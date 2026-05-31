# TEMP.md — 模組介面與耦合規範

> **角色**：定義各模組之間的資料交換介面，以及前後端的溝通格式。所有模組開發均以本文件的介面約定為準，不得擅自更改欄位名稱或單位。

---

## 一、設計原則

本系統面向普通使用者，介面設計遵循以下原則：

- **維生素與礦物質合併**為單一 `micro_score`（0–100），使用者不需要知道是哪種維生素
- **達成率以語意表示**（足夠／略低／不足），不暴露精確百分比
- **數學細節不對外暴露**：損失函數、懲罰係數等保留在模組內部
- **缺口即輸入**：使用者只需告知「還差多少」，系統自動推薦
- **食物名稱使用市售品名**：降低辨識門檻，不用通用食材名稱

---

## 二、核心資料結構

### 2.1 NutritionTarget（PLAN.md 輸出 → API 回傳）

```typescript
interface NutritionTarget {
    tdee:         number;   // kcal/天
    bmr:          number;   // kcal/天（參考用）
    carb_g:       number;   // 碳水化合物目標（g）
    prot_g:       number;   // 蛋白質目標（g）
    fat_g:        number;   // 脂肪目標（g）
    fiber_g:      number;   // 膳食纖維目標（g）
    micro_score:  number;   // 微量營養素目標（固定為 100.0）
}
```

> 內部欄位 `_vit_ref`、`_min_ref` 在 API 回傳前剝除，不對前端暴露。

### 2.2 Gap（PLAN.md → SUB.md 傳遞）

```typescript
interface Gap {
    carb_g:       number;   // 碳水化合物缺口（g）
    prot_g:       number;   // 蛋白質缺口（g）
    fat_g:        number;   // 脂肪缺口（g）
    fiber_g:      number;   // 膳食纖維缺口（g）
    micro_score:  number;   // 微量營養素缺口（0–100）
}
```

缺口計算（所有欄位 clamp ≥ 0）：

```
gap.carb_g      = max(0, target.carb_g      - already_eaten.carb_g)
gap.prot_g      = max(0, target.prot_g      - already_eaten.prot_g)
gap.fat_g       = max(0, target.fat_g       - already_eaten.fat_g)
gap.fiber_g     = max(0, target.fiber_g     - already_eaten.fiber_g)
gap.micro_score = max(0, 100               - already_eaten.micro_score)
```

若使用者今日尚未進食，gap = target（直接帶入）。

### 2.3 micro_score 計算

```
vit_score  = Σ_k ( food_vit_k / daily_vit_k ) × vit_weight_k × 100
min_score  = Σ_k ( food_min_k / daily_min_k ) × min_weight_k × 100
micro_score = (vit_score + min_score) / 2
```

| 維生素 | 權重 | 礦物質 | 權重 |
|--------|------|--------|------|
| A | 20% | 鈣 | 25% |
| C | 25% | 鐵 | 25% |
| D | 20% | 鋅 | 20% |
| B12 | 20% | 鎂 | 15% |
| 葉酸 | 15% | 鉀 | 15% |

### 2.4 FoodItem（食物資料庫單筆記錄）

```typescript
interface FoodItem {
    id:           number;
    name:         string;   // 市售品名風格
    category:     string;   // 主食/肉類/蛋類/蔬菜/水果/乳製品/堅果/豆類
    carb:         number;   // g/100g
    protein:      number;   // g/100g
    fat:          number;   // g/100g
    fiber:        number;   // g/100g
    micro_score:  number;   // 0–100（已正規化）
    sodium:       number;   // mg/100g
}
```

### 2.5 RecommendResult（SUB.md 輸出 → 前端）

```typescript
interface RecommendResult {
    foods: Array<{
        name:      string;
        category:  string;
        amount_g:  number;     // 推薦份量（演算法估算，預設 150g）
        contrib: {
            carb_g:       number;
            prot_g:       number;
            fat_g:        number;
            fiber_g:      number;
            micro_score:  number;
        };
    }>;
    coverage: {
        carb:  "足夠" | "略低" | "不足";
        prot:  "足夠" | "略低" | "不足";
        fat:   "足夠" | "略低" | "不足";
        fiber: "足夠" | "略低" | "不足";
        micro: "足夠" | "略低" | "不足";
    };
    tips:   string[];
    ratios: {
        carb: number; prot: number; fat: number;
        fiber: number; micro: number;
    };
}
```

---

## 三、達成率語意分級

| 等級 | 達成率範圍 | 顯示文字 | 六角形顏色 |
|------|-----------|---------|-----------|
| 足夠 | ≥ 90% | ✓ 已達標 | 綠色 |
| 略低 | 70–89% | 略低，可再補充 | 橘色 |
| 不足 | < 70% | 不足，建議優先補充 | 紅色 |
| 超標 | > 100% | 超出 Xg（藍色文字） | 橘色超出層 |

---

## 四、資料流圖

```
使用者輸入
 W, H, A, Sex
 exercises[]
      │
      ▼
 calc.py（Python）
 計算 BMR → TDEE → 目標量
      │
      ▼  NutritionTarget{}
      │
 前端記錄已攝取量
 eatenFoods{}（100g/份）
      │
      ▼  Gap{}
      │
 recommender.py（Python）
 兩階段貪婪演算法
      │
      ▼  RecommendResult{}
      │
 前端（JS）
 ┌────────────────────────────┐
 │ 六角形視覺化（hexagon.js） │
 │   綠層：攝取（100% cap）   │
 │   橘層：超出部分（from center）│
 │   藍層：食物貢獻預覽       │
 │   頂點：公克數標籤         │
 ├────────────────────────────┤
 │ 今日營養缺口面板（自動更新）│
 │ 已加入食物卡片             │
 │ 推薦食物卡片清單           │
 └────────────────────────────┘
```

---

## 五、API 介面約定

### POST /api/targets

Request：
```json
{
  "W": 70, "H": 170, "A": 30, "sex": "male",
  "exercises": [{ "met": 7.0, "hours": 1.0 }],
  "eaten": {}
}
```

Response：
```json
{ "target": { "tdee": ..., "bmr": ..., "carb_g": ..., ... }, "gap": { ... } }
```

### POST /api/recommend

Request（Gap）：
```json
{ "carb_g": 200, "prot_g": 80, "fat_g": 50, "fiber_g": 20, "micro_score": 75 }
```

### GET /api/foods

Response：`FoodItem[]`（33+ 筆，含使用者新增）

### POST /api/foods

Request（新增食物）：
```json
{
  "name": "燙青江菜", "category": "蔬菜",
  "carb": 2.4, "protein": 1.8, "fat": 0.2,
  "fiber": 1.5, "micro_score": 55, "sodium": 30
}
```

Response：新增的 `FoodItem`，HTTP 201，並持久化寫入 `food_db.json`。

---

## 六、各模組遵守義務

### PLAN.md

1. `micro_score` 輸出固定為 100.0（目標滿分）
2. 欄位名稱嚴格遵守 §2.1，不得更名
3. 內部參照表（`_vit_ref`、`_min_ref`）在 API 回傳前剝除

### SUB.md

1. 食物資料庫的 `micro_score` 為合併後的 0–100 單一分數
2. `coverage` 使用語意字串，不輸出原始百分比
3. 不對外暴露得分、損失值等內部計算細節
4. 演算法估算份量（150g）與前端加入份量（100g）各自獨立

### 前端（hexagon.js / index.html）

1. `gap` 各欄位不得為負數（`updateDeficitPanel` 自動 clamp）
2. 六角圖橘色層 = 超出量 ratio（`max(0, ratio - 1.0)`），從圓心繪製
3. 六角圖綠色層 = 攝取 ratio，上限 clamp 至 1.0

---

## 七、不變項

- 基礎單位：食物資料庫每 100 公克
- 前端加入食物預設份量：**100g**（1 份）
- 演算法估算基準：150g（不影響前端顯示）
- 碳水、蛋白、脂肪、纖維以公克（g）計算
- micro_score 範圍：0–100，數值越大代表該食物微量營養越豐富
- gap 各欄位不得為負數
