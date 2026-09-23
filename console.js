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
const SYS = D.SYSTEM, body = id => SYS.bodies.find(b => b.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/* Where a body is at time t: star at (0,0), scope radius 1. Hostiles that broke orbit to chase you use S.foes. */
function bodyPos(b, t = S.time) {
  if (typeof b === "string") b = body(b);
  if (S && S.foes[b.id]) return S.foes[b.id];
  const c = b.parent ? bodyPos(b.parent, t) : { x: 0, y: 0 }, a = (b.phase + 360 * t / b.period) * Math.PI / 180;
  return { x: c.x + Math.cos(a) * b.r, y: c.y + Math.sin(a) * b.r };
}

/* ── State ── */
let S;
function newGame() {
  S = { hull: D.START.hull, maxHull: D.START.hull, fuel: D.START.fuel, o2: D.START.o2, scrap: D.START.scrap,
    layout: D.START_LAYOUT.slice(), alloc: { eng: 2, life: 1, sens: 0, drone: 0, shd: 0, wpn: 0 }, eff: {},
    reactor: 4, heat: 12, coolant: false, scram: 0, at: "depot", pos: null, target: null, travel: null, visited: new Set(["depot"]), seen: new Set(), done: new Set(),
    foes: {}, trail: [], trailT: 0, boost: 0, sling: null, landing: false, scoop: null, dry: false,
    mode: "nav", sel: null, explore: null, combat: null, time: 0, over: false, core: false,
    incidents: {}, tapes: [], tapeI: -1, crew: null };
  S.crew = D.CREW_ABOARD.map(c => ({ ...c, room: roomOf(c.home), x: 0, y: 0, path: [], task: null, idle: 2 + Math.random() * 4, placed: false }));
  S.pos = bodyPos("depot"); computePower();
}
const has = room => S.layout.includes(room);
const roomOf = room => Math.max(0, (S ? S.layout : D.START_LAYOUT).indexOf(room));

/* ── Power: reactor output is shared across the faders ── */
function demand() { return SYSTEMS.reduce((n, s) => n + (has(s.room) ? S.alloc[s.k] : 0), 0) + (S.coolant ? 1 : 0); }
const burning = room => { const i = S.layout.indexOf(room); return i >= 0 && S.incidents[i] && S.incidents[i].type === "fire"; };
function supply() { return S.scram > 0 ? 0 : Math.max(0, S.reactor - (burning("reactor") ? 3 : 0)); }
function computePower() {
  const d = demand(), sp = supply(), ratio = d > sp ? sp / Math.max(1, d) : 1;
  SYSTEMS.forEach(s => { S.eff[s.k] = has(s.room) && !burning(s.room) ? Math.floor(S.alloc[s.k] * ratio + 1e-6) : 0; });
  S.overload = d > sp;
}
function safePoint() { return T.safeOutput + (has("battery") ? 2 : 0) + (S.coolant ? T.coolantShift * (has("coolant") ? 2 : 1) : 0); }

/* ── Tick ── */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (S && !S.over && booted) for (let k = 0; k < (window.__sjSpeed || 1) && !S.over; k++) tick(dt); // __sjSpeed: test fast-forward
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
  flightTick(dt); if (S.over) return;
  if (S.combat) combatTick(dt);
  incidentsTick(dt); crewTick(dt); tapeTick(dt);
  if (S.heat > 92 && !burning("reactor") && Math.random() < dt * .25) startIncident(S.layout.indexOf("reactor"), "fire");
  if (S.explore && S.eff.drone < 1 && !S.explore.stalled) { S.explore.stalled = true; log("DRONE LINK LOST: NO POWER TO DRONE BAY.", "alert"); sfx("err"); }
  if (S.explore && S.eff.drone >= 1 && S.explore.stalled) { S.explore.stalled = false; log("DRONE LINK RESTORED.", "grn"); }
  ui();
}

/* ── NAV: one star system, everything moving. Pick a body, burn, and the autopilot flies an intercept.
   The ENG fader is the throttle: speed grows with power, fuel burn grows with power squared. ── */
function speed() {
  if (S.fuel <= 0) return T.drift;                      // tanks dry: ion trickle only
  return S.eff.eng * T.speedPerEng * (S.boost > 0 ? T.slingBoost : 1);
}
function aimAt(id) { // lead the target: where will it be when we get there?
  let p = bodyPos(id); const v = Math.max(speed(), T.drift);
  for (let k = 0; k < 3; k++) p = bodyPos(id, S.time + dist(S.pos, p) / v);
  return p;
}
function selectTarget(id) {
  if (S.landing || id === S.at) return;
  const b = body(id);
  if (S.done.has(id) && b.type === "hostile") return;
  S.target = id; sfx("blip");
  log(`COURSE PLOTTED: ${revealed(b) ? b.name : "UNIDENTIFIED CONTACT"}. ${S.travel ? "ADJUSTING BURN." : "PRESS BURN."}`);
  if (S.travel) S.travel.to = id;
}
function engage() {
  if (S.travel) { cutEngines(); return; }
  if (!S.target) { log("NO COURSE. TAP A BODY ON THE NAV SCOPE.", "alert"); sfx("err"); return; }
  if (S.explore) { log("RECALL THE DRONE BEFORE BURNING.", "alert"); sfx("err"); return; }
  if (S.scoop) { log("FINISH THE SCOOP FIRST.", "alert"); sfx("err"); return; }
  if (S.eff.eng < 1 && S.fuel > 0) { log("NO POWER TO ENGINES. RAISE THE ENG FADER.", "alert"); sfx("err"); return; }
  S.travel = { to: S.target }; S.at = null; log("MAIN ENGINE BURN."); sfx("jump"); setMode("nav");
}
function cutEngines() { S.travel = null; S.sling = null; log("ENGINES CUT. HOLDING POSITION."); sfx("clunk"); }
function flightTick(dt) {
  // parked: ride along with whatever we're orbiting
  if (S.at) S.pos = { ...bodyPos(S.at) };
  if (S.boost > 0) { S.boost -= dt; if (S.boost <= 0) log("SLINGSHOT SPENT. BACK ON OUR OWN ENGINES."); }
  if (S.scoop) { S.scoop.t += dt; S.heat = Math.min(100, S.heat + T.scoopHeat / 5 * dt); if (Math.random() < dt * .06) { log("LIGHTNING STRIKE IN THE CLOUDS!", "alert"); randomIncident("fire"); shake(); }
    if (S.scoop.t >= 5) { S.scoop = null; S.fuel = Math.min(100, S.fuel + T.scoopFuel); log(`SCOOP COMPLETE. +${T.scoopFuel} FUEL.`, "grn"); sfx("dock"); } }
  if (S.travel && !S.landing) {
    const v = speed(), to = S.travel.to, tp = bodyPos(to), aim = aimAt(to), d = dist(S.pos, aim);
    if (v > 0 && d > 1e-6) { const st = Math.min(d, v * dt); S.pos.x += (aim.x - S.pos.x) / d * st; S.pos.y += (aim.y - S.pos.y) / d * st; }
    if (S.fuel > 0 && S.boost <= 0) { S.fuel = Math.max(0, S.fuel - T.fuelPerEng2 * S.eff.eng * S.eff.eng * dt); if (S.fuel <= 0 && !S.dry) { S.dry = true; log("TANKS DRY. ION TRICKLE ONLY. FIND FUEL: SCOOP BRANN OR SALVAGE IT.", "alert"); } }
    if (S.fuel > 0) S.dry = false;
    S.trailT -= dt; if (S.trailT <= 0) { S.trailT = .4; S.trail.push({ ...S.pos }); if (S.trail.length > 90) S.trail.shift(); }
    // slingshot window while passing Brann
    const bp = bodyPos("brann"), nearB = dist(S.pos, bp) < SYS.sling && to !== "brann" && to !== "aurora";
    if (nearB && !S.sling) { S.sling = { t: 0, done: false }; log("PASSING BRANN. SLINGSHOT WINDOW OPEN: HIT SLING ON THE GREEN.", "grn"); sfx("relay"); }
    if (!nearB && S.sling) S.sling = null;
    if (S.sling) S.sling.t += dt;
    if (dist(S.pos, tp) < .012 + (body(to).size || 0)) arrive();
  }
  if (S.landing) S.pos = { ...bodyPos("halcyon") };
  hazards(dt);
  // reveal what sensors can reach
  const range = .14 + .1 * S.eff.sens;
  SYS.bodies.forEach(b => { if (S.seen.has(b.id)) return; const d = dist(S.pos, bodyPos(b));
    if (b.veil ? d < .03 : d < range) { S.seen.add(b.id); if (!b.known) { log(`SENSORS: ${b.name} IDENTIFIED.`, b.type === "hostile" ? "alert" : "grn"); sfx("blip"); } } });
  // hostiles close in
  SYS.bodies.forEach(b => {
    if (b.type !== "hostile" || S.done.has(b.id)) return;
    const E = D.ENEMIES[b.enemy], p = bodyPos(b), d = dist(S.pos, p);
    if (S.combat && S.combat.id === b.id) {
      const f = S.foes[b.id] || (S.foes[b.id] = { ...p }); if (d > .02) { const st = Math.min(d - .02, E.chase * dt); f.x += (S.pos.x - f.x) / d * st; f.y += (S.pos.y - f.y) / d * st; }
      if (d > E.range * 1.7) { log(`${E.name} FALLING BEHIND. CONTACT LOST.`, "grn"); sfx("relay"); S.combat = null; if (S.mode === "radar") setMode("nav"); }
    } else if (!S.combat && d < E.range) startCombat(b);
  });
}
function hazards(dt) {
  const r = Math.hypot(S.pos.x, S.pos.y), moving = S.travel && !S.landing ? S.eff.eng * (S.boost > 0 ? 2 : 1) : 0;
  const inBelt = r > SYS.belt[0] && r < SYS.belt[1], inVeil = dist(S.pos, bodyPos("brann")) < SYS.veil;
  if (inBelt !== S.inBelt) { S.inBelt = inBelt; if (inBelt) log(moving > 2 ? "ENTERING THE ICE BELT AT SPEED. THROTTLE DOWN OR RAISE SHIELDS." : "ENTERING THE ICE BELT.", moving > 2 ? "alert" : ""); }
  if (inVeil !== S.inVeil) { S.inVeil = inVeil; if (inVeil) log("INSIDE THE VEIL. SENSORS BLIND. LIGHTNING EVERYWHERE.", "alert"); }
  const shieldSave = Math.min(.85, S.eff.shd * .3);
  if (inBelt && moving && Math.random() < .06 * moving * moving * dt) {
    if (Math.random() < shieldSave) { log("MICROMETEORITE. SHIELDS HELD.", "grn"); sfx("shield"); }
    else { S.hull -= 1; log("MICROMETEORITE STRIKE! HULL -1.", "alert"); sfx("hit"); shake(); if (Math.random() < .35) randomIncident("breach"); if (S.hull <= 0) return lose("hull"); }
  }
  if (inVeil && Math.random() < (moving ? .12 : .05) * dt) {
    if (Math.random() < shieldSave) { log("LIGHTNING ARCS ACROSS THE SHIELDS.", "grn"); sfx("shield"); }
    else { log("LIGHTNING STRIKE! ELECTRICAL FIRE.", "alert"); sfx("hit"); shake(); randomIncident("fire"); }
  }
}
function slingPhase() { const k = (S.sling.t * .9) % 2; return k < 1 ? k : 2 - k; } // needle sweeps 0→1→0
function slingshot() {
  if (!S.sling || S.sling.done) return; S.sling.done = true;
  const p = slingPhase();
  if (p > .4 && p < .6) { S.boost = T.slingTime; log(`SLINGSHOT! BRANN THROWS US FORWARD. DOUBLE SPEED, NO FUEL, ${T.slingTime} SECONDS.`, "grn"); sfx("win"); }
  else { S.hull -= 1; S.heat = Math.min(100, S.heat + 12); log("BAD ANGLE. HULL STRESS -1.", "alert"); sfx("hit"); shake(); if (S.hull <= 0) lose("hull"); }
  renderActions();
}
function arrive() {
  const id = S.travel.to, b = body(id);
  if (b.id === "halcyon") { S.landing = true; S.sling = null; log("HALCYON ORBIT INSERTION. WE'RE COMING IN FAST. BRAKE BURN OR AEROBRAKE?", "alert"); sfx("alarm"); renderActions(); return; }
  S.travel = null; S.sling = null; S.at = id; S.target = null; S.visited.add(id); S.seen.add(id); sfx("relay");
  log(`ARRIVED: ${b.name}.`, "grn"); if (D.ARRIVE[b.type]) log(D.ARRIVE[b.type]);
  if (b.type === "beacon" && !S.done.has(id)) { S.done.add(id); log("BEACON 7 BUFFER DUMPED TO CASSETTE.", "grn"); addTape("hale"); }
  if (S.mode === "nav") renderActions();
}
function scoop() {
  if (S.at !== "brann" || S.scoop) return;
  S.scoop = { t: 0 }; log("DIPPING INTO BRANN'S CLOUDS. WATCH THE HEAT.", "alert"); sfx("launch"); renderActions();
}
function land(how) {
  if (how === "burn") {
    if (S.fuel < T.brakeFuel || S.eff.eng < 1) { log(S.eff.eng < 1 ? "NO ENGINE POWER FOR A BRAKE BURN." : "NOT ENOUGH FUEL TO BRAKE. AEROBRAKE IT IS.", "alert"); sfx("err"); return; }
    S.fuel -= T.brakeFuel; log(`BRAKE BURN. -${T.brakeFuel} FUEL. SOFT ENTRY.`, "grn"); sfx("jump"); return win("burn");
  }
  const dmg = Math.max(0, 2 + S.eff.eng - S.eff.shd);
  S.hull -= dmg; S.heat = Math.min(100, S.heat + 25); shake(); sfx("hit");
  log(dmg ? `AEROBRAKE! THE HULL SCREAMS. HULL -${dmg}.` : "AEROBRAKE. SHIELDS TAKE THE HEAT. PERFECT ENTRY.", dmg ? "alert" : "grn");
  if (S.hull <= 0) return lose("burnup");
  win("aero");
}
function revealed(b) {
  if (typeof b === "string") b = body(b);
  return b.known || S.seen.has(b.id) || S.visited.has(b.id);
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
  const n = S.at && body(S.at);
  if (!n || !n.map || S.done.has(S.at)) return;
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
  if (c === "F") { E.carry.fuel += 15; E.grid[ny][nx] = "."; log("FUEL CELL: +15 FUEL IN DRONE HOLD.", "grn"); sfx("pick"); }
  if (c === "O") { E.carry.o2 += 30; E.grid[ny][nx] = "."; log("OXYGEN CANISTER: +30 O₂ IN DRONE HOLD.", "grn"); sfx("pick"); }
  if (c === "L") { E.grid[ny][nx] = "."; log(E.M.logs[E.logI++] || "LOG CORRUPTED."); sfx("blip"); }
  if (c === "K") { E.grid[ny][nx] = "."; E.carry.tape = E.M.tape; log("CASSETTE TAPE FOUND. IT'LL PLAY WHEN THE DRONE DOCKS.", "grn"); sfx("pick"); }
  if (c === "C") { E.grid[ny][nx] = "."; S.core = true; S.seen.add("aurora"); log(E.M.core, "grn"); sfx("pick"); }
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
  S.scrap += E.carry.scrap; S.fuel = Math.min(100, S.fuel + E.carry.fuel); S.o2 = Math.min(100, S.o2 + E.carry.o2);
  log(`DRONE DOCKED. UNLOADED ${E.carry.scrap} SCRAP, ${E.carry.fuel} FUEL, ${E.carry.o2} O₂.`, "grn"); sfx("dock");
  if (E.carry.tape) addTape(E.carry.tape);
  S.done.add(S.at); S.explore = null; setMode("nav");
}
function droneLost() { log("DRONE BATTERY DEAD. SIGNAL LOST. EVERYTHING IT CARRIED IS GONE.", "alert"); sfx("alarm"); S.done.add(S.at); S.explore = null; setMode("nav"); }

/* ── RADAR: battle ── */
function startCombat(n) {
  const E = D.ENEMIES[n.enemy]; S.seen.add(n.id);
  S.combat = { id: n.id, E, hull: E.hull, sh: E.shields, shT: 0, fireT: E.fireEvery * .7, wpn: 0, layers: S.eff.shd, layerT: 0, shots: [], hits: [] };
  log(E.hail, "alert"); log(`${E.name} ON RADAR. HULL ${E.hull}, SHIELDS ${E.shields}.`, "alert");
  if (!has("weapon")) log("NO WEAPON BAY. OUTRUN THEM: MORE POWER TO ENG.", "alert");
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
      else { S.hull -= E.dmg; log(`HULL HIT! -${E.dmg}.`, "alert"); sfx("hit"); shake(); if (Math.random() < D.INCIDENTS.hitChance) randomIncident(); }
    } else {
      if (C.sh > 0) { C.sh--; C.shT = 0; log("ENEMY SHIELD DOWN."); sfx("shield"); }
      else { C.hull -= 2; log(`DIRECT HIT. ENEMY HULL ${Math.max(0, C.hull)}.`, "grn"); sfx("boom"); }
    }
    C.hits.push({ at: s.from, t: 0 });
  });
  C.shots = C.shots.filter(s => s.t < 1); C.hits.forEach(h => h.t += dt); C.hits = C.hits.filter(h => h.t < .6);
  if (S.hull <= 0) return lose("hull");
  if (C.hull <= 0) { const L = E.loot; S.scrap += L.scrap; S.fuel = Math.min(100, S.fuel + L.fuel); S.done.add(C.id); if (S.target === C.id) { S.target = null; if (S.travel) cutEngines(); } log(`${E.name} DESTROYED. SALVAGED ${L.scrap} SCRAP, ${L.fuel} FUEL.`, "grn"); sfx("win"); S.combat = null; setMode("nav"); }
}
function fire() { const C = S.combat; if (!C || C.wpn < 100) return; C.wpn = 0; C.shots.push({ from: "us", t: 0 }); sfx("fire"); }

/* ── End states ── */
function lose(why) {
  if (S.over) return; S.over = true; sfx("alarm");
  const T0 = { hull: ["HULL BREACH", "THE MERIDIAN BROKE APART. HER BEACON IS STILL BLINKING FOR ANYONE WHO COMES LOOKING."],
    burnup: ["BURNED UP ON ENTRY", "SO CLOSE. HALCYON'S SKY LIT UP FOR A MOMENT. SOMEONE DOWN THERE SAW IT."],
    o2: ["LIFE SUPPORT FAILURE", "THE AIR RAN OUT BEFORE THE POWER DID. SOL KEPT THE LIGHTS ON ANYWAY."] }[why] || ["LOST", ""];
  endScreen(T0[0], T0[1], "amber");
}
function win(how) {
  if (S.over) return; S.over = true; sfx("win");
  const days = Math.max(1, Math.round(S.time / 6));
  const story = S.tapes.includes("aurora") ? "THE AURORA'S COUNT IS STILL GOING ON THE COMMS. SOMEONE DOWN THERE IS STILL COUNTING. WE BROUGHT COFFEE."
    : S.core ? "THE AURORA WENT INTO THE VEIL ON PURPOSE. WE NEVER FOUND OUT WHY. THE COUNT GOES ON WITHOUT US."
    : "A STRANGE COUNT CRACKLES ON THE COMMS. NOBODY ABOARD KNOWS WHAT IT MEANS.";
  endScreen("LANDED ON HALCYON", `${how === "aero" ? "AEROBRAKED IN" : "BRAKE BURN, SOFT ENTRY"}. DAY ${days} OF THE CROSSING. HULL ${S.hull}/${S.maxHull}.\n${story}`, "");
}
function endScreen(title, text, cls) {
  const ov = $("#ovEnd"), lines = [`*** MERIDIAN SHIP CONTROL · MISSION PRINTOUT ***`, ``, title, `-`.repeat(title.length), ``, ...text.split("\n"), ``,
    `HULL ........ ${Math.max(0, S.hull)}/${S.maxHull}`, `FUEL ........ ${Math.round(S.fuel)}`, `SCRAP ....... ${S.scrap}`, `TAPES FOUND . ${S.tapes.length}/${Object.keys(D.TAPES).length}`, `ROOMS BUILT . ${S.layout.filter(Boolean).length}/9`, ``, `END OF PRINTOUT. TEAR ALONG PERFORATION.`];
  ov.innerHTML = `<div class="paper"><div class="feed" id="feed"></div><button class="big grn go" id="again" type="button" hidden>Reboot</button></div>`;
  ov.hidden = false; say(title + ". " + text.split("\n")[0], true);
  const feed = $("#feed"); let i = 0;
  (function print() { if (i >= lines.length) { $("#again").hidden = false; return; } const p = document.createElement("p"); p.textContent = lines[i++] || " "; feed.appendChild(p); sfx("print"); setTimeout(print, reduce ? 0 : 140); })();
  $("#again").addEventListener("click", () => { ov.hidden = true; stopTape(); newGame(); termLines = []; bootLog(); renderFaders(); renderShip(); setMode("nav"); });
}

/* ── Terminal ── */
let termLines = [];
function log(t, cls = "") { termLines.push({ t, cls }); if (termLines.length > 6) termLines.shift(); renderTerm(); if (cls === "alert") say(t, false); }
function renderTerm() {
  $("#term").innerHTML = termLines.map((l, i) => `<p class="${l.cls}${i < termLines.length - 3 ? " old" : ""}">&gt; ${esc(l.t)}${i === termLines.length - 1 ? ' <span class="cursor"></span>' : ""}</p>`).join("");
}
function bootLog() { log("MERIDIAN SHIP CONTROL ONLINE.", "grn"); D.CREW.forEach(c => log(c)); log("HALCYON IS INSYSTEM. TAP ANY BODY ON THE NAV SCOPE, THEN BURN."); }

/* ── Monitor modes ── */
function setMode(m) {
  S.mode = m; buildSlot = null;
  document.querySelectorAll(".sel-btn").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  const amber = m === "drone"; $("#crt").classList.toggle("amber", amber);
  $("#crtLabel").textContent = { nav: "NAV SCOPE", ship: "SHIP · CUTAWAY", drone: "DRONE CAM", radar: "RADAR" }[m];
  renderShip();
  renderActions(); sfx("tick");
}
document.querySelectorAll(".sel-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

function renderActions() {
  const a = $("#actions"), m = S.mode;
  if (m === "nav") {
    navKey = navState();
    if (S.landing) {
      a.innerHTML = `<div class="info">HALCYON ENTRY. BRAKE BURN COSTS ${T.brakeFuel} FUEL. AEROBRAKE IS FREE BUT HURTS: LESS ENG AND MORE SHIELDS = SOFTER.</div>
        <button class="big yel" id="bBrake" type="button">Brake burn</button><button class="big red" id="bAero" type="button">Aerobrake</button>`;
      $("#bBrake").addEventListener("click", () => land("burn")); $("#bAero").addEventListener("click", () => land("aero")); return;
    }
    const n = S.at && body(S.at), canDock = n && n.map && !S.done.has(S.at), canScoop = S.at === "brann" && !S.scoop;
    const sl = S.sling && !S.sling.done;
    a.innerHTML = `<div class="info" id="navInfo"></div>
      ${sl ? `<div class="charge"><span class="plate">Slingshot</span><div class="bar sling"><b></b><i id="needle"></i></div></div><button class="big grn" id="bSling" type="button">Sling</button>` : ""}
      ${canDock ? `<button class="big blu" id="bDock" type="button">Dock</button>` : ""}${canScoop ? `<button class="big yel" id="bScoop" type="button">Scoop fuel</button>` : ""}
      <button class="big red" id="bEngage" type="button">${S.travel ? "Cut engines" : "Burn"}</button>`;
    $("#bEngage").addEventListener("click", engage); if (canDock) $("#bDock").addEventListener("click", dock);
    if (canScoop) $("#bScoop").addEventListener("click", scoop); if (sl) $("#bSling").addEventListener("click", slingshot);
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
      <button class="big red" id="bFire" type="button">Fire</button><button class="big yel" id="bFlee" type="button">Full burn</button>`;
    $("#bFire").addEventListener("click", fire); $("#bFlee").addEventListener("click", () => {
      if (!S.target) { log("PLOT A COURSE ON THE NAV SCOPE, THEN BURN AWAY.", "alert"); setMode("nav"); return; }
      S.alloc.eng = 4; sfx("click"); log("ALL POWER TO ENGINES. RUN!", "alert"); if (!S.travel) engage(); });
  } else {
    const fires = Object.keys(S.incidents).map(Number);
    if (fires.length) return showIncident(S.sel != null && S.incidents[S.sel] ? S.sel : fires[0]);
    a.innerHTML = `<div class="info">TAP AN EMPTY BAY TO BUILD. TAP A ROOM TO INSPECT OR STRIP IT. WHEN SOMETHING BURNS, TAP IT: SEND CREW OR VENT.</div>`;
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
  if (S.mode === "nav" && navState() !== navKey) renderActions();
  if (S.mode === "nav" && $("#navInfo")) {
    const t = S.target && body(S.target), v = speed();
    let info;
    if (t) {
      const d = dist(S.pos, aimAt(S.target)), eta = v > 0 ? d / v : Infinity, cost = S.fuel > 0 && S.boost <= 0 ? T.fuelPerEng2 * S.eff.eng * S.eff.eng * eta : 0;
      info = `${S.travel ? "BURNING FOR" : "TARGET"}: ${revealed(t) ? t.name : "UNKNOWN CONTACT"} · ${isFinite(eta) ? `ETA ${Math.ceil(eta)}S · ~${Math.ceil(cost)} FUEL` : "NO THRUST"}${S.boost > 0 ? " · SLINGSHOT" : ""}${S.fuel <= 0 ? " · TANKS DRY" : ""}`;
    } else info = S.at ? `AT: ${body(S.at).name}. TAP A BODY TO PLOT A COURSE.` : "ADRIFT. TAP A BODY TO PLOT A COURSE.";
    if (S.scoop) info = `SCOOPING FUEL… ${Math.round(S.scoop.t / 5 * 100)}%`;
    $("#navInfo").textContent = info;
    const e = $("#bEngage"); if (e) { e.disabled = !S.travel && !S.target; e.classList.toggle("ready", !S.travel && !!S.target && S.eff.eng > 0); }
    if (S.sling && $("#needle")) $("#needle").style.left = slingPhase() * 100 + "%";
  }
  if (S.mode === "drone" && S.explore && $("#dbat")) {
    const E = S.explore; $("#dbat").style.width = clamp(E.bat / E.maxBat, 0, 1) * 100 + "%";
    $("#dInfo").textContent = `HOLD: ${E.carry.scrap}S ${E.carry.fuel}F ${E.carry.o2}O₂${E.stalled ? " · NO POWER" : ""}`;
    a11yDpad(!E.stalled);
  }
  if (S.mode === "radar" && S.combat && $("#wchg")) {
    const C = S.combat; $("#wchg").style.width = C.wpn + "%"; const f = $("#bFire"); f.disabled = !has("weapon") || C.wpn < 100; f.classList.toggle("ready", !f.disabled);
    $("#lay").innerHTML = Array.from({ length: Math.max(1, S.eff.shd) }, (_, i) => `<i class="${i < C.layers ? "on" : ""}"></i>`).join("");
    const fl = $("#bFlee"); fl.classList.toggle("ready", !!S.target);
  }
  document.querySelector('.sel-btn[data-mode="radar"]').classList.toggle("alert", !!S.combat && S.mode !== "radar");
  document.querySelector('.sel-btn[data-mode="ship"]').classList.toggle("alert", Object.keys(S.incidents).length > 0 && S.mode !== "ship");
  lamp("#lFire", Object.keys(S.incidents).length > 0, true);
  tapeUI();
  document.querySelector('.sel-btn[data-mode="drone"]').classList.toggle("alert", !!S.explore && S.mode !== "drone");
  $("#crtInfo").textContent = S.mode === "nav" ? `${SYS.name} · DAY ${Math.max(1, Math.round(S.time / 6))}` : S.mode === "drone" && S.explore ? `BAT ${Math.max(0, Math.round(S.explore.bat))}` : "";
}
let navKey = "";
function navState() { return [S.at, !!S.travel, S.landing, S.sling ? (S.sling.done ? 2 : 1) : 0, !!S.scoop, S.at && S.done.has(S.at)].join("|"); }
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

/* ── Ship cutaway: build menu overlay + room actions ── */
function renderShip() {
  const g = $("#shipgrid");
  g.hidden = !(S.mode === "ship" && buildSlot !== null);
  if (g.hidden) { g.innerHTML = ""; return; }
  g.innerHTML = `<div class="buildmenu"><p>BAY ${buildSlot + 1}: BUILD WHAT? SCRAP ${S.scrap}</p>${D.BUILDABLE.map(r => { const R = D.ROOMS[r], ok = S.scrap >= R.cost && !has(r); return `<button type="button" data-b="${r}" ${ok ? "" : "disabled"}><span>${R.name}</span><span>${has(r) ? "BUILT" : R.cost + " SCR"}</span></button>`; }).join("")}<button type="button" data-b="x"><span>CANCEL</span><span></span></button></div>`;
  g.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => { if (b.dataset.b === "x") { buildSlot = null; renderShip(); } else build(buildSlot, b.dataset.b); }));
}
function roomTapped(i) {
  const inc = S.incidents[i];
  if (inc) { S.sel = i; showIncident(i); sfx("tick"); return; }
  if (S.combat || S.explore) { S.sel = i; if (S.layout[i]) log(`${D.ROOMS[S.layout[i]].name}: ${S.layout[i] && D.ROOMS[S.layout[i]].desc}`); sfx("tick"); return; }
  shipClick(i);
  const r = S.layout[i]; if (!r) return;
  const R = D.ROOMS[r]; log(`${R.name}: ${R.desc}`);
  if (!R.fixed) showDemolish(i); else renderActions();
}
function showDemolish(i) {
  const a = $("#actions"), R = D.ROOMS[S.layout[i]];
  a.innerHTML = `<div class="info">${esc(R.name)} · ${esc(R.desc)}</div><button class="big red" id="bDemo" type="button">Strip +${Math.floor(R.cost / 2)}</button><button class="big grey" id="bBack" type="button">Back</button>`;
  $("#bDemo").addEventListener("click", () => { demolish(i); S.sel = null; renderActions(); }); $("#bBack").addEventListener("click", () => { S.sel = null; renderActions(); });
}
function showIncident(i) {
  const inc = S.incidents[i], a = $("#actions"); if (!inc) return renderActions();
  const room = S.layout[i] ? D.ROOMS[S.layout[i]].name : "BAY " + (i + 1);
  const busy = S.crew.find(c => c.task && c.task.room === i);
  a.innerHTML = `<div class="info">${D.INCIDENTS[inc.type].name} IN ${esc(room)}. ${busy ? busy.name + " IS ON IT." : "NOBODY ASSIGNED."} ${inc.type === "fire" ? "IT WILL SPREAD." : "AIR IS VENTING."}</div>
    <button class="big yel" id="bSend" type="button" ${busy ? "disabled" : ""}>Send crew</button><button class="big red" id="bVent" type="button">Vent room</button>`;
  $("#bSend").addEventListener("click", () => dispatch(i));
  $("#bVent").addEventListener("click", () => vent(i));
}

/* ── Incidents & crew ── */
function startIncident(i, type) {
  if (i < 0 || S.incidents[i]) return;
  S.incidents[i] = { type, t: 0, hullT: 0 };
  const room = S.layout[i] ? D.ROOMS[S.layout[i]].name : "EMPTY BAY " + (i + 1);
  log(`${type === "fire" ? "FIRE" : "HULL BREACH"} IN ${room}!`, "alert"); sfx("alarm");
  if (S.mode === "ship") showIncident(i);
}
function randomIncident(type) {
  const rooms = S.layout.map((r, i) => i).filter(i => S.layout[i] && S.layout[i] !== "bridge" && !S.incidents[i]);
  if (!rooms.length) return;
  startIncident(rooms[(Math.random() * rooms.length) | 0], type || (Math.random() < .6 ? "fire" : "breach"));
}
function incidentsTick(dt) {
  Object.entries(S.incidents).forEach(([k, inc]) => {
    const i = +k, I = D.INCIDENTS[inc.type]; inc.t += dt;
    if (inc.type === "fire") {
      inc.hullT += dt; if (inc.hullT >= I.hullEvery) { inc.hullT = 0; S.hull -= 1; log("FIRE DAMAGE: HULL -1.", "alert"); if (S.hull <= 0) lose("hull"); }
      if (inc.t >= I.spread) { inc.t = 0; const n = [i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter(j => j >= 0 && j < 9 && !S.incidents[j]); if (n.length) startIncident(n[(Math.random() * n.length) | 0], "fire"); }
    } else S.o2 = Math.max(0, S.o2 - I.o2 * dt);
  });
}
function dispatch(i) {
  if (!S.incidents[i]) return;
  const free = S.crew.filter(c => !c.task && !c.hurt);
  if (!free.length) { log("EVERYONE'S BUSY.", "alert"); sfx("err"); return; }
  const cx = cellCenter(i);
  const c = free.sort((a, b) => Math.abs(a.x - cx[0]) + Math.abs(a.y - cx[1]) - Math.abs(b.x - cx[0]) - Math.abs(b.y - cx[1]))[0];
  c.task = { room: i, work: 0 }; c.path = pathTo(c, i); sfx("blip"); log(`${c.name}: ON MY WAY.`);
  if (S.mode === "ship") showIncident(i);
}
function vent(i) {
  if (!S.incidents[i]) return;
  S.o2 = Math.max(0, S.o2 - D.INCIDENTS.ventO2); delete S.incidents[i]; sfx("vent"); shake();
  S.crew.forEach(c => { if (c.room === i && !c.moving) { c.hurt = 8; log(`${c.name} CAUGHT IN THE VENT! MED BAY, NOW.`, "alert"); } if (c.task && c.task.room === i) c.task = null; });
  log(`ROOM VENTED TO SPACE. -${D.INCIDENTS.ventO2} O₂.`, "alert"); renderActions();
}
/* Crew walk along the decks; the middle column has the ladder between decks. */
let CELL = null; // [x, y, w, h] of each bay in canvas pixels, set by drawShipCut
function cellCenter(i) { if (!CELL || !CELL[i]) return [0, 0]; const c = CELL[i]; return [c[0] + c[2] / 2, c[1] + c[3] - 10 * DPR]; }
function pathTo(c, i) {
  if (!CELL) return [];
  const from = c.room >= 0 ? c.room : 4, [tx, ty] = cellCenter(i), rowFrom = Math.floor(from / 3), rowTo = Math.floor(i / 3);
  if (rowFrom === rowTo) return [[tx, ty]];
  const lad = cellCenter(rowFrom * 3 + 1), ladTo = cellCenter(rowTo * 3 + 1);
  return [[lad[0], lad[1]], [ladTo[0], ladTo[1]], [tx, ty]];
}
function crewTick(dt) {
  if (!CELL) return;
  S.crew.forEach(c => {
    if (!c.placed) { const [x, y] = cellCenter(c.room); c.x = x + (Math.random() - .5) * 30 * DPR; c.y = y; c.placed = true; }
    if (c.hurt) { c.hurt -= dt; if (c.hurt <= 0) { c.hurt = 0; log(`${c.name}: I'M OK. BACK ON DUTY.`); } }
    if (c.path.length) {
      c.moving = true; const [tx, ty] = c.path[0], sp = 70 * DPR * dt * (c.hurt ? .4 : 1), dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      if (d <= sp) { c.x = tx; c.y = ty; c.path.shift(); if (!c.path.length) { c.moving = false; const r = roomAt(c.x, c.y - 4 * DPR); if (r >= 0) c.room = r; } }
      else { c.x += dx / d * sp; c.y += dy / d * sp; c.face = dx < 0 ? -1 : 1; }
      return;
    }
    c.moving = false;
    if (c.task) {
      const inc = S.incidents[c.task.room];
      if (!inc) { c.task = null; return; }
      c.task.work += dt; if (Math.random() < .3) sparks.push({ x: c.x + (Math.random() - .5) * 12 * DPR, y: c.y - 10 * DPR, vx: (Math.random() - .5) * 60, vy: -Math.random() * 60, life: .4, col: D.INCIDENTS[inc.type].color });
      if (c.task.work >= D.INCIDENTS[inc.type].fix) {
        if (inc.type === "breach" && S.scrap > 0) S.scrap -= 1;
        delete S.incidents[c.task.room]; c.task = null; log(c.fix[(Math.random() * c.fix.length) | 0], "grn"); sfx("dock");
        if (S.mode === "ship") renderActions();
      }
      return;
    }
    c.idle -= dt;
    if (c.idle <= 0) { c.idle = 4 + Math.random() * 6; const home = roomOf(c.home); const built = S.layout.map((r, i) => r ? i : -1).filter(i => i >= 0); const dest = Math.random() < .6 ? home : built[(Math.random() * built.length) | 0]; if (dest !== c.room) c.path = pathTo(c, dest); else { const [x] = cellCenter(dest); c.path = [[x + (Math.random() - .5) * 40 * DPR, c.y]]; } }
  });
}
function roomAt(x, y) { if (!CELL) return -1; return CELL.findIndex(([cx, cy, w, h]) => x >= cx && x <= cx + w && y >= cy && y <= cy + h); }
let sparks = [];

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
  if (m === "nav") drawNav(t); else if (m === "radar") drawRadar(t); else if (m === "drone") drawDrone(t); else drawShipCut(t);
}
const glowLine = (col, w = 1.6) => { g.strokeStyle = col; g.lineWidth = w * DPR; g.shadowColor = col; g.shadowBlur = 8 * DPR; };
const txt = (s, x, y, col, size = 18, al = "center") => { g.shadowBlur = 6 * DPR; g.shadowColor = col; g.fillStyle = col; g.font = `${size * DPR}px VT323, monospace`; g.textAlign = al; g.fillText(s, x, y); };
let navScale = 1, navC = [0, 0];
function toScr(p) { return [navC[0] + p.x * navScale, navC[1] + p.y * navScale]; }
const BELT = Array.from({ length: 170 }, (_, i) => ({ a: Math.random() * TAU, r: D.SYSTEM.belt[0] + Math.random() * (D.SYSTEM.belt[1] - D.SYSTEM.belt[0]), s: Math.random() < .2 ? 2 : 1.2 }));
function drawNav(t) {
  navC = [W / 2, H / 2 + 8 * DPR]; navScale = Math.min(W / 2 - 14 * DPR, H / 2 - 26 * DPR);
  const R = navScale, [cx, cy] = navC;
  // range rings
  g.shadowBlur = 0; g.strokeStyle = "rgba(109,255,138,.07)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  // orbits
  SYS.bodies.forEach(b => {
    if (b.type === "hostile" || (!revealed(b) && !b.known)) return;
    const c = b.parent ? toScr(bodyPos(b.parent)) : navC;
    g.strokeStyle = "rgba(109,255,138,.16)"; g.setLineDash([2 * DPR, 5 * DPR]); g.beginPath(); g.arc(c[0], c[1], b.r * R, 0, TAU); g.stroke();
  });
  g.setLineDash([]);
  // the ice belt
  const rot = S.time * .004; g.fillStyle = "rgba(109,255,138,.4)";
  BELT.forEach(k => { const a = k.a + rot * (1 - k.r); g.fillRect(cx + Math.cos(a) * k.r * R, cy + Math.sin(a) * k.r * R, k.s * DPR, k.s * DPR); });
  // the star
  const pul = 1 + Math.sin(t * 2) * .08;
  g.fillStyle = AMB; g.shadowColor = AMB; g.shadowBlur = 24 * DPR; g.beginPath(); g.arc(cx, cy, 7 * DPR * pul, 0, TAU); g.fill();
  glowLine(AMB, 1); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * .2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 11 * DPR, cy + Math.sin(a) * 11 * DPR); g.lineTo(cx + Math.cos(a) * 17 * DPR, cy + Math.sin(a) * 17 * DPR); g.stroke(); }
  txt(SYS.star, cx, cy + 30 * DPR, AMB_D, 14);
  // Brann: the Veil and the slingshot zone
  const bp = toScr(bodyPos("brann"));
  glowLine("rgba(109,255,138,.35)", 1); g.beginPath();
  for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU, rr = (SYS.veil + Math.sin(a * 7 + t * 2) * .006) * R; g[i ? "lineTo" : "moveTo"](bp[0] + Math.cos(a) * rr, bp[1] + Math.sin(a) * rr); } g.stroke();
  if (S.travel && S.travel.to !== "brann") { glowLine(S.sling ? GRN : "rgba(109,255,138,.3)", 1); g.setLineDash([3 * DPR, 4 * DPR]); g.beginPath(); g.arc(bp[0], bp[1], SYS.sling * R, 0, TAU); g.stroke(); g.setLineDash([]); if (!S.sling) txt("SLING ZONE", bp[0], bp[1] - SYS.sling * R - 4 * DPR, GRN_D, 13); }
  // bodies
  SYS.bodies.forEach(b => {
    const [x, y] = toScr(bodyPos(b)), known = revealed(b), done = S.done.has(b.id), s = 6 * DPR;
    if (b.type === "hostile" && done) { glowLine(GRN_D, 1); g.beginPath(); g.moveTo(x - 3 * DPR, y - 3 * DPR); g.lineTo(x + 3 * DPR, y + 3 * DPR); g.stroke(); return; }
    if (b.veil && !known) return;               // hidden in the storm
    const col = b.type === "hostile" && known ? RED : b.type === "halcyon" ? AMB : GRN;
    glowLine(col, 1.8); g.beginPath();
    if (!known) { txt("?", x, y + 6 * DPR, GRN_D, 20); }
    else if (b.type === "giant") { const r = b.size * R; g.arc(x, y, r, 0, TAU); g.stroke(); for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x, y + k * r * .4, r * Math.sqrt(1 - (k * .4) ** 2), r * .12, 0, 0, TAU); g.stroke(); } }
    else if (b.type === "halcyon") { const r = b.size * R; g.arc(x, y, r, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, r + 4 * DPR + Math.sin(t * 3) * DPR, 0, TAU); g.globalAlpha = .5; g.stroke(); g.globalAlpha = 1; }
    else if (b.type === "hostile") { g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke(); }
    else if (b.type === "derelict" || b.type === "station") { g.rect(x - s, y - s, s * 2, s * 2); g.stroke(); if (done) { g.beginPath(); g.moveTo(x - s, y + s); g.lineTo(x + s, y - s); g.stroke(); } }
    else if (b.type === "beacon") { g.moveTo(x, y - s); g.lineTo(x + s, y + s); g.lineTo(x - s, y + s); g.closePath(); g.stroke(); if (!done && (t * 2 | 0) % 2) { g.beginPath(); g.arc(x, y, s * 2.2, 0, TAU); g.stroke(); } }
    else { g.rect(x - s * .6, y - s * .6, s * 1.2, s * 1.2); g.stroke(); }
    if (known) txt(b.name, x, y + ((b.size || 0) * R + 18 * DPR), col, 14);
    if (b.id === S.target) { glowLine(GRN, 1.5); const q = (14 + (b.size || 0) * R / DPR) * DPR + Math.sin(t * 6) * 2 * DPR; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(x + dx * q, y + dy * q * .6); g.lineTo(x + dx * q, y + dy * q); g.lineTo(x + dx * q * .6, y + dy * q); g.stroke(); }); }
  });
  // our trail and plotted course
  g.shadowBlur = 0; S.trail.forEach((p, i) => { g.fillStyle = `rgba(255,179,71,${.15 + .5 * i / S.trail.length})`; const [x, y] = toScr(p); g.fillRect(x - DPR, y - DPR, 2 * DPR, 2 * DPR); });
  const [sx, sy] = toScr(S.pos);
  if (S.target && !S.landing) { const [ax, ay] = toScr(aimAt(S.target)); glowLine(S.travel ? AMB : "rgba(255,179,71,.5)", 1.2); g.setLineDash([5 * DPR, 5 * DPR]); g.beginPath(); g.moveTo(sx, sy); g.lineTo(ax, ay); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(ax, ay, 4 * DPR, 0, TAU); g.stroke(); }
  // the Meridian, pointing where she's going
  const aim = S.target && !S.landing ? aimAt(S.target) : { x: S.pos.x + 1, y: S.pos.y }, ang = Math.atan2(aim.y - S.pos.y, aim.x - S.pos.x);
  if ((t * 2 | 0) % 2 || S.travel) {
    g.save(); g.translate(sx, sy); g.rotate(ang); glowLine(AMB, 2); g.fillStyle = AMB;
    g.beginPath(); g.moveTo(10 * DPR, 0); g.lineTo(-6 * DPR, 6 * DPR); g.lineTo(-6 * DPR, -6 * DPR); g.closePath(); g.fill();
    if (S.travel && speed() > T.drift) { g.beginPath(); g.moveTo(-8 * DPR, 0); g.lineTo(-(10 + S.eff.eng * 3 + Math.sin(t * 30) * 2) * DPR, 0); g.stroke(); }
    g.restore();
  }
  txt(`FUEL ${Math.round(S.fuel)}  ·  ENG ${S.eff.eng}${S.boost > 0 ? " ×2" : ""}  ·  SENS ${S.eff.sens ? "R" + S.eff.sens : "OFF"}${S.inBelt ? "  ·  ICE BELT" : ""}${S.inVeil ? "  ·  VEIL" : ""}`, 10 * DPR, H - 10 * DPR, GRN, 16, "left");
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
  const fp = bodyPos(C.id), brg = Math.atan2(fp.y - S.pos.y, fp.x - S.pos.x), rr = clamp(dist(S.pos, fp) / (C.E.range * 1.7), .25, .95);
  const ex = cx + Math.cos(brg) * R * rr, ey = cy + Math.sin(brg) * R * rr;
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
    const glyph = { S: "$", F: "F", O: "O", L: "≡", C: "◆", A: "A", X: "✶", K: "▣", T: E.jammed.has(x + "," + y) ? "t" : "T" }[c];
    if (glyph) { const col = c === "X" ? (Math.sin(t * 12 + x) > 0 ? RED : AMB) : c === "T" && !E.jammed.has(x + "," + y) ? RED : AMB; txt(glyph, px + cs / 2, py + cs * .72, col, cs / DPR * .8); }
  }));
  const px = ox + E.pos.x * cs + cs / 2, py = oy + E.pos.y * cs + cs / 2;
  if (E.pulse > 0) { E.pulse -= .02; glowLine(AMB, 2); g.globalAlpha = E.pulse; g.beginPath(); g.arc(px, py, (1 - E.pulse) * cs * (3 + S.eff.sens), 0, TAU); g.stroke(); g.globalAlpha = 1; }
  glowLine(AMB, 2); g.fillStyle = E.stalled ? AMB_D : AMB; g.fillRect(px - cs * .25, py - cs * .25, cs * .5, cs * .5);
  if ((t * 3 | 0) % 2) { g.strokeRect(px - cs * .38, py - cs * .38, cs * .76, cs * .76); }
  txt(E.M.title, 12 * DPR, H - 10 * DPR, AMB, 17, "left");
}
function drawShipCut(t) {
  // Hull: a long ship, nose to the right, three decks of three bays
  const L = W * .07, R = W * .86, Tp = H * .16, B = H * .9, cw = (R - L) / 3, ch = (B - Tp) / 3;
  glowLine("rgba(109,255,138,.55)", 1.6);
  g.beginPath(); g.moveTo(L - 14 * DPR, Tp - 10 * DPR); g.lineTo(R + 10 * DPR, Tp - 10 * DPR); g.lineTo(W - 10 * DPR, (Tp + B) / 2); g.lineTo(R + 10 * DPR, B + 10 * DPR); g.lineTo(L - 14 * DPR, B + 10 * DPR); g.closePath(); g.stroke();
  // engine exhaust at the stern
  for (let i = 0; i < 3; i++) { const y = Tp + ch * (i + .5), f = 8 + Math.sin(t * 20 + i) * 3 + S.eff.eng * 3; glowLine(AMB, 1.5); g.beginPath(); g.moveTo(L - 14 * DPR, y - 6 * DPR); g.lineTo(L - (14 + f) * DPR, y); g.lineTo(L - 14 * DPR, y + 6 * DPR); g.stroke(); }
  CELL = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = (i / 3) | 0, x = L + col * cw, y = Tp + row * ch; CELL.push([x, y, cw, ch]);
    const room = S.layout[i], R2 = room && D.ROOMS[room], inc = S.incidents[i];
    const on = !room ? false : R2.sys ? S.eff[R2.sys] > 0 : S.scram <= 0;
    g.shadowBlur = 0; g.fillStyle = on ? "rgba(109,255,138,.07)" : "rgba(0,0,0,.25)"; g.fillRect(x + 3 * DPR, y + 3 * DPR, cw - 6 * DPR, ch - 6 * DPR);
    glowLine(S.sel === i ? GRN : room ? "rgba(109,255,138,.6)" : GRN_D, S.sel === i ? 2.4 : 1.2);
    if (!room) g.setLineDash([4 * DPR, 5 * DPR]);
    g.strokeRect(x + 3 * DPR, y + 3 * DPR, cw - 6 * DPR, ch - 6 * DPR); g.setLineDash([]);
    // deck floor
    glowLine("rgba(109,255,138,.35)", 1); g.beginPath(); g.moveTo(x + 3 * DPR, y + ch - 7 * DPR); g.lineTo(x + cw - 3 * DPR, y + ch - 7 * DPR); g.stroke();
    if (col === 1 && row < 2) { glowLine("rgba(109,255,138,.25)", 1); for (let k = 0; k < 6; k++) { const ly = y + ch - 7 * DPR + k * ch / 6; g.beginPath(); g.moveTo(x + cw / 2 - 6 * DPR, ly); g.lineTo(x + cw / 2 + 6 * DPR, ly); g.stroke(); } }
    if (!room) { txt("+ EMPTY", x + cw / 2, y + ch / 2, GRN_D, 17); continue; }
    roomIcon(room, x + cw / 2, y + ch * .42, Math.min(cw, ch) * .22, t, on);
    g.font = `${15 * DPR}px VT323, monospace`; txt(g.measureText(R2.name).width > cw - 10 * DPR ? R2.short : R2.name, x + cw / 2, y + 18 * DPR, on ? GRN : GRN_D, 15);
    if (R2.sys) { const p = S.eff[R2.sys]; for (let k = 0; k < 4; k++) { g.shadowBlur = 0; g.fillStyle = k < p ? GRN : "rgba(109,255,138,.12)"; g.fillRect(x + cw - 14 * DPR, y + ch - 14 * DPR - k * 7 * DPR, 6 * DPR, 5 * DPR); } }
    if (inc) {
      if (inc.type === "fire") for (let k = 0; k < 14; k++) { const fx = x + 10 * DPR + ((k * 37 + t * 60) % (cw - 20 * DPR)), fh = (10 + Math.sin(t * 13 + k) * 7) * DPR; g.fillStyle = k % 3 ? RED : AMB; g.shadowColor = RED; g.shadowBlur = 10 * DPR; g.fillRect(fx, y + ch - 8 * DPR - fh, 3 * DPR, fh); }
      else { glowLine("#9fd8ff", 1.5); for (let k = 0; k < 5; k++) { const a = t * 3 + k * 1.3, rr = ((t * 40 + k * 17) % 30) * DPR; g.beginPath(); g.moveTo(x + cw / 2, y + ch / 2); g.lineTo(x + cw / 2 + Math.cos(a) * rr, y + ch / 2 + Math.sin(a) * rr); g.stroke(); } }
      if ((t * 3 | 0) % 2) { glowLine(RED, 2.5); g.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
      txt(D.INCIDENTS[inc.type].name, x + cw / 2, y + ch - 14 * DPR, RED, 17);
    }
  }
  // crew: little amber people with name tags
  S.crew.forEach(c => {
    if (!c.placed) return;
    const bob = c.moving ? Math.abs(Math.sin(t * 12)) * 2 * DPR : 0, x = c.x, y = c.y - bob;
    g.shadowColor = AMB; g.shadowBlur = 6 * DPR; g.fillStyle = c.hurt ? RED : AMB;
    g.fillRect(x - 2.5 * DPR, y - 17 * DPR, 5 * DPR, 5 * DPR);      // head
    g.fillRect(x - 3.5 * DPR, y - 11 * DPR, 7 * DPR, 8 * DPR);      // body
    const leg = c.moving ? Math.sin(t * 14) * 2 * DPR : 0;
    g.fillRect(x - 3 * DPR + leg, y - 3 * DPR, 2 * DPR, 4 * DPR); g.fillRect(x + 1 * DPR - leg, y - 3 * DPR, 2 * DPR, 4 * DPR);
    txt(c.tag, x, y - 21 * DPR, c.task ? GRN : AMB, 13);
  });
  sparks.forEach(p => { p.x += p.vx * DPR / 60; p.y += p.vy * DPR / 60; p.vy += 4; p.life -= 1 / 60; g.fillStyle = p.col; g.fillRect(p.x, p.y, 2 * DPR, 2 * DPR); }); sparks = sparks.filter(p => p.life > 0);
  txt(`TAP A BAY · CREW ${S.crew.filter(c => !c.task).length}/4 FREE · O₂ ${Math.round(S.o2)}`, 12 * DPR, H - 6 * DPR, GRN, 15, "left");
}
function roomIcon(room, x, y, s, t, on) {
  glowLine(on ? GRN : GRN_D, 1.6); g.beginPath();
  if (room === "reactor") { const p = 1 + (on ? Math.sin(t * 4) * .12 : 0); g.arc(x, y, s * .6 * p, 0, TAU); g.moveTo(x + s, y); g.arc(x, y, s, 0, TAU); g.stroke(); return; }
  if (room === "engine") { g.moveTo(x - s, y - s * .6); g.lineTo(x + s * .4, y - s * .6); g.lineTo(x + s, y); g.lineTo(x + s * .4, y + s * .6); g.lineTo(x - s, y + s * .6); g.closePath(); g.stroke(); return; }
  if (room === "life") { g.moveTo(x - s * .7, y); g.lineTo(x + s * .7, y); g.moveTo(x, y - s * .7); g.lineTo(x, y + s * .7); g.stroke(); g.beginPath(); g.arc(x, y, s, 0, TAU); g.stroke(); return; }
  if (room === "bridge") { g.rect(x - s, y - s * .5, s * 2, s); g.moveTo(x - s * .6, y - s * .1); g.lineTo(x + s * .6, y - s * .1); g.stroke(); return; }
  if (room === "sensor") { const a = on ? t * 2 : 0; g.arc(x, y + s * .4, s, Math.PI * 1.1, Math.PI * 1.9); g.moveTo(x, y + s * .4); g.lineTo(x + Math.cos(a) * s, y + s * .4 - Math.abs(Math.sin(a)) * s); g.stroke(); return; }
  if (room === "drone") { g.rect(x - s * .5, y - s * .5, s, s); g.moveTo(x - s, y - s); g.lineTo(x - s * .5, y - s * .5); g.moveTo(x + s, y - s); g.lineTo(x + s * .5, y - s * .5); g.moveTo(x - s, y + s); g.lineTo(x - s * .5, y + s * .5); g.moveTo(x + s, y + s); g.lineTo(x + s * .5, y + s * .5); g.stroke(); return; }
  if (room === "shield") { for (let k = 1; k <= 3; k++) { g.moveTo(x + s * k / 3, y); g.arc(x, y, s * k / 3, 0, TAU); } g.stroke(); return; }
  if (room === "weapon") { g.moveTo(x - s, y + s * .3); g.lineTo(x + s, y + s * .3); g.moveTo(x - s * .4, y + s * .3); g.lineTo(x - s * .4, y - s * .4); g.lineTo(x + s * .9, y - s * .4); g.stroke(); return; }
  if (room === "battery") { g.rect(x - s * .8, y - s * .5, s * 1.6, s); g.moveTo(x + s * .8, y - s * .2); g.lineTo(x + s, y - s * .2); g.lineTo(x + s, y + s * .2); g.lineTo(x + s * .8, y + s * .2); g.stroke(); return; }
  if (room === "coolant") { for (let k = -1; k <= 1; k++) { g.moveTo(x - s, y + k * s * .5); for (let j = 0; j <= 8; j++) g.lineTo(x - s + j * s / 4, y + k * s * .5 + Math.sin(j + t * 3) * s * .12); } g.stroke(); return; }
  if (room === "cargo") { g.rect(x - s, y - s * .6, s * .9, s * 1.2); g.rect(x + s * .1, y - s * .2, s * .9, s * .8); g.stroke(); return; }
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
     build: () => f("square", 300, 600, .25, .08), demolish: () => f("sawtooth", 400, 80, .35, .1),
     vent: () => f("sawtooth", 900, 60, .9, .18), print: () => f("square", 2400 + Math.random() * 600, 0, .04, .03), degauss: () => { o.type = "sine"; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(30, t + .9); env(.35, 1); } }[k] || (() => {}))();
}

/* ── Tape deck ── */
let tapePlay = null;
function addTape(id) { if (S.tapes.includes(id)) return; S.tapes.push(id); S.tapeI = S.tapes.length - 1; log(`TAPE LOADED: ${D.TAPES[id].label}. PRESS PLAY.`, "grn"); sfx("clunk"); document.querySelector(".deck").classList.add("new"); }
function playTape() {
  if (S.tapeI < 0) { log("TAPE DECK EMPTY. FIND CASSETTES IN WRECKS."); sfx("err"); return; }
  const T0 = D.TAPES[S.tapes[S.tapeI]]; tapePlay = { lines: T0.lines, i: 0, t: 0 }; sfx("clunk"); document.querySelector(".deck").classList.remove("new");
  sayLine();
}
function sayLine() { const P = tapePlay; if (!P) return; if (P.i >= P.lines.length) { stopTape(); log("END OF TAPE."); return; } log("TAPE: " + P.lines[P.i], "grn"); say(P.lines[P.i], true); P.i++; P.t = 0; }
function stopTape() { if (tapePlay) { tapePlay = null; try { speechSynthesis.cancel(); } catch (_) {} } }
function tapeTick(dt) { if (!tapePlay) return; tapePlay.t += dt; const speaking = voiceOn && window.speechSynthesis && speechSynthesis.speaking; if ((!speaking && tapePlay.t > 1.2) || tapePlay.t > 9) sayLine(); }
function tapeUI() {
  const lbl = S.tapeI >= 0 ? D.TAPES[S.tapes[S.tapeI]].label : "NO TAPE"; const el = $("#tapeLbl"); if (el.textContent !== lbl) el.textContent = lbl;
  $("#tapeCount").textContent = String(S.tapes.length).padStart(1, "0") + "/" + Object.keys(D.TAPES).length;
  document.querySelector(".deck").classList.toggle("playing", !!tapePlay);
}
$("#tPlay").addEventListener("click", playTape);
$("#tStop").addEventListener("click", () => { stopTape(); sfx("clunk"); });
$("#tNext").addEventListener("click", () => { if (!S.tapes.length) return; stopTape(); S.tapeI = (S.tapeI + 1) % S.tapes.length; sfx("clunk"); });

/* ── The ship's voice (speech synthesis), MOTHER-style ── */
let voiceOn = true, lastSay = 0;
function say(text, force) {
  if (!voiceOn || !window.speechSynthesis) return;
  const now = performance.now(); if (!force && (now - lastSay < 2500 || speechSynthesis.speaking)) return; lastSay = now;
  try {
    const u = new SpeechSynthesisUtterance(text.toLowerCase().replace(/o₂/g, "oxygen").replace(/[·'"]/g, " "));
    const vs = speechSynthesis.getVoices(); const v = vs.find(v => /en[-_](GB|US)/i.test(v.lang) && /female|samantha|zira|serena|karen|moira|google uk english female/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang));
    if (v) u.voice = v; u.pitch = .55; u.rate = .88; u.volume = .9;
    if (force) speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (_) {}
}
$("#voice").addEventListener("click", e => { voiceOn = !voiceOn; e.currentTarget.classList.toggle("on", voiceOn); e.currentTarget.setAttribute("aria-pressed", String(voiceOn)); sfx("clunk"); if (!voiceOn) try { speechSynthesis.cancel(); } catch (_) {} else say("voice online", true); });
$("#degauss").addEventListener("click", () => { const c = $("#crt"); c.classList.remove("degauss"); void c.offsetWidth; c.classList.add("degauss"); sfx("degauss"); });

/* ── Boot ── */
let booted = false;
newGame(); renderFaders(); setMode("nav"); ui();
const bootLines = ["HALCYON TRANSIT AUTHORITY", "MERIDIAN SHIP CONTROL · FIRMWARE 2.1", "MEMORY CHECK .......... 640K OK", "REACTOR INTERLOCK ..... OK", "DRONE BAY ............. NOT INSTALLED", "WEAPON BAY ............ NOT INSTALLED", "", "READY."];
(function type(i, j) { const el = $("#bootText"); if (i >= bootLines.length) return; el.textContent = bootLines.slice(0, i).join("\n") + (i ? "\n" : "") + bootLines[i].slice(0, j); setTimeout(() => j >= bootLines[i].length ? type(i + 1, 0) : type(i, j + 2), j >= bootLines[i].length ? 120 : 18); })(0, 0);
$("#powerOn").addEventListener("click", () => { $("#ovBoot").hidden = true; booted = true; startSound(); sfx("relay"); bootLog(); say("meridian ship control online. good morning, control.", true); const c = $("#crt"); c.classList.add("poweron"); });
cv.addEventListener("pointerdown", e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
  if (S.mode === "ship") { const i = roomAt(x, y); if (i >= 0) roomTapped(i); return; }
  if (S.mode !== "nav") return;
  let best = null, bd = 36 * DPR; SYS.bodies.forEach(b => { if (b.veil && !revealed(b)) return; if (b.type === "hostile" && S.done.has(b.id)) return; const [nx, ny] = toScr(bodyPos(b)), d = Math.hypot(nx - x, ny - y) - (b.size || 0) * navScale; if (d < bd) { bd = d; best = b; } });
  if (best) selectTarget(best.id);
});
addEventListener("keydown", e => {
  if (S.mode === "drone" && S.explore) { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key]; if (m && !(e.target instanceof SVGElement) && !e.target.closest?.(".track")) { e.preventDefault(); droneMove(...m); } }
  if (e.key === " " && S.mode === "radar") { e.preventDefault(); fire(); }
});
window.__sjProbe = () => ({ S, scr: id => toScr(bodyPos(id)).map(v => v / DPR) }); // read-only hook for automated playtests
requestAnimationFrame(loop);
})();
