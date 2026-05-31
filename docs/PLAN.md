# PLAN.md — 每日營養需求計算模組

> **角色**：系統核心計算層。接收使用者基本資料，輸出每日六大營養素目標量與缺口向量，供 SUB.md 食物推薦模組使用。
> **實作語言**：純 Python（`nutrition/calc.py`）。C 層已評估並預留遷移路徑，目前以 Python 完整實作。

---

## 一、模組職責

```
使用者輸入（體重、身高、年齡、性別、運動紀錄）
                    ↓
             PLAN.md（本模組）
         計算 BMR → TDEE → 六大營養素目標
                    ↓
        輸出 NutritionTarget + gap{}
                    ↓
           SUB.md 食物推薦模組
```

本模組不負責食物推薦，不負責視覺化，只負責「算出今天需要多少」。

---

## 二、六大營養素定義（WHO）

| 編號 | 營養素 | 說明 | 計算單位 |
|------|--------|------|---------|
| 1 | 碳水化合物 | 主要熱量來源，含糖類與澱粉 | g |
| 2 | 蛋白質 | 組織建構與修復 | g |
| 3 | 脂肪 | 能量儲存與脂溶性維生素吸收 | g |
| 4 | 膳食纖維 | 消化健康、血糖調節 | g |
| 5 | 維生素 | 微量有機化合物，維持生理功能 | micro_score（0–100） |
| 6 | 礦物質 | 無機元素，支援骨骼、血液系統 | micro_score（0–100） |

> 維生素與礦物質依 TEMP.md 約定合併為單一 `micro_score`，供介面傳遞使用。

---

## 三、輸入變數

| 變數 | 說明 | 單位 | 來源 |
|------|------|------|------|
| W | 體重 | kg | 使用者輸入 |
| H | 身高 | cm | 使用者輸入 |
| A | 年齡 | 歲 | 使用者輸入 |
| Sex | 性別 | male / female | 使用者輸入 |
| T_ex | 當日運動總時數 | hr | 使用者輸入（可多項加總） |
| MET_i | 各運動的代謝當量 | kcal/kg/hr | 使用者選擇（查表） |

前端運動行即時顯示當日消耗估算：`≈ MET × W × 時數 kcal`（橘色徽章）。

---

## 四、TDEE 計算公式

### 4.1 基礎代謝率（BMR）— Mifflin-St Jeor

```
男性：BMR = 10×W + 6.25×H - 5×A + 5
女性：BMR = 10×W + 6.25×H - 5×A - 161
```

### 4.2 每日總消耗熱量（TDEE）

假設每日睡眠 8 小時，其餘 16 小時為清醒狀態：

```
E_sleep = 0.95 × BMR × (8/24)
E_rest  = BMR × (16 - T_ex) / 24
E_ex    = Σ(MET_i × W × T_ex_i)

TDEE = BMR × (23.6 - T_ex) / 24 + E_ex
```

### 4.3 常見運動 MET 值

| 運動類型 | MET |
|---------|-----|
| 靜坐辦公 | 1.5 |
| 站立工作 | 2.0 |
| 步行（一般） | 3.5 |
| 快走 | 4.5 |
| 騎自行車（輕度） | 5.0 |
| 重量訓練 | 5.0 |
| 有氧舞蹈 | 6.5 |
| 慢跑 | 7.0 |
| 游泳 | 7.0 |
| 騎自行車（中度） | 8.0 |
| 跑步（快速） | 9.8 |

---

## 五、六大營養素目標量公式

### 5.1 碳水化合物

```
C_carb = (0.55 × TDEE) / 4    (g)
```

### 5.2 蛋白質

蛋白質採雙方法取最大值，確保運動後最低需求不被低估：

```
f_prot = 0.8  if T_ex == 0
         1.2  if T_ex <= 1
         1.5  if T_ex <= 2
         2.0  if T_ex >  2

C_prot = max( (0.15 × TDEE) / 4,  W × f_prot )    (g)
```

### 5.3 脂肪

```
C_fat = (0.30 × TDEE) / 9    (g)
```

### 5.4 膳食纖維

```
C_fiber = (TDEE / 1000) × 14    (g)
```

### 5.5 維生素目標（查表，依 A、Sex）

| 維生素 | 成年男性 | 成年女性 | 單位 |
|--------|---------|---------|------|
| A | 900 | 700 | μg |
| C | 90 | 75 | mg |
| D | 15（>70歲：20） | 15（>70歲：20） | μg |
| E | 15 | 15 | mg |
| K | 120 | 90 | μg |
| B12 | 2.4 | 2.4 | μg |
| 葉酸 B9 | 400 | 400 | μg |
| B6 | 1.3（>51歲：1.7） | 1.3（>51歲：1.5） | mg |

### 5.6 礦物質目標（查表，依 A、Sex）

| 礦物質 | 成年男性 | 成年女性 | 單位 |
|--------|---------|---------|------|
| 鈣 | 1000（>71歲：1200） | 1000（>71歲：1200） | mg |
| 鐵 | 8 | 18（>51歲：8） | mg |
| 鋅 | 11 | 8 | mg |
| 鎂 | 400（>31歲：420） | 310（>31歲：320） | mg |
| 鉀 | 3500 | 2600 | mg |
| 鈉（上限） | ≤2000 | ≤2000 | mg |
| 磷 | 700 | 700 | mg |
| 碘 | 150 | 150 | μg |

---

## 六、輸出結構（傳遞給 SUB.md）

```python
NutritionTarget = {
    "tdee":        float,   # kcal/天
    "bmr":         float,   # kcal/天（參考用）
    "carb_g":      float,   # 碳水目標（g）
    "prot_g":      float,   # 蛋白質目標（g）
    "fat_g":       float,   # 脂肪目標（g）
    "fiber_g":     float,   # 膳食纖維目標（g）
    "micro_score": float,   # 微量營養素目標（固定 100.0）
    # 內部用，不對外暴露（API 回傳前剝除）
    "_vit_ref":    dict,
    "_min_ref":    dict,
}

gap = {
    "carb_g":      float,   # max(0, target - eaten)
    "prot_g":      float,
    "fat_g":       float,
    "fiber_g":     float,
    "micro_score": float,
}
```

---

## 七、實作語言分配

| 層 | 語言 | 職責 |
|----|------|------|
| 計算核心 | Python | BMR、TDEE、營養素目標量（`nutrition/calc.py`） |
| 後端橋接 | Python / Flask | 路由呼叫、回傳 JSON（`nutrition/server.py`） |
| 前端顯示 | JavaScript | 接收 JSON，渲染六角形與缺口面板 |

> **C 移植路徑**：`calc.py` 中的三個函式（`calc_bmr`、`calc_targets`、`calc_gap`）可直接對應至 C 版本 `calc_bmr()`、`calc_tdee()`、`calc_targets()`，透過 ctypes 橋接。ARCH.md 保留 `calc.so` / `calc.dll` 條目供未來使用。

---

## 八、Python 核心完整實作

```python
def calc_bmr(W, H, A, sex):
    return 10*W + 6.25*H - 5*A + (5 if sex == 'male' else -161)

def calc_targets(W, H, A, sex, exercises):
    bmr  = calc_bmr(W, H, A, sex)
    t_ex = sum(h for _, h in exercises)
    e_ex = sum(met * W * h for met, h in exercises)
    tdee = bmr * (23.6 - t_ex) / 24 + e_ex
    f_p  = 0.8 if t_ex==0 else 1.2 if t_ex<=1 else 1.5 if t_ex<=2 else 2.0
    return {
        "tdee":        round(tdee, 1),
        "bmr":         round(bmr, 1),
        "carb_g":      round(0.55 * tdee / 4, 1),
        "prot_g":      round(max(0.15 * tdee / 4, W * f_p), 1),
        "fat_g":       round(0.30 * tdee / 9, 1),
        "fiber_g":     round(tdee / 1000 * 14, 1),
        "micro_score": 100.0,
        "_vit_ref":    _vit_ref(A, sex),
        "_min_ref":    _min_ref(A, sex),
    }

def calc_gap(target, eaten):
    keys = ["carb_g", "prot_g", "fat_g", "fiber_g", "micro_score"]
    return {k: max(0.0, target[k] - eaten.get(k, 0.0)) for k in keys}
```

---

*資料來源：WHO DRI、Mifflin-St Jeor (1990)、ACSM MET Compendium*
