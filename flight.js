/* StarJourney — FLIGHT (2D, top-down)
   Look down on the Meridian as she flies "up" the screen through painted space.
   You steer, boost, route power, patch the hull and pick your lanes. Survive five legs to Halcyon.
   Everything is drawn on a 2D canvas in code; content & tuning live in legs.js. */
(() => {
"use strict";
const L = window.LEGS, T = L.T;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── Canvas & world units ──
   The world is 360 units wide whatever the screen; k converts units → pixels. */
const canvas = $("#world"), g = canvas.getContext("2d");
let W = 0, H = 0, D = 1, k = 1, VW = 360, VH = 640, OX = 0;
function resize() {
  const r = canvas.getBoundingClientRect(); D = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(r.width * D), h = Math.round(r.height * D);
  if (w === W && h === H) return; W = canvas.width = w; H = canvas.height = h;
  k = Math.min(W / VW, H / 600); VH = H / k; OX = (W - VW * k) / 2; bgCache = null; // wide screens: a centred phone-shaped lane
}
const SHIP_Y = () => VH * .74;

/* ── Sprite factory: things are painted once, then stamped every frame ── */
function sprite(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
const glowCache = {};
function glow(col) { return glowCache[col] || (glowCache[col] = sprite(128, 128, (c, w) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(.25, hexA(col, .55)); gr.addColorStop(1, hexA(col, 0)); c.fillStyle = gr; c.fillRect(0, 0, w, w); })); }

function rockSprite(seed, ice) {
  const R = 64, S = R * 2 + 8;
  return sprite(S, S, c => {
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = 14, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = R * (.72 + rnd() * .28); pts.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r]); }
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    const base = ice ? ["#e8fbff", "#8cc9e0", "#2b5a70"] : ["#b99a7e", "#6b5444", "#231a14"];
    const gr = c.createRadialGradient(S * .36, S * .32, 4, S / 2, S / 2, R * 1.1); gr.addColorStop(0, base[0]); gr.addColorStop(.45, base[1]); gr.addColorStop(1, base[2]);
    c.fillStyle = gr; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 9; i++) { // craters
      const x = S / 2 + (rnd() - .5) * R * 1.3, y = S / 2 + (rnd() - .5) * R * 1.3, r = 4 + rnd() * 13;
      c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x, y, r, r * .8, 0, 0, TAU); c.fill();
      c.strokeStyle = ice ? "rgba(255,255,255,.35)" : "rgba(255,230,200,.18)"; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 1, y + 1, r, Math.PI * .9, Math.PI * 1.7); c.stroke();
    }
    const sh = c.createLinearGradient(0, 0, S, S); sh.addColorStop(.45, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.55)"); c.fillStyle = sh; c.fillRect(0, 0, S, S);
    c.restore();
    c.strokeStyle = ice ? "rgba(220,250,255,.5)" : "rgba(255,210,160,.25)"; c.lineWidth = 2; c.beginPath(); pts.slice(8, 14).forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
  });
}
const ROCKS = Array.from({ length: 8 }, (_, i) => rockSprite(1234 + i * 777, false));
const ICE = Array.from({ length: 5 }, (_, i) => rockSprite(99 + i * 313, true));

const PICK = {
  fuel: { col: "#5ee6e0", spr: sprite(48, 64, c => { const gr = c.createLinearGradient(8, 0, 40, 0); gr.addColorStop(0, "#1a6f6b"); gr.addColorStop(.5, "#9ffcf7"); gr.addColorStop(1, "#1a6f6b"); c.fillStyle = gr; c.beginPath(); c.roundRect(10, 8, 28, 48, 10); c.fill(); c.fillStyle = "#0b2f2e"; c.fillRect(10, 26, 28, 5); c.fillRect(18, 2, 12, 8); c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(15, 12, 4, 12); }) },
  o2: { col: "#bfe4ff", spr: sprite(56, 56, c => { const gr = c.createRadialGradient(20, 18, 2, 28, 28, 26); gr.addColorStop(0, "#fff"); gr.addColorStop(.6, "#cfe8ff"); gr.addColorStop(1, "#5b7f99"); c.fillStyle = gr; c.beginPath(); c.arc(28, 28, 24, 0, TAU); c.fill(); c.fillStyle = "#2a78c9"; c.fillRect(4, 24, 48, 8); c.fillStyle = "#fff"; c.font = "bold 11px sans-serif"; c.textAlign = "center"; c.fillText("O2", 28, 32); }) },
  parts: { col: "#ff7a2e", spr: sprite(52, 52, c => { c.fillStyle = "#8a3a0e"; c.fillRect(4, 4, 44, 44); c.fillStyle = "#ff8a3e"; c.fillRect(8, 8, 36, 36); c.strokeStyle = "#3a1504"; c.lineWidth = 4; c.beginPath(); c.moveTo(8, 8); c.lineTo(44, 44); c.moveTo(44, 8); c.lineTo(8, 44); c.stroke(); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(8, 8, 36, 5); }) },
};

const WRECK = sprite(320, 120, c => {
  c.translate(160, 60);
  const metal = (x, y, w, h, l) => { const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, l ? "#5a6270" : "#3a404a"); gr.addColorStop(1, "#15181d"); c.fillStyle = gr; c.fillRect(x, y, w, h); c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 1.5; c.strokeRect(x, y, w, h); };
  metal(-150, -8, 300, 16, true);
  [-120, -40, 30, 95].forEach((x, i) => metal(x, -22 - (i % 2) * 6, 34, 44 + (i % 2) * 12));
  c.strokeStyle = "#2a2f37"; c.lineWidth = 9; c.beginPath(); c.ellipse(-70, 0, 16, 52, 0, .6, TAU - 1.2); c.stroke();
  c.strokeStyle = "#4a515c"; c.lineWidth = 2; c.stroke();
  c.fillStyle = "#15181d"; c.beginPath(); c.moveTo(150, -8); c.lineTo(160, -24); c.lineTo(160, 24); c.lineTo(150, 8); c.fill();
  c.fillStyle = "rgba(255,190,120,.35)"; for (let i = 0; i < 9; i++) c.fillRect(-130 + i * 28, -3, 4, 3);
  c.strokeStyle = "rgba(0,0,0,.7)"; c.lineWidth = 3; c.beginPath(); c.moveTo(-10, -30); c.lineTo(4, -4); c.lineTo(-6, 20); c.stroke();
});

/* The Meridian, seen from above, nose up. */
const SHIP = sprite(96, 128, c => {
  c.translate(48, 64);
  const plate = (x, y, w, h, r = 3) => { const gr = c.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, "#2a313b"); gr.addColorStop(.5, "#9aa6b5"); gr.addColorStop(1, "#2a313b"); c.fillStyle = gr; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 1; c.stroke(); };
  // radiators
  c.fillStyle = "#1c2f3a"; c.strokeStyle = "#5ee6e0"; c.lineWidth = 1;
  [[-40, 10], [22, 10]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y - 4); c.lineTo(x + 18, y + 22); c.lineTo(x, y + 18); c.closePath(); c.fill(); c.globalAlpha = .5; c.stroke(); c.globalAlpha = 1; for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(x + 2, y + i * 4); c.lineTo(x + 16, y + i * 4 - 2); c.stroke(); } });
  plate(-6, -44, 12, 90);                           // spine
  plate(-10, 22, 20, 22, 4);                        // reactor
  c.fillStyle = "#12161c"; c.beginPath(); c.moveTo(-9, 44); c.lineTo(9, 44); c.lineTo(12, 54); c.lineTo(-12, 54); c.closePath(); c.fill(); // engine bell
  // habitat ring
  c.strokeStyle = "#cdd6e0"; c.lineWidth = 6; c.beginPath(); c.ellipse(0, -2, 34, 12, 0, 0, TAU); c.stroke();
  c.strokeStyle = "#39414c"; c.lineWidth = 2; c.stroke();
  c.fillStyle = "rgba(255,200,120,.9)"; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; c.fillRect(Math.cos(a) * 34 - 1, -2 + Math.sin(a) * 12 - 1, 2.5, 2.5); }
  plate(-18, -8, 8, 12); plate(10, -8, 8, 12);       // cargo pods
  // command module + nose
  plate(-9, -58, 18, 18, 5);
  c.fillStyle = "#cfd8e2"; c.beginPath(); c.moveTo(-7, -58); c.lineTo(0, -64); c.lineTo(7, -58); c.fill();
  c.fillStyle = "#5ee6e0"; c.globalAlpha = .9; c.beginPath(); c.roundRect(-5, -56, 10, 6, 2); c.fill(); c.globalAlpha = 1; // bridge windows
  c.fillStyle = "#ff7a2e"; c.fillRect(-1, -40, 2, 60);                                                                   // livery stripe
});

/* ── Background: painted nebula tile + parallax stars + passing planet ── */
let bgCache = null, bgY = 0;
function paintBackground(type) {
  const bw = Math.max(1, W), bh = Math.ceil(VH * k * 1.5);
  const [deep, mid, hi] = type.sky;
  bgCache = sprite(bw, bh, c => {
    c.fillStyle = deep; c.fillRect(0, 0, bw, bh);
    const blob = (x, y, r, col, a) => { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0)); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); };
    // blobs wrap vertically so the tile scrolls seamlessly
    for (let i = 0; i < 18; i++) { const x = rand(0, bw), y = rand(0, bh), r = rand(bw * .25, bw * .7), a = rand(.2, .45); [0, -bh, bh].forEach(o => blob(x, y + o, r, mid, a)); }
    for (let i = 0; i < 10; i++) { const x = rand(0, bw), y = rand(0, bh), r = rand(bw * .1, bw * .3), a = rand(.12, .3); [0, -bh, bh].forEach(o => blob(x, y + o, r, hi, a)); }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${rand(.2, .8)})`; const z = Math.random() < .05 ? 2 * D : D; c.fillRect(rand(0, bw), rand(0, bh), z, z); }
  });
}
const STARS = [0, 1, 2].map(l => Array.from({ length: [70, 40, 18][l] }, () => ({ x: rand(0, 360), y: rand(0, 1400), s: rand(.4, 1) })));
let planetSpr = null, planetY = 0;
function paintPlanet(p) {
  const R = 256;
  planetSpr = sprite(R * 2 + 120, R * 2 + 120, c => {
    const cx = R + 60, cy = R + 60;
    const gl = c.createRadialGradient(cx, cy, R * .9, cx, cy, R + 60); gl.addColorStop(0, hexA(p.color, .5)); gl.addColorStop(1, hexA(p.color, 0)); c.fillStyle = gl; c.fillRect(0, 0, cx * 2, cy * 2);
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    c.fillStyle = p.color; c.fillRect(0, 0, cx * 2, cy * 2);
    for (let i = 0; i < 34; i++) { c.globalAlpha = rand(.08, .35); c.fillStyle = Math.random() < .5 ? p.band : "#ffffff"; c.beginPath(); c.ellipse(cx, rand(cy - R, cy + R), R * 1.3, rand(3, 16), rand(-.08, .08), 0, TAU); c.fill(); }
    if (p.final) { c.globalAlpha = .85; c.fillStyle = "#2a6b8f"; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(rand(cx - R, cx + R), rand(cy - R, cy + R), rand(30, 90), rand(18, 50), rand(0, 3), 0, TAU); c.fill(); } c.fillStyle = "#f4fff8"; for (let i = 0; i < 24; i++) { c.globalAlpha = rand(.2, .55); c.beginPath(); c.ellipse(rand(cx - R, cx + R), rand(cy - R, cy + R), rand(20, 90), rand(3, 9), rand(-.3, .3), 0, TAU); c.fill(); } }
    c.globalAlpha = 1;
    const sh = c.createRadialGradient(cx - R * .45, cy - R * .5, R * .2, cx, cy, R * 1.05); sh.addColorStop(0, "rgba(255,255,255,.12)"); sh.addColorStop(.6, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.75)"); c.fillStyle = sh; c.fillRect(0, 0, cx * 2, cy * 2);
    c.restore();
  });
}

/* ── Game state ── */
let S = null, ents = [], parts = [], mode = "title", leg = null, legType = null, spawnCarry = 0;
const input = { x: 0, y: 0, boost: false, keys: {} };

function newGame() {
  S = { hull: L.START.hull, maxHull: L.START.hull, fuel: L.START.fuel, maxFuel: L.START.fuel, o2: L.START.o2, parts: L.START.parts,
        power: L.START.power, eng: 2, shd: 2, life: 2, o2Mult: 1, upgrades: {}, legIndex: 0, day: 0, time: 0,
        sx: 180, sy: 0, vx: 0, vy: 0, tilt: 0, shake: 0, shieldHit: 0, leak: false, hits: 0, picked: 0 };
  renderPower();
}
function setLook(type) {
  legType = type; paintBackground(type); bgY = 0;
  if (type.planet) { paintPlanet(type.planet); planetY = type.planet.final ? -VH * .3 : VH * .25; } else planetSpr = null;
}
function startLeg(typeId) {
  const type = L.TYPES[typeId]; setLook(type);
  leg = { id: typeId, dist: 0, len: T.legLength * (type.short || 1), acc: {}, t: 0, comms: type.comms.slice(), commsAt: [2.5, 26], flareT: type.flare ? 9 : Infinity, flare: 0, flareWarn: 0, leakRoll: false };
  ents = []; parts = []; spawnCarry = 0;
  S.sx = 180; S.sy = 0; S.vx = S.vy = 0;
  for (let y = -40; y < VH * .45; y += 12) spawnRow(y);
  $("#legName").textContent = type.name;
  mode = "fly"; showOverlay(null);
  say(...(leg.comms.shift() || []));
}

/* ── Spawning: densities come from legs.js ── */
function spawnRow(y) {
  const d = legType, every = { rocks: 32, fuel: 300, o2: 320, parts: 230, clouds: 380, wrecks: 820 };
  for (const kd in every) {
    const dens = d[kd] || 0; if (!dens) continue;
    leg.acc[kd] = (leg.acc[kd] || 0) + 8 * dens / every[kd];
    while (leg.acc[kd] >= 1) { leg.acc[kd]--; make(kd, y - rand(0, 20)); }
  }
}
const aimX = (near) => Math.random() < near && S ? clamp(S.sx + rand(-40, 40), 20, 340) : rand(10, 350);
function make(kind, y) {
  if (kind === "rocks") {
    const small = legType.small, big = !small && Math.random() < .09;
    const r = small ? rand(7, 13) : big ? rand(30, 44) : rand(11, 24);
    ents.push({ kind, x: aimX(.18), y, r, spr: (small || legType.rockColor ? ICE : ROCKS)[(Math.random() * (small ? 5 : 8)) | 0], rot: rand(0, TAU), spin: rand(-1, 1) * (small ? 2 : .7), vx: small ? rand(-40, 40) : rand(-8, 8), vy: small ? rand(20, 60) : rand(-6, 10), dmg: small ? 6 + r * .5 : 5 + r * .7 });
  } else if (kind in PICK) {
    ents.push({ kind, x: aimX(.5), y, r: 14, rot: 0, spin: 1.2, vx: 0, vy: 0, bob: rand(0, 6) });
  } else if (kind === "clouds") {
    ents.push({ kind, x: aimX(.4), y, r: rand(60, 110), vx: rand(-6, 6), vy: 0, phase: rand(0, 6) });
  } else if (kind === "wrecks") {
    const len = rand(150, 230);
    ents.push({ kind, x: aimX(.45), y, r: len / 2, len, rot: rand(-.6, .6), spin: rand(-.06, .06), vx: 0, vy: 0, dmg: 30 });
  }
}

/* ── Collisions & effects ── */
function burst(x, y, col, n, spd, life = .6, size = 2) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(.3, 1) * spd; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col, size }); } }
function hit(dmg, e) {
  const cut = T.shieldCut(S.shd), d = Math.round(dmg * cut);
  S.hull = Math.max(0, S.hull - d); S.hits++; S.shake = Math.min(14, 4 + d * .6); S.shieldHit = .5;
  burst(S.sx, SHIP_Y() + S.sy - 10, "#ffd28a", 18, 160, .5); burst(e.x, e.y, "#8a735e", 10, 90, .8, 3);
  flash("hit", Math.min(.7, .2 + d / 40)); sfx("thud"); buzz(40 + d * 3);
  if (S.hull < 30 && !S.warnHull) { S.warnHull = true; say("ada", "Hull's getting thin, Captain! Patch her or we're breathing vacuum."); }
}
function pickup(e) {
  S.picked++; sfx("chime"); burst(e.x, e.y, PICK[e.kind].col, 14, 110, .5);
  if (e.kind === "fuel") { S.fuel = Math.min(S.maxFuel, S.fuel + 16); toast("+16 FUEL", "c"); }
  if (e.kind === "o2") { S.o2 = Math.min(100, S.o2 + 18); toast("+18 O₂", "w"); }
  if (e.kind === "parts") { S.parts += 1; toast("+1 PART", "o"); }
}
function wreckHit(e, shipY) { // a wreck is long: test the ship against a few points along it
  for (let i = -2; i <= 2; i++) { const px = e.x + Math.cos(e.rot) * e.len * .2 * i, py = e.y + Math.sin(e.rot) * e.len * .2 * i; if (Math.hypot(px - S.sx, py - shipY) < 26) return true; }
  return false;
}

/* ── Main loop ── */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  resize();
  if (mode === "fly") update(dt); else cruise(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}
function speedNow() { if (!S || S.fuel <= 0) return 18; return T.speed[S.eng] * (input.boost ? T.boost : 1); }
const SCROLL = 3.2; // world units scrolled per metre flown
function cruise(dt) { // menus: keep space drifting past
  const v = 14 * SCROLL; bgY += v * dt * .15; planetY += v * dt * .05;
  ents.forEach(e => { e.y += v * dt; if (e.rot !== undefined) e.rot += (e.spin || 0) * dt; });
  ents = ents.filter(e => e.y < VH + 140);
  if (legType && leg) { spawnCarry += v * dt; while (spawnCarry >= 12) { spawnCarry -= 12; spawnRow(-60); } }
  stepParticles(dt);
}
function update(dt) {
  S.time += dt; leg.t += dt;
  // Steering
  const kx = (input.keys.ArrowLeft || input.keys.a ? -1 : 0) + (input.keys.ArrowRight || input.keys.d ? 1 : 0);
  const ky = (input.keys.ArrowUp || input.keys.w ? -1 : 0) + (input.keys.ArrowDown || input.keys.s ? 1 : 0);
  const ix = clamp(input.x + kx, -1, 1), iy = clamp(-input.y + ky, -1, 1);
  const agility = 200 + S.eng * 22;
  S.vx += (ix * agility - S.vx) * Math.min(1, dt * 6); S.vy += (iy * agility * .6 - S.vy) * Math.min(1, dt * 6);
  S.sx = clamp(S.sx + S.vx * dt, 22, 338); S.sy = clamp(S.sy + S.vy * dt, -VH * .25, VH * .12);
  S.tilt += (clamp(S.vx / 260, -1, 1) * .22 - S.tilt) * Math.min(1, dt * 8);
  const shipY = SHIP_Y() + S.sy;

  const boosting = input.boost && S.fuel > 0, v = speedNow();
  leg.dist += v * dt;
  const scroll = v * SCROLL * dt;
  bgY += scroll * .15; planetY += scroll * .05;

  // Resources
  S.fuel = Math.max(0, S.fuel - T.fuelUse(S.eng) * (boosting ? 3 : 1) * dt);
  S.o2 = Math.max(0, S.o2 - T.o2Use(S.life) * S.o2Mult * (S.leak ? 3 : 1) * dt);
  if (S.fuel <= 0 && !S.warnFuel) { S.warnFuel = true; say("sol", "Fuel tanks dry. We're coasting. Every second costs air now."); }
  if (S.o2 < 25 && !S.warnO2) { S.warnO2 = true; say("lin", "Oxygen's under a quarter. Route power to life support or find air!"); }
  if (!leg.leakRoll && leg.t > 18) { leg.leakRoll = true; if (Math.random() < .35) { S.leak = true; sfx("alarm"); buzz([60, 60, 60]); say("wrench", "Seal's blown in the aft bulkhead! We're venting air. Hit PATCH!"); } }
  if (leg.flareT !== Infinity) {
    leg.flareT -= dt;
    if (leg.flareT <= 4 && !leg.flareWarn) { leg.flareWarn = 1; sfx("alarm"); say("sol", "Flare incoming! Shields, Captain. Shields!"); }
    if (leg.flareT <= 0) {
      leg.flareT = rand(13, 17); leg.flareWarn = 0; leg.flare = 1.4; flash("flare", 1);
      const d = Math.round(26 * Math.max(0, 1 - .28 * S.shd)); if (d > 0) { S.hull = Math.max(0, S.hull - d); S.shake = 10; buzz(200); } S.shieldHit = .9;
      toast(d ? `FLARE −${d} HULL` : "FLARE ABSORBED", d ? "r" : "c");
    }
  }
  if (leg.flare > 0) leg.flare -= dt;
  if (leg.commsAt.length && leg.t > leg.commsAt[0]) { leg.commsAt.shift(); const c = leg.comms.shift(); if (c) say(...c); }

  // World
  spawnCarry += scroll; while (spawnCarry >= 8 * SCROLL) { spawnCarry -= 8 * SCROLL; spawnRow(-80); }
  let inCloud = false;
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];
    e.y += scroll + (e.vy || 0) * dt; e.x += (e.vx || 0) * dt; if (e.rot !== undefined) e.rot += (e.spin || 0) * dt;
    if (e.kind === "rocks" && (e.x < -60 || e.x > 420)) { ents.splice(i, 1); continue; }
    const dx = e.x - S.sx, dy = e.y - shipY;
    if (e.kind === "clouds") { if (Math.hypot(dx, dy) < e.r * .75) inCloud = true; }
    else if (!e.done) {
      const touching = e.kind === "wrecks" ? (Math.abs(dy) < e.r + 30 && wreckHit(e, shipY)) : Math.hypot(dx, dy) < e.r + 15;
      if (touching) { e.done = true; if (e.kind in PICK) { pickup(e); ents.splice(i, 1); continue; } hit(e.dmg, e); if (e.kind === "rocks") { burst(e.x, e.y, "#9a8470", 16, 120, .9, 3); ents.splice(i, 1); continue; } }
    }
    if (e.y > VH + 160) ents.splice(i, 1);
  }
  if (inCloud) { S.hull = Math.max(0, S.hull - 5 * T.shieldCut(S.shd) * dt); S.cloudT = (S.cloudT || 0) + dt; if (S.cloudT > .5) { S.cloudT = 0; S.shake = Math.max(S.shake, 3); sfx("crackle"); burst(S.sx + rand(-20, 20), shipY + rand(-20, 20), legType.cloudColor || "#b25cff", 4, 60, .4); } }
  $("#warnRad").hidden = !inCloud;

  // Engine exhaust & damage smoke
  const ex = S.sx - Math.sin(S.tilt) * 30, ey = shipY + 36;
  for (let i = 0; i < (boosting ? 5 : 2); i++) parts.push({ x: ex + rand(-3, 3), y: ey, vx: rand(-15, 15), vy: rand(120, 200) * (boosting ? 1.6 : 1), life: .35, max: .35, col: boosting ? "#bffffb" : "#5ee6e0", size: boosting ? 3 : 2.2 });
  if (S.hull / S.maxHull < .5 && Math.random() < .5) parts.push({ x: S.sx + rand(-14, 14), y: shipY + rand(-10, 20), vx: rand(-10, 10), vy: rand(60, 110), life: 1.1, max: 1.1, col: "#6d6f74", size: 5, smoke: true });
  if (S.leak && Math.random() < .6) parts.push({ x: S.sx + 12, y: shipY + 18, vx: rand(40, 90), vy: rand(20, 60), life: .8, max: .8, col: "#dff3ff", size: 2.5 });
  stepParticles(dt);
  S.shake = Math.max(0, S.shake - dt * 30); S.shieldHit = Math.max(0, S.shieldHit - dt);

  if (legType.planet && legType.planet.final) planetY = -VH * .3 + leg.dist / leg.len * VH * .5;
  hud(v, boosting);
  if (S.hull <= 0) return gameOver("hull");
  if (S.o2 <= 0) return gameOver("o2");
  if (leg.dist >= leg.len) return arrive();
}
function stepParticles(dt) { for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) parts.splice(i, 1); } if (parts.length > 500) parts.splice(0, parts.length - 500); }

/* ── Drawing ── */
function draw(t) {
  if (!W) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sh = reduce ? 0 : S ? S.shake : 0;
  g.translate(rand(-1, 1) * sh * D, rand(-1, 1) * sh * D);
  // Nebula tile (seamless vertical scroll)
  if (!bgCache && legType) paintBackground(legType);
  if (bgCache) { const bh = bgCache.height, off = ((bgY * k) % bh + bh) % bh; g.drawImage(bgCache, 0, off - bh); g.drawImage(bgCache, 0, off); }
  g.translate(OX, 0); g.scale(k, k);
  // Parallax stars
  STARS.forEach((layer, l) => { const sp = [.25, .5, .9][l]; g.fillStyle = l === 2 ? "#ffffff" : "rgba(220,230,255,.8)"; layer.forEach(s => { const y = ((s.y + bgY * sp * 4) % 1400 + 1400) % 1400 - 200; if (y > -10 && y < VH + 10) { const z = (l + 1) * .7 * s.s; g.globalAlpha = .4 + s.s * .6; g.fillRect(s.x, y, z, z * (mode === "fly" && input.boost ? 6 : 1)); } }); });
  g.globalAlpha = 1;
  // Planet sliding past below everything
  if (planetSpr) { const p = legType.planet, s = (p.final ? 1.1 : .9) * p.size; const w = 380 * s; g.drawImage(planetSpr, (p.final ? 180 : 250) - w / 2, planetY - w / 2, w, w); }
  // Clouds under objects
  g.globalCompositeOperation = "lighter";
  ents.forEach(e => { if (e.kind !== "clouds") return; const a = .35 + Math.sin(t * 2 + e.phase) * .08; g.globalAlpha = a; const s = e.r * 2.4; g.drawImage(glow(legType.cloudColor || "#b25cff"), e.x - s / 2, e.y - s / 2, s, s); });
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  // Wrecks, rocks, pickups
  ents.forEach(e => {
    if (e.kind === "wrecks") { g.save(); g.translate(e.x, e.y); g.rotate(e.rot); g.drawImage(WRECK, -e.len / 2, -e.len * .19, e.len, e.len * .375); if ((t % 1.6) < .2) { g.globalCompositeOperation = "lighter"; g.drawImage(glow("#ff3b3b"), e.len * .45 - 14, -14, 28, 28); } g.restore(); }
    else if (e.kind === "rocks") { g.save(); g.translate(e.x, e.y); g.rotate(e.rot); g.drawImage(e.spr, -e.r * 1.1, -e.r * 1.1, e.r * 2.2, e.r * 2.2); g.restore(); }
    else if (e.kind in PICK) {
      const P = PICK[e.kind], b = Math.sin(t * 3 + e.bob) * 2;
      g.globalCompositeOperation = "lighter"; g.globalAlpha = .7 + Math.sin(t * 5 + e.bob) * .2; g.drawImage(glow(P.col), e.x - 30, e.y - 30 + b, 60, 60); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      g.save(); g.translate(e.x, e.y + b); g.rotate(Math.sin(t + e.bob) * .3); const s = e.kind === "fuel" ? [18, 24] : [20, 20]; g.drawImage(P.spr, -s[0] / 2, -s[1] / 2, s[0], s[1]); g.restore();
    }
  });
  // Particles
  g.globalCompositeOperation = "lighter";
  parts.forEach(p => { const a = p.life / p.max; if (p.smoke) { g.globalCompositeOperation = "source-over"; g.globalAlpha = a * .35; } else { g.globalCompositeOperation = "lighter"; g.globalAlpha = a; } g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.size * (p.smoke ? 2 - a : a + .3), 0, TAU); g.fill(); });
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  // The Meridian
  if (S && (mode === "fly" || mode === "waypoint" || mode === "title")) drawShip(t);
  // Vignette (and on wide screens, soft edges to the flight lane)
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (OX > 4) { const e1 = g.createLinearGradient(OX - 40 * D, 0, OX + 20 * D, 0); e1.addColorStop(0, "rgba(0,0,0,.55)"); e1.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, OX - 40 * D, H); g.fillStyle = e1; g.fillRect(OX - 40 * D, 0, 60 * D, H); const e2 = g.createLinearGradient(W - OX - 20 * D, 0, W - OX + 40 * D, 0); e2.addColorStop(0, "rgba(0,0,0,0)"); e2.addColorStop(1, "rgba(0,0,0,.55)"); g.fillStyle = e2; g.fillRect(W - OX - 20 * D, 0, 60 * D, H); g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W - OX + 40 * D, 0, OX, H); }
  const vg = g.createRadialGradient(W / 2, H * .55, H * .3, W / 2, H * .55, H * .85); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
function drawShip(t) {
  const y = SHIP_Y() + (mode === "fly" ? S.sy : Math.sin(t) * 3), x = mode === "fly" ? S.sx : 180 + Math.sin(t * .7) * 6;
  const boosting = mode === "fly" && input.boost && S.fuel > 0;
  // engine glow
  g.globalCompositeOperation = "lighter";
  const fl = (boosting ? 1.6 : 1) * (1 + Math.sin(t * 40) * .08);
  g.drawImage(glow("#5ee6e0"), x - 18 * fl, y + 22, 36 * fl, 60 * fl);
  g.globalCompositeOperation = "source-over";
  g.save(); g.translate(x, y); g.rotate(mode === "fly" ? S.tilt : 0);
  g.scale(Math.cos(mode === "fly" ? S.tilt * 1.2 : 0), 1); // bank: the ship narrows as she rolls
  g.drawImage(SHIP, -24 * 1.35, -32 * 1.35, 48 * 1.35, 64 * 1.35);
  if ((t % 1.4) < .15) { g.globalCompositeOperation = "lighter"; g.drawImage(glow("#ff7a2e"), -6, -8, 12, 12); }
  g.restore();
  // shield bubble flashes when something hits it
  if (S.shieldHit > 0 && S.shd > 0) { g.globalAlpha = Math.min(1, S.shieldHit * 1.6) * (.25 + S.shd * .12); g.strokeStyle = "#5ee6e0"; g.lineWidth = 2 + S.shd; g.beginPath(); g.ellipse(x, y, 46, 54, 0, 0, TAU); g.stroke(); g.fillStyle = "rgba(94,230,224,.12)"; g.fill(); g.globalAlpha = 1; }
}

/* ── Arrival, waypoint, ending ── */
function arrive() {
  mode = "waypoint"; S.day += Math.round(12 + leg.len / 600); S.leak = false; input.boost = false; sfx("arrive");
  const legNo = S.legIndex; S.legIndex++;
  if (legType === L.TYPES.halcyon) return gameOver("arrived");
  const beat = L.WAYPOINT_BEATS[legNo] || [];
  const route = L.ROUTE[S.legIndex]; const opts = route.pick ? shuffle(route.options).slice(0, route.pick) : route.options;
  showOverlay("way", `<div class="kick">Waypoint ${S.legIndex} of ${L.ROUTE.length - 1} · Day ${S.day}</div>
    <h2>${esc(legType.name)} cleared</h2>
    <div class="beat">${beat.map(([w, t]) => `<p><b>${esc(WHO[w] || w)}</b> ${esc(t)}</p>`).join("")}</div>
    <h3>Workshop <span class="pc">${S.parts} part${S.parts === 1 ? "" : "s"}</span></h3>
    <div class="shop">${L.UPGRADES.map(u => `<button class="up" type="button" data-u="${u.id}"><b>${esc(u.name)}</b><span>${esc(u.desc)}</span><i></i></button>`).join("")}</div>
    <h3>Next lane</h3>
    <div class="lanes">${laneButtons(opts)}</div>`);
  document.querySelectorAll("[data-u]").forEach(b => b.addEventListener("click", () => { buy(b.dataset.u); shopRefresh(); }));
  document.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", () => startLeg(b.dataset.l)));
  shopRefresh();
}
const laneButtons = opts => opts.map(id => { const t = L.TYPES[id]; return `<button class="lane" type="button" data-l="${id}" style="--lc:${t.sky[2]}"><b>${esc(t.name)}</b><span>${esc(t.tag)}</span></button>`; }).join("");
function shopRefresh() {
  $(".pc").textContent = `${S.parts} part${S.parts === 1 ? "" : "s"}`;
  document.querySelectorAll("[data-u]").forEach(b => { const u = L.UPGRADES.find(x => x.id === b.dataset.u); const owned = S.upgrades[u.id] && !u.repeat; b.disabled = owned || S.parts < u.cost; b.querySelector("i").textContent = owned ? "Installed" : u.cost + " parts"; });
  hud(0, false);
}
function buy(id) {
  const u = L.UPGRADES.find(x => x.id === id); if (!u || S.parts < u.cost || (S.upgrades[id] && !u.repeat)) return;
  S.parts -= u.cost; S.upgrades[id] = true; sfx("chime");
  if (id === "plating") { S.maxHull += 25; S.hull = S.maxHull; }
  if (id === "tank") { S.maxFuel += 30; S.fuel = S.maxFuel; }
  if (id === "scrubber") S.o2Mult = .7;
  if (id === "capacitor") { S.power += 1; renderPower(); }
  if (id === "o2") S.o2 = 100;
}
function gameOver(why) {
  mode = "end"; input.boost = false; sfx(why === "arrived" ? "arrive" : "alarm");
  if (why !== "arrived") { burst(S.sx, SHIP_Y() + S.sy, "#ffb070", 60, 220, 1.2, 3); buzz(400); }
  const txt = { arrived: ["Touchdown on Halcyon", S.hull > 60 ? "The Meridian settles into Halcyon's green, loud, not-at-all-calm air. Scorched, dented, and whole. The crew walk out into the rain, laughing." : "The Meridian comes down hard, smoke trailing, hull groaning, but she comes down. Everyone walks off. Some of them limp."],
    hull: ["Hull breach", "The Meridian came apart somewhere out here. Her beacon is still blinking, for anyone who comes looking."],
    o2: ["The air ran out", "The engines were still running when the air ran out. Sol kept flying toward Halcyon anyway."] }[why];
  showOverlay("end", `<div class="kick">${why === "arrived" ? `Day ${S.day} · ${S.legIndex} legs flown` : `Lost on leg ${S.legIndex + 1} · ${esc(legType.name)}`}</div>
    <h2>${esc(txt[0])}</h2><p class="lede">${esc(txt[1])}</p>
    <div class="stats"><div><span>Hull</span><b>${Math.round(S.hull)}%</b></div><div><span>Hits taken</span><b>${S.hits}</b></div><div><span>Pickups</span><b>${S.picked}</b></div><div><span>Flight time</span><b>${Math.floor(S.time / 60)}:${String(Math.floor(S.time % 60)).padStart(2, "0")}</b></div></div>
    <button class="go" type="button" id="again">Fly again</button>`);
  $("#again").addEventListener("click", begin);
}
function begin() {
  newGame(); startSound();
  mode = "waypoint";
  showOverlay("way", `<div class="kick">Leaving Earth orbit · Leg 1 of ${L.ROUTE.length}</div><h2>Choose your first lane</h2>
    <div class="beat"><p><b>Ada</b> Board is green. Merry's yours, Captain. Where to?</p></div>
    <div class="lanes">${laneButtons(L.ROUTE[0].options)}</div>`);
  document.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", () => startLeg(b.dataset.l)));
}
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const WHO = { ada: "Ada", wrench: "Wrench", lin: "Lin", priya: "Priya", sol: "Sol", hale: "Control" };
function showOverlay(kind, html) {
  const ov = $("#ov");
  if (!kind) { ov.hidden = true; ov.innerHTML = ""; return; }
  ov.className = "ov " + kind; ov.innerHTML = `<div class="screen">${html}</div>`; ov.hidden = false;
}

/* ── HUD & dashboard ── */
const G = { hull: $("#gHull"), fuel: $("#gFuel"), o2: $("#gO2") };
function gauge(el, v, max, lowAt) { const f = clamp(v / max, 0, 1); el.style.setProperty("--f", f); el.querySelector("b").textContent = Math.round(v); el.classList.toggle("low", f < lowAt); el.classList.toggle("crit", f < lowAt / 2); }
function hud(v, boosting) {
  gauge(G.hull, S.hull, S.maxHull, .35); gauge(G.fuel, S.fuel, S.maxFuel, .25); gauge(G.o2, S.o2, 100, .3);
  $("#parts").textContent = S.parts;
  $("#patch").disabled = S.parts < 1 || (S.hull >= S.maxHull && !S.leak);
  if (leg) { const p = clamp(leg.dist / leg.len, 0, 1); $("#prog").style.width = p * 100 + "%"; $("#dist").textContent = ((leg.len - leg.dist) / 1000).toFixed(1) + " km"; }
  $("#spd").textContent = Math.round(v * 3.6);
  $("#warnFuel").hidden = S.fuel > 0; $("#warnLeak").hidden = !S.leak; $("#warnFlare").hidden = !(leg && leg.flareWarn);
  $("#warnFlare").textContent = leg && leg.flareWarn ? `FLARE IN ${Math.max(0, Math.ceil(leg.flareT))} · SHIELDS UP` : "";
  document.body.classList.toggle("alarm", S.hull / S.maxHull < .3 || S.o2 < 20 || S.leak);
  $("#o2haze").style.opacity = clamp((30 - S.o2) / 30, 0, .75);
}
function renderPower() {
  if (!S) return;
  const used = S.eng + S.shd + S.life;
  ["eng", "shd", "life"].forEach(key => {
    const row = document.querySelector(`.pw[data-k="${key}"]`);
    row.querySelector(".pips").innerHTML = Array.from({ length: 4 }, (_, i) => `<i class="${i < S[key] ? "on" : ""}"></i>`).join("");
    row.querySelector(".minus").disabled = S[key] <= 0; row.querySelector(".plus").disabled = S[key] >= 4 || used >= S.power;
  });
  $("#free").textContent = S.power - used;
}
document.querySelectorAll(".pw").forEach(row => {
  const key = row.dataset.k;
  row.querySelector(".minus").addEventListener("click", () => { if (S[key] > 0) { S[key]--; renderPower(); sfx("tick"); buzz(8); } });
  row.querySelector(".plus").addEventListener("click", () => { if (S[key] < 4 && S.eng + S.shd + S.life < S.power) { S[key]++; renderPower(); sfx("tick"); buzz(8); } });
});
$("#patch").addEventListener("click", () => {
  if (!S || S.parts < 1 || mode !== "fly") return;
  S.parts--; sfx("weld"); buzz(20); burst(S.sx, SHIP_Y() + S.sy, "#ffd28a", 12, 80, .5);
  if (S.leak) { S.leak = false; toast("LEAK SEALED", "c"); say("wrench", "Sealed! Nobody breathe on that bulkhead for a while."); }
  else { S.hull = Math.min(S.maxHull, S.hull + 14); toast("+14 HULL", "o"); }
});

/* Comms, toasts, flashes, haptics */
let commsTimer = 0;
function say(who, text) { if (!who) return; const el = $("#comms"); el.innerHTML = `<b>${esc(WHO[who] || who)}</b> ${esc(text)}`; el.classList.add("on"); sfx("blip"); clearTimeout(commsTimer); commsTimer = setTimeout(() => el.classList.remove("on"), 6500); }
function toast(text, cls) { const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = text; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 1400); }
function flash(kind, a) { const f = $("#flash"); f.style.transition = "none"; f.className = kind; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = kind === "flare" ? "opacity 1.4s" : "opacity .35s"; f.style.opacity = 0; }); }
function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} }

/* ── Input: drag anywhere in the view to steer; hold BOOST ── */
const pad = $("#window"), knob = $("#knob");
let drag = null;
pad.addEventListener("pointerdown", e => { if (mode !== "fly") return; const r = pad.getBoundingClientRect(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; pad.setPointerCapture(e.pointerId); knob.style.left = e.clientX - r.left + "px"; knob.style.top = e.clientY - r.top + "px"; knob.classList.add("on"); });
pad.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; const R = Math.min(60, pad.clientWidth * .15); input.x = clamp((e.clientX - drag.x) / R, -1, 1); input.y = clamp(-(e.clientY - drag.y) / R, -1, 1); knob.style.setProperty("--dx", input.x * 28 + "px"); knob.style.setProperty("--dy", -input.y * 28 + "px"); });
const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; input.x = input.y = 0; knob.classList.remove("on"); knob.style.setProperty("--dx", "0px"); knob.style.setProperty("--dy", "0px"); };
pad.addEventListener("pointerup", endDrag); pad.addEventListener("pointercancel", endDrag);
const boostBtn = $("#boost");
const setBoost = on => { input.boost = on && mode === "fly" && S && S.fuel > 0; boostBtn.classList.toggle("on", input.boost); };
boostBtn.addEventListener("pointerdown", e => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); setBoost(true); });
["pointerup", "pointercancel", "pointerleave"].forEach(ev => boostBtn.addEventListener(ev, () => setBoost(false)));
addEventListener("keydown", e => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; input.keys[key] = true;
  if (key === "Shift" || key === " ") { e.preventDefault(); setBoost(true); }
  if (key === "e" || key === "f") $("#patch").click();
  if (key.startsWith("Arrow")) e.preventDefault();
});
addEventListener("keyup", e => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; input.keys[key] = false; if (key === "Shift" || key === " ") setBoost(false); });
addEventListener("blur", () => { input.keys = {}; setBoost(false); });

/* ── Sound: engine rumble + effects, all synthesized ── */
let ac = null, master = null, drone = null, soundOn = true;
function startSound() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = soundOn ? .5 : 0; master.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
      const gn = ac.createGain(); gn.gain.value = .1; src.connect(lp).connect(gn).connect(master); src.start();
      drone = { lp, gn };
    }
    ac.resume && ac.resume();
  } catch (_) {}
}
function sfx(kind) {
  if (!ac || !soundOn) return;
  const t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain(); o.connect(gn).connect(master);
  const env = (a, d) => { gn.gain.setValueAtTime(a, t); gn.gain.exponentialRampToValueAtTime(.0001, t + d); o.start(t); o.stop(t + d + .02); };
  if (kind === "thud") { o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + .3); env(.5, .35); }
  else if (kind === "chime") { o.type = "triangle"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + .07); env(.12, .25); }
  else if (kind === "alarm") { o.type = "square"; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + .15); o.frequency.setValueAtTime(660, t + .3); env(.07, .45); }
  else if (kind === "blip") { o.type = "sine"; o.frequency.value = 1400; env(.04, .06); }
  else if (kind === "tick") { o.type = "square"; o.frequency.value = 2200; env(.03, .03); }
  else if (kind === "weld") { o.type = "sawtooth"; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(900, t + .4); env(.06, .45); }
  else if (kind === "crackle") { o.type = "sawtooth"; o.frequency.value = rand(80, 200); env(.05, .08); }
  else if (kind === "arrive") { o.type = "triangle"; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(659, t + .15); o.frequency.setValueAtTime(784, t + .3); env(.12, .6); }
}
setInterval(() => { if (!drone) return; const fly = mode === "fly"; drone.lp.frequency.setTargetAtTime(fly ? 180 + speedNow() * 5 : 160, ac.currentTime, .2); drone.gn.gain.setTargetAtTime(fly ? .08 + (input.boost ? .1 : 0) : .04, ac.currentTime, .3); }, 150);
$("#snd").addEventListener("click", e => { soundOn = !soundOn; e.currentTarget.setAttribute("aria-pressed", String(soundOn)); e.currentTarget.textContent = soundOn ? "Sound on" : "Sound off"; if (master) master.gain.value = soundOn ? .5 : 0; if (soundOn) startSound(); });

/* ── Boot: title screen over live, drifting space ── */
newGame(); resize(); setLook(L.TYPES.belt);
leg = { id: "belt", dist: 0, len: 1, acc: {}, t: 0, comms: [], commsAt: [], flareT: Infinity };
for (let y = -40; y < VH; y += 12) spawnRow(y);
hud(0, false);
$("#launch").addEventListener("click", begin);
window.__sjProbe = () => ({ S, ents, shipY: SHIP_Y() + (S ? S.sy : 0), mode }); // read-only hook for automated playtests
requestAnimationFrame(loop);
})();
