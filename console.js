/* StarJourney — CONSOLE
   You are the Meridian's control panel. This file runs the hardware:
   reactor & heat → power faders → systems; ship rooms; NAV scope travel;
   DRONE exploration of derelicts; RADAR battles; terminal; lamps; sound.
   Content & tuning live in data.js. */
(() => {
"use strict";
const D = window.DATA, T = D.TUNE;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const GRN = "#6dff8a", GRN_D = "#1f7a35", AMB = "#ffb347", AMB_D = "#8a5a14", RED = "#ff5a3c";
const SYSTEMS = [ // fader order on the panel
  { k: "eng", lbl: "ENG", room: "engine" }, { k: "life", lbl: "LIFE", room: "life" }, { k: "sens", lbl: "SENS", room: "sensor" },
  { k: "drone", lbl: "DRONE", room: "drone" }, { k: "shd", lbl: "SHLD", room: "shield" }, { k: "wpn", lbl: "WPN", room: "weapon" },
];
const node = id => D.SECTOR.nodes.find(n => n.id === id);
const linked = (a, b) => D.SECTOR.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/* ── State ── */
let S;
function newGame() {
  S = { hull: D.START.hull, maxHull: D.START.hull, fuel: D.START.fuel, o2: D.START.o2, scrap: D.START.scrap,
    layout: D.START_LAYOUT.slice(), alloc: { eng: 2, life: 1, sens: 0, drone: 0, shd: 0, wpn: 0 }, eff: {},
    reactor: 4, heat: 12, coolant: false, scram: 0, charge: 0, at: "start", target: null, visited: new Set(["start"]), done: new Set(),
    mode: "nav", sel: null, explore: null, combat: null, travel: null, time: 0, over: false, core: false };
  computePower();
}
const has = room => S.layout.includes(room);

/* ── Power: reactor output is shared across the faders ── */
function demand() { return SYSTEMS.reduce((n, s) => n + (has(s.room) ? S.alloc[s.k] : 0), 0) + (S.coolant ? 1 : 0); }
function supply() { return S.scram > 0 ? 0 : S.reactor; }
function computePower() {
  const d = demand(), sp = supply(), ratio = d > sp ? sp / Math.max(1, d) : 1;
  SYSTEMS.forEach(s => { S.eff[s.k] = has(s.room) ? Math.floor(S.alloc[s.k] * ratio + 1e-6) : 0; });
  S.overload = d > sp;
}
function safePoint() { return T.safeOutput + (has("battery") ? 2 : 0) + (S.coolant ? T.coolantShift * (has("coolant") ? 2 : 1) : 0); }

/* ── Tick ── */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (S && !S.over && booted) tick(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}
function tick(dt) {
  S.time += dt;
  computePower();
  // Reactor heat
  if (S.scram > 0) { S.scram -= dt; S.heat = Math.max(0, S.heat - 18 * dt); if (S.scram <= 0) { log("REACTOR RESTART COMPLETE.", "grn"); sfx("relay"); } }
  else {
    const over = S.reactor - safePoint();
    S.heat = clamp(S.heat + (over > 0 ? over * T.heatPerPoint : over * 1.6) * dt, 0, 100);
    if (S.heat >= 100) { S.scram = 6; S.heat = 72; log("CORE OVERHEAT. AUTOMATIC SCRAM. ALL SYSTEMS DOWN.", "alert"); sfx("alarm"); shake(); }
  }
  // Air
  if (S.eff.life >= 1) S.o2 = Math.min(100, S.o2 + T.o2Regen * dt);
  else { S.o2 = Math.max(0, S.o2 - T.o2Drain * dt); if (!S.warnedO2 && S.o2 < 60) { S.warnedO2 = true; log("LIN: LIFE SUPPORT HAS NO POWER. WE'RE BREATHING OUR RESERVE.", "alert"); } }
  if (S.eff.life >= 1) S.warnedO2 = false;
  if (S.o2 <= 0) return lose("o2");
  // Jump drive
  if (S.target && !S.travel && S.fuel >= jumpCost(S.target)) S.charge = Math.min(100, S.charge + S.eff.eng * T.jumpCharge * dt);
  // Travel animation
  if (S.travel) { S.travel.t += dt / 1.6; if (S.travel.t >= 1) arrive(); }
  if (S.combat) combatTick(dt);
  if (S.explore && S.eff.drone < 1 && !S.explore.stalled) { S.explore.stalled = true; log("DRONE LINK LOST: NO POWER TO DRONE BAY.", "alert"); sfx("err"); }
  if (S.explore && S.eff.drone >= 1 && S.explore.stalled) { S.explore.stalled = false; log("DRONE LINK RESTORED.", "grn"); }
  ui();
}
const jumpCost = id => D.SECTOR.jumpCost[id] ?? D.SECTOR.jumpCost.default;

/* ── NAV: pick a linked destination, charge engines, engage ── */
function selectTarget(id) {
  if (S.travel || id === S.at) return;
  if (!linked(S.at, id)) { log("NO DIRECT ROUTE. PLOT VIA A LINKED POINT."); sfx("err"); return; }
  if (S.target !== id) S.charge = 0;
  S.target = id; sfx("blip");
  const n = node(id), known = revealed(id);
  log(`COURSE PLOTTED: ${known ? n.name : "UNIDENTIFIED CONTACT"}. COST ${jumpCost(id)} FUEL. CHARGE ENGINES.`);
  if (S.fuel < jumpCost(id)) log("INSUFFICIENT FUEL FOR THIS JUMP.", "alert");
}
function engage() {
  if (!S.target || S.charge < 100 || S.travel) return;
  if (S.explore) { log("RECALL THE DRONE BEFORE JUMPING.", "alert"); sfx("err"); return; }
  S.fuel -= jumpCost(S.target); S.travel = { from: S.at, to: S.target, t: 0 };
  if (S.combat) { log("EMERGENCY JUMP. WE'RE OUT OF HERE."); S.combat = null; }
  S.charge = 0; log("JUMP ENGAGED."); sfx("jump"); setMode("nav");
}
function arrive() {
  const id = S.travel.to; S.travel = null; S.at = id; S.target = null; S.visited.add(id);
  const n = node(id); sfx("relay");
  log(`ARRIVED: ${n.name}.`, "grn"); log(D.ARRIVE[n.type]);
  if (n.type === "beacon" && !S.done.has(id)) { S.done.add(id); log(D.BEACON, "grn"); }
  if (n.type === "rocks" && !S.done.has(id)) {
    S.done.add(id); const layers = S.eff.shd;
    const dmg = Math.max(0, 4 - layers * 2); S.hull -= dmg; S.scrap += 3; S.fuel += 1;
    log(dmg ? `ICE STRIKES: HULL -${dmg}. MINED 3 SCRAP, 1 FUEL.` : "SHIELDS DEFLECT THE ICE. MINED 3 SCRAP, 1 FUEL.", dmg ? "alert" : "grn");
    if (dmg) shake(); if (S.hull <= 0) return lose("hull");
  }
  if (n.type === "hostile" && !S.done.has(id)) startCombat(n);
  if (n.type === "gate") return win();
  if (S.mode === "nav") renderActions();
}
function revealed(id) {
  if (S.visited.has(id)) return true;
  const s = S.eff.sens; if (s >= 2) return true;
  if (s >= 1) return linked(S.at, id);
  return false;
}

/* ── SHIP: build / demolish rooms ── */
let buildSlot = null;
function shipClick(i) {
  if (S.combat || S.explore) { log("CREW BUSY. ROOM WORK WHEN IT'S QUIET.", "alert"); sfx("err"); return; }
  S.sel = i; buildSlot = S.layout[i] ? null : i; sfx("tick"); renderShip();
}
function build(i, room) {
  const R = D.ROOMS[room]; if (S.scrap < R.cost || S.layout[i] || has(room)) return;
  S.scrap -= R.cost; S.layout[i] = room; buildSlot = null; sfx("build");
  log(`${R.name} BUILT. -${R.cost} SCRAP.${R.sys ? " NEW FADER ONLINE." : ""}`, "grn");
  renderFaders(); renderShip();
}
function demolish(i) {
  const room = S.layout[i], R = D.ROOMS[room]; if (!room || R.fixed) return;
  const back = Math.floor(R.cost / 2); S.layout[i] = null; S.scrap += back; if (R.sys) S.alloc[R.sys] = 0;
  sfx("demolish"); log(`${R.name} STRIPPED FOR PARTS. +${back} SCRAP.`); renderFaders(); renderShip();
}

/* ── DRONE: explore a derelict ── */
function dock() {
  const n = node(S.at);
  if (!n.map || S.done.has(S.at)) return;
  if (!has("drone")) { log("NO DRONE BAY. BUILD ONE ON THE SHIP SCREEN.", "alert"); sfx("err"); return; }
  if (S.eff.drone < 1) { log("DRONE BAY HAS NO POWER. RAISE THE DRONE FADER.", "alert"); sfx("err"); return; }
  const M = D.MAPS[n.map], grid = M.grid.map(r => r.split(""));
  let pos = null; grid.forEach((r, y) => r.forEach((c, x) => { if (c === "A") pos = { x, y }; }));
  const bat = T.droneBattery(S.eff.drone);
  S.explore = { M, grid, pos, bat, maxBat: bat, seen: new Set(), carry: { scrap: 0, fuel: 0, o2: 0 }, logI: 0, jammed: new Set(), stalled: false, pulse: 0 };
  see(1); log(`DRONE LAUNCHED INTO ${M.title}. BATTERY ${bat}.`, "grn"); log(M.note); sfx("launch"); setMode("drone");
}
function see(r) { const E = S.explore; for (let y = E.pos.y - r; y <= E.pos.y + r; y++) for (let x = E.pos.x - r; x <= E.pos.x + r; x++) if (E.grid[y] && E.grid[y][x] !== undefined) E.seen.add(x + "," + y); }
function droneMove(dx, dy) {
  const E = S.explore; if (!E || E.stalled) { if (E) sfx("err"); return; }
  const nx = E.pos.x + dx, ny = E.pos.y + dy, c = E.grid[ny] && E.grid[ny][nx];
  if (!c || c === "#") { sfx("err"); return; }
  if (c === "T" && !E.jammed.has(nx + "," + ny)) { log("SENTRY BLOCKS THE CORRIDOR. SCAN TO JAM IT.", "alert"); sfx("err"); return; }
  E.pos = { x: nx, y: ny }; E.bat -= T.droneMove; see(1); sfx("step");
  const cargo = has("cargo") ? 1 : 0;
  if (c === "S") { const n = 2 + cargo; E.carry.scrap += n; E.grid[ny][nx] = "."; log(`SALVAGE: +${n} SCRAP IN DRONE HOLD.`, "grn"); sfx("pick"); }
  if (c === "F") { E.carry.fuel += 2; E.grid[ny][nx] = "."; log("FUEL CELL: +2 FUEL IN DRONE HOLD.", "grn"); sfx("pick"); }
  if (c === "O") { E.carry.o2 += 30; E.grid[ny][nx] = "."; log("OXYGEN CANISTER: +30 O₂ IN DRONE HOLD.", "grn"); sfx("pick"); }
  if (c === "L") { E.grid[ny][nx] = "."; log(E.M.logs[E.logI++] || "LOG CORRUPTED."); sfx("blip"); }
  if (c === "C") { E.grid[ny][nx] = "."; S.core = true; log(E.M.core, "grn"); sfx("pick"); }
  if (c === "X") { E.bat -= 12; log("FIRE! DRONE SCORCHED. BATTERY -12.", "alert"); sfx("hit"); }
  // Active sentries shoot anything that passes next to them
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ax, ay]) => { const tx = nx + ax, ty = ny + ay; if (E.grid[ty] && E.grid[ty][tx] === "T" && !E.jammed.has(tx + "," + ty)) { E.bat -= 30; log("SENTRY FIRE! BATTERY -30.", "alert"); sfx("hit"); shake(); } });
  if (E.bat <= 0) droneLost();
}
function droneScan() {
  const E = S.explore; if (!E || E.stalled) return;
  E.bat -= T.droneScan; const r = 2 + S.eff.sens; see(r); E.pulse = 1; sfx("scan");
  let j = 0; E.grid.forEach((row, y) => row.forEach((c, x) => { if (c === "T" && Math.abs(x - E.pos.x) + Math.abs(y - E.pos.y) <= r + 1 && !E.jammed.has(x + "," + y)) { E.jammed.add(x + "," + y); j++; } }));
  log(`SCAN PULSE. RADIUS ${r}.${j ? ` ${j} SENTRY JAMMED.` : ""}`, j ? "grn" : "");
  if (E.bat <= 0) droneLost();
}
function droneRecall() {
  const E = S.explore; if (!E) return;
  if (E.grid[E.pos.y][E.pos.x] !== "A") { log("DRONE MUST RETURN TO THE AIRLOCK (A) TO DOCK.", "alert"); sfx("err"); return; }
  S.scrap += E.carry.scrap; S.fuel += E.carry.fuel; S.o2 = Math.min(100, S.o2 + E.carry.o2);
  log(`DRONE DOCKED. UNLOADED ${E.carry.scrap} SCRAP, ${E.carry.fuel} FUEL, ${E.carry.o2} O₂.`, "grn"); sfx("dock");
  S.done.add(S.at); S.explore = null; setMode("nav");
}
function droneLost() { log("DRONE BATTERY DEAD. SIGNAL LOST. EVERYTHING IT CARRIED IS GONE.", "alert"); sfx("alarm"); S.done.add(S.at); S.explore = null; setMode("nav"); }

/* ── RADAR: battle ── */
function startCombat(n) {
  const E = D.ENEMIES[n.enemy];
  S.combat = { E, hull: E.hull, sh: E.shields, shT: 0, fireT: E.fireEvery * .7, wpn: 0, layers: S.eff.shd, layerT: 0, shots: [], hits: [] };
  log(E.hail, "alert"); log(`${E.name} ON RADAR. HULL ${E.hull}, SHIELDS ${E.shields}.`, "alert");
  if (!has("weapon")) log("NO WEAPON BAY. PLOT A JUMP AND CHARGE ENGINES TO ESCAPE.", "alert");
  sfx("alarm"); setMode("radar");
}
function combatTick(dt) {
  const C = S.combat, E = C.E;
  // your shields: layers up to shield power, recharging one at a time
  const maxL = S.eff.shd; if (C.layers > maxL) C.layers = maxL;
  if (C.layers < maxL) { C.layerT += dt; if (C.layerT >= T.shieldRecharge) { C.layerT = 0; C.layers++; sfx("tick"); } } else C.layerT = 0;
  // your gun
  if (has("weapon")) C.wpn = Math.min(100, C.wpn + T.weaponCharge(S.eff.wpn) * dt);
  // their shields regenerate
  if (C.sh < E.shields) { C.shT += dt; if (C.shT >= 5) { C.shT = 0; C.sh++; } }
  // they fire; the shot takes 2 seconds to cross the scope, time enough to push power to shields
  C.fireT -= dt; if (C.fireT <= 0) { C.fireT = E.fireEvery; C.shots.push({ from: "them", t: 0 }); sfx("enemyfire"); }
  C.shots.forEach(s => s.t += dt / (s.from === "them" ? 2 : .8));
  C.shots.filter(s => s.t >= 1).forEach(s => {
    if (s.from === "them") {
      if (C.layers > 0) { C.layers--; C.layerT = 0; log("SHIELD LAYER ABSORBED THE HIT.", "grn"); sfx("shield"); }
      else { S.hull -= E.dmg; log(`HULL HIT! -${E.dmg}.`, "alert"); sfx("hit"); shake(); }
    } else {
      if (C.sh > 0) { C.sh--; C.shT = 0; log("ENEMY SHIELD DOWN."); sfx("shield"); }
      else { C.hull -= 2; log(`DIRECT HIT. ENEMY HULL ${Math.max(0, C.hull)}.`, "grn"); sfx("boom"); }
    }
    C.hits.push({ at: s.from, t: 0 });
  });
  C.shots = C.shots.filter(s => s.t < 1); C.hits.forEach(h => h.t += dt); C.hits = C.hits.filter(h => h.t < .6);
  if (S.hull <= 0) return lose("hull");
  if (C.hull <= 0) { const L = E.loot; S.scrap += L.scrap; S.fuel += L.fuel; S.done.add(S.at); log(`${E.name} DESTROYED. SALVAGED ${L.scrap} SCRAP, ${L.fuel} FUEL.`, "grn"); sfx("win"); S.combat = null; setMode("nav"); }
}
function fire() { const C = S.combat; if (!C || C.wpn < 100) return; C.wpn = 0; C.shots.push({ from: "us", t: 0 }); sfx("fire"); }

/* ── End states ── */
function lose(why) {
  S.over = true; sfx("alarm");
  endScreen(why === "hull" ? "HULL BREACH" : "LIFE SUPPORT FAILURE", why === "hull" ? "THE MERIDIAN BROKE APART. HER BEACON IS STILL BLINKING FOR ANYONE WHO COMES LOOKING." : "THE AIR RAN OUT BEFORE THE POWER DID. SOL KEPT THE LIGHTS ON ANYWAY.", "amber");
}
function win() {
  S.over = true; sfx("win");
  endScreen("SECTOR 1 CLEARED", `JUMP GATE ENGAGED ON DAY ${Math.max(1, Math.round(S.time / 20))}. HULL ${S.hull}/${S.maxHull}. ${S.core ? "THE TESSERA DATA CORE IS ABOARD: THE AURORA WENT INTO THE VEIL ON PURPOSE." : "SOMEWHERE BACK THERE, A DATA CORE WENT UNREAD."}\n\nSECTORS 2 TO 5 AND HALCYON: NEXT BUILD.`, "");
}
function endScreen(title, text, cls) {
  const ov = $("#ovEnd");
  ov.innerHTML = `<div class="crt ${cls}"><h1>${esc(title)}</h1><p style="white-space:pre-wrap">${esc(text)}</p><button class="big grn go" id="again" type="button">Reboot</button><div class="fx"></div></div>`;
  ov.hidden = false; $("#again").addEventListener("click", () => { ov.hidden = true; newGame(); termLines = []; bootLog(); renderFaders(); renderShip(); setMode("nav"); });
}

/* ── Terminal ── */
let termLines = [];
function log(t, cls = "") { termLines.push({ t, cls }); if (termLines.length > 6) termLines.shift(); renderTerm(); }
function renderTerm() {
  $("#term").innerHTML = termLines.map((l, i) => `<p class="${l.cls}${i < termLines.length - 3 ? " old" : ""}">&gt; ${esc(l.t)}${i === termLines.length - 1 ? ' <span class="cursor"></span>' : ""}</p>`).join("");
}
function bootLog() { log("MERIDIAN SHIP CONTROL ONLINE.", "grn"); D.CREW.forEach(c => log(c)); log("PLOT A COURSE ON THE NAV SCOPE: TAP A LINKED POINT."); }

/* ── Monitor modes ── */
function setMode(m) {
  S.mode = m; buildSlot = null;
  document.querySelectorAll(".sel-btn").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  const amber = m === "drone"; $("#crt").classList.toggle("amber", amber);
  $("#crtLabel").textContent = { nav: "NAV SCOPE", ship: "SHIP LAYOUT", drone: "DRONE CAM", radar: "RADAR" }[m];
  $("#shipgrid").hidden = m !== "ship"; if (m === "ship") renderShip();
  renderActions(); sfx("tick");
}
document.querySelectorAll(".sel-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

function renderActions() {
  const a = $("#actions"), m = S.mode;
  if (m === "nav") {
    const n = node(S.at), canDock = n.map && !S.done.has(S.at);
    a.innerHTML = `<div class="info" id="navInfo"></div><div class="charge"><span class="plate">Jump drive</span><div class="bar"><i id="chg"></i></div></div>
      ${canDock ? `<button class="big blu" id="bDock" type="button">Dock</button>` : ""}<button class="big red" id="bEngage" type="button">Engage</button>`;
    $("#bEngage").addEventListener("click", engage); if (canDock) $("#bDock").addEventListener("click", dock);
  } else if (m === "drone") {
    if (!S.explore) { a.innerHTML = `<div class="info">NO DRONE DEPLOYED. DOCK AT A DERELICT FROM THE NAV SCOPE.</div>`; return; }
    a.innerHTML = `<div class="dpad"><button class="up" data-d="0,-1" type="button" aria-label="Drone north">▲</button><button class="lt" data-d="-1,0" type="button" aria-label="Drone west">◀</button><span class="mid"></span><button class="rt" data-d="1,0" type="button" aria-label="Drone east">▶</button><button class="dn" data-d="0,1" type="button" aria-label="Drone south">▼</button></div>
      <div class="charge"><span class="plate">Drone battery</span><div class="bar amb"><i id="dbat"></i></div><div class="info" id="dInfo" style="min-height:0"></div></div>
      <button class="big yel" id="bScan" type="button">Scan</button><button class="big blu" id="bRecall" type="button">Recall</button>`;
    a.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => { const [x, y] = b.dataset.d.split(",").map(Number); droneMove(x, y); }));
    $("#bScan").addEventListener("click", droneScan); $("#bRecall").addEventListener("click", droneRecall);
  } else if (m === "radar") {
    if (!S.combat) { a.innerHTML = `<div class="info">NO CONTACTS. RADAR QUIET.</div>`; return; }
    a.innerHTML = `<div class="charge"><span class="plate">Mass driver</span><div class="bar"><i id="wchg"></i></div><span class="plate">Shield layers</span><div class="layers" id="lay"></div></div>
      <button class="big red" id="bFire" type="button">Fire</button><button class="big yel" id="bFlee" type="button">Jump out</button>`;
    $("#bFire").addEventListener("click", fire); $("#bFlee").addEventListener("click", () => { if (!S.target) { log("PLOT AN ESCAPE ON THE NAV SCOPE, THEN CHARGE ENGINES.", "alert"); setMode("nav"); } else engage(); });
  } else {
    a.innerHTML = `<div class="info">TAP AN EMPTY BAY TO BUILD. TAP A ROOM TO INSPECT OR STRIP IT FOR SCRAP. FADERS APPEAR FOR POWERED ROOMS.</div>`;
  }
}

/* ── Live UI refresh ── */
function ui() {
  const setSeg = (id, v, low, ok) => { const el = $(id); el.querySelector(".win").textContent = Math.max(0, Math.round(v)); el.classList.toggle("low", low); el.classList.toggle("ok", ok); };
  setSeg("#rHull", S.hull, S.hull <= 6, S.hull > 10); setSeg("#rFuel", S.fuel, S.fuel <= 1, S.fuel > 2); setSeg("#rO2", S.o2, S.o2 < 30, S.o2 > 60); setSeg("#rScrap", S.scrap, false, true);
  lamp("#lOvl", S.overload, true); lamp("#lHeat", S.heat > 70, S.heat > 85); lamp("#lO2", S.o2 < 40 || S.eff.life < 1, S.o2 < 25); lamp("#lHull", S.hull <= 8, S.hull <= 5); lamp("#lScram", S.scram > 0, true);
  $("#kVal").textContent = S.reactor; drawKnob(); drawHeat();
  const d = demand(), sp = supply(); $("#loadBar").style.width = clamp(d / Math.max(1, T.reactorMax), 0, 1) * 100 + "%";
  $("#loadTxt").textContent = `${d} / ${sp} PWR`; $("#supply").classList.toggle("over", S.overload);
  updateFaders();
  if (S.mode === "nav" && $("#chg")) {
    $("#chg").style.width = S.charge + "%";
    const t = S.target && node(S.target);
    $("#navInfo").textContent = S.travel ? "IN TRANSIT…" : t ? `TARGET: ${revealed(S.target) ? t.name : "UNKNOWN"} · ${jumpCost(S.target)} FUEL · ${S.charge < 100 ? (S.eff.eng ? "CHARGING" : "NO ENGINE POWER") : "READY"}` : `AT: ${node(S.at).name}. TAP A LINKED POINT.`;
    const e = $("#bEngage"); e.disabled = !(S.target && S.charge >= 100 && !S.travel); e.classList.toggle("ready", !e.disabled);
  }
  if (S.mode === "drone" && S.explore && $("#dbat")) {
    const E = S.explore; $("#dbat").style.width = clamp(E.bat / E.maxBat, 0, 1) * 100 + "%";
    $("#dInfo").textContent = `HOLD: ${E.carry.scrap}S ${E.carry.fuel}F ${E.carry.o2}O₂${E.stalled ? " · NO POWER" : ""}`;
    a11yDpad(!E.stalled);
  }
  if (S.mode === "radar" && S.combat && $("#wchg")) {
    const C = S.combat; $("#wchg").style.width = C.wpn + "%"; const f = $("#bFire"); f.disabled = !has("weapon") || C.wpn < 100; f.classList.toggle("ready", !f.disabled);
    $("#lay").innerHTML = Array.from({ length: Math.max(1, S.eff.shd) }, (_, i) => `<i class="${i < C.layers ? "on" : ""}"></i>`).join("");
    const fl = $("#bFlee"); fl.classList.toggle("ready", !!S.target && S.charge >= 100);
  }
  if (S.mode === "ship" && buildSlot === null && (uiFrame++ % 20 === 0)) renderShip();
  document.querySelector('.sel-btn[data-mode="radar"]').classList.toggle("alert", !!S.combat && S.mode !== "radar");
  document.querySelector('.sel-btn[data-mode="drone"]').classList.toggle("alert", !!S.explore && S.mode !== "drone");
  $("#crtInfo").textContent = S.mode === "nav" ? D.SECTOR.name.split(" · ")[0] : S.mode === "drone" && S.explore ? `BAT ${Math.max(0, Math.round(S.explore.bat))}` : "";
}
let uiFrame = 0;
function a11yDpad(on) { document.querySelectorAll(".dpad button").forEach(b => b.disabled = !on); }
function lamp(id, on, blink) { const l = $(id); l.classList.toggle("on", on); l.classList.toggle("blink", on && blink); l.classList.toggle("warn", on && !blink); }

/* ── Faders ── */
function renderFaders() {
  $("#faders").innerHTML = SYSTEMS.map(s => {
    const on = has(s.room);
    return `<div class="fader ${on ? "" : "none"}" data-k="${s.k}"><div class="track" role="slider" aria-label="${s.lbl} power" aria-valuemin="0" aria-valuemax="4" tabindex="${on ? 0 : -1}"><div class="slot"></div><div class="ladder">${"<i></i>".repeat(4)}</div><div class="cap"></div></div><span class="val">0</span><span class="plate">${s.lbl}</span></div>`;
  }).join("");
  document.querySelectorAll(".fader").forEach(f => {
    const k = f.dataset.k, tr = f.querySelector(".track");
    const set = y => { if (!has(SYSTEMS.find(s => s.k === k).room)) { log(`NO ${SYSTEMS.find(s => s.k === k).lbl} ROOM. BUILD IT ON THE SHIP SCREEN.`); sfx("err"); return; } const r = tr.getBoundingClientRect(); const v = clamp(Math.round((1 - (y - r.top - 8) / (r.height - 16)) * 4), 0, 4); if (v !== S.alloc[k]) { S.alloc[k] = v; sfx("click"); } };
    let dragging = false;
    tr.addEventListener("pointerdown", e => { dragging = true; tr.setPointerCapture(e.pointerId); set(e.clientY); });
    tr.addEventListener("pointermove", e => { if (dragging) set(e.clientY); });
    tr.addEventListener("pointerup", () => dragging = false); tr.addEventListener("pointercancel", () => dragging = false);
    tr.addEventListener("keydown", e => { if (!has(SYSTEMS.find(s => s.k === k).room)) return; if (e.key === "ArrowUp") { S.alloc[k] = Math.min(4, S.alloc[k] + 1); sfx("click"); e.preventDefault(); } if (e.key === "ArrowDown") { S.alloc[k] = Math.max(0, S.alloc[k] - 1); sfx("click"); e.preventDefault(); } });
  });
}
function updateFaders() {
  document.querySelectorAll(".fader").forEach(f => {
    const k = f.dataset.k, a = S.alloc[k], e = S.eff[k] || 0;
    f.querySelector(".cap").style.bottom = `calc(${a / 4} * (100% - 34px) + 8px)`;
    f.querySelectorAll(".ladder i").forEach((i, n) => { i.className = n < e ? "on" : n < a ? "brown" : ""; });
    f.querySelector(".val").textContent = e; f.classList.toggle("short", e < a);
    f.querySelector(".track").setAttribute("aria-valuenow", a);
  });
}

/* ── Reactor knob & heat gauge ── */
const knob = $("#knob");
function drawKnob() {
  const a = -135 + S.reactor / T.reactorMax * 270;
  const ticks = Array.from({ length: T.reactorMax + 1 }, (_, i) => { const r = (-135 + i / T.reactorMax * 270 - 90) * Math.PI / 180, hot = i > safePoint(); return `<line x1="${50 + Math.cos(r) * 44}" y1="${50 + Math.sin(r) * 44}" x2="${50 + Math.cos(r) * 48}" y2="${50 + Math.sin(r) * 48}" stroke="${hot ? "#ff5a3c" : "#d9cfb4"}" stroke-width="2.5"/>`; }).join("");
  knob.innerHTML = `${ticks}<circle cx="50" cy="50" r="38" fill="#111" /><circle cx="50" cy="50" r="34" fill="url(#kg)"/><defs><radialGradient id="kg" cx=".4" cy=".35"><stop offset="0" stop-color="#6a655a"/><stop offset="1" stop-color="#1e1c18"/></radialGradient></defs>
    ${Array.from({ length: 16 }, (_, i) => { const r = i / 16 * TAU; return `<line x1="${50 + Math.cos(r) * 30}" y1="${50 + Math.sin(r) * 30}" x2="${50 + Math.cos(r) * 34}" y2="${50 + Math.sin(r) * 34}" stroke="#0c0b09" stroke-width="2"/>`; }).join("")}
    <g transform="rotate(${a} 50 50)"><rect x="47" y="18" width="6" height="22" rx="2" fill="#ffb347"/></g>`;
  knob.setAttribute("aria-valuenow", S.reactor);
}
function drawHeat() {
  const f = S.heat / 100, a = (-180 + f * 180) * Math.PI / 180, cx = 54, cy = 56, r = 44;
  const arc = (a0, a1, col) => `<path d="M${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r}" stroke="${col}" stroke-width="7" fill="none"/>`;
  $("#heat").innerHTML = `<rect x="2" y="2" width="104" height="58" rx="5" fill="#e8e0c8" stroke="#000"/>${arc(Math.PI, Math.PI * 1.6, "#3a3a32")}${arc(Math.PI * 1.6, Math.PI * 1.8, "#e8b21c")}${arc(Math.PI * 1.8, Math.PI * 2, "#d9352b")}
    <line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * (r - 4)}" y2="${cy + Math.sin(a) * (r - 4)}" stroke="#111" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="4" fill="#111"/>
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-family="VT323,monospace" font-size="14" fill="#2a2620">${Math.round(S.heat)}°</text>`;
}
let kDrag = null;
knob.addEventListener("pointerdown", e => { kDrag = { y: e.clientY, v: S.reactor }; knob.setPointerCapture(e.pointerId); });
knob.addEventListener("pointermove", e => { if (!kDrag) return; setReactor(kDrag.v + Math.round((kDrag.y - e.clientY) / 16)); });
knob.addEventListener("pointerup", () => kDrag = null); knob.addEventListener("pointercancel", () => kDrag = null);
knob.addEventListener("wheel", e => { e.preventDefault(); setReactor(S.reactor + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
knob.addEventListener("keydown", e => { if (e.key === "ArrowUp" || e.key === "ArrowRight") { setReactor(S.reactor + 1); e.preventDefault(); } if (e.key === "ArrowDown" || e.key === "ArrowLeft") { setReactor(S.reactor - 1); e.preventDefault(); } });
$("#kUp").addEventListener("click", () => setReactor(S.reactor + 1)); $("#kDn").addEventListener("click", () => setReactor(S.reactor - 1));
function setReactor(v) { v = clamp(v, 0, T.reactorMax); if (v === S.reactor) return; S.reactor = v; sfx("clunk"); if (v > safePoint()) log(`REACTOR AT ${v}. ABOVE SAFE LIMIT OF ${safePoint()}. WATCH THE HEAT.`, "alert"); }
$("#cool").addEventListener("click", e => { S.coolant = !S.coolant; e.currentTarget.classList.toggle("on", S.coolant); e.currentTarget.setAttribute("aria-pressed", String(S.coolant)); sfx("clunk"); log(S.coolant ? `COOLANT PUMP ON. SAFE LIMIT ${safePoint()}. DRAWS 1 PWR.` : "COOLANT PUMP OFF."); });
$("#scramCover").addEventListener("click", () => { $("#scram").classList.add("open"); sfx("click"); setTimeout(() => $("#scram").classList.remove("open"), 4000); });
$("#scramBtn").addEventListener("click", () => { if (!$("#scram").classList.contains("open")) return; S.scram = 3; S.reactor = Math.min(S.reactor, 3); log("MANUAL SCRAM. CORE VENTING. ALL SYSTEMS DOWN FOR 3 SECONDS.", "alert"); sfx("alarm"); $("#scram").classList.remove("open"); });

/* ── Ship grid ── */
function renderShip() {
  const g = $("#shipgrid");
  if (buildSlot !== null) {
    g.innerHTML = `<div class="buildmenu"><p>BAY ${buildSlot + 1}: BUILD WHAT? SCRAP ${S.scrap}</p>${D.BUILDABLE.map(r => { const R = D.ROOMS[r], ok = S.scrap >= R.cost && !has(r); return `<button type="button" data-b="${r}" ${ok ? "" : "disabled"}><span>${R.name}</span><span>${has(r) ? "BUILT" : R.cost + " SCR"}</span></button>`; }).join("")}<button type="button" data-b="x"><span>CANCEL</span><span></span></button></div>`;
    g.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => { if (b.dataset.b === "x") { buildSlot = null; renderShip(); } else build(buildSlot, b.dataset.b); }));
    g.querySelectorAll("[data-b]").forEach(b => b.addEventListener("mouseenter", () => { const R = D.ROOMS[b.dataset.b]; if (R) $("#crtInfo").textContent = ""; }));
    return;
  }
  g.innerHTML = S.layout.map((r, i) => {
    if (!r) return `<button class="cell empty" type="button" data-i="${i}"><b>+</b><span>EMPTY BAY</span></button>`;
    const R = D.ROOMS[r], off = R.sys && S.eff[R.sys] < 1;
    return `<button class="cell ${S.sel === i ? "sel" : ""} ${off ? "off" : ""}" type="button" data-i="${i}"><b>${R.short}</b><span>${R.name}</span><span>${R.sys ? (off ? "UNPOWERED" : "PWR " + S.eff[R.sys]) : "ONLINE"}</span></button>`;
  }).join("");
  g.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.i; shipClick(i);
    const r = S.layout[i]; if (!r || S.combat || S.explore) return;
    const R = D.ROOMS[r]; log(`${R.name}: ${R.desc}`);
    if (!R.fixed) showDemolish(i);
  }));
}
function showDemolish(i) {
  const a = $("#actions"), R = D.ROOMS[S.layout[i]];
  a.innerHTML = `<div class="info">${esc(R.name)} · ${esc(R.desc)}</div><button class="big red" id="bDemo" type="button">Strip +${Math.floor(R.cost / 2)}</button><button class="big" style="background:linear-gradient(#5a564d,#35322c)" id="bBack" type="button">Back</button>`;
  $("#bDemo").addEventListener("click", () => { demolish(i); renderActions(); }); $("#bBack").addEventListener("click", () => { S.sel = null; renderShip(); renderActions(); });
}

/* ── Main monitor drawing ── */
const cv = $("#scope"), g = cv.getContext("2d");
let W = 0, H = 0, DPR = 1, shakeT = 0;
function shake() { shakeT = .4; }
function draw(t) {
  const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(r.width * DPR), h = Math.round(r.height * DPR); if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
  if (!W || !S) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  if (shakeT > 0 && !reduce) { shakeT -= 1 / 60; g.translate((Math.random() - .5) * 10 * DPR, (Math.random() - .5) * 8 * DPR); }
  const m = S.mode;
  if (S.scram > 0 && Math.random() < .3) { g.fillStyle = "rgba(109,255,138,.05)"; g.fillRect(0, 0, W, H); }
  if (m === "nav") drawNav(t); else if (m === "radar") drawRadar(t); else if (m === "drone") drawDrone(t); else drawShipBg(t);
}
const glowLine = (col, w = 1.6) => { g.strokeStyle = col; g.lineWidth = w * DPR; g.shadowColor = col; g.shadowBlur = 8 * DPR; };
const txt = (s, x, y, col, size = 18, al = "center") => { g.shadowBlur = 6 * DPR; g.shadowColor = col; g.fillStyle = col; g.font = `${size * DPR}px VT323, monospace`; g.textAlign = al; g.fillText(s, x, y); };
function navXY(n) { const pad = 34 * DPR; return [pad + n.x / 100 * (W - pad * 2), 44 * DPR + n.y / 100 * (H - 70 * DPR)]; }
function drawNav(t) {
  g.shadowBlur = 0; g.strokeStyle = "rgba(109,255,138,.08)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 30 * DPR) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 30 * DPR) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  D.SECTOR.links.forEach(([a, b]) => {
    const A = navXY(node(a)), B = navXY(node(b)), act = (a === S.at && b === S.target) || (b === S.at && a === S.target), near = a === S.at || b === S.at;
    glowLine(act ? GRN : near ? "rgba(109,255,138,.55)" : GRN_D, act ? 2.2 : 1.2); g.setLineDash(act ? [] : [4 * DPR, 6 * DPR]);
    g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.stroke();
  });
  g.setLineDash([]);
  D.SECTOR.nodes.forEach(n => {
    const [x, y] = navXY(n), known = revealed(n.id), done = S.done.has(n.id), col = n.type === "hostile" && known && !done ? RED : GRN;
    glowLine(col, 1.8); const s = 7 * DPR;
    g.beginPath();
    if (!known) { txt("?", x, y + 6 * DPR, GRN_D, 22); }
    else if (n.type === "hostile") { g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke(); }
    else if (n.type === "gate") { g.arc(x, y, s * 1.4, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, s * .6, 0, TAU); g.stroke(); }
    else if (n.type === "derelict" || n.type === "station") { g.rect(x - s, y - s, s * 2, s * 2); g.stroke(); if (done) { g.beginPath(); g.moveTo(x - s, y + s); g.lineTo(x + s, y - s); g.stroke(); } }
    else if (n.type === "rocks") { for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + Math.cos(i * 1.7) * s, y + Math.sin(i * 1.7) * s * .8, 2.2 * DPR, 0, TAU); g.stroke(); } }
    else if (n.type === "beacon") { g.moveTo(x, y - s); g.lineTo(x + s, y + s); g.lineTo(x - s, y + s); g.closePath(); g.stroke(); }
    else { g.arc(x, y, 3 * DPR, 0, TAU); g.stroke(); }
    if (known) txt(n.name, x, y + 22 * DPR, col, 15);
    if (n.id === S.target) { glowLine(GRN, 1.5); const b = 14 * DPR + Math.sin(t * 6) * 2 * DPR; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(x + dx * b, y + dy * b * .6); g.lineTo(x + dx * b, y + dy * b); g.lineTo(x + dx * b * .6, y + dy * b); g.stroke(); }); }
  });
  // The Meridian
  let [sx, sy] = navXY(node(S.at));
  if (S.travel) { const [ax, ay] = navXY(node(S.travel.from)), [bx, by] = navXY(node(S.travel.to)), k = S.travel.t; sx = ax + (bx - ax) * k; sy = ay + (by - ay) * k; }
  if ((t * 2 | 0) % 2 || S.travel) { glowLine(AMB, 2); g.fillStyle = AMB; g.beginPath(); g.moveTo(sx, sy - 9 * DPR); g.lineTo(sx + 7 * DPR, sy + 6 * DPR); g.lineTo(sx - 7 * DPR, sy + 6 * DPR); g.closePath(); g.fill(); }
  txt(`FUEL ${S.fuel}  ·  SENSORS ${S.eff.sens ? "RANGE " + S.eff.sens : "OFF"}`, 12 * DPR, H - 12 * DPR, GRN, 17, "left");
}
function drawRadar(t) {
  const cx = W / 2, cy = H / 2 + 10 * DPR, R = Math.min(W, H) * .42;
  glowLine("rgba(109,255,138,.35)", 1); for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, R * i / 4, 0, TAU); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const sw = t * 1.8; for (let i = 0; i < 24; i++) { g.strokeStyle = `rgba(109,255,138,${.3 * (1 - i / 24)})`; g.lineWidth = 3 * DPR; g.shadowBlur = 0; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sw - i * .03) * R, cy + Math.sin(sw - i * .03) * R); g.stroke(); }
  // you
  glowLine(GRN, 2); g.beginPath(); g.moveTo(cx, cy - 10 * DPR); g.lineTo(cx + 8 * DPR, cy + 8 * DPR); g.lineTo(cx - 8 * DPR, cy + 8 * DPR); g.closePath(); g.stroke();
  const C = S.combat; if (!C) { txt("NO CONTACTS", cx, cy - R * .5, GRN, 24); return; }
  for (let i = 0; i < C.layers; i++) { glowLine(GRN, 1.5); g.beginPath(); g.arc(cx, cy, (22 + i * 7) * DPR, 0, TAU); g.stroke(); }
  const ex = cx + Math.cos(-.9) * R * .72, ey = cy + Math.sin(-.9) * R * .72;
  glowLine(RED, 2); g.beginPath(); g.arc(ex, ey, 9 * DPR, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(ex - 14 * DPR, ey); g.lineTo(ex + 14 * DPR, ey); g.stroke();
  for (let i = 0; i < C.sh; i++) { g.beginPath(); g.arc(ex, ey, (16 + i * 6) * DPR, 0, TAU); g.stroke(); }
  txt(`${C.E.name}  HULL ${Math.max(0, C.hull)}`, ex, ey - 26 * DPR, RED, 17);
  C.shots.forEach(s => { const k = s.t, [x0, y0, x1, y1] = s.from === "them" ? [ex, ey, cx, cy] : [cx, cy, ex, ey]; const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k; g.fillStyle = s.from === "them" ? RED : GRN; g.shadowColor = g.fillStyle; g.shadowBlur = 10 * DPR; g.beginPath(); g.arc(x, y, 4 * DPR, 0, TAU); g.fill(); });
  C.hits.forEach(h => { const [x, y] = h.at === "them" ? [cx, cy] : [ex, ey]; glowLine(h.at === "them" ? RED : GRN, 2); g.beginPath(); g.arc(x, y, (10 + h.t * 60) * DPR, 0, TAU); g.stroke(); });
  txt(`HULL ${S.hull}   SHIELDS ${C.layers}/${S.eff.shd}   WPN ${has("weapon") ? Math.round(C.wpn) + "%" : "NONE"}`, 12 * DPR, H - 12 * DPR, GRN, 17, "left");
}
function drawDrone(t) {
  const E = S.explore;
  if (!E) { txt("NO SIGNAL", W / 2, H / 2, AMB, 30); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,179,71,${Math.random() * .3})`; g.fillRect(Math.random() * W, Math.random() * H, 3 * DPR, 2 * DPR); } return; }
  const rows = E.grid.length, cols = E.grid[0].length, cs = Math.min((W - 24 * DPR) / cols, (H - 60 * DPR) / rows), ox = (W - cs * cols) / 2, oy = 38 * DPR + (H - 60 * DPR - cs * rows) / 2;
  E.grid.forEach((row, y) => row.forEach((c, x) => {
    if (!E.seen.has(x + "," + y)) return;
    const px = ox + x * cs, py = oy + y * cs;
    if (c === "#") { g.shadowBlur = 0; g.fillStyle = "rgba(255,179,71,.22)"; g.fillRect(px + 1, py + 1, cs - 2, cs - 2); g.strokeStyle = AMB_D; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, cs - 3, cs - 3); return; }
    g.shadowBlur = 0; g.fillStyle = "rgba(255,179,71,.05)"; g.fillRect(px + 1, py + 1, cs - 2, cs - 2);
    const glyph = { S: "$", F: "F", O: "O", L: "≡", C: "◆", A: "A", X: "✶", T: E.jammed.has(x + "," + y) ? "t" : "T" }[c];
    if (glyph) { const col = c === "X" ? (Math.sin(t * 12 + x) > 0 ? RED : AMB) : c === "T" && !E.jammed.has(x + "," + y) ? RED : AMB; txt(glyph, px + cs / 2, py + cs * .72, col, cs / DPR * .8); }
  }));
  const px = ox + E.pos.x * cs + cs / 2, py = oy + E.pos.y * cs + cs / 2;
  if (E.pulse > 0) { E.pulse -= .02; glowLine(AMB, 2); g.globalAlpha = E.pulse; g.beginPath(); g.arc(px, py, (1 - E.pulse) * cs * (3 + S.eff.sens), 0, TAU); g.stroke(); g.globalAlpha = 1; }
  glowLine(AMB, 2); g.fillStyle = E.stalled ? AMB_D : AMB; g.fillRect(px - cs * .25, py - cs * .25, cs * .5, cs * .5);
  if ((t * 3 | 0) % 2) { g.strokeRect(px - cs * .38, py - cs * .38, cs * .76, cs * .76); }
  txt(E.M.title, 12 * DPR, H - 10 * DPR, AMB, 17, "left");
}
function drawShipBg(t) {
  glowLine("rgba(109,255,138,.18)", 1); const m = 10 * DPR;
  g.beginPath(); g.moveTo(W / 2, m + 26 * DPR); g.lineTo(W - m, H * .3); g.lineTo(W - m, H - m); g.lineTo(m, H - m); g.lineTo(m, H * .3); g.closePath(); g.stroke();
}

/* ── Sound: all synthesized, 80s-console style ── */
let ac = null, master = null, hum = null;
function startSound() {
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .45; master.connect(ac.destination);
    const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = 50; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 120; hum = ac.createGain(); hum.gain.value = .03; o.connect(lp).connect(hum).connect(master); o.start();
  } catch (_) {}
}
function sfx(k) {
  if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain(); o.connect(gn).connect(master);
  const env = (a, d) => { gn.gain.setValueAtTime(a, t); gn.gain.exponentialRampToValueAtTime(.0001, t + d); o.start(t); o.stop(t + d + .02); };
  const f = (type, a, b, d, v) => { o.type = type; o.frequency.setValueAtTime(a, t); if (b) o.frequency.exponentialRampToValueAtTime(b, t + d); env(v, d); };
  ({ tick: () => f("square", 1800, 0, .03, .03), click: () => f("square", 900, 0, .025, .05), clunk: () => f("square", 160, 60, .08, .12), blip: () => f("sine", 1200, 0, .08, .06),
     err: () => f("square", 220, 180, .15, .08), relay: () => f("square", 400, 800, .12, .06), alarm: () => { o.type = "square"; o.frequency.setValueAtTime(700, t); o.frequency.setValueAtTime(500, t + .2); o.frequency.setValueAtTime(700, t + .4); env(.08, .6); },
     jump: () => f("sawtooth", 80, 1200, 1.2, .1), launch: () => f("triangle", 300, 900, .3, .1), step: () => f("square", 600, 0, .03, .03), pick: () => f("triangle", 900, 1800, .15, .1),
     scan: () => f("sine", 400, 2000, .4, .08), hit: () => f("sawtooth", 180, 40, .35, .2), dock: () => f("triangle", 900, 300, .4, .1), shield: () => f("sine", 1500, 400, .25, .1),
     boom: () => f("sawtooth", 120, 30, .5, .25), fire: () => f("square", 1100, 200, .25, .12), enemyfire: () => f("square", 500, 900, .2, .06), win: () => f("triangle", 523, 1046, .6, .12),
     build: () => f("square", 300, 600, .25, .08), demolish: () => f("sawtooth", 400, 80, .35, .1) }[k] || (() => {}))();
}

/* ── Boot ── */
let booted = false;
newGame(); renderFaders(); setMode("nav"); ui();
const bootLines = ["HALCYON TRANSIT AUTHORITY", "MERIDIAN SHIP CONTROL · FIRMWARE 2.1", "MEMORY CHECK .......... 640K OK", "REACTOR INTERLOCK ..... OK", "DRONE BAY ............. NOT INSTALLED", "WEAPON BAY ............ NOT INSTALLED", "", "READY."];
(function type(i, j) { const el = $("#bootText"); if (i >= bootLines.length) return; el.textContent = bootLines.slice(0, i).join("\n") + (i ? "\n" : "") + bootLines[i].slice(0, j); setTimeout(() => j >= bootLines[i].length ? type(i + 1, 0) : type(i, j + 2), j >= bootLines[i].length ? 120 : 18); })(0, 0);
$("#powerOn").addEventListener("click", () => { $("#ovBoot").hidden = true; booted = true; startSound(); sfx("relay"); bootLog(); });
cv.addEventListener("pointerdown", e => {
  if (S.mode !== "nav" || S.travel) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
  let best = null, bd = 34 * DPR; D.SECTOR.nodes.forEach(n => { const [nx, ny] = navXY(n), d = Math.hypot(nx - x, ny - y); if (d < bd) { bd = d; best = n; } });
  if (best) selectTarget(best.id);
});
addEventListener("keydown", e => {
  if (S.mode === "drone" && S.explore) { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key]; if (m && !(e.target instanceof SVGElement) && !e.target.closest?.(".track")) { e.preventDefault(); droneMove(...m); } }
  if (e.key === " " && S.mode === "radar") { e.preventDefault(); fire(); }
});
window.__sjProbe = () => ({ S }); // read-only hook for automated playtests
requestAnimationFrame(loop);
})();
