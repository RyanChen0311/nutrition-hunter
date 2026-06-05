// ── MET lookup table ──────────────────────────────────────────────────────────
const MET_OPTIONS = [
  { label: "靜坐辦公",       met: 1.5 },
  { label: "站立工作",       met: 2.0 },
  { label: "步行（一般）",   met: 3.5 },
  { label: "快走",           met: 4.5 },
  { label: "騎自行車（輕）", met: 5.0 },
  { label: "重量訓練",       met: 5.0 },
  { label: "有氧舞蹈",       met: 6.5 },
  { label: "慢跑",           met: 7.0 },
  { label: "游泳",           met: 7.0 },
  { label: "騎自行車（中）", met: 8.0 },
  { label: "跑步（快速）",   met: 9.8 },
];

// 未計算目標前使用的預設每日基準（70kg 成年男性靜態）
const DEFAULT_TARGET = {
  carb_g: 275, prot_g: 56, fat_g: 65, fiber_g: 28, micro_score: 100, sodium_mg: 2300,
};

// Sodium daily limit (WHO recommendation, mg)
const SODIUM_TARGET_MG = 2300;

// ── State ─────────────────────────────────────────────────────────────────────
let currentTarget = null;
let currentGap    = null;

// ── Exercise rows ─────────────────────────────────────────────────────────────
function addExerciseRow() {
  const list = document.getElementById("exercise-list");
  const row  = document.createElement("div");
  row.className = "exercise-row";

  const sel = document.createElement("select");
  MET_OPTIONS.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.met;
    opt.textContent = o.label;
    sel.appendChild(opt);
  });
  sel.value = "3.5";

  const calBadge = document.createElement("span");
  calBadge.className = "cal-badge";

  function refreshCal() {
    const w   = parseFloat(document.getElementById("in-weight").value) || 70;
    const met = parseFloat(sel.value) || 3.5;
    const h   = parseFloat(hrs.value) || 1;
    calBadge.textContent = `≈ ${Math.round(met * w * h)} kcal`;
  }

  const hrs = document.createElement("input");
  hrs.type = "number"; hrs.value = "1";
  hrs.min = "0.1"; hrs.max = "12"; hrs.step = "0.25";
  hrs.placeholder = "小時";
  hrs.className = "hrs-input";

  sel.addEventListener("change", refreshCal);
  hrs.addEventListener("input",  refreshCal);
  refreshCal();

  const btn = document.createElement("button");
  btn.className = "btn-remove";
  btn.textContent = "×";
  btn.onclick = () => row.remove();

  row.appendChild(sel);
  row.appendChild(hrs);
  row.appendChild(calBadge);
  row.appendChild(btn);
  list.appendChild(row);
}

function getExercises() {
  const rows = document.querySelectorAll("#exercise-list .exercise-row");
  const out = [];
  rows.forEach(row => {
    const met  = parseFloat(row.querySelector("select").value);
    const hrs  = parseFloat(row.querySelector("input").value);
    if (!isNaN(met) && !isNaN(hrs) && hrs > 0) out.push({ met, hours: hrs });
  });
  return out;
}

// ── Targets ────────────────────────────────────────────────────────────────────
function calcTargets() {
  const W   = parseFloat(document.getElementById("in-weight").value);
  const H   = parseFloat(document.getElementById("in-height").value);
  const A   = parseFloat(document.getElementById("in-age").value);
  const sex = document.getElementById("in-sex").value;
  const exercises = getExercises();

  if (isNaN(W) || isNaN(H) || isNaN(A)) { alert("請填入正確的體重、身高、年齡。"); return; }

  const target = calcNutritionTargets(W, H, A, sex, exercises);
  const gap    = calcNutritionGap(target, {});

  currentTarget = target;
  currentGap    = gap;

  document.getElementById("tdee-display").innerHTML =
    `<div>BMR：${target.bmr} kcal</div>
     <div>TDEE：${target.tdee} kcal</div>`;

  setAxisTargets(["","","","","",""]);

  // 六角圖下方目標 grid（第六項改為鈉上限）
  const grid = document.getElementById("target-grid");
  grid.classList.remove("hidden");
  grid.innerHTML = [
    ["碳水",  target.carb_g  + "g"],
    ["蛋白質", target.prot_g  + "g"],
    ["脂肪",  target.fat_g   + "g"],
    ["纖維",  target.fiber_g + "g"],
    ["維生素", target.micro_score],
    ["鈉上限", SODIUM_TARGET_MG + "mg"],
  ].map(([n, v]) => `
    <div class="tg-item">
      <span class="tg-label">${n}</span>
      <span class="tg-val">${v}</span>
    </div>`).join("");

  eatenFoods    = {};
  viewingFoodId = null;
  unpinFoodContrib();

  document.querySelectorAll(".cat-card").forEach(c => {
    c.classList.remove("selected", "viewing");
    const btn = c.querySelector(".cat-card-add");
    if (btn) { btn.textContent = "＋加入今日"; btn.classList.remove("added"); }
  });

  document.getElementById("food-list").innerHTML   = "";
  document.getElementById("tips-list").classList.add("hidden");
  document.getElementById("btn-cancel-recommend").classList.add("hidden");

  updateHexFromGap(gap, target);
  updateDeficitPanel();

  document.getElementById("btn-recommend").classList.remove("hidden");
  document.getElementById("rec-placeholder").textContent =
    "加入今日已吃的食物後，點擊「取得推薦」以補足缺口。";
  document.getElementById("rec-placeholder").classList.remove("hidden");
  updateRecommendBtn();
  document.querySelector("button[onclick='calcTargets()']").textContent = "重新計算";
  document.body.classList.add("has-target");
}

// ── Recommend ──────────────────────────────────────────────────────────────────
async function getRecommend() {
  if (!currentGap) return;

  const allMet = Object.values(currentGap).every(v => v <= 0.1);
  if (allMet) {
    document.getElementById("food-list").innerHTML = "";
    document.getElementById("tips-list").classList.add("hidden");
    document.getElementById("btn-cancel-recommend").classList.add("hidden");
    const ph = document.getElementById("rec-placeholder");
    ph.innerHTML = "<strong style='color:#2e7d32;font-size:15px;'>所有營養素已達標！不需要額外補充食物。</strong>";
    ph.classList.remove("hidden");
    return;
  }

  await runRecommend(currentGap, currentTarget);
}

async function runRecommend(gap, target) {
  const result = recommendFoods(gap, allFoods);
  renderRecommend(result, gap, target);
}

function cancelRecommend() {
  document.getElementById("food-list").innerHTML = "";
  document.getElementById("tips-list").classList.add("hidden");
  document.getElementById("btn-cancel-recommend").classList.add("hidden");
  const ph = document.getElementById("rec-placeholder");
  ph.textContent = "已取消推薦，可重新點擊「取得推薦」。";
  ph.classList.remove("hidden");
  updateDeficitPanel();
}

function renderRecommend(result, gap, target) {
  document.getElementById("rec-placeholder").classList.add("hidden");
  document.getElementById("btn-cancel-recommend").classList.remove("hidden");

  const foodList = document.getElementById("food-list");
  foodList.innerHTML = "";
  result.foods.forEach((food, idx) => {
    const card = buildFoodCard(food, idx, gap, target);
    foodList.appendChild(card);
  });

  const tipsList = document.getElementById("tips-list");
  if (result.tips && result.tips.length > 0) {
    tipsList.classList.remove("hidden");
    tipsList.innerHTML = result.tips.map(t => `<li>${t}</li>`).join("");
  } else {
    tipsList.classList.add("hidden");
  }
}

function coverageBadgeClass(label) {
  if (label === "足夠") return "badge-ok";
  if (label === "略低") return "badge-low";
  return "badge-bad";
}

function buildFoodCard(food, idx, gap, target) {
  const card = document.createElement("div");
  card.className = "food-card";
  card.dataset.idx = idx;

  const header = document.createElement("div");
  header.className = "food-header";

  const nameEl = document.createElement("span");
  nameEl.className = "food-name";
  nameEl.textContent = food.name;

  const amtEl = document.createElement("span");
  amtEl.className = "food-amount";
  amtEl.textContent = `${food.category} · ${food.amount_g}g`;

  header.appendChild(nameEl);
  header.appendChild(amtEl);
  card.appendChild(header);

  const bars = document.createElement("div");
  bars.className = "food-bars";

  const barDefs = [
    { key: "carb_g",      label: "碳水",  targetKey: "carb_g" },
    { key: "prot_g",      label: "蛋白質", targetKey: "prot_g" },
    { key: "fat_g",       label: "脂肪",   targetKey: "fat_g" },
    { key: "fiber_g",     label: "纖維",   targetKey: "fiber_g" },
    { key: "micro_score", label: "微量",   targetKey: "micro_score" },
  ];

  barDefs.forEach(bd => {
    const val  = food.contrib[bd.key] || 0;
    const tgt  = target ? (target[bd.targetKey] || 1) : 100;
    const pct  = Math.min((val / tgt) * 100, 100).toFixed(0);

    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-label">${bd.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-val">${val.toFixed(1)}</span>
    `;
    bars.appendChild(row);
  });

  card.appendChild(bars);

  const addBtn = document.createElement("button");
  addBtn.className = "cat-card-add";
  const matched = allFoods.find(f => f.name === food.name);
  addBtn.textContent = matched && eatenFoods[matched.id] ? "✓ 已加入" : "＋加入今日";
  if (matched && eatenFoods[matched.id]) addBtn.classList.add("added");
  addBtn.style.marginTop = "8px";
  addBtn.onclick = (e) => {
    e.stopPropagation();
    if (!matched) return;
    toggleEaten(matched.id);
    addBtn.textContent = eatenFoods[matched.id] ? "✓ 已加入" : "＋加入今日";
    addBtn.classList.toggle("added", !!eatenFoods[matched.id]);
  };
  card.appendChild(addBtn);

  card.addEventListener("mouseenter", () => {
    card.classList.add("active");
    if (target) {
      // Axis 5: sodium contribution of this food relative to daily limit
      const origFood = allFoods.find(f => f.name === food.name);
      const sodiumRatio = origFood ? (origFood.sodium * food.amount_g / 100) / SODIUM_TARGET_MG : 0;
      showFoodContrib([
        food.contrib.carb_g      / target.carb_g,
        food.contrib.prot_g      / target.prot_g,
        food.contrib.fat_g       / target.fat_g,
        food.contrib.fiber_g     / target.fiber_g,
        food.contrib.micro_score / target.micro_score,
        sodiumRatio,
      ]);
    }
  });
  card.addEventListener("mouseleave", () => {
    card.classList.remove("active");
    if (viewingFoodId === null) clearFoodContrib();
  });

  return card;
}

function updateStatsRow(target) {
  const row = document.getElementById("stats-row");
  row.innerHTML = [
    ["碳水", target.carb_g + "g"],
    ["蛋白質", target.prot_g + "g"],
    ["脂肪", target.fat_g + "g"],
    ["纖維", target.fiber_g + "g"],
  ].map(([l, v]) => `<span class="stat-pill">${l} ${v}</span>`).join("");
}

function updateHexFromGap(gap, target) {
  updateFromRatios([0, 0, 0, 0, 0, 0]);
}

// ── 缺口面板 ───────────────────────────────────────────────────────────────────
function updateDeficitPanel() {
  if (!currentTarget) return;
  const panel = document.getElementById("deficit-panel");
  panel.classList.remove("hidden");

  const eaten = computeEatenTotals();
  const defs = [
    { label: "碳水化合物", key: "carb_g",      eaten: eaten.carb_g,      target: currentTarget.carb_g,      unit: "g" },
    { label: "蛋白質",     key: "prot_g",      eaten: eaten.prot_g,      target: currentTarget.prot_g,      unit: "g" },
    { label: "脂肪",       key: "fat_g",       eaten: eaten.fat_g,       target: currentTarget.fat_g,       unit: "g" },
    { label: "膳食纖維",   key: "fiber_g",     eaten: eaten.fiber_g,     target: currentTarget.fiber_g,     unit: "g" },
    { label: "微量營養素", key: "micro_score", eaten: eaten.micro_score, target: currentTarget.micro_score, unit: "" },
    { label: "鈉（上限）", key: "sodium_mg",   eaten: eaten.sodium_mg,   target: SODIUM_TARGET_MG,          unit: "mg", limitAxis: true },
  ];

  const list = document.getElementById("deficit-list");
  list.innerHTML = defs.map(d => {
    const pct    = d.target > 0 ? d.eaten / d.target : 1;
    const remain = Math.max(0, d.target - d.eaten);
    const excess = Math.max(0, d.eaten - d.target);
    const barPct = Math.min(pct * 100, 100).toFixed(0);

    let statusText, statusColor;
    if (d.limitAxis) {
      // 鈉：超標才是問題
      if (pct >= 1) {
        statusText  = `超出 ${excess.toFixed(0)}${d.unit}`;
        statusColor = "#c62828";
      } else {
        statusText  = `尚餘 ${remain.toFixed(0)}${d.unit} 空間`;
        statusColor = "#2e7d32";
      }
    } else if (pct >= 1) {
      statusText  = excess > 0 ? `超出 ${excess.toFixed(1)}${d.unit}` : "✓ 已達標";
      statusColor = "#1565c0";
    } else if (pct >= 0.7) {
      statusText  = `還需 ${remain.toFixed(1)}${d.unit}`;
      statusColor = "#e65100";
    } else {
      statusText  = `還需 ${remain.toFixed(1)}${d.unit}`;
      statusColor = "#c62828";
    }

    const barColor = d.limitAxis
      ? (pct >= 1 ? "#f44336" : "#4caf50")
      : (pct >= 1 ? "#4caf50" : pct >= 0.7 ? "#ff9800" : "#f44336");

    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-size:26px;font-weight:600;">${d.label}</span>
          <span style="font-size:24px;color:${statusColor};font-weight:600;">${statusText}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;height:12px;background:rgba(0,0,0,0.07);border-radius:6px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:${barColor};border-radius:6px;transition:width 0.4s;"></div>
          </div>
          <span style="font-size:20px;color:#888;width:130px;text-align:right;">${d.eaten.toFixed(d.unit === "mg" ? 0 : 1)} / ${d.target}${d.unit}</span>
        </div>
      </div>`;
  }).join("");

  // 六角圖：axis 5 = sodium ratio
  const sodiumRatio = eaten.sodium_mg / SODIUM_TARGET_MG;
  const ratios = [
    currentTarget.carb_g      > 0 ? eaten.carb_g      / currentTarget.carb_g      : 0,
    currentTarget.prot_g      > 0 ? eaten.prot_g      / currentTarget.prot_g      : 0,
    currentTarget.fat_g       > 0 ? eaten.fat_g       / currentTarget.fat_g       : 0,
    currentTarget.fiber_g     > 0 ? eaten.fiber_g     / currentTarget.fiber_g     : 0,
    currentTarget.micro_score > 0 ? eaten.micro_score / currentTarget.micro_score : 0,
    sodiumRatio,
  ];
  updateFromRatios(ratios);
  setIntakeGrams([
    eaten.carb_g, eaten.prot_g, eaten.fat_g,
    eaten.fiber_g, eaten.micro_score, Math.round(eaten.sodium_mg),
  ]);
  setExcessGrams([
    Math.max(0, eaten.carb_g      - currentTarget.carb_g),
    Math.max(0, eaten.prot_g      - currentTarget.prot_g),
    Math.max(0, eaten.fat_g       - currentTarget.fat_g),
    Math.max(0, eaten.fiber_g     - currentTarget.fiber_g),
    Math.max(0, eaten.micro_score - currentTarget.micro_score),
    Math.max(0, eaten.sodium_mg   - SODIUM_TARGET_MG),
  ]);

  currentGap = {
    carb_g:      Math.max(0, currentTarget.carb_g      - eaten.carb_g),
    prot_g:      Math.max(0, currentTarget.prot_g      - eaten.prot_g),
    fat_g:       Math.max(0, currentTarget.fat_g       - eaten.fat_g),
    fiber_g:     Math.max(0, currentTarget.fiber_g     - eaten.fiber_g),
    micro_score: Math.max(0, currentTarget.micro_score - eaten.micro_score),
  };
  updateRecommendBtn();
}

function onHexagonDrag(index, ratio) {}

// ── 新增食物 ───────────────────────────────────────────────────────────────────
function toggleAddFoodForm() {
  const form = document.getElementById("add-food-form");
  const btn  = document.querySelector("#add-food-card .btn-add-ex");
  const hidden = form.classList.toggle("hidden");
  btn.textContent = hidden ? "展開 ▾" : "收起 ▲";
}

function deleteUserFood(foodId) {
  allFoods = allFoods.filter(f => f.id !== foodId);
  const userFoods = JSON.parse(localStorage.getItem("userFoods") || "[]")
    .filter(f => f.id !== foodId);
  localStorage.setItem("userFoods", JSON.stringify(userFoods));
  if (eatenFoods[foodId]) {
    delete eatenFoods[foodId];
    updateDeficitPanel();
    renderEatenList();
    updateRecommendBtn();
  }
  renderCatalog();
}

function submitAddFood() {
  const name   = document.getElementById("af-name").value.trim();
  const cat    = document.getElementById("af-cat").value;
  const carb   = parseFloat(document.getElementById("af-carb").value)   || 0;
  const prot   = parseFloat(document.getElementById("af-prot").value)   || 0;
  const fat    = parseFloat(document.getElementById("af-fat").value)    || 0;
  const fiber  = parseFloat(document.getElementById("af-fiber").value)  || 0;
  const micro  = parseFloat(document.getElementById("af-micro").value)  || 0;
  const sodium = parseFloat(document.getElementById("af-sodium").value) || 0;
  const msg    = document.getElementById("af-msg");

  if (!name) { msg.textContent = "請輸入食物名稱。"; return; }

  const newId = Math.max(...allFoods.map(f => f.id), 0) + 1;
  const food  = { id: newId, name, category: cat, carb,
                  protein: prot, fat, fiber, micro_score: micro, sodium,
                  _user: true };

  const userFoods = JSON.parse(localStorage.getItem("userFoods") || "[]");
  userFoods.push(food);
  localStorage.setItem("userFoods", JSON.stringify(userFoods));

  allFoods.push(food);
  renderCatalog();

  ["af-name","af-carb","af-prot","af-fat","af-fiber","af-micro","af-sodium"]
    .forEach(id => { document.getElementById(id).value = ""; });
  msg.style.color  = "#2e7d32";
  msg.textContent  = `「${food.name}」已新增（儲存於本機）！`;
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

// ── Food Catalog ───────────────────────────────────────────────────────────────
let allFoods       = [];
let catalogFilter  = "全部";
let eatenFoods     = {};
let viewingFoodId  = null;

const CATEGORIES = ["全部", "主食", "肉類", "蛋類", "蔬菜", "水果", "乳製品", "堅果", "豆類"];
const MACRO_MAX  = { carb: 80, protein: 35, fat: 70, fiber: 16 };

async function loadCatalog() {
  try {
    const res       = await fetch("nutrition/food_db.json");
    const baseFoods = await res.json();
    const userFoods = JSON.parse(localStorage.getItem("userFoods") || "[]")
      .map(f => ({ ...f, _user: true }));
    allFoods = [...baseFoods, ...userFoods];

    buildFilterBtns();
    renderCatalog();

    const track = document.getElementById("catalog-track");
    track.addEventListener("wheel", e => {
      if (e.deltaY !== 0) { e.preventDefault(); track.scrollLeft += e.deltaY; }
    }, { passive: false });
  } catch (e) {
    console.warn("無法載入食物資料庫", e);
  }
}

function buildFilterBtns() {
  const container = document.getElementById("catalog-filters");
  container.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat === catalogFilter ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => {
      catalogFilter = cat;
      container.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCatalog();
    };
    container.appendChild(btn);
  });
}

function renderCatalog() {
  const track = document.getElementById("catalog-track");
  track.innerHTML = "";
  const filtered = catalogFilter === "全部"
    ? allFoods
    : allFoods.filter(f => f.category === catalogFilter);
  filtered.forEach(food => track.appendChild(buildCatCard(food)));
}

function foodContribRatios(food) {
  const t = currentTarget || DEFAULT_TARGET;
  return [
    food.carb        / t.carb_g,
    food.protein     / t.prot_g,
    food.fat         / t.fat_g,
    food.fiber       / t.fiber_g,
    food.micro_score / t.micro_score,
    (food.sodium || 0) / SODIUM_TARGET_MG,  // axis 5: sodium vs daily limit
  ];
}

function viewFood(foodId) {
  const food = allFoods.find(f => f.id === foodId);
  if (!food) return;

  if (viewingFoodId === foodId) {
    viewingFoodId = null;
    unpinFoodContrib();
  } else {
    viewingFoodId = foodId;
    pinFoodContrib(foodContribRatios(food));
  }

  document.querySelectorAll(".cat-card").forEach(c => c.classList.remove("viewing"));
  if (viewingFoodId !== null) {
    const card = document.getElementById(`catcard-${viewingFoodId}`);
    if (card) card.classList.add("viewing");
  }
}

function buildCatCard(food) {
  const card = document.createElement("div");
  const isSelected = !!eatenFoods[food.id];
  const isViewing  = viewingFoodId === food.id;
  card.className = "cat-card" + (isSelected ? " selected" : "") + (isViewing ? " viewing" : "");
  card.id = `catcard-${food.id}`;

  const macroWinner = (() => {
    const vals = { carb: food.carb, protein: food.protein, fat: food.fat };
    const top  = Object.entries(vals).sort((a, b) => b[1] - a[1])[0][0];
    return { carb: { label: "碳水", cls: "macro-carb" },
             protein: { label: "蛋白質", cls: "macro-prot" },
             fat:     { label: "脂肪",  cls: "macro-fat" } }[top];
  })();

  const deleteBtn = food._user
    ? `<button class="cat-card-delete" onclick="event.stopPropagation(); deleteUserFood(${food.id})">移除</button>`
    : "";

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
      <div class="cat-card-name" title="${food.name}" style="flex:1;min-width:0;">${food.name}</div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="macro-badge ${macroWinner.cls}">${macroWinner.label}</span>
        ${deleteBtn}
      </div>
    </div>
    <div class="cat-card-cat">${food.category}</div>
    <div class="cat-card-macros">
      ${macroBars(food)}
    </div>
    <button class="cat-card-add${isSelected ? " added" : ""}"
            onclick="event.stopPropagation(); toggleEaten(${food.id})">
      ${isSelected ? "✓ 已加入" : "＋加入今日"}
    </button>
  `;

  card.addEventListener("click", () => viewFood(food.id));
  card.addEventListener("mouseenter", () => {
    if (viewingFoodId !== null) return;
    showFoodContrib(foodContribRatios(food));
  });
  card.addEventListener("mouseleave", () => {
    if (viewingFoodId !== null) return;
    clearFoodContrib();
  });

  return card;
}

function macroBars(food) {
  const defs = [
    { label: "碳水", val: food.carb,    max: MACRO_MAX.carb,    color: "#ff9800" },
    { label: "蛋白", val: food.protein, max: MACRO_MAX.protein, color: "#4caf50" },
    { label: "脂肪", val: food.fat,     max: MACRO_MAX.fat,     color: "#f44336" },
    { label: "纖維", val: food.fiber,   max: MACRO_MAX.fiber,   color: "#8bc34a" },
  ];
  return defs.map(d => {
    const pct = Math.min((d.val / d.max) * 100, 100).toFixed(0);
    return `
      <div class="cat-macro-row">
        <span class="cat-macro-label">${d.label}</span>
        <div class="cat-macro-bar">
          <div class="cat-macro-fill" style="width:${pct}%;background:${d.color}"></div>
        </div>
        <span class="cat-macro-val">${d.val}g</span>
      </div>`;
  }).join("");
}

function toggleEaten(foodId) {
  if (!currentTarget) return;
  const food = allFoods.find(f => f.id === foodId);
  if (!food) return;

  const wasAdded = !!eatenFoods[foodId];
  if (wasAdded) {
    delete eatenFoods[foodId];
    document.getElementById("food-list").innerHTML = "";
    document.getElementById("tips-list").classList.add("hidden");
    const ph = document.getElementById("rec-placeholder");
    ph.textContent = "食物已更新，請重新點擊「取得推薦」。";
    ph.classList.remove("hidden");
  } else {
    eatenFoods[foodId] = { food, amount_g: 100 };
  }

  const card = document.getElementById(`catcard-${foodId}`);
  if (card) {
    card.classList.toggle("selected", !!eatenFoods[foodId]);
    const btn = card.querySelector(".cat-card-add");
    if (btn) {
      btn.textContent = eatenFoods[foodId] ? "✓ 已加入" : "＋加入今日";
      btn.classList.toggle("added", !!eatenFoods[foodId]);
    }
  }

  updateDeficitPanel();
  updateRecommendBtn();
  renderEatenList();
}

// ── 已加入食物清單 ─────────────────────────────────────────────────────────────
function renderEatenList() {
  const panel = document.getElementById("eaten-panel");
  const list  = document.getElementById("eaten-list");
  const count = document.getElementById("eaten-count");
  const items = Object.values(eatenFoods);

  if (items.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  count.textContent = `共 ${items.length} 項`;

  list.innerHTML = items.map(({ food }) => {
    const macros = [
      { label: "碳水", val: food.carb,    color: "#bf6000" },
      { label: "蛋白", val: food.protein, color: "#2e7d32" },
      { label: "脂肪", val: food.fat,     color: "#c62828" },
      { label: "纖維", val: food.fiber,   color: "#558b2f" },
    ].map(m => `<span class="eaten-macro" style="color:${m.color};">${m.label} ${m.val}g</span>`).join("");

    return `
      <div class="eaten-item">
        <div class="eaten-left">
          <span class="eaten-name">${food.name}</span>
          <span class="eaten-cat">${food.category} · 100g</span>
          <div class="eaten-macros">${macros}</div>
        </div>
        <button class="btn-remove" onclick="toggleEaten(${food.id})" title="移除">×</button>
      </div>`;
  }).join("");
}

function updateRecommendBtn() {
  const btn = document.getElementById("btn-recommend");
  if (!btn) return;
  const hasFood = Object.keys(eatenFoods).length > 0;
  const allMet  = currentGap && Object.values(currentGap).every(v => v <= 0.1);
  const enabled = hasFood && !allMet;
  btn.disabled      = !enabled;
  btn.style.opacity = enabled ? "1" : "0.4";
  btn.style.cursor  = enabled ? "pointer" : "not-allowed";
  btn.textContent   = allMet ? "已達標" : "取得推薦";
}

function computeEatenTotals() {
  const totals = { carb_g: 0, prot_g: 0, fat_g: 0, fiber_g: 0, micro_score: 0, sodium_mg: 0 };
  Object.values(eatenFoods).forEach(({ food, amount_g }) => {
    const r = amount_g / 100;
    totals.carb_g      += food.carb        * r;
    totals.prot_g      += food.protein     * r;
    totals.fat_g       += food.fat         * r;
    totals.fiber_g     += food.fiber       * r;
    totals.micro_score += food.micro_score * r;
    totals.sodium_mg   += (food.sodium || 0) * r;
  });
  return totals;
}

function scrollCatalog(dir) {
  const track = document.getElementById("catalog-track");
  track.scrollBy({ left: dir * 480, behavior: "smooth" });
}

// ── Init ────────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  initHexagon("hexCanvas");
  addExerciseRow();
  loadCatalog();
});
