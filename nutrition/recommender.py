"""
Two-phase greedy food recommendation algorithm (SUB.md spec).
"""

import json
from pathlib import Path
from dataclasses import dataclass, field

_DB_PATH = Path(__file__).parent / "food_db.json"

# Nutrient keys that participate in scoring / gap tracking
_KEYS = ["carb_g", "prot_g", "fat_g", "fiber_g", "micro_score"]

# Mapping from gap keys to food_db field names
_KEY_TO_FIELD = {
    "carb_g":      "carb",
    "prot_g":      "protein",
    "fat_g":       "fat",
    "fiber_g":     "fiber",
    "micro_score": "micro_score",
}

# Equal weights by default (SUB.md §4.3)
_WEIGHTS = {k: 1.0 / len(_KEYS) for k in _KEYS}

# System limits (SUB.md §2.2)
_MAX_FOODS       = 8
_SERVING_G       = 150.0   # scoring estimate basis
_MIN_IMPROVEMENT = 0.01    # Phase 2 termination: < 1% improvement
_COVERAGE_OK     = 0.90    # "足夠" threshold


def _load_db() -> list[dict]:
    with open(_DB_PATH, encoding="utf-8") as f:
        return json.load(f)


def _contrib(food: dict, amount_g: float) -> dict:
    """Nutrient contribution of `amount_g` grams of food."""
    ratio = amount_g / 100.0
    return {
        "carb_g":      food["carb"]        * ratio,
        "prot_g":      food["protein"]     * ratio,
        "fat_g":       food["fat"]         * ratio,
        "fiber_g":     food["fiber"]       * ratio,
        "micro_score": food["micro_score"] * ratio,
    }


def _score(food: dict, gap: dict) -> float:
    """Phase 1 & 2 score for a candidate food (SUB.md §4.3 / §4.4)."""
    total = 0.0
    for k in _KEYS:
        g = gap.get(k, 0.0)
        if g <= 0:
            continue
        field = _KEY_TO_FIELD[k]
        fill = food[field] * _SERVING_G / 100.0
        total += _WEIGHTS[k] * min(fill / g, 1.0)
    return total


def _coverage_label(ratio: float) -> str:
    if ratio >= _COVERAGE_OK:
        return "足夠"
    if ratio >= 0.70:
        return "略低"
    return "不足"


def _generate_tips(coverage: dict, selections: list[dict]) -> list[str]:
    tips = []
    label_map = {
        "carb":  "碳水化合物",
        "prot":  "蛋白質",
        "fat":   "脂肪",
        "fiber": "膳食纖維",
        "micro": "微量營養素",
    }
    suggestions = {
        "carb":  "可補充一份御釜白飯或台灣芭蕉",
        "prot":  "可多加一份舒胸嫩雞排或溫泉玉子",
        "fat":   "可補充一份美國大杏仁或美國核桃仁",
        "fiber": "可加入翠綠嫩葉菠菜或桂格即食燕麥",
        "micro": "可補充黃金奇異果或翠綠嫩葉菠菜",
    }
    for key, label in label_map.items():
        if coverage[key] == "不足":
            tips.append(f"{label}不足，{suggestions[key]}")
        elif coverage[key] == "略低":
            tips.append(f"{label}略低，{suggestions[key]}")
    return tips


def recommend(gap: dict, db: list[dict] | None = None) -> dict:
    """
    Run two-phase greedy selection.
    gap: Gap dict per TEMP.md §2.2
    Returns: RecommendResult dict per TEMP.md §2.5
    """
    if db is None:
        db = _load_db()

    # Working copy of gap (never go negative)
    g = {k: max(0.0, gap.get(k, 0.0)) for k in _KEYS}
    # Original gap for coverage ratio
    original = {k: v for k, v in g.items()}

    selected: list[dict] = []   # {food, amount_g, contrib}
    remaining = list(db)

    # ── Phase 1: pick the single best food ──────────────────────────────────
    if remaining:
        best = max(remaining, key=lambda f: _score(f, g))
        amount = _SERVING_G
        c = _contrib(best, amount)
        selected.append({"food": best, "amount_g": amount, "contrib": c})
        for k in _KEYS:
            g[k] = max(0.0, g[k] - c[k])
        remaining.remove(best)

    # ── Phase 2: complementary iteration ────────────────────────────────────
    while remaining and len(selected) < _MAX_FOODS:
        # Check termination A: all nutrients sufficient
        if all(
            (original[k] <= 0 or (original[k] - g[k]) / original[k] >= _COVERAGE_OK)
            for k in _KEYS if original[k] > 0
        ):
            break

        scores = {f["id"]: _score(f, g) for f in remaining}
        best_id = max(scores, key=scores.__getitem__)

        # Termination C: < 1% marginal improvement
        if scores[best_id] < _MIN_IMPROVEMENT:
            break

        best = next(f for f in remaining if f["id"] == best_id)
        amount = _SERVING_G
        c = _contrib(best, amount)
        selected.append({"food": best, "amount_g": amount, "contrib": c})
        for k in _KEYS:
            g[k] = max(0.0, g[k] - c[k])
        remaining.remove(best)

    # ── Build output ─────────────────────────────────────────────────────────
    foods_out = []
    for s in selected:
        foods_out.append({
            "name":     s["food"]["name"],
            "category": s["food"]["category"],
            "amount_g": s["amount_g"],
            "contrib":  {k: round(v, 1) for k, v in s["contrib"].items()},
        })

    def _ratio(key: str) -> float:
        orig = original.get(key, 0.0)
        if orig <= 0:
            return 1.0
        eaten = sum(s["contrib"][key] for s in selected)
        return min(eaten / orig, 1.5)

    coverage = {
        "carb":  _coverage_label(_ratio("carb_g")),
        "prot":  _coverage_label(_ratio("prot_g")),
        "fat":   _coverage_label(_ratio("fat_g")),
        "fiber": _coverage_label(_ratio("fiber_g")),
        "micro": _coverage_label(_ratio("micro_score")),
    }

    return {
        "foods":    foods_out,
        "coverage": coverage,
        "tips":     _generate_tips(coverage, selected),
        "ratios": {
            "carb":  round(_ratio("carb_g"),      2),
            "prot":  round(_ratio("prot_g"),      2),
            "fat":   round(_ratio("fat_g"),       2),
            "fiber": round(_ratio("fiber_g"),     2),
            "micro": round(_ratio("micro_score"), 2),
        },
    }


# ── Smoke test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json as _json
    gap = {
        "carb_g":      200.0,
        "prot_g":      80.0,
        "fat_g":       50.0,
        "fiber_g":     20.0,
        "micro_score": 75.0,
    }
    result = recommend(gap)
    print(_json.dumps(result, indent=2, ensure_ascii=False))
