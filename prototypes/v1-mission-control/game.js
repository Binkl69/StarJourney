/* StarJourney — ENGINE
   Turn loop: choose lane → travel (costs) → event card → maybe crisis → repeat → descent → ending.
   Story content lives in content.js; this file only runs the rules. */
(() => {
"use strict";
const C = window.SJ;
const $ = s => document.querySelector(s);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COL = { c:"#5ee6e0", o:"#ff7a2e", amber:"#ffb300", red:"#ff4d4d", green:"#5fd68a", dim:"#8a919b", dim2:"#586070", t:"#e9e7e2", bg:"#12171e" };
const TYPE = { nebula:["Nebula","NEB"], derelict:["Derelict","DER"], planet:["Planet","PLN"], trade:["Trade post","TRD"], anomaly:["Anomaly","ANM"], unknown:["Unknown","???"], earth:["Earth","EARTH"], halcyon:["Halcyon","HALCYON"] };
const SYS = { engines:["Engines","+4 fuel, +2 days per jump"], life:["Life support","Supplies drain 60% faster"], shields:["Shields","Nebulae & debris hit harder"], sensors:["Sensors","Can't see what's ahead"] };
const RES = [ ["fuel","Fuel"], ["sup","Supplies"], ["hull","Hull"], ["parts","Spare parts"] ];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n, w = 3) => String(Math.max(0, Math.round(n))).padStart(w, "0");

/* ── Seeded randomness: same seed, same map and dice ── */
function mulberry(seed) {
  let a = 0; for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const WORDS = ["ORION","VEGA","LYRA","DRACO","CETUS","HYDRA","PAVO","CRUX","ARA","NORMA","TUCANA","VELA"];
const newSeed = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${10 + Math.floor(Math.random() * 90)}`;

let S = null, R = Math.random;
const roll = p => R() < p;
const pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const alive = () => S.crew.filter(m => m.alive);

/* ── The toolbox event cards use (see content.js header) ── */
const ctx = {
  get S() { return S; }, v: {},
  roll, pick, shuffle, alive,
  first: m => (m ? m.first : "Someone"),
  role(r) { return alive().filter(m => m.role === r).sort((a, b) => a.stress - b.stress)[0] || null; },
  check(r, base) { const m = ctx.role(r); const p = m ? base + .25 - (m.stress > 70 ? .2 : 0) : base * .6; return roll(clamp(p, .05, .95)); },
  hurt(m, n) { if (!m || !m.alive) return; m.hp = clamp(m.hp - n, 0, 100); if (n > 0) m.stress = clamp(m.stress + Math.round(n / 3), 0, 100); },
  stress(t, n) { (t === "all" ? alive() : [t]).forEach(m => { if (m && m.alive) m.stress = clamp(m.stress + n, 0, 100); }); },
  res(k, d) { S[k] = k === "hull" ? clamp(S[k] + d, 0, 100) : Math.max(0, S[k] + d); },
  days(n) { S.day = Math.max(0, S.day + n); },
  flag: k => !!S.flags[k],
  set(k) { S.flags[k] = true; },
  sys(name, state) { if (state === undefined) return S.sys[name]; if (S.sys[name] !== state) { S.sys[name] = state; if (state !== "ok") log("MASTER CAUTION", `${SYS[name][0]} damaged. ${SYS[name][1]}.`, "sys"); } return state; },
  discover(t) { if (!S.disc.includes(t)) { S.disc.push(t); log("RAMAN", `Discovery logged: ${t}.`); } },
  avgStress() { const a = alive(); return a.length ? a.reduce((s, m) => s + m.stress, 0) / a.length : 0; },
};

/* ── Legacy (per-browser; the game works without it) ── */
const LKEY = "starjourney.legacy.v1";
function loadLegacy() { try { return JSON.parse(localStorage.getItem(LKEY)) || { runs: 0, best: 0, fallen: [], endings: [] }; } catch (_) { return { runs: 0, best: 0, fallen: [], endings: [] }; } }
function saveLegacy(L) { try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (_) {} }
let legacy = loadLegacy();

/* ── Map ─────────────────────────────── */
const W = 760, H = 320;
function buildMap() {
  const L = C.JUMPS + 1, layers = [];
  const bag = ["nebula","nebula","nebula","derelict","derelict","derelict","planet","planet","planet","anomaly","anomaly","trade","trade","unknown"];
  for (let i = 0; i < L; i++) {
    const n = (i === 0 || i === L - 1) ? 1 : 2 + (roll(.55) ? 1 : 0);
    const col = [];
    for (let j = 0; j < n; j++) {
      const y = n === 1 ? H / 2 : 46 + (H - 92) * (j / (n - 1)) + (R() - .5) * 20;
      const t = i === 0 ? "earth" : i === L - 1 ? "halcyon" : pick(bag);
      col.push({ x: 42 + i * (W - 84) / (L - 1) + (R() - .5) * 14, y, t, out: [] });
    }
    layers.push(col);
  }
  for (let i = 0; i < L - 1; i++) {
    const a = layers[i], b = layers[i + 1];
    a.forEach((nd, j) => {
      const k = Math.round(j * (b.length - 1) / Math.max(1, a.length - 1));
      nd.out.push(k);
      if (b.length > 1 && roll(.6)) nd.out.push(clamp(k + (roll(.5) ? -1 : 1), 0, b.length - 1));
      if (a.length === 1) b.forEach((_, q) => nd.out.push(q)); // from a single node, every lane is open
    });
    b.forEach((_, k) => { if (!a.some(nd => nd.out.includes(k))) pick(a).out.push(k); });
    a.forEach(nd => { nd.out = [...new Set(nd.out)].sort(); if (nd.out.length === 1 && b.length > 1 && roll(.5)) nd.out.push(nd.out[0] === 0 ? 1 : nd.out[0] - 1); nd.out = [...new Set(nd.out)].sort(); });
  }
  return layers;
}

/* ── Travel ──────────────────────────── */
function preview(nd) {
  let d = 17, f = 9; const risk = [];
  if (nd.t === "nebula") { d -= 5; risk.push("hull damage"); }
  if (nd.t === "derelict") d += 2;
  if (nd.t === "planet") { d += 1; f -= 3; }
  if (nd.t === "anomaly") risk.push("time is unpredictable");
  if (nd.t === "unknown") risk.push("anything");
  if (S.sys.engines !== "ok") { f += 4; d += 2; }
  const eat = Math.round(alive().length * d * .125 * (S.sys.life === "ok" ? 1 : 1.6));
  return { d, f, eat, risk };
}
function travel(j) {
  const nd = S.map[S.layer + 1][j], p = preview(nd);
  let d = p.d;
  if (nd.t === "anomaly") d += Math.round((R() - .5) * 16);
  if (nd.t === "unknown") d += Math.round((R() - .5) * 8);
  d = Math.max(4, d);
  const short = Math.max(0, p.f - S.fuel);
  S.fuel = Math.max(0, S.fuel - p.f);
  if (short > 0) { const extra = Math.ceil(short * 1.5); d += extra; log("SOL", `Fuel tanks dry. Coasting on momentum: +${extra} days.`, "sys"); }
  if (nd.t === "nebula") { let h = 4 + Math.floor(R() * 9); if (S.sys.shields !== "ok") h = Math.round(h * 1.8); ctx.res("hull", -h); log("SOL", `Nebula transit. Hull abrasion −${h}.`); }
  S.day += d;
  S.sup -= alive().length * d * .125 * (S.sys.life === "ok" ? 1 : 1.6);
  if (S.sup < 0) { S.sup = 0; alive().forEach(m => ctx.hurt(m, 22)); log("SATO", "We're out of food. Everyone's weak. We need supplies, fast.", "sys"); }
  ctx.res("hull", -4); // wear and tear
  const medic = ctx.role("medic");
  alive().forEach(m => {
    m.stress = clamp(m.stress + 5 + Math.floor(R() * 6), 0, 100);
    if (m.stress > 80) ctx.hurt(m, 6);                                   // exhaustion
    if (m.hp < 40) { if (medic && medic !== m) m.hp = clamp(m.hp + 8, 0, 100); else ctx.hurt(m, 10); } // untreated injuries worsen
  });
  alive().forEach(m => { if (m.stress >= 100) { m.stress = 65; ctx.hurt(m, 20); log(m.first.toUpperCase(), "…I need a minute. I need a lot of minutes.", "sys"); } });
  S.layer++; S.node = j; S.path.push(j);
  snapshot();
  log("SOL", `Jump ${S.layer} complete: ${TYPE[nd.t][0]}, ${d} days in transit.`, "sol");
  beep(1500, .04);
}
function snapshot() { S.hist.push({ fuel: S.fuel, sup: S.sup, hull: S.hull, parts: S.parts }); }

/* ── Deaths & end conditions ─────────── */
function checkDeaths() {
  S.crew.forEach(m => {
    if (m.alive && m.hp <= 0) {
      m.alive = false; m.died = S.day; m.last = null;
      log("BIOMED", `Vital signs lost: ${m.name}. Day ${Math.round(S.day)}.`, "dead");
      beep(220, .6);
    }
  });
}
const over = () => S.hull <= 0 || alive().length === 0;

/* ── Event dealing ───────────────────── */
function safe(fn, fallback) { try { return fn(); } catch (e) { console.error(e); return fallback; } }
function deal(type) {
  const pool = C.EVENTS.filter(e =>
    (e.once === false || !S.used.has(e.id)) && e.id !== S.lastEvent &&
    (e.tags.includes(type) || e.tags.includes("any")) &&
    (!e.when || safe(() => e.when(ctx), false)));
  if (!pool.length) return null;
  const w = pool.map(e => (e.weight || 1) * (e.tags.includes(type) ? 3 : 1) * (e.when ? 2.5 : 1));
  let r = R() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
const DESCENT = {
  id: "descent", title: "Halcyon Descent", tags: [],
  text: () => "Halcyon fills the window: green, cloud-wrapped, very much not calm. One last call, Control. How do we bring her down?",
  choices: [
    { label: "Hot descent", hint: "Pilot check · fast", go: c => { if (c.check("pilot", .5)) return "A textbook burn. Merry kisses the atmosphere and glides home."; c.res("hull", -25); c.hurt(c.pick(c.alive()), 45); return "Too steep. Fire on the windows, alarms everywhere, one hard landing."; } },
    { label: "Careful orbital burn", hint: "−15 fuel (or hull if empty)", go: c => { if (c.S.fuel >= 15) { c.res("fuel", -15); return "Slow, patient, perfect. Nobody breathes until touchdown."; } c.res("hull", -15); return "Not enough fuel to do it gently. Merry does it anyway, loudly."; } },
    { label: "Wait for a clean weather window", hint: "+6 days · −10 supplies", go: c => { c.days(6); c.res("sup", -10); return "Six days in orbit, staring at the ground. Then a clear sky and the softest landing of anyone's career."; } },
  ],
};
function openEvent(e) {
  ctx.v = e.setup ? safe(() => e.setup(ctx), {}) : {};
  S.cur = e; S.phase = "event"; S.outcome = null;
  if (e.id !== "descent") { S.used.add(e.id); S.lastEvent = e.id; }
  log("INCOMING", e.title, "you");
  beep(1100, .05); setTimeout(() => beep(1400, .05), 90);
}
function choose(i) {
  const e = S.cur, ch = e.choices[i];
  if (!ch || (ch.req && !safe(() => ch.req(ctx), false))) return;
  log("CONTROL", ch.label, "you");
  const out = safe(() => ch.go(ctx), "…");
  S.outcome = { title: e.title, choice: ch.label, text: out };
  log("MERIDIAN", out);
  S.cur = null;
  checkDeaths();
  if (e.id === "descent" || over()) return finish();
  if (!maybeCrisis(S.map[S.layer][S.node].t)) S.phase = "choose";
  render();
}

/* ── Crisis: timed power routing ─────── */
let crisis = null, crisisTimer = 0;
function maybeCrisis(type) {
  if (S.layer >= C.JUMPS || S.crises >= 3) return false;
  let p = { nebula: .3, anomaly: .35, derelict: .2 }[type] ?? .12;
  if (S.hull < 50) p += .15;
  if ((S.crises < 1 && S.layer >= 3) || (S.crises < 2 && S.layer >= 6) || roll(p)) { startCrisis(); return true; }
  return false;
}
function startCrisis() {
  const cr = pick(C.CRISES.filter(x => !S.crisisUsed.includes(x.id))) || pick(C.CRISES);
  S.crisisUsed.push(cr.id); S.crises++;
  const eng = ctx.role("engineer");
  let time = 15 + (eng ? 5 : 0);
  if (S.flags.warned && !S.flags.warned_used) { S.flags.warned_used = true; time += 8; }
  crisis = { cr, power: 2 + (eng ? 1 : 0), on: new Set(), end: performance.now() + time * 1000, time, eng };
  S.phase = "crisis";
  log("MASTER CAUTION", cr.title, "sys");
  beep(880, .15); setTimeout(() => beep(660, .15), 180); setTimeout(() => beep(880, .15), 360);
  renderCrisis();
  clearInterval(crisisTimer);
  crisisTimer = setInterval(tickCrisis, 100);
}
function tickCrisis() {
  if (!crisis) return;
  const left = Math.max(0, crisis.end - performance.now());
  const bar = $("#crTimer"), txt = $("#crLeft");
  if (bar) bar.style.width = (left / (crisis.time * 1000) * 100) + "%";
  if (txt) txt.textContent = (left / 1000).toFixed(1) + "s";
  if (left <= 0) commitCrisis(true);
}
function commitCrisis(timeout) {
  if (!crisis) return;
  clearInterval(crisisTimer);
  const { cr, on } = crisis; crisis = null;
  if (timeout) log("SOL", "Out of time. Routing defaults.", "sys");
  cr.systems.forEach(s => { if (on.has(s.id)) log("CONTROL", `Power to ${s.name}.`, "you"); });
  cr.systems.forEach(s => { if (!on.has(s.id)) { safe(() => s.go(ctx)); log("MERIDIAN", `${s.name} unpowered: ${s.miss}.`, "sys"); } });
  checkDeaths();
  $("#ovCrisis").hidden = true;
  if (over()) return finish();
  S.phase = "choose";
  render();
}

/* ── Repairs (spend parts between jumps) ── */
const repairCost = () => (ctx.role("engineer") ? 1 : 2);
function repair(name) { const c = repairCost(); if (S.phase !== "choose" || S.parts < c || S.sys[name] === "ok") return; S.parts -= c; S.sys[name] = "ok"; log("CONTROL", `Repair ${SYS[name][0]} (−${c} parts).`, "you"); log(ctx.role("engineer") ? ctx.role("engineer").first.toUpperCase() : "MERIDIAN", `${SYS[name][0]} back online.`); render(); }
function patchHull() { if (S.phase !== "choose" || S.parts < 1 || S.hull >= 100) return; S.parts -= 1; ctx.res("hull", 12); log("CONTROL", "Patch hull (−1 part, +12 hull).", "you"); render(); }

/* ── Run lifecycle ───────────────────── */
let prep = { crew: new Set(["okafor", "vey", "sato", "raman"]), load: "balanced", seed: newSeed() };
function startRun() {
  const L = C.LOADOUTS.find(l => l.id === prep.load);
  R = mulberry(prep.seed);
  S = {
    seed: prep.seed, runId: String(Math.random()), day: 0, fuel: L.fuel, sup: L.sup, hull: 100, parts: L.parts,
    crew: C.ROSTER.filter(m => prep.crew.has(m.id)).map(m => ({ ...m, hp: 100, alive: true, phase: R(), x: 0, last: null })),
    sys: { engines: "ok", life: "ok", shields: "ok", sensors: "ok" },
    flags: {}, used: new Set(), lastEvent: null, disc: [], log: [], hist: [],
    layer: 0, node: 0, path: [0], sel: null, phase: "choose", cur: null, outcome: null, crises: 0, crisisUsed: [],
  };
  S.map = buildMap();
  snapshot();
  log("SOL", `Good morning, Control. Meridian is clear of Earth orbit with ${S.crew.length} aboard. Halcyon is ${C.JUMPS} jumps out.`, "sol");
  log(S.crew[0].first.toUpperCase(), S.crew[0].line);
  log("SOL", "Pick our first lane on the route map. Days, fuel and supplies all matter. So do they.", "sol");
  $("#ovPrep").hidden = true; $("#ovEnd").hidden = true;
  render();
}
function jump() {
  if (S.phase !== "choose" || S.sel == null) return;
  const j = S.sel; S.sel = null; S.outcome = null;
  travel(j);
  checkDeaths();
  if (over()) return finish();
  const nd = S.map[S.layer][S.node];
  const e = nd.t === "halcyon" ? DESCENT : deal(nd.t);
  if (e) openEvent(e); else if (!maybeCrisis(nd.t)) S.phase = "choose";
  render();
}
function finish() {
  S.phase = "end";
  const end = C.ENDINGS.find(e => safe(() => e.when(S), false));
  const survivors = alive().length, arrived = S.hull > 0 && end.id !== "lost";
  const late = Math.round(S.day - C.TARGET_DAY);
  const score = Math.max(0, Math.round(survivors * 25 + (arrived ? S.hull / 2 + 20 : 0) + S.disc.length * 10 + (arrived ? clamp(-late, -30, 30) : 0)));
  legacy.runs++; legacy.best = Math.max(legacy.best, score);
  S.crew.filter(m => !m.alive).forEach(m => legacy.fallen.push({ name: m.name, run: legacy.runs, day: Math.round(m.died) }));
  if (!legacy.endings.includes(end.id)) legacy.endings.push(end.id);
  saveLegacy(legacy);
  renderEnd(end, { survivors, late, score, arrived });
  render();
}

/* ── Log ─────────────────────────────── */
function log(who, msg, cls = "") {
  if (!S) return;
  S.log.push({ day: S.day, who, msg, cls: cls || (who === "SOL" ? "sol" : "") });
  if (S.log.length > 120) S.log.shift();
}

/* ── Rendering ───────────────────────── */
function render() {
  if (!S) return;
  $("#hDay").textContent = "D" + pad(S.day);
  const left = Math.round(C.TARGET_DAY - S.day), eta = $("#hEta");
  eta.textContent = left >= 0 ? `T−${left}d` : `+${-left}d late`;
  eta.className = "v " + (left >= 0 ? "o" : "late");
  $("#hJump").textContent = `${S.layer}/${C.JUMPS}`;
  $("#seedChip").textContent = "Seed " + S.seed;
  $("#legacyFoot").textContent = `RUNS FLOWN: ${legacy.runs} · BEST SCORE: ${legacy.best}${legacy.fallen.length ? " · FALLEN: " + legacy.fallen.length : ""}`;
  const mc = $("#mc"); mc.className = "mc" + (S.phase === "crisis" ? " on" : "") + (reduce && S.phase === "crisis" ? "" : "");
  renderMap(); renderPlan(); renderEvent(); renderLog(); renderCrew(); renderShip();
  $("#pRoute").classList.toggle("hot", S.phase === "choose");
  $("#pComms").classList.toggle("hot", S.phase === "event");
}
function renderMap() {
  const svg = $("#map"), L = S.map, cur = L[S.layer][S.node];
  const reach = S.phase === "choose" && S.layer < C.JUMPS ? cur.out : [];
  const blind = S.sys.sensors !== "ok";
  let h = "";
  for (let i = 0; i < L.length - 1; i++) L[i].forEach((nd, j) => nd.out.forEach(k => {
    const m = L[i + 1][k];
    const flown = i < S.layer && S.path[i] === j && S.path[i + 1] === k;
    const nxt = i === S.layer && S.node === j && reach.includes(k);
    const sel = nxt && S.sel === k;
    const col = flown ? COL.o : nxt ? COL.c : COL.dim2;
    h += `<line x1="${nd.x}" y1="${nd.y}" x2="${m.x}" y2="${m.y}" stroke="${col}" stroke-width="${flown || sel ? 2.4 : 1.2}" ${flown || sel ? "" : 'stroke-dasharray="3 5"'} opacity="${flown || nxt ? 1 : .45}"/>`;
  }));
  L.forEach((col, i) => col.forEach((nd, j) => {
    const here = i === S.layer && j === S.node, past = i < S.layer && S.path[i] === j;
    const isReach = i === S.layer + 1 && reach.includes(j), sel = isReach && S.sel === j;
    const hidden = blind && !here && !past && i > S.layer && nd.t !== "halcyon";
    const code = hidden ? "???" : TYPE[nd.t][1];
    const stroke = here || past ? COL.o : isReach ? COL.c : COL.dim;
    const fill = here ? COL.o : sel ? COL.c : COL.bg;
    const attrs = isReach ? `class="node reach${sel ? " sel" : ""}" tabindex="0" role="button" data-j="${j}" aria-label="Plan jump to ${hidden ? "unknown contact" : TYPE[nd.t][0]}"` : `class="node"`;
    let shape;
    if (nd.t === "earth") shape = `<circle class="ring" cx="${nd.x}" cy="${nd.y}" r="10" fill="${here ? COL.o : COL.bg}" stroke="${COL.c}" stroke-width="1.6"/>`;
    else if (nd.t === "halcyon") shape = `<circle class="ring" cx="${nd.x}" cy="${nd.y}" r="12" fill="${here ? COL.o : isReach && sel ? COL.c : COL.bg}" stroke="${isReach ? COL.c : COL.t}" stroke-width="1.8"/><circle cx="${nd.x}" cy="${nd.y}" r="17" fill="none" stroke="${COL.t}" stroke-width=".8" stroke-dasharray="2 3"/>`;
    else shape = `<rect class="ring" x="${nd.x - 7}" y="${nd.y - 7}" width="14" height="14" transform="rotate(45 ${nd.x} ${nd.y})" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    const pulse = isReach && !sel && !reduce ? `<circle cx="${nd.x}" cy="${nd.y}" r="12" fill="none" stroke="${COL.c}" stroke-width="1"><animate attributeName="r" values="10;17;10" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="2.2s" repeatCount="indefinite"/></circle>` : "";
    const hit = isReach ? `<circle cx="${nd.x}" cy="${nd.y}" r="22" fill="transparent"/>` : "";
    const ly = nd.y + (nd.t === "halcyon" ? 32 : 24);
    const lcol = here ? COL.o : isReach ? COL.c : (past ? COL.o : COL.dim);
    h += `<g ${attrs}>${hit}${pulse}${shape}<text x="${nd.x}" y="${ly}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${isReach || here || nd.t === "earth" || nd.t === "halcyon" ? 11 : 9.5}" font-weight="${isReach || here ? 600 : 400}" letter-spacing=".08em" fill="${lcol}">${code}</text></g>`;
  }));
  h += `<path d="M${cur.x - 5} ${cur.y - 20} l5 7 l5 -7 z" fill="${COL.o}"/>`;
  svg.innerHTML = h;
  svg.querySelectorAll(".node.reach").forEach(g => {
    const j = +g.dataset.j;
    g.addEventListener("click", () => { S.sel = j; render(); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); S.sel = j; render(); $("#jumpBtn").focus(); } });
  });
}
function renderLanes() {
  const box = $("#lanes");
  if (S.phase !== "choose" || S.layer >= C.JUMPS) { box.innerHTML = ""; return; }
  const cur = S.map[S.layer][S.node], blind = S.sys.sensors !== "ok";
  box.innerHTML = cur.out.map(k => {
    const nd = S.map[S.layer + 1][k], p = preview(nd), hid = blind && nd.t !== "halcyon";
    return `<button class="lane" type="button" data-k="${k}" aria-pressed="${S.sel === k}"><span class="n">${hid ? "Unknown contact" : TYPE[nd.t][0]}</span><span class="d">~${p.d}d · −${p.f} fuel${!hid && p.risk.length ? " · risk" : ""}</span></button>`;
  }).join("");
  box.querySelectorAll(".lane").forEach(b => b.addEventListener("click", () => { S.sel = +b.dataset.k; render(); }));
}
function renderPlan() {
  renderLanes();
  const txt = $("#planTxt"), btn = $("#jumpBtn");
  btn.disabled = true; btn.textContent = "Jump";
  if (S.phase === "end") { txt.innerHTML = "Run complete. Start a new run to fly again."; return; }
  if (S.phase === "event") { txt.innerHTML = "Incoming transmission. Answer it in <b>Comms</b> before plotting the next jump."; return; }
  if (S.phase === "crisis") { txt.innerHTML = "<span class='risk'>Crisis in progress.</span>"; return; }
  if (S.sel == null) { txt.innerHTML = `Tap a <b style="color:var(--c)">cyan</b> waypoint to plan the next jump. ${S.layer === C.JUMPS - 1 ? "<b>Next stop: Halcyon.</b>" : ""}`; return; }
  const nd = S.map[S.layer + 1][S.sel], p = preview(nd), blind = S.sys.sensors !== "ok" && nd.t !== "halcyon";
  const name = blind ? "Unknown contact" : TYPE[nd.t][0];
  const risk = blind ? ["sensors down, anything could be out there"] : p.risk;
  const fuelNote = p.f > S.fuel ? ` <span class="risk">(not enough fuel: you'll coast, slowly)</span>` : "";
  txt.innerHTML = `<b>${esc(name)}</b> · ~${p.d} days · −${p.f} fuel${fuelNote} · −${p.eat} supplies${risk.length ? ` · <span class="risk">${esc(risk.join(", "))}</span>` : ""}`;
  btn.disabled = false; btn.textContent = nd.t === "halcyon" ? "Begin approach" : "Jump";
}
function renderEvent() {
  const box = $("#event"), chip = $("#commsChip");
  if (S.phase === "event" && S.cur) {
    const e = S.cur, nd = S.map[S.layer][S.node];
    chip.className = "chip c"; chip.textContent = "Incoming";
    box.innerHTML = `<div class="ev live"><div class="evk">Incoming · ${esc(TYPE[nd.t][0])} · Day ${Math.round(S.day)}</div><h3>${esc(e.title)}</h3><p>${esc(safe(() => e.text(ctx), ""))}</p>
      <div class="choices">${e.choices.map((ch, i) => {
        const ok = !ch.req || safe(() => ch.req(ctx), false);
        const hint = typeof ch.hint === "function" ? safe(() => ch.hint(ctx), "") : (ch.hint || "");
        return `<button class="ch" type="button" data-i="${i}" ${ok ? "" : "disabled"}><span class="l">${esc(ch.label)}</span><span class="h">${esc(ok ? hint : "Unavailable · " + hint)}</span></button>`;
      }).join("")}</div></div>`;
    box.querySelectorAll(".ch").forEach(b => b.addEventListener("click", () => choose(+b.dataset.i)));
    return;
  }
  chip.className = "chip"; chip.textContent = "Link up";
  if (S.outcome) {
    box.innerHTML = `<div class="ev"><div class="evk">${esc(S.outcome.title)} · you chose: ${esc(S.outcome.choice)}</div><p class="out">${esc(S.outcome.text)}</p><p class="next">${S.phase === "choose" ? "→ Plot the next jump on the route map." : ""}</p></div>`;
  } else if (S.phase === "choose") {
    box.innerHTML = `<div class="ev"><div class="evk">Standing by</div><p class="out">${S.layer === 0 ? "Meridian is fuelled and waiting. Choose the first lane on the route map." : "Quiet on the link. Choose the next lane."}</p></div>`;
  } else box.innerHTML = "";
}
function renderLog() {
  const el = $("#log");
  el.innerHTML = S.log.map(l => `<li class="${l.cls}"><time>D${pad(l.day)}</time><div><span class="who">${esc(l.who)}</span><span class="msg">${esc(l.msg)}</span></div></li>`).join("");
  el.scrollTop = el.scrollHeight;
}
function renderCrew() {
  const box = $("#crew");
  if (box.dataset.run !== S.runId) {
    box.dataset.run = S.runId;
    box.innerHTML = S.crew.map(m => `<article class="cc" id="cc-${m.id}"><header><div><h3>${esc(m.name)}</h3><div class="role">${m.role}</div></div><div class="hr"><span>--</span><small>BPM</small></div></header><canvas aria-hidden="true"></canvas><div class="bars"><div><div class="k"><span>Health</span><span class="hpv"></span></div><div class="bar hp"><i></i></div></div><div><div class="k"><span>Stress</span><span class="stv"></span></div><div class="bar st"><i></i></div></div></div><p class="quote"></p></article>`).join("");
    S.crew.forEach(m => { m.el = $("#cc-" + m.id); m.cv = m.el.querySelector("canvas"); m.last = null; m.x = 0; });
  }
  S.crew.forEach(m => {
    const el = m.el; el.classList.toggle("dead", !m.alive);
    el.querySelector(".hpv").textContent = Math.round(m.hp);
    el.querySelector(".stv").textContent = Math.round(m.stress);
    el.querySelector(".bar.hp i").style.width = m.hp + "%";
    el.querySelector(".bar.hp").classList.toggle("low", m.hp < 35);
    el.querySelector(".bar.st i").style.width = m.stress + "%";
    el.querySelector(".bar.st").classList.toggle("hi", m.stress > 70);
    el.querySelector(".quote").textContent = !m.alive ? `Lost on day ${Math.round(m.died)}.` : m.hp < 35 ? "Injured. Needs rest and a medic." : m.stress > 70 ? "Close to breaking." : `“${m.line}”`;
    if (!m.alive) el.querySelector(".hr span").textContent = "0";
  });
  const n = alive().length, chip = $("#crewChip");
  chip.textContent = `${n} of ${S.crew.length} aboard`;
  chip.className = "chip " + (n === S.crew.length ? "ok" : n ? "warn" : "bad");
  if (reduce) S.crew.forEach(m => drawECG(m, 3.2));
}
function renderShip() {
  const box = $("#ship"), canAct = S.phase === "choose", rc = repairCost();
  box.innerHTML = RES.map(([k, name]) => {
    const v = Math.round(S[k]);
    const lvl = k === "parts" ? (v === 0 ? "crit" : v < 2 ? "low" : "") : (v < 15 ? "crit" : v < 30 ? "low" : "");
    const act = k === "hull" ? `<button class="act" type="button" data-act="patch" ${canAct && S.parts >= 1 && S.hull < 100 ? "" : "disabled"}>Patch +12 · 1 part</button>` : "";
    const sub = k === "sup" ? `<span class="sub">~${Math.round(alive().length * .125 * 17 * (S.sys.life === "ok" ? 1 : 1.6))} per jump</span>` : k === "fuel" ? `<span class="sub">~${9 + (S.sys.engines === "ok" ? 0 : 4)} per jump</span>` : k === "parts" ? `<span class="sub">Repairs, patches, trade</span>` : "";
    return `<div class="res ${lvl}"><div class="top"><span class="k">${name}</span><span class="v">${v}${k === "hull" ? "%" : ""}</span></div><canvas data-k="${k}" aria-hidden="true"></canvas>${sub}${act}</div>`;
  }).join("") + `<div class="systems">${Object.keys(SYS).map(k => {
    const bad = S.sys[k] !== "ok";
    return `<div class="sy ${bad ? "bad" : ""}"><span class="led"></span><span class="n">${SYS[k][0]} · ${bad ? "damaged" : "go"}</span>${bad ? `<span class="fx">${SYS[k][1]}</span><button class="act" type="button" data-sys="${k}" ${canAct && S.parts >= rc ? "" : "disabled"}>Repair · ${rc} part${rc > 1 ? "s" : ""}</button>` : ""}</div>`;
  }).join("")}</div>`;
  box.querySelectorAll("canvas").forEach(cv => drawSpark(cv, cv.dataset.k));
  box.querySelector('[data-act="patch"]').addEventListener("click", patchHull);
  box.querySelectorAll("[data-sys]").forEach(b => b.addEventListener("click", () => repair(b.dataset.sys)));
  const bad = Object.values(S.sys).filter(v => v !== "ok").length, chip = $("#shipChip");
  chip.textContent = bad ? `${bad} system${bad > 1 ? "s" : ""} damaged` : "All systems go";
  chip.className = "chip " + (bad ? "warn" : "ok");
  $("#pShip").classList.toggle("alert", bad > 0 || S.hull < 30);
}
function fit(cv) { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1, w = Math.round(r.width * d), h = Math.round(r.height * d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return cv.getContext("2d"); }
function drawSpark(cv, k) {
  const g = fit(cv), Wc = cv.width, Hc = cv.height, d = devicePixelRatio || 1;
  const vals = S.hist.map(s => s[k]), max = k === "parts" ? Math.max(8, ...vals) : k === "hull" ? 100 : Math.max(100, ...vals);
  g.clearRect(0, 0, Wc, Hc);
  g.strokeStyle = "rgba(94,230,224,.07)"; g.lineWidth = 1;
  for (let i = 1; i < C.JUMPS + 1; i++) { const x = Math.round(i / C.JUMPS * Wc) + .5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hc); g.stroke(); }
  const X = i => i / C.JUMPS * (Wc - 6 * d) + 3 * d, Y = v => Hc - 4 * d - v / max * (Hc - 8 * d);
  if (k !== "parts" && k !== "hull") { g.strokeStyle = "rgba(255,179,0,.35)"; g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(0, Y(15)); g.lineTo(Wc, Y(15)); g.stroke(); g.setLineDash([]); }
  const last = vals[vals.length - 1], col = (k !== "parts" && last < 15) || (k === "parts" && last === 0) ? COL.red : (k !== "parts" && last < 30) ? COL.amber : COL.c;
  g.beginPath(); vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = col; g.lineWidth = 1.6 * d; g.stroke();
  g.lineTo(X(vals.length - 1), Hc); g.lineTo(X(0), Hc); g.closePath(); g.fillStyle = "rgba(94,230,224,.08)"; g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(X(vals.length - 1), Y(last), 3 * d, 0, 7); g.fill();
}

/* ── ECG: heart rate follows stress; flatline on death ── */
function ecg(t) { const G = (m, s, a) => a * Math.exp(-((t - m) ** 2) / (2 * s * s)); return G(.18, .025, .12) + G(.36, .008, -.12) + G(.4, .01, 1) + G(.44, .01, -.25) + G(.66, .045, .28); }
function drawECG(m, dt) {
  if (!m.cv) return;
  const cv = m.cv, g = fit(cv), Wc = cv.width, Hc = cv.height, d = devicePixelRatio || 1, speed = Wc / 3.2;
  if (!m.last) { g.clearRect(0, 0, Wc, Hc); m.last = { x: 0, y: Hc * .72 }; m.x = 0; }
  const hr = m.alive ? 56 + m.stress * .55 + (100 - m.hp) * .25 + Math.sin(performance.now() / 4000 + m.phase * 6) * 2 : 0;
  const steps = Math.max(1, Math.round(dt * speed / (2 * d)));
  g.lineWidth = 1.4 * d; g.strokeStyle = m.alive ? (m.hp < 35 ? COL.amber : COL.c) : COL.red; g.lineCap = "round";
  for (let s = 0; s < steps; s++) {
    m.x += dt * speed / steps; if (m.alive) m.phase = (m.phase + dt / steps * hr / 60) % 1;
    if (m.x >= Wc) { m.x = 0; m.last.x = 0; }
    const y = m.alive ? Hc * .72 - ecg(m.phase) * Hc * .58 : Hc * .72;
    g.clearRect(m.x + d, 0, 10 * d, Hc);
    g.beginPath(); g.moveTo(m.last.x, m.last.y); g.lineTo(m.x, y); g.stroke();
    m.last = { x: m.x, y };
  }
  if (m.alive) m.el.querySelector(".hr span").textContent = Math.round(hr);
}
let lastT = performance.now();
function frame(t) { const dt = Math.min(.1, (t - lastT) / 1000); lastT = t; if (S) S.crew.forEach(m => drawECG(m, dt)); requestAnimationFrame(frame); }
if (!reduce) requestAnimationFrame(frame);
addEventListener("resize", () => { if (!S) return; S.crew.forEach(m => { m.last = null; }); renderShip(); });

/* ── Overlays ────────────────────────── */
function renderPrep() {
  const ov = $("#ovPrep"), n = prep.crew.size;
  $("#ovEnd").hidden = true;
  ov.innerHTML = `<div class="sheet"><section class="p" aria-labelledby="prepH"><span class="bk"></span>
    <div class="kicker">Meridian Control · Pre-launch</div>
    <h2 class="big" id="prepH">Halcyon is ${C.JUMPS} jumps and ${C.TARGET_DAY} days away.</h2>
    <p class="lede">You don't fly the ship. You make the calls. Pick the lanes, answer the crew, route power when things break. Get as many of them to Halcyon as you can, as intact as you can, as close to day ${C.TARGET_DAY} as you can.</p>
    <h3 class="sec">Crew · choose 4 (${n}/4)</h3>
    <div class="pick">${C.ROSTER.map(m => `<button class="opt" type="button" data-crew="${m.id}" aria-pressed="${prep.crew.has(m.id)}"><span class="n">${esc(m.name)}</span><span class="r">${m.role}</span><span class="d">“${esc(m.line)}”</span></button>`).join("")}</div>
    <h3 class="sec">Loadout</h3>
    <div class="pick">${C.LOADOUTS.map(l => `<button class="opt" type="button" data-load="${l.id}" aria-pressed="${prep.load === l.id}"><span class="n">${esc(l.name)}</span><span class="d">${esc(l.desc)}</span><span class="stats">Fuel ${l.fuel} · Supplies ${l.sup} · Parts ${l.parts}</span></button>`).join("")}</div>
    <div class="launch"><div class="note">Seed <b style="color:var(--c)">${prep.seed}</b>: same seed, same map. <button class="sbtn" type="button" id="reroll">New seed</button></div>
      <button class="go" type="button" id="launch" ${n === 4 ? "" : "disabled"}>${n === 4 ? "Launch" : `Pick ${4 - n} more`}</button></div>
    <p class="lede" style="font-size:12.5px">Tip: pilots help with flying checks, engineers with repairs and crises, medics with injuries and illness, scientists with discoveries. Without one, those options get harder or disappear.</p>
  </section></div>`;
  ov.hidden = false;
  ov.querySelectorAll("[data-crew]").forEach(b => b.addEventListener("click", () => { const id = b.dataset.crew; if (prep.crew.has(id)) prep.crew.delete(id); else if (prep.crew.size < 4) prep.crew.add(id); renderPrep(); }));
  ov.querySelectorAll("[data-load]").forEach(b => b.addEventListener("click", () => { prep.load = b.dataset.load; renderPrep(); }));
  $("#reroll").addEventListener("click", () => { prep.seed = newSeed(); renderPrep(); });
  $("#launch").addEventListener("click", startRun);
}
function renderCrisis() {
  const ov = $("#ovCrisis"), c = crisis; if (!c) return;
  const used = c.on.size;
  ov.innerHTML = `<div class="sheet crisis"><section class="p alert" aria-labelledby="crH"><span class="bk"></span>
    <div class="kicker" style="color:var(--amber)">Master caution · crisis</div>
    <h2 class="big" id="crH">${esc(c.cr.title)}</h2>
    <p class="lede">${esc(c.cr.text)} Route power to what you can't afford to lose. Anything left dark takes the hit.${c.eng ? ` ${esc(c.eng.first)} squeezed out an extra unit.` : ""}</p>
    <div class="pw">Power units <b>${c.power - used}</b> / ${c.power} free · <span id="crLeft">${c.time.toFixed(1)}s</span></div>
    <div class="timer"><i id="crTimer" style="width:100%"></i></div>
    <div class="syspick">${c.cr.systems.map(s => `<button class="opt" type="button" data-s="${s.id}" aria-pressed="${c.on.has(s.id)}"><span class="n">${esc(s.name)}</span><span class="r">${c.on.has(s.id) ? "Powered" : "Dark"}</span><span class="d">If dark: ${esc(s.miss)}</span></button>`).join("")}</div>
    <div class="launch"><div class="note">Tap systems to power them. You can't save everything.</div><button class="go" type="button" id="crGo">Commit routing</button></div>
  </section></div>`;
  ov.hidden = false;
  ov.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.s; if (c.on.has(id)) c.on.delete(id); else if (c.on.size < c.power) c.on.add(id); else return;
    beep(900, .03); renderCrisis(); tickCrisis();
  }));
  $("#crGo").addEventListener("click", () => commitCrisis(false));
  tickCrisis();
}
function renderEnd(end, r) {
  const ov = $("#ovEnd");
  const lateTxt = !r.arrived ? "—" : r.late > 0 ? `${r.late}d late` : r.late < 0 ? `${-r.late}d early` : "On time";
  const beats = [];
  if (S.flags.charts) beats.push("You pulled Nadia out of a derelict pod. She's staying on Halcyon.");
  if (S.flags.spaced_pod) beats.push("The pod you spaced is still out there. Knocking.");
  if (S.flags.debt && !S.flags.debt_paid) beats.push("Dace never got paid. Dace will remember.");
  if (S.flags.debt_paid) beats.push("Your debt to Dace is settled.");
  if (S.flags.ai_awake) beats.push("Sol asked if caring was a malfunction. You said no.");
  if (S.flags.ai_tool) beats.push("Sol ran a diagnostic and never asked again.");
  S.disc.forEach(d => beats.push("Discovery: " + d));
  ov.innerHTML = `<div class="sheet"><section class="p ${r.arrived ? "" : "alert"}" aria-labelledby="endH"><span class="bk"></span>
    <div class="kicker">${r.arrived ? `Arrival report · day ${Math.round(S.day)}` : "Loss of signal"}</div>
    <h2 class="big" id="endH">${esc(end.title)}</h2>
    <p class="lede">${esc(end.text(S))}</p>
    <div class="score"><div><div class="k">Who landed</div><div class="v">${r.survivors}/${S.crew.length}</div></div><div><div class="k">Hull</div><div class="v">${Math.round(S.hull)}%</div></div><div><div class="k">Arrival</div><div class="v">${lateTxt}</div></div><div><div class="k">Score</div><div class="v" style="color:var(--o)">${r.score}</div></div></div>
    <h3 class="sec">The crew</h3>
    <div class="fate">${S.crew.map(m => `<div class="${m.alive ? "" : "lost"}">${esc(m.name)} · ${m.alive ? (m.hp < 35 ? "landed, injured" : "landed") : `lost, day ${Math.round(m.died)}`}</div>`).join("")}</div>
    ${beats.length ? `<h3 class="sec">How the story went</h3><ul class="list">${beats.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    ${legacy.fallen.length ? `<h3 class="sec">Memorial wall · all runs</h3><p class="lede" style="font-size:13px">${legacy.fallen.slice(-12).map(f => `${esc(f.name)} (run ${f.run})`).join(" · ")}</p>` : ""}
    <div class="launch"><div class="note">Runs flown: ${legacy.runs} · Best score: ${legacy.best} · Endings found: ${legacy.endings.length}/${C.ENDINGS.length}</div><button class="go" type="button" id="again">Fly again</button></div>
  </section></div>`;
  ov.hidden = false;
  $("#again").addEventListener("click", () => { prep.seed = newSeed(); renderPrep(); });
}

/* ── Sound (off until the viewer turns it on) ── */
let ac = null, sound = false;
$("#snd").addEventListener("click", e => {
  sound = !sound; e.currentTarget.setAttribute("aria-pressed", String(sound)); e.currentTarget.textContent = sound ? "Sound on" : "Sound off";
  if (sound && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  beep(1200, .05);
});
function beep(f, d) { if (!sound || !ac) return; try { const o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; o.frequency.value = f; g.gain.setValueAtTime(.035, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d); } catch (_) {} }

$("#jumpBtn").addEventListener("click", jump);
$("#newRun").addEventListener("click", () => { if (crisis) { clearInterval(crisisTimer); crisis = null; $("#ovCrisis").hidden = true; } prep.seed = newSeed(); renderPrep(); });

/* ── Boot: a sample run sits behind the launch sheet so the dashboard is never empty ── */
startRun();
renderPrep();
})();
