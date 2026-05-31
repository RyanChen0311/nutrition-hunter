"""
Flask API server (ARCH.md §2 / §3).
Routes:
  POST /api/targets    → NutritionTarget
  POST /api/recommend  → RecommendResult
  GET  /api/foods      → full food database list
  POST /api/foods      → add a new food, persist to food_db.json
  GET  /               → serves ../index.html
  GET  /static/*       → serves ../<path>
"""

import os
import sys
import json
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory

# Ensure UTF-8 on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from calc import calc_targets, calc_gap
from recommender import recommend, _load_db

_FOOD_DB   = None  # lazy-loaded cache
_DB_PATH   = Path(__file__).parent / "food_db.json"

def get_food_db():
    global _FOOD_DB
    if _FOOD_DB is None:
        _FOOD_DB = _load_db()
    return _FOOD_DB

def save_food_db(db: list) -> None:
    global _FOOD_DB
    with open(_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    _FOOD_DB = db   # update cache

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")


# ── Static file serving ───────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(ROOT, path)


# ── API: /api/targets ─────────────────────────────────────────────────────────

@app.route("/api/targets", methods=["POST"])
def api_targets():
    """
    Request body (ARCH.md §3):
      { "W": 70, "H": 170, "A": 30, "sex": "male",
        "exercises": [{"met": 7.0, "hours": 1.0}],
        "eaten": {"carb_g": 0, "prot_g": 0, "fat_g": 0, "fiber_g": 0, "micro_score": 0}  // optional
      }
    """
    data = request.get_json(force=True)
    try:
        W   = float(data["W"])
        H   = float(data["H"])
        A   = float(data["A"])
        sex = str(data["sex"]).lower()
        exercises = [(float(e["met"]), float(e["hours"]))
                     for e in data.get("exercises", [])]
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400

    target = calc_targets(W, H, A, sex, exercises)
    eaten  = data.get("eaten", {})
    gap    = calc_gap(target, eaten)

    # Strip internal reference tables before sending
    public_target = {k: v for k, v in target.items() if not k.startswith("_")}

    return jsonify({"target": public_target, "gap": gap})


# ── API: /api/foods ──────────────────────────────────────────────────────────

@app.route("/api/foods", methods=["GET"])
def api_foods():
    """Return full food database (FoodItem[])."""
    return jsonify(get_food_db())


@app.route("/api/foods", methods=["POST"])
def api_add_food():
    """Add a new food and persist to food_db.json."""
    data = request.get_json(force=True)
    required = {"name", "category", "carb", "protein", "fat", "fiber", "micro_score", "sodium"}
    missing = required - set(data.keys())
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    db     = get_food_db()
    new_id = max((f["id"] for f in db), default=0) + 1
    food   = {
        "id":          new_id,
        "name":        str(data["name"]).strip(),
        "category":    str(data["category"]).strip(),
        "carb":        round(float(data["carb"]),        2),
        "protein":     round(float(data["protein"]),     2),
        "fat":         round(float(data["fat"]),         2),
        "fiber":       round(float(data["fiber"]),       2),
        "micro_score": round(float(data["micro_score"]), 1),
        "sodium":      round(float(data["sodium"]),      1),
    }
    db.append(food)
    save_food_db(db)
    return jsonify(food), 201


# ── API: /api/recommend ───────────────────────────────────────────────────────

@app.route("/api/recommend", methods=["POST"])
def api_recommend():
    """
    Request body: Gap dict per TEMP.md §2.2
      { "carb_g": 200, "prot_g": 80, "fat_g": 50,
        "fiber_g": 20, "micro_score": 75 }
    """
    gap = request.get_json(force=True)
    required = {"carb_g", "prot_g", "fat_g", "fiber_g", "micro_score"}
    missing = required - set(gap.keys())
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    result = recommend(gap)
    return jsonify(result)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting server at http://127.0.0.1:{port}/")
    app.run(host="127.0.0.1", port=port, debug=True)
