/**
 * hexagon.js — Nutrition Hexagon Chart
 * Axes (clockwise from top):
 *   0: 碳水化合物  1: 蛋白質  2: 脂肪
 *   3: 膳食纖維    4: 維生素  5: 礦物質
 */

const NUM_POINTS  = 6;
const GRID_LEVELS = 5;
const AXIS_LABELS = ["碳水化合物", "蛋白質", "脂肪", "膳食纖維", "維生素", "礦物質"];

let _canvas, _ctx;
let _cx = 200, _cy = 200, _r = 120, _dpr = 1, _size = 400;

// Layers
let intakeRatios = [0, 0, 0, 0, 0, 0];
let pinnedRatios = null;
let hoverRatios  = null;

// Actual gram values for vertex labels (null = show % fallback)
let _intakeGrams  = null;
let _excessGrams  = null;   // excess grams for orange vertex labels

// Axis target gram labels (shown under axis name when set)
let _axisTargetG = Array(NUM_POINTS).fill("");

// Drag
let _drag = -1;

// ── Init ──────────────────────────────────────────────────────────────────────

function initHexagon(id) {
  _canvas = document.getElementById(id);
  if (!_canvas) return;
  _ctx = _canvas.getContext("2d");
  requestAnimationFrame(() => { _resize(); draw(); });
  _canvas.addEventListener("mousedown",  _mdown);
  _canvas.addEventListener("mousemove",  _mmove);
  _canvas.addEventListener("mouseup",    _mup);
  _canvas.addEventListener("mouseleave", _mup);
  _canvas.addEventListener("touchstart", _tstart, { passive: false });
  _canvas.addEventListener("touchmove",  _tmove,  { passive: false });
  _canvas.addEventListener("touchend",   _mup);
  window.addEventListener("resize", () => { _resize(); draw(); });
}

function _resize() {
  _dpr = window.devicePixelRatio || 1;
  const wrap = _canvas.parentElement;
  const available = wrap ? wrap.clientWidth : 0;
  _size = Math.min(Math.max(available - 32, 200), 420);
  _canvas.width        = _size * _dpr;
  _canvas.height       = _size * _dpr;
  _canvas.style.width  = _size + "px";
  _canvas.style.height = _size + "px";
  _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  _cx = _size / 2;
  _cy = _size / 2;
  _r  = _size * 0.28;   // smaller radius → room for two-line labels
}

// ── Geometry ──────────────────────────────────────────────────────────────────

function _angle(i) {
  return (i / NUM_POINTS) * Math.PI * 2 - Math.PI / 2;
}

function _pt(i, ratio) {
  const d = Math.min(Math.max(ratio, 0), 1.6) * _r;
  const a = _angle(i);
  return [_cx + d * Math.cos(a), _cy + d * Math.sin(a)];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _poly(ratios, fill, stroke, lw) {
  if (!ratios || ratios.length < NUM_POINTS) return;
  _ctx.beginPath();
  for (let i = 0; i < NUM_POINTS; i++) {
    const [x, y] = _pt(i, ratios[i]);
    i === 0 ? _ctx.moveTo(x, y) : _ctx.lineTo(x, y);
  }
  _ctx.closePath();
  _ctx.fillStyle = fill; _ctx.strokeStyle = stroke;
  _ctx.lineWidth = lw;   _ctx.fill();      _ctx.stroke();
}

function _roundRect(x, y, w, h, r) {
  _ctx.beginPath();
  _ctx.moveTo(x + r, y);
  _ctx.lineTo(x + w - r, y);
  _ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  _ctx.lineTo(x + w, y + h - r);
  _ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  _ctx.lineTo(x + r, y + h);
  _ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  _ctx.lineTo(x, y + r);
  _ctx.quadraticCurveTo(x, y,         x + r, y);
  _ctx.closePath();
}

function _axisColor(ratio) {
  if (ratio >= 0.9) return "#2e7d32";
  if (ratio >= 0.7) return "#e65100";
  return "#c62828";
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function draw() {
  if (!_ctx) return;
  _ctx.clearRect(0, 0, _size, _size);

  // ── Grid ──
  _ctx.strokeStyle = "rgba(0,0,0,0.09)";
  _ctx.lineWidth   = 1;
  for (let lv = 1; lv <= GRID_LEVELS; lv++) {
    const rv = lv / GRID_LEVELS;
    _ctx.beginPath();
    for (let i = 0; i < NUM_POINTS; i++) {
      const [x, y] = _pt(i, rv);
      i === 0 ? _ctx.moveTo(x, y) : _ctx.lineTo(x, y);
    }
    _ctx.closePath();
    _ctx.stroke();
  }
  for (let i = 0; i < NUM_POINTS; i++) {
    const [x, y] = _pt(i, 1);
    _ctx.beginPath();
    _ctx.moveTo(_cx, _cy);
    _ctx.lineTo(x, y);
    _ctx.strokeStyle = "rgba(0,0,0,0.09)";
    _ctx.stroke();
  }

  // ── Outer ring (100% target) ──
  _poly(Array(NUM_POINTS).fill(1), "rgba(0,0,0,0.03)", "rgba(0,0,0,0.18)", 1.5);

  // ── Green: intake capped at 100% (orange handles excess) ──
  const cappedIntake = intakeRatios.map(r => Math.min(r, 1.0));
  _poly(cappedIntake, "rgba(76,175,80,0.25)", "rgba(76,175,80,0.88)", 2);

  // ── Deficit dashed lines (intake → 100%) for under-target axes ──
  for (let i = 0; i < NUM_POINTS; i++) {
    const r = intakeRatios[i];
    if (r < 0.98) {
      const [x1, y1] = _pt(i, r);
      const [x2, y2] = _pt(i, 1.0);
      _ctx.save();
      _ctx.setLineDash([4, 4]);
      _ctx.beginPath();
      _ctx.moveTo(x1, y1);
      _ctx.lineTo(x2, y2);
      _ctx.strokeStyle = "rgba(244,67,54,0.50)";
      _ctx.lineWidth   = 1.5;
      _ctx.stroke();
      _ctx.restore();
    }
  }

  // ── Orange: excess from center = (intake - target) / target ──
  const excessRatios = intakeRatios.map(r => Math.max(0, r - 1.0));
  if (excessRatios.some(r => r > 0)) {
    _poly(excessRatios, "rgba(255,152,0,0.50)", "rgba(255,152,0,0.95)", 2);

    // Orange vertex labels (excess grams)
    if (_excessGrams) {
      const _vfs = Math.max(10, Math.round(_size * 0.043));
      _ctx.font         = `bold ${_vfs}px sans-serif`;
      _ctx.textAlign    = "center";
      _ctx.textBaseline = "middle";
      for (let i = 0; i < NUM_POINTS; i++) {
        const ex = _excessGrams[i];
        if (!ex || ex < 0.1) continue;
        const er = excessRatios[i];
        if (er < 0.02) continue;
        const [vx, vy] = _pt(i, er);
        const label = "+" + (ex >= 10 ? Math.round(ex) : ex.toFixed(1)) + "g";
        const tw = _ctx.measureText(label).width;
        const pw = tw + 8, ph = 16, pr = 5;
        _ctx.fillStyle = "rgba(255,237,210,0.95)";
        _roundRect(vx - pw / 2, vy - ph / 2, pw, ph, pr);
        _ctx.fill();
        _ctx.fillStyle = "#bf6000";
        _ctx.fillText(label, vx, vy);
      }
    }
  }

  // ── Pinned / hover food contribution (blue) ──
  const show = pinnedRatios || hoverRatios;
  if (show) {
    _poly(show, "rgba(33,150,243,0.28)", "rgba(33,150,243,1.00)", 2.5);
  }

  // ── Vertex numbers (% at each intake vertex) ──
  const _vfs = Math.max(10, Math.round(_size * 0.043));
  _ctx.font         = `bold ${_vfs}px sans-serif`;
  _ctx.textAlign    = "center";
  _ctx.textBaseline = "middle";
  for (let i = 0; i < NUM_POINTS; i++) {
    const r = intakeRatios[i];
    if (r < 0.04) continue;             // 太靠近圓心時不顯示
    const vr      = Math.min(r, 1.0);   // 頂點位置（green polygon）
    const [vx, vy] = _pt(i, vr);
    const g       = _intakeGrams ? _intakeGrams[i] : null;
    const label   = g != null
      ? (g >= 10 ? Math.round(g) + "g" : g.toFixed(1) + "g")
      : Math.round(r * 100) + "%";
    const tw      = _ctx.measureText(label).width;
    const pw = tw + 8, ph = 16, pr = 5;
    // 白色圓角底板
    _ctx.fillStyle = "rgba(255,255,255,0.90)";
    _roundRect(vx - pw / 2, vy - ph / 2, pw, ph, pr);
    _ctx.fill();
    // 數字
    _ctx.fillStyle = r >= 1.0 ? "#1565c0" : r >= 0.7 ? "#e65100" : "#c62828";
    _ctx.fillText(label, vx, vy);
  }

  // ── Axis labels (name + optional target grams) ──
  const _afs = Math.max(11, Math.round(_size * 0.05));
  _ctx.textAlign    = "center";
  _ctx.textBaseline = "middle";
  for (let i = 0; i < NUM_POINTS; i++) {
    const [x, y] = _pt(i, 1.38);
    const ratio  = intakeRatios[i];

    _ctx.font      = `bold ${_afs}px sans-serif`;
    _ctx.fillStyle = _axisColor(ratio);
    _ctx.fillText(AXIS_LABELS[i], x, y);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function updateFromRatios(ratios) {
  intakeRatios = ratios.map(r => Math.min(Math.max(+r || 0, 0), 1.5));
  draw();
}

/** Pass actual gram values so vertex labels show grams instead of %. */
function setIntakeGrams(grams) {
  _intakeGrams = grams ? grams.map(v => +v || 0) : null;
  draw();
}

/** Pass excess gram values to show on orange vertices. */
function setExcessGrams(grams) {
  _excessGrams = grams ? grams.map(v => +v || 0) : null;
  draw();
}

/** Set target gram labels shown under each axis name. */
function setAxisTargets(labels) {
  _axisTargetG = labels.map(l => l || "");
  draw();
}

function pinFoodContrib(ratios) {
  pinnedRatios = ratios.map(r => Math.min(Math.max(+r || 0, 0), 1.5));
  draw();
}

function unpinFoodContrib() {
  pinnedRatios = null;
  draw();
}

function showFoodContrib(ratios) {
  hoverRatios = ratios.map(r => Math.min(Math.max(+r || 0, 0), 1.5));
  draw();
}

function clearFoodContrib() {
  hoverRatios = null;
  draw();
}

function resetHexagon() {
  intakeRatios = Array(NUM_POINTS).fill(0);
  pinnedRatios = null;
  hoverRatios  = null;
  _axisTargetG = Array(NUM_POINTS).fill("");
  _intakeGrams = null;
  _excessGrams = null;
  draw();
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function _nearest(x, y) {
  let best = -1, bd = Infinity;
  intakeRatios.forEach((r, i) => {
    const [px, py] = _pt(i, r);
    const d = Math.hypot(x - px, y - py);
    if (d < bd && d < 24) { bd = d; best = i; }
  });
  return best;
}

function _project(idx, x, y) {
  const a = _angle(idx);
  return Math.max(0, Math.min((( x - _cx) * Math.cos(a) + (y - _cy) * Math.sin(a)) / _r, 1.5));
}

function _xy(e) {
  const rect = _canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function _mdown(e) { const [x, y] = _xy(e); _drag = _nearest(x, y); }

function _mmove(e) {
  const [x, y] = _xy(e);
  if (_drag >= 0) {
    intakeRatios[_drag] = _project(_drag, x, y);
    draw();
    if (typeof onHexagonDrag === "function") onHexagonDrag(_drag, intakeRatios[_drag]);
  } else {
    _canvas.style.cursor = _nearest(x, y) >= 0 ? "grab" : "default";
  }
}

function _mup() { _drag = -1; _canvas.style.cursor = "default"; }

function _tstart(e) {
  e.preventDefault();
  const [x, y] = _xy(e.touches[0]);
  _drag = _nearest(x, y);
}

function _tmove(e) {
  e.preventDefault();
  if (_drag < 0) return;
  const [x, y] = _xy(e.touches[0]);
  intakeRatios[_drag] = _project(_drag, x, y);
  draw();
  if (typeof onHexagonDrag === "function") onHexagonDrag(_drag, intakeRatios[_drag]);
}
