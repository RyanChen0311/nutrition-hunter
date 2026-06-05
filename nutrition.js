/**
 * nutrition.js — Pure JS port of calc.py + recommender.py
 * No server required. Works entirely in the browser.
 */

// ── calc.py port ──────────────────────────────────────────────────────────────

function calcBMR(W, H, A, sex) {
  return 10 * W + 6.25 * H - 5 * A + (sex === "male" ? 5 : -161);
}

function calcNutritionTargets(W, H, A, sex, exercises) {
  const bmr  = calcBMR(W, H, A, sex);
  const t_ex = exercises.reduce((s, e) => s + e.hours, 0);
  const e_ex = exercises.reduce((s, e) => s + e.met * W * e.hours, 0);
  const tdee = bmr * (23.6 - t_ex) / 24 + e_ex;

  const f_p = t_ex === 0 ? 0.8
            : t_ex <= 1  ? 1.2
            : t_ex <= 2  ? 1.5 : 2.0;

  const r = (v) => Math.round(v * 10) / 10;
  return {
    tdee:        r(tdee),
    bmr:         r(bmr),
    carb_g:      r(0.55 * tdee / 4),
    prot_g:      r(Math.max(0.15 * tdee / 4, W * f_p)),
    fat_g:       r(0.30 * tdee / 9),
    fiber_g:     r(tdee / 1000 * 14),
    micro_score: 100.0,
    sodium_mg:   2300,   // WHO daily sodium limit (mg)
  };
}

function calcNutritionGap(target, eaten) {
  const keys = ["carb_g", "prot_g", "fat_g", "fiber_g", "micro_score"];
  const gap  = {};
  keys.forEach(k => { gap[k] = Math.max(0, (target[k] || 0) - (eaten[k] || 0)); });
  return gap;
}

// ── recommender.py port ───────────────────────────────────────────────────────

const _REC_KEYS = ["carb_g", "prot_g", "fat_g", "fiber_g", "micro_score"];
const _KEY_TO_FIELD = {
  carb_g: "carb", prot_g: "protein", fat_g: "fat",
  fiber_g: "fiber", micro_score: "micro_score",
};
const _W        = 1 / _REC_KEYS.length;
const _SERVING  = 150;
const _MAX_FOOD = 8;
const _MIN_IMP  = 0.01;
const _OK_THR   = 0.90;

function _contrib(food, amount_g) {
  const r = amount_g / 100;
  return {
    carb_g:      food.carb        * r,
    prot_g:      food.protein     * r,
    fat_g:       food.fat         * r,
    fiber_g:     food.fiber       * r,
    micro_score: food.micro_score * r,
  };
}

function _score(food, gap) {
  let s = 0;
  _REC_KEYS.forEach(k => {
    const g = gap[k] || 0;
    if (g <= 0) return;
    const fill = food[_KEY_TO_FIELD[k]] * _SERVING / 100;
    s += _W * Math.min(fill / g, 1.0);
  });
  return s;
}

function _label(ratio) {
  return ratio >= _OK_THR ? "足夠" : ratio >= 0.7 ? "略低" : "不足";
}

function recommendFoods(gap, db) {
  const g    = {};
  _REC_KEYS.forEach(k => { g[k] = Math.max(0, gap[k] || 0); });
  const orig = { ...g };

  const sel  = [];
  const pool = [...db];

  // Phase 1
  if (pool.length) {
    const best = pool.reduce((a, b) => _score(b, g) > _score(a, g) ? b : a);
    const c = _contrib(best, _SERVING);
    sel.push({ food: best, contrib: c });
    _REC_KEYS.forEach(k => { g[k] = Math.max(0, g[k] - c[k]); });
    pool.splice(pool.indexOf(best), 1);
  }

  // Phase 2
  while (pool.length && sel.length < _MAX_FOOD) {
    const allOk = _REC_KEYS.every(k =>
      orig[k] <= 0 || (orig[k] - g[k]) / orig[k] >= _OK_THR
    );
    if (allOk) break;

    const best = pool.reduce((a, b) => _score(b, g) > _score(a, g) ? b : a);
    if (_score(best, g) < _MIN_IMP) break;

    const c = _contrib(best, _SERVING);
    sel.push({ food: best, contrib: c });
    _REC_KEYS.forEach(k => { g[k] = Math.max(0, g[k] - c[k]); });
    pool.splice(pool.indexOf(best), 1);
  }

  // Ratios
  function ratio(k) {
    if ((orig[k] || 0) <= 0) return 1.0;
    const eaten = sel.reduce((s, x) => s + (x.contrib[k] || 0), 0);
    return Math.min(eaten / orig[k], 1.5);
  }

  const coverage = {
    carb:  _label(ratio("carb_g")),
    prot:  _label(ratio("prot_g")),
    fat:   _label(ratio("fat_g")),
    fiber: _label(ratio("fiber_g")),
    micro: _label(ratio("micro_score")),
  };

  const tips = [];
  const sugg = {
    carb:  "可補充一份御釜白飯或台灣芭蕉",
    prot:  "可多加一份舒胸嫩雞排或溫泉玉子",
    fat:   "可補充一份美國大杏仁或美國核桃仁",
    fiber: "可加入翠綠嫩葉菠菜或桂格即食燕麥",
    micro: "可補充黃金奇異果或翠綠嫩葉菠菜",
  };
  const lm = { carb:"碳水化合物", prot:"蛋白質", fat:"脂肪", fiber:"膳食纖維", micro:"微量營養素" };
  Object.entries(coverage).forEach(([k, v]) => {
    if (v === "不足") tips.push(`${lm[k]}不足，${sugg[k]}`);
    else if (v === "略低") tips.push(`${lm[k]}略低，${sugg[k]}`);
  });

  const rnd2 = v => Math.round(v * 100) / 100;
  return {
    foods: sel.map(s => ({
      name:     s.food.name,
      category: s.food.category,
      amount_g: _SERVING,
      contrib:  Object.fromEntries(
        Object.entries(s.contrib).map(([k, v]) => [k, Math.round(v * 10) / 10])
      ),
    })),
    coverage,
    tips,
    ratios: {
      carb:  rnd2(ratio("carb_g")),
      prot:  rnd2(ratio("prot_g")),
      fat:   rnd2(ratio("fat_g")),
      fiber: rnd2(ratio("fiber_g")),
      micro: rnd2(ratio("micro_score")),
    },
  };
}
