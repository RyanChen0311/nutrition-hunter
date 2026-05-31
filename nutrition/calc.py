"""
Pure-Python calculation core (PLAN.md spec).
Replaces the C layer during development; can be ported to C later.
"""

from dataclasses import dataclass


# ── Vitamin / Mineral daily reference values (WHO/NIH DRI) ──────────────────

_VIT_REF_MALE = {
    "vit_a": 900, "vit_c": 90, "vit_d": 15, "vit_b12": 2.4, "folate": 400,
}
_VIT_REF_FEMALE = {
    "vit_a": 700, "vit_c": 75, "vit_d": 15, "vit_b12": 2.4, "folate": 400,
}
_VIT_REF_MALE_70 = {**_VIT_REF_MALE, "vit_d": 20}
_VIT_REF_FEMALE_70 = {**_VIT_REF_FEMALE, "vit_d": 20}

_MIN_REF_MALE = {
    "calcium": 1000, "iron": 8,  "zinc": 11, "magnesium": 400,
    "potassium": 3500, "sodium_max": 2000, "phosphorus": 700, "iodine": 150,
}
_MIN_REF_FEMALE = {
    "calcium": 1000, "iron": 18, "zinc": 8,  "magnesium": 310,
    "potassium": 2600, "sodium_max": 2000, "phosphorus": 700, "iodine": 150,
}
_MIN_REF_MALE_31   = {**_MIN_REF_MALE,   "magnesium": 420}
_MIN_REF_FEMALE_31 = {**_MIN_REF_FEMALE, "magnesium": 320}
_MIN_REF_MALE_51   = {**_MIN_REF_MALE_31}
_MIN_REF_FEMALE_51 = {**_MIN_REF_FEMALE_31, "iron": 8}
_MIN_REF_MALE_71   = {**_MIN_REF_MALE_51,   "calcium": 1200}
_MIN_REF_FEMALE_71 = {**_MIN_REF_FEMALE_51, "calcium": 1200}


def _vit_ref(age: float, sex: str) -> dict:
    base = _VIT_REF_MALE if sex == "male" else _VIT_REF_FEMALE
    if age > 70:
        return _VIT_REF_MALE_70 if sex == "male" else _VIT_REF_FEMALE_70
    return base


def _min_ref(age: float, sex: str) -> dict:
    if sex == "male":
        if age > 70: return _MIN_REF_MALE_71
        if age > 50: return _MIN_REF_MALE_51
        if age > 30: return _MIN_REF_MALE_31
        return _MIN_REF_MALE
    else:
        if age > 70: return _MIN_REF_FEMALE_71
        if age > 50: return _MIN_REF_FEMALE_51
        if age > 30: return _MIN_REF_FEMALE_31
        return _MIN_REF_FEMALE


# ── Core calculations ────────────────────────────────────────────────────────

def calc_bmr(W: float, H: float, A: float, sex: str) -> float:
    """Mifflin-St Jeor BMR (kcal/day)."""
    return 10 * W + 6.25 * H - 5 * A + (5 if sex == "male" else -161)



def calc_targets(W: float, H: float, A: float, sex: str,
                 exercises: list[tuple[float, float]]) -> dict:
    """
    Full pipeline: inputs → NutritionTarget dict (TEMP.md §2.1).
    exercises: list of (MET, hours) tuples.
    """
    bmr = calc_bmr(W, H, A, sex)
    t_ex = sum(h for _, h in exercises)
    e_ex = sum(met * W * h for met, h in exercises)
    tdee = bmr * (23.6 - t_ex) / 24 + e_ex

    # Protein factor
    if t_ex == 0:
        f_p = 0.8
    elif t_ex <= 1:
        f_p = 1.2
    elif t_ex <= 2:
        f_p = 1.5
    else:
        f_p = 2.0

    return {
        "tdee":        round(tdee, 1),
        "bmr":         round(bmr, 1),
        "carb_g":      round(0.55 * tdee / 4, 1),
        "prot_g":      round(max(0.15 * tdee / 4, W * f_p), 1),
        "fat_g":       round(0.30 * tdee / 9, 1),
        "fiber_g":     round(tdee / 1000 * 14, 1),
        "micro_score": 100.0,
        # Reference tables attached for downstream use
        "_vit_ref":    _vit_ref(A, sex),
        "_min_ref":    _min_ref(A, sex),
    }


def calc_gap(target: dict, eaten: dict) -> dict:
    """
    Compute gap = target - already_eaten (TEMP.md §2.2).
    All values clamped to ≥ 0.
    """
    return {
        "carb_g":      max(0.0, target["carb_g"]      - eaten.get("carb_g",      0.0)),
        "prot_g":      max(0.0, target["prot_g"]      - eaten.get("prot_g",      0.0)),
        "fat_g":       max(0.0, target["fat_g"]       - eaten.get("fat_g",       0.0)),
        "fiber_g":     max(0.0, target["fiber_g"]     - eaten.get("fiber_g",     0.0)),
        "micro_score": max(0.0, 100.0                 - eaten.get("micro_score", 0.0)),
    }


# ── Quick smoke-test ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    result = calc_targets(70, 170, 30, "male", [(7.0, 1.0)])
    printable = {k: v for k, v in result.items() if not k.startswith("_")}
    print(json.dumps(printable, indent=2, ensure_ascii=False))
