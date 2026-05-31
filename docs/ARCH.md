# ARCH.md — 系統架構規範

> **角色**：定義整個專案的技術分層、檔案結構、語言職責、前端設計規範，以及六角形視覺化的渲染規格。本文件為開發的主要參考依據。

---

## 一、專案總覽

本專案以每日飲食營養追蹤與推薦為核心，結合六角形雷達圖視覺化，提供使用者直覺的營養缺口管理體驗。

```
nutrition_of_hunter/
├── index.html          ← 主頁面（完整營養追蹤 UI）
├── style.css           ← 樣式（Glassmorphism，zoom: 0.75 基準）
├── hexagon.js          ← 六角形圖表核心（三層顯示＋拖曳＋公克標籤）
├── .gitignore          ← 排除 .venv/、calc.so、calc.dll、__pycache__
├── .cspell.json        ← VS Code 拼字檢查忽略清單
│
├── nutrition/          ← 後端模組
│   ├── calc.py         ← Python：BMR / TDEE / 營養目標公式
│   ├── food_db.json    ← 食物資料庫（33+ 種，市售品名，USDA 數據）
│   ├── recommender.py  ← 兩階段貪婪推薦演算法
│   └── server.py       ← Flask API（4 個端點）
│
└── docs/               ← 設計文件
    ├── PLAN.md         ← 營養計算規格
    ├── SUB.md          ← 食物推薦子系統規格
    ├── TEMP.md         ← 模組介面與耦合規範
    ├── ARCH.md（本文件）
    └── HISTORY.md      ← 開發歷程記錄
```

### 啟動方式

```bash
# WSL（Debian / Ubuntu，首次需建立虛擬環境）
python3 -m venv .venv
source .venv/bin/activate
pip install flask
python -X utf8 nutrition/server.py

# 每次啟動
source .venv/bin/activate
python -X utf8 nutrition/server.py

# 瀏覽器開啟
http://127.0.0.1:5000/
```

> Windows 原生環境：直接 `python -X utf8 nutrition/server.py`（Flask 已安裝於系統 Python）

---

## 二、語言分層職責

### 層 1：計算核心（Python）

**檔案**：`nutrition/calc.py`

純函式，無 I/O、無外部依賴：

```python
calc_bmr(W, H, A, sex)            → float
calc_targets(W, H, A, sex, exercises) → NutritionTarget dict
calc_gap(target, eaten)            → Gap dict
```

> **C 移植路徑**：三個函式可直接對應至 C 版本，透過 ctypes 橋接。`.gitignore` 已預留 `calc.so` / `calc.dll` 條目。

### 層 2：後端橋接與推薦演算法（Python / Flask）

**檔案**：`nutrition/server.py`、`nutrition/recommender.py`

```
server.py
  ├── GET  /api/foods      → 回傳食物資料庫（FoodItem[]）
  ├── POST /api/foods      → 新增食物，持久化寫入 food_db.json（201）
  ├── POST /api/targets    → 呼叫 calc.py，回傳 NutritionTarget + Gap
  └── POST /api/recommend  → 呼叫 recommender.py，回傳 RecommendResult

recommender.py
  └── recommend(gap, db) → RecommendResult（兩階段貪婪）
```

### 層 3：前端渲染（JavaScript）

**檔案**：`index.html`、`hexagon.js`、`style.css`

職責：
- 收集使用者輸入，POST 到 Python API
- 接收 JSON，驅動六角形圖表更新
- 管理已加入食物、缺口面板、推薦面板
- 前端不執行任何營養計算邏輯

---

## 三、API 介面定義

### GET /api/foods

Response：`FoodItem[]`

### POST /api/foods

Request：
```json
{
  "name": "燙青江菜", "category": "蔬菜",
  "carb": 2.4, "protein": 1.8, "fat": 0.2,
  "fiber": 1.5, "micro_score": 55, "sodium": 30
}
```

Response：新增的 FoodItem（HTTP 201），同時持久化至 `food_db.json`。

### POST /api/targets

Request：
```json
{
  "W": 70, "H": 170, "A": 30, "sex": "male",
  "exercises": [{ "met": 7.0, "hours": 1.0 }]
}
```

Response：
```json
{
  "target": { "tdee": 2013.1, "bmr": 1617.5, "carb_g": 276.8, ... },
  "gap":    { "carb_g": 276.8, "prot_g": 84.0, ... }
}
```

### POST /api/recommend

Request（Gap）：
```json
{ "carb_g": 200, "prot_g": 80, "fat_g": 50, "fiber_g": 20, "micro_score": 75 }
```

Response：
```json
{
  "foods": [
    { "name": "舒胸嫩雞排", "category": "肉類", "amount_g": 150,
      "contrib": { "carb_g": 0, "prot_g": 46.5, "fat_g": 5.4, "fiber_g": 0, "micro_score": 30 } }
  ],
  "coverage": { "carb": "略低", "prot": "足夠", ... },
  "tips": ["膳食纖維略低，建議加入翠綠嫩葉菠菜"],
  "ratios": { "carb": 0.85, "prot": 1.1, ... }
}
```

---

## 四、六角形視覺化規格（`hexagon.js`）

### 4.1 六個軸的對應

```
          碳水化合物（上）
         /              \
  礦物質                  蛋白質
  （左）                  （右上）
         \              /
  維生素                  脂肪
  （左下）                （右下）
          膳食纖維（下）
```

軸序（0–5）：碳水化合物、蛋白質、脂肪、膳食纖維、維生素、礦物質

> 維生素（軸 4）與礦物質（軸 5）共用同一 `micro_score` 數值。

### 4.2 四層顯示（繪製順序）

| 層次 | 說明 | 顏色 | 觸發條件 |
|------|------|------|---------|
| 灰色外環 | 100% 目標值 | 灰色邊框 + 極淡填充 | 始終顯示 |
| 綠色多邊形 | 今日攝取（上限 clamp 100%） | 綠色填充 | 有已加入食物時 |
| 橘色多邊形 | 超出部分（= 攝取ratio - 1.0，從圓心） | 橘色填充 | 任一軸超出 100% 時 |
| 藍色多邊形 | 食物貢獻預覽（hover 或 click 釘選） | 藍色填充 | 滑過或點擊食物卡片時 |

**不足指示**：從攝取頂點到 100% 目標點畫紅色虛線（dash）。

### 4.3 頂點標籤

- **綠色頂點**（攝取量 > 0）：白底圓角標籤，顯示實際公克數（如 `42g`）
- **橘色頂點**（超出量 > 0）：淡橘底標籤，顯示超出公克數（如 `+12g`）
- 軸標籤文字顏色：綠（≥ 90%）、橘（70–89%）、紅（< 70%）

### 4.4 目標公克 Grid

計算後於六角圖下方顯示 3×2 的目標公克 Grid（碳水 / 蛋白質 / 脂肪 / 纖維 / 維生素 / 礦物質）。軸標籤不再在畫布上顯示目標公克，避免文字重疊。

### 4.5 公開 API（hexagon.js）

```javascript
initHexagon(canvasId)           // 初始化
updateFromRatios(ratios)        // 更新綠色攝取層（0.0–1.5）
setIntakeGrams(grams)           // 設定頂點公克標籤
setExcessGrams(grams)           // 設定橘色超出標籤
setAxisTargets(labels)          // 保留（目前前端改用 HTML grid）
pinFoodContrib(ratios)          // 釘選藍色食物貢獻
unpinFoodContrib()
showFoodContrib(ratios)         // 暫時 hover 預覽（藍色）
clearFoodContrib()
resetHexagon()                  // 完全重置
```

---

## 五、前端設計規範

沿用 Glassmorphism 風格，以米白為背景底色。

### 5.1 色彩

| 用途 | 色值 |
|------|------|
| 背景 | `#f5f5f0` |
| 面板背景 | `rgba(255, 255, 255, 0.6)` + `backdrop-filter: blur(12px)` |
| 邊框 | `rgba(0, 0, 0, 0.08)` |
| 主要文字 | `#1a1a1a` |
| 次要文字 | `#6b6b6b` |
| 足夠（綠） | `#4caf50` |
| 超標（藍） | `#1565c0` |
| 略低（橘） | `#e65100` |
| 不足（紅） | `#c62828` |
| 卡路里徽章 | `#e65100`（橘色） |

### 5.2 字型縮放

CSS 全局：`html { zoom: 0.75; }`。基礎字型大小 20px，zoom 後實際顯示約 15px，符合一般閱讀舒適度。

### 5.3 版面結構

```
┌─────────────────────────────────────────────────┐
│  頁首：標題「營養獵人」                           │
├─────────────────────────────────────────────────┤
│  輸入面板                                        │
│  體重 / 身高 / 年齡 / 性別                       │
│  今日運動（小時）— 下拉 + 時數 + ≈卡路里          │
│  [計算熱量] → 顯示 BMR / TDEE（分兩行）           │
├─────────────┬──────────────────┬────────────────┤
│  六角形圖表 │  推薦食物面板     │  使用步驟       │
│  （含目標   │  [取得推薦]       │  1. 基礎設定   │
│   公克 Grid）│  [取消推薦]       │  2. 計算熱量   │
│             │  食物卡片清單     │  3. 加入食物   │
│             │  （含「加入今日」）│  4. 取得推薦   │
├─────────────┴──────────────────┴────────────────┤
│  食物資料庫（水平卡片軸）                         │
│  分類過濾 + 主導營養素徽章 + hover 六角圖預覽     │
├─────────────────────────────────────────────────┤
│  新增食物（可展開表單，POST /api/foods）           │
├─────────────────────────────────────────────────┤
│  已加入食物（自動顯示，× 可移除）                  │
├─────────────────────────────────────────────────┤
│  今日營養缺口（進度條 + 還需/超出公克數）           │
└─────────────────────────────────────────────────┘
```

### 5.4 食物資料庫卡片

每張卡片顯示：
- 食物名稱（右上角：主導營養素徽章）
  - 橘色 `碳水`：carb 最高
  - 綠色 `蛋白質`：protein 最高
  - 紅色 `脂肪`：fat 最高
- 分類
- 四條 mini bar（碳水/蛋白/脂肪/纖維）
- 「＋加入今日」按鈕

點擊卡片本體：藍色釘選層顯示在六角圖（再點取消）。
滑鼠 Hover：暫時顯示藍色貢獻預覽。

### 5.5 推薦食物卡片

每張卡片顯示：
- 食物名稱、分類、份量
- 五條 bar（碳水/蛋白質/脂肪/纖維/微量）
- 「＋加入今日」按鈕（點擊同步加入 eatenFoods，更新缺口面板與已加入清單）

---

## 六、開發流程建議

```
Step 1  nutrition/calc.py
        實作 calc_bmr、calc_targets、calc_gap
        執行 python -X utf8 nutrition/calc.py 確認輸出

Step 2  nutrition/food_db.json
        建立至少 30 種食物（含 micro_score）

Step 3  nutrition/recommender.py
        實作兩階段貪婪演算法，smoke test 確認推薦結果

Step 4  nutrition/server.py
        Flask API 串接，curl 測試 4 個端點

Step 5  hexagon.js
        實作三層多邊形（灰/綠/橘）+ 藍色食物貢獻層
        實作拖曳、頂點標籤

Step 6  index.html + style.css
        加入輸入列、食物卡片、缺口面板、推薦面板
        串接前端 JS 與 Flask API

Step 7  整合測試
        完整流程：基礎設定 → 計算熱量 → 加入食物 → 取得推薦
```

---

## 七、開發注意事項

- 所有欄位名稱與資料結構以 **TEMP.md §二** 為準
- `food_db.json` 的食物名稱使用**市售品名風格**（見 SUB.md §3.2）
- 前端加入食物預設 **100g**；推薦演算法估算基準 **150g**（兩者獨立）
- WSL 啟動需 `source .venv/bin/activate`（Debian PEP 668 限制）
- Windows 啟動需加 `-X utf8` 確保 JSON 中文正常輸出
- API response 統一為 UTF-8 JSON，Content-Type: `application/json`
