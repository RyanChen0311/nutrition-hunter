# 🍱 營養獵人 Nutrition Hunter

每日營養追蹤與飲食推薦系統，結合六角形雷達圖視覺化，幫助使用者掌握每日六大營養素攝取狀況。

**🌐 線上體驗：** https://ryanchen0311.github.io/nutrition_of_hunter/

> 📱 **手機使用提示：** 請將瀏覽器切換為「電腦版網站」模式以獲得最佳顯示效果。
> - **Chrome（Android）**：右上角 `⋮` → 勾選「電腦版網站」
> - **Safari（iPhone）**：網址列左側 `AA` → 選擇「要求電腦版網站」

---

## 功能特色

### 📊 六角形營養雷達圖
- **綠色多邊形**：今日已攝取量（上限至 100% 目標）
- **橘色多邊形**：超出目標的超量部分（從圓心繪製）
- **藍色多邊形**：滑鼠懸停或點擊食物時的即時貢獻預覽
- **紅色虛線**：尚未補足的缺口
- **頂點公克數標籤**：清楚顯示每個軸的攝取量

### 🔥 熱量計算
- 依照 **Mifflin-St Jeor** 公式計算 BMR（基礎代謝率）
- 支援多項運動加總的 TDEE 計算（MET 代謝當量）
- 即時顯示各運動消耗卡路里
- 自動計算碳水、蛋白質、脂肪、膳食纖維、維生素、礦物質每日目標量

### 🥗 智慧食物推薦
- 兩階段貪婪演算法，根據當前營養缺口推薦補充食物
- 達標偵測：所有營養素達標時自動顯示「已達標」
- 推薦結果包含每項食物的貢獻比例說明

### 📦 食物資料庫
- 33 種市售品名食物（御釜白飯、桂格即食燕麥、北海道納豆…）
- 按類別篩選：主食、肉類、蛋類、蔬菜、水果、乳製品、堅果、豆類
- 主導營養素徽章（碳水 / 蛋白質 / 脂肪）
- 水平滾動卡片軸，支援滑鼠滾輪
- **可自訂新增食物**，儲存於瀏覽器 localStorage

### 📋 即時缺口追蹤
- 加入食物後自動更新今日營養缺口進度條
- 超標顯示藍色、不足顯示紅色
- 已加入食物清單，支援隨時移除

---

## 使用步驟

```
1. 基礎設定   → 輸入體重、身高、年齡、性別
2. 計算熱量   → 點擊按鈕取得 BMR / TDEE 與各營養素目標
3. 加入食物   → 從食物資料庫選擇今日已吃的食物
4. 取得推薦   → 根據剩餘缺口推薦補充食物
```

---

## 六角圖軸說明

| 軸 | 名稱 | 資料來源 | 語意 |
|---|---|---|---|
| 0 | 碳水化合物 | 食物 carb (g) | 攝取量 / 每日目標 |
| 1 | 蛋白質 | 食物 protein (g) | 攝取量 / 每日目標 |
| 2 | 脂肪 | 食物 fat (g) | 攝取量 / 每日目標 |
| 3 | 膳食纖維 | 食物 fiber (g) | 攝取量 / 每日目標 |
| 4 | 維生素 | 食物 micro_score (0–100) | 綜合微量營養素評分，基於 USDA 主要維生素密度估算 |
| 5 | 礦物質 | 食物 sodium (mg) | 攝取量 / WHO 每日上限 2300 mg；**橘色代表超標** |

> `micro_score` 為 0–100 的估算分，反映食物的維生素密度（參考 USDA FoodData Central 維生素 C / B 群 / 葉酸含量比例加權）。目標值固定為 100，代表「當天已達充足微量營養素攝取」。

---

## 技術架構

| 層次 | 技術 | 說明 |
|------|------|------|
| 前端 | Vanilla JS + Canvas 2D | 六角形雷達圖、互動介面 |
| 樣式 | CSS（Glassmorphism） | 玻璃擬態風格 |
| 計算 | 純 JavaScript | BMR/TDEE/推薦演算法（無需伺服器） |
| 資料 | JSON + localStorage | 食物資料庫 + 使用者自訂食物 |

> 本專案為純靜態前端，可直接部署至 GitHub Pages，無需後端伺服器。

---

## 本地開發

### 純靜態版（推薦）

```bash
git clone https://github.com/RyanChen0311/nutrition_of_hunter.git
cd nutrition_of_hunter
python3 -m http.server 8080
# 開啟 http://localhost:8080/
```

### Flask 後端版（開發用，需 Python ≥ 3.10）

```bash
cd nutrition_of_hunter
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -X utf8 nutrition/server.py
# 開啟 http://127.0.0.1:5000/
```

> Flask 後端版提供 `/api/targets`、`/api/recommend`、`/api/foods` REST API，
> 功能與純靜態版完全相同，適合需要伺服器端擴充的情境。

---

## 檔案結構

```
nutrition_of_hunter/
├── index.html          主頁面
├── style.css           樣式（Glassmorphism）
├── hexagon.js          六角形圖表核心
├── nutrition.js        純 JS 計算核心（BMR / TDEE / 推薦演算法）
├── nutrition/
│   ├── calc.py         Python 計算核心（Flask 版）
│   ├── food_db.json    食物資料庫（33 種）
│   ├── recommender.py  推薦演算法（Flask 版）
│   └── server.py       Flask API 伺服器
└── docs/
    ├── PLAN.md         營養計算規格
    ├── SUB.md          食物推薦子系統規格
    ├── TEMP.md         模組介面規範
    ├── ARCH.md         系統架構
    └── HISTORY.md      開發歷程
```

---

## 資料來源

- 每日營養素建議量：[WHO DRI](https://www.who.int/)
- BMR 公式：Mifflin-St Jeor (1990)
- 運動 MET 值：ACSM MET Compendium
- 食物營養數據：[USDA FoodData Central](https://fdc.nal.usda.gov/)

---

## License

MIT
