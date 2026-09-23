/* StarJourney — FLIGHT
   You are in the Meridian's cockpit. The ship flies forward; you steer, boost, route power,
   patch the hull and pick your lanes. Survive five legs to reach Halcyon.
   Rendering: three.js (vendor/three.min.js). Content & tuning: legs.js. */
(() => {
"use strict";
const L = window.LEGS, T = L.T;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── Renderer & scene ───────────────────────── */
const canvas = $("#world");
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
catch (e) { $("#nogl").hidden = false; return; }
renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, .1, 3000);
scene.fog = new THREE.Fog(0x000000, 120, 620);
const hemi = new THREE.HemisphereLight(0x8899bb, 0x0a0a10, .55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-1, .7, .5); scene.add(sun);
const headlight = new THREE.PointLight(0xfff2dd, .9, 90, 2); scene.add(headlight);
scene.add(new THREE.AmbientLight(0x222230, .5));

/* ── Procedural textures (drawn once, in code) ── */
function tex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t; }
const glowCache = {};
function glowTex(col) {
  return glowCache[col] || (glowCache[col] = tex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, "#fff"); gr.addColorStop(.18, col); gr.addColorStop(.5, col + "55"); gr.addColorStop(1, col + "00"); g.fillStyle = gr; g.fillRect(0, 0, w, w); }));
}
function skyTex(cols) {
  return tex(2048, 1024, (g, w, h) => {
    const [deep, mid, hi] = cols;
    g.fillStyle = deep; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, c, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (let i = 0; i < 26; i++) blob(rand(0, w), rand(h * .15, h * .85), rand(120, 420), mid, rand(.25, .6));
    for (let i = 0; i < 14; i++) blob(rand(0, w), rand(h * .25, h * .75), rand(60, 220), hi, rand(.15, .4));
    g.globalAlpha = 1;
    for (let i = 0; i < 2600; i++) { const s = Math.random(); g.fillStyle = `rgba(255,255,255,${.3 + s * .7})`; const z = s > .985 ? 2.2 : s > .9 ? 1.4 : .9; g.fillRect(rand(0, w), rand(0, h), z, z); }
  });
}
function planetTex(p) {
  return tex(1024, 512, (g, w, h) => {
    g.fillStyle = p.color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.globalAlpha = rand(.08, .35); g.fillStyle = Math.random() < .5 ? p.band : "#ffffff"; const y = rand(0, h), t = rand(4, 38); g.fillRect(0, y, w, t); }
    if (p.final) { g.globalAlpha = .9; for (let i = 0; i < 18; i++) { g.fillStyle = "#2a6b8f"; g.beginPath(); g.ellipse(rand(0, w), rand(h * .2, h * .8), rand(40, 160), rand(20, 70), rand(0, 3), 0, 7); g.fill(); } g.fillStyle = "#f4fff8"; for (let i = 0; i < 40; i++) { g.globalAlpha = rand(.2, .6); g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(30, 140), rand(4, 14), 0, 0, 7); g.fill(); } }
    g.globalAlpha = 1;
  });
}

/* ── The far backdrop: sky sphere, sun, planet (they ride along with the camera) ── */
const far = new THREE.Group(); scene.add(far);
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMat); far.add(sky);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("#ffffff"), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
sunSprite.position.set(-900, 520, -1300); sunSprite.scale.set(520, 520, 1); far.add(sunSprite);
const planetMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, fog: false });
const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat); far.add(planet); planet.visible = false;
const planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: .45 })); far.add(planetGlow); planetGlow.visible = false;

/* ── Starfield streaks: show speed ── */
const STREAKS = 220;
const streakGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(STREAKS * 6); streakGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: .55, fog: false }));
scene.add(streaks);
const sData = Array.from({ length: STREAKS }, () => ({ x: rand(-70, 70), y: rand(-45, 45), z: rand(-500, 0) }));

/* ── Shared shapes ── */
function rockGeo(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position, key = {};
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    const f = key[k] || (key[k] = .72 + Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453 % 1) * .5);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .85, p.getZ(i) * f);
  }
  geo.computeVertexNormals(); return geo;
}
const ROCK_GEOS = Array.from({ length: 7 }, (_, i) => rockGeo(i + 1));
const PICK = {
  fuel:  { geo: new THREE.OctahedronGeometry(1.1), mat: new THREE.MeshBasicMaterial({ color: 0x5ee6e0 }), glow: "#5ee6e0", label: "FUEL" },
  o2:    { geo: new THREE.SphereGeometry(.9, 16, 12), mat: new THREE.MeshBasicMaterial({ color: 0xe8f6ff }), glow: "#9fd8ff", label: "O₂" },
  parts: { geo: new THREE.BoxGeometry(1.5, 1.5, 1.5), mat: new THREE.MeshStandardMaterial({ color: 0xff7a2e, emissive: 0x9a3a0a, roughness: .5, metalness: .4 }), glow: "#ff7a2e", label: "PARTS" },
};
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: .7, metalness: .6 });
const wreckDark = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: .9, metalness: .3 });

/* ── Game state ── */
let S = null, ents = [], mode = "title", leg = null, legType = null;
const input = { x: 0, y: 0, boost: false, keys: {} };

function newGame() {
  S = { hull: L.START.hull, maxHull: L.START.hull, fuel: L.START.fuel, maxFuel: L.START.fuel, o2: L.START.o2, parts: L.START.parts,
        power: L.START.power, eng: 2, shd: 2, life: 2, o2Mult: 1, upgrades: {}, legIndex: 0, day: 0, cracks: [], time: 0,
        sx: 0, sy: 0, vx: 0, vy: 0, shake: 0, leak: false, hits: 0, picked: 0 };
  renderPower(); cracksDraw();
}

/* ── Legs ── */
function startLeg(typeId) {
  legType = L.TYPES[typeId];
  leg = { id: typeId, dist: 0, len: T.legLength * (legType.short || 1), acc: {}, t: 0, comms: legType.comms.slice(), commsAt: [2.5, 26], flareT: legType.flare ? 9 : Infinity, flare: 0, flareWarn: 0, leakRoll: false };
  ents.forEach(e => scene.remove(e.obj)); ents = [];
  // Look
  skyMat.map && skyMat.map.dispose(); skyMat.map = skyTex(legType.sky); skyMat.needsUpdate = true;
  scene.fog.color.set(legType.fog); scene.fog.near = legType.fogNear || 140; scene.fog.far = legType.fogFar || 640;
  renderer.setClearColor(legType.fog);
  sun.color.set(legType.sun); sunSprite.material.color.set(legType.sun); sunSprite.scale.setScalar(legType.star ? 1100 : 520);
  hemi.color.set(legType.sky[2]); hemi.intensity = .45;
  if (legType.planet) {
    planet.visible = planetGlow.visible = true; planetMat.map && planetMat.map.dispose(); planetMat.map = planetTex(legType.planet); planetMat.needsUpdate = true;
    planetGlow.material.map = glowTex(legType.planet.color); planetGlow.material.needsUpdate = true;
  } else { planet.visible = planetGlow.visible = false; }
  placePlanet(0);
  // Seed the space ahead so it isn't empty on arrival
  for (let z = -60; z > -700; z -= 8) spawnAt(z);
  $("#legName").textContent = legType.name;
  mode = "fly"; showOverlay(null);
  say(...(leg.comms.shift() || []));
}
function placePlanet(prog) {
  if (!legType || !legType.planet) return;
  const p = legType.planet, s = p.final ? 260 + prog * 900 : 420 * p.size;
  planet.scale.setScalar(s);
  planet.position.set(p.final ? 120 - prog * 80 : 520, p.final ? -120 + prog * 40 : -260, p.final ? -1500 + prog * 300 : -1450);
  planetGlow.position.copy(planet.position); planetGlow.scale.setScalar(s * 2.7);
}

/* ── Spawning ── */
function glowSprite(col, size, op = .9) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); s.scale.set(size, size, 1); return s; }
function spawnAt(z) {
  const d = legType, every = { rocks: 26, fuel: 300, o2: 320, parts: 230, clouds: 380, wrecks: 820 };
  for (const k in every) {
    const dens = d[k] || 0; if (!dens) continue;
    leg.acc[k] = (leg.acc[k] || 0) + 8 * dens / every[k];
    while (leg.acc[k] >= 1) { leg.acc[k]--; make(k, z - rand(0, 8)); }
  }
}
function aimXY(spread, near) { // some things spawn in your path so you have to steer
  if (S && Math.random() < near) return [clamp(S.sx + rand(-5, 5), -T.bounds.x, T.bounds.x), clamp(S.sy + rand(-4, 4), -T.bounds.y, T.bounds.y)];
  return [rand(-spread, spread), rand(-spread * .6, spread * .6)];
}
function make(kind, z) {
  let obj, r, e;
  if (kind === "rocks") {
    const small = legType.small, s = small ? rand(.7, 1.8) : Math.random() < .12 ? rand(4, 7) : rand(1.2, 3.4);
    const mat = new THREE.MeshStandardMaterial({ color: legType.rockColor || new THREE.Color().setHSL(rand(.05, .1), rand(.1, .25), rand(.22, .38)), roughness: .95, metalness: .05, flatShading: true });
    obj = new THREE.Mesh(ROCK_GEOS[(Math.random() * ROCK_GEOS.length) | 0], mat); obj.scale.setScalar(s); r = s * .9;
    const [x, y] = aimXY(34, .26); obj.position.set(x, y, z);
    e = { kind, obj, r, spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(small ? 1.6 : .6), drift: small ? rand(8, 20) : 0, dmg: small ? 8 + s * 4 : 7 + s * 6 };
  } else if (kind in PICK) {
    const P = PICK[kind]; obj = new THREE.Group();
    const core = new THREE.Mesh(P.geo, P.mat); obj.add(core); obj.add(glowSprite(P.glow, 7, .8));
    const [x, y] = aimXY(20, .5); obj.position.set(x, y, z); r = 2.6;
    e = { kind, obj, r, core, spin: new THREE.Vector3(.8, 1.3, 0) };
  } else if (kind === "clouds") {
    const size = rand(38, 70); obj = glowSprite(legType.cloudColor || "#b25cff", size, .5);
    const [x, y] = aimXY(30, .4); obj.position.set(x, y, z); r = size * .32;
    e = { kind, obj, r, base: .5, phase: rand(0, 6) };
  } else if (kind === "wrecks") {
    obj = new THREE.Group(); const len = rand(26, 44);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 3), wreckMat); obj.add(spine);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rand(3, 6), rand(5, 9), rand(3, 6)), i % 2 ? wreckMat : wreckDark); m.position.set(rand(-len / 2, len / 2), rand(-2, 2), 0); obj.add(m); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, .9, 6, 18, 4.2), wreckDark); ring.rotation.y = Math.PI / 2; ring.position.x = -len * .2; obj.add(ring);
    const light = glowSprite("#ff3b3b", 5, 1); light.position.set(len / 2, 2, 0); obj.add(light);
    obj.rotation.set(rand(-.3, .3), rand(-.6, .6), rand(-.5, .5));
    const [x, y] = aimXY(26, .45); obj.position.set(x, y, z); r = 6;
    e = { kind, obj, r, len, light, spin: new THREE.Vector3(0, 0, rand(-.08, .08)), dmg: 32 };
  }
  scene.add(obj); ents.push(e);
}

/* ── Collisions ── */
function wreckHit(e, dx, dy) { // a wreck is long: treat it as a line along its rotated axis
  const ax = Math.cos(e.obj.rotation.z) * Math.cos(e.obj.rotation.y), ay = Math.sin(e.obj.rotation.z);
  const t = clamp(dx * ax + dy * ay, -e.len / 2, e.len / 2);
  return Math.hypot(dx - ax * t, dy - ay * t) < 5.2;
}
function hit(dmg, e) {
  const cut = T.shieldCut(S.shd), d = Math.round(dmg * cut);
  S.hull = Math.max(0, S.hull - d); S.hits++; S.shake = Math.min(1.6, .5 + d / 20);
  flash("hit", Math.min(.8, .25 + d / 40)); sfx("thud");
  if (d >= 6) addCrack(e);
  if (S.hull < 30 && !S.warnHull) { S.warnHull = true; say("ada", "Hull's getting thin, Captain! Patch her or we're breathing vacuum."); }
}
function pickup(e) {
  S.picked++; sfx("chime");
  if (e.kind === "fuel") { S.fuel = Math.min(S.maxFuel, S.fuel + 16); toast("+16 FUEL", "c"); }
  if (e.kind === "o2") { S.o2 = Math.min(100, S.o2 + 18); toast("+18 O₂", "w"); }
  if (e.kind === "parts") { S.parts += 1; toast("+1 PART", "o"); }
}

/* ── Update loop ── */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  resize();
  if (mode === "fly") update(dt); else idle(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
function idle(dt) { // title & waypoint: slow cruise so the window stays alive
  far.position.set(camera.position.x, camera.position.y, 0);
  moveStreaks(dt, 14);
  for (let i = ents.length - 1; i >= 0; i--) { const e = ents[i]; e.obj.position.z += 10 * dt; if (e.spin) { e.obj.rotation.x += e.spin.x * dt; e.obj.rotation.y += e.spin.y * dt; } if (e.obj.position.z > 30) { scene.remove(e.obj); ents.splice(i, 1); } }
  if (legType) spawnTick(10 * dt);
  camera.rotation.z *= .95;
}
function speedNow() {
  if (S.fuel <= 0) return 18;
  return T.speed[S.eng] * (input.boost ? T.boost : 1);
}
function update(dt) {
  S.time += dt; leg.t += dt;
  // Steering: input → velocity → position, with a little inertia
  const kx = (input.keys.ArrowLeft || input.keys.a ? -1 : 0) + (input.keys.ArrowRight || input.keys.d ? 1 : 0);
  const ky = (input.keys.ArrowUp || input.keys.w ? 1 : 0) + (input.keys.ArrowDown || input.keys.s ? -1 : 0);
  const ix = clamp(input.x + kx, -1, 1), iy = clamp(input.y + ky, -1, 1);
  const agility = 26 + S.eng * 3;
  S.vx += (ix * agility - S.vx) * Math.min(1, dt * 4); S.vy += (iy * agility * .8 - S.vy) * Math.min(1, dt * 4);
  S.sx = clamp(S.sx + S.vx * dt, -T.bounds.x, T.bounds.x); S.sy = clamp(S.sy + S.vy * dt, -T.bounds.y, T.bounds.y);
  if (Math.abs(S.sx) >= T.bounds.x) S.vx *= .5; if (Math.abs(S.sy) >= T.bounds.y) S.vy *= .5;

  const boosting = input.boost && S.fuel > 0;
  const v = speedNow();
  leg.dist += v * dt;

  // Resources
  S.fuel = Math.max(0, S.fuel - T.fuelUse(S.eng) * (boosting ? 3 : 1) * dt);
  S.o2 = Math.max(0, S.o2 - T.o2Use(S.life) * S.o2Mult * (S.leak ? 3 : 1) * dt);
  if (S.fuel <= 0 && !S.warnFuel) { S.warnFuel = true; say("sol", "Fuel tanks dry. We're coasting. Every second costs air now."); }
  if (S.o2 < 25 && !S.warnO2) { S.warnO2 = true; say("lin", "Oxygen's under a quarter. Route power to life support or find air!"); }

  // Random O₂ leak once in some legs: a tinkering moment
  if (!leg.leakRoll && leg.t > 18) { leg.leakRoll = true; if (Math.random() < .35) { S.leak = true; sfx("alarm"); say("wrench", "Seal's blown in the aft bulkhead! We're venting air. Hit PATCH!"); } }

  // Solar flares: warning, then a blast your shields must soak
  if (leg.flareT !== Infinity) {
    leg.flareT -= dt;
    if (leg.flareT <= 4 && !leg.flareWarn) { leg.flareWarn = 1; sfx("alarm"); say("sol", "Flare incoming! Shields, Captain. Shields!"); }
    if (leg.flareT <= 0) {
      leg.flareT = rand(13, 17); leg.flareWarn = 0; leg.flare = 1.4; flash("flare", 1);
      const d = Math.round(26 * Math.max(0, 1 - .28 * S.shd)); if (d > 0) { S.hull = Math.max(0, S.hull - d); S.shake = 1; addCrack(null); }
      toast(d ? `FLARE −${d} HULL` : "FLARE ABSORBED", d ? "r" : "c");
    }
  }
  if (leg.flare > 0) leg.flare -= dt;

  // Comms
  if (leg.commsAt.length && leg.t > leg.commsAt[0]) { leg.commsAt.shift(); const c = leg.comms.shift(); if (c) say(...c); }

  // World
  spawnTick(v * dt);
  const inCloud = [];
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i], o = e.obj;
    const pz = o.position.z; o.position.z += v * dt;
    if (e.drift) o.position.x += Math.sin(leg.t + i) * e.drift * dt * .2;
    if (e.spin) { o.rotation.x += e.spin.x * dt; o.rotation.y += e.spin.y * dt; o.rotation.z += e.spin.z * dt; }
    if (e.kind === "clouds") o.material.opacity = e.base + Math.sin(leg.t * 2 + e.phase) * .12;
    if (e.light) e.light.material.opacity = (leg.t % 1.6) < .2 ? 1 : .15;
    const dx = o.position.x - S.sx, dy = o.position.y - S.sy;
    if (e.kind === "clouds") { if (Math.abs(o.position.z) < e.r && Math.hypot(dx, dy) < e.r) inCloud.push(e); }
    else if (!e.done && pz <= 0 && o.position.z > -e.r) { // passing the ship this frame
      const near = e.kind === "wrecks" ? wreckHit(e, dx, dy) : Math.hypot(dx, dy) < e.r + 1.6;
      if (near) { e.done = true; if (e.kind in PICK) { pickup(e); scene.remove(o); ents.splice(i, 1); continue; } hit(e.dmg, e); }
    }
    if (o.position.z > 30) { scene.remove(o); ents.splice(i, 1); }
  }
  if (inCloud.length) { const d = 7 * T.shieldCut(S.shd) * dt; S.hull = Math.max(0, S.hull - d); S.cloudT = (S.cloudT || 0) + dt; if (S.cloudT > .6) { S.cloudT = 0; S.shake = .3; sfx("crackle"); } }
  $("#warnRad").hidden = !inCloud.length;

  // Camera: you are the ship
  camera.position.set(S.sx, S.sy, 0);
  const sh = reduce ? 0 : S.shake; S.shake = Math.max(0, S.shake - dt * 2.2);
  camera.position.x += rand(-1, 1) * sh * .5; camera.position.y += rand(-1, 1) * sh * .5;
  camera.rotation.set(S.vy * .006, -S.vx * .004, -S.vx * .012);
  headlight.position.set(S.sx, S.sy, -8);
  far.position.set(S.sx, S.sy, 0);
  if (legType.planet && legType.planet.final) placePlanet(leg.dist / leg.len);
  moveStreaks(dt, v * (boosting ? 1.4 : 1));
  camera.fov = 72 + (boosting ? 8 : 0) * (reduce ? 0 : 1); camera.updateProjectionMatrix();

  hud(v, boosting, inCloud.length > 0);

  if (S.hull <= 0) return gameOver("hull");
  if (S.o2 <= 0) return gameOver("o2");
  if (leg.dist >= leg.len) return arrive();
}
let spawnCarry = 0;
function spawnTick(m) { spawnCarry += m; while (spawnCarry >= 8) { spawnCarry -= 8; spawnAt(-700); } }
function moveStreaks(dt, v) {
  const len = clamp(v * .08, .5, 14);
  sData.forEach((s, i) => {
    s.z += v * dt; if (s.z > 5) { s.z = rand(-500, -300); s.x = rand(-70, 70) + camera.position.x; s.y = rand(-45, 45) + camera.position.y; }
    sPos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
  });
  streakGeo.attributes.position.needsUpdate = true;
  streaks.material.opacity = clamp(v / 120, .15, .7);
}

/* ── Arrival, waypoint, ending ── */
function arrive() {
  mode = "waypoint"; S.day += Math.round(12 + leg.len / 600); S.leak = false; input.boost = false;
  sfx("arrive");
  const legNo = S.legIndex; S.legIndex++;
  if (legType === L.TYPES.halcyon) return gameOver("arrived");
  const beat = L.WAYPOINT_BEATS[legNo] || [];
  const route = L.ROUTE[S.legIndex]; const opts = route.pick ? shuffle(route.options).slice(0, route.pick) : route.options;
  showOverlay("way", `<div class="kick">Waypoint ${S.legIndex} of ${L.ROUTE.length - 1} · Day ${S.day}</div>
    <h2>${esc(legType.name)} cleared</h2>
    <div class="beat">${beat.map(([w, t]) => `<p><b>${esc(WHO[w] || w)}</b> ${esc(t)}</p>`).join("")}</div>
    <h3>Workshop <span class="pc">${S.parts} part${S.parts === 1 ? "" : "s"}</span></h3>
    <div class="shop">${L.UPGRADES.map(u => { const owned = S.upgrades[u.id] && !u.repeat; return `<button class="up" type="button" data-u="${u.id}" ${owned || S.parts < u.cost ? "disabled" : ""}><b>${esc(u.name)}</b><span>${esc(u.desc)}</span><i>${owned ? "Installed" : u.cost + " parts"}</i></button>`; }).join("")}</div>
    <h3>Next lane</h3>
    <div class="lanes">${opts.map(id => { const t = L.TYPES[id]; return `<button class="lane" type="button" data-l="${id}" style="--lc:${t.sky[2]}"><b>${esc(t.name)}</b><span>${esc(t.tag)}</span></button>`; }).join("")}</div>`);
  document.querySelectorAll("[data-u]").forEach(b => b.addEventListener("click", () => { buy(b.dataset.u); arriveRefresh(); }));
  document.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", () => startLeg(b.dataset.l)));
}
function arriveRefresh() {
  $(".pc").textContent = `${S.parts} part${S.parts === 1 ? "" : "s"}`;
  document.querySelectorAll("[data-u]").forEach(b => { const u = L.UPGRADES.find(x => x.id === b.dataset.u); const owned = S.upgrades[u.id] && !u.repeat; b.disabled = owned || S.parts < u.cost; b.querySelector("i").textContent = owned ? "Installed" : u.cost + " parts"; });
  hud(0, false, false);
}
function buy(id) {
  const u = L.UPGRADES.find(x => x.id === id); if (!u || S.parts < u.cost || (S.upgrades[id] && !u.repeat)) return;
  S.parts -= u.cost; S.upgrades[id] = true; sfx("chime");
  if (id === "plating") { S.maxHull += 25; S.hull = S.maxHull; S.cracks = []; cracksDraw(); }
  if (id === "tank") { S.maxFuel += 30; S.fuel = S.maxFuel; }
  if (id === "scrubber") S.o2Mult = .7;
  if (id === "capacitor") { S.power += 1; renderPower(); }
  if (id === "o2") S.o2 = 100;
}
function gameOver(why) {
  mode = "end"; input.boost = false; sfx(why === "arrived" ? "arrive" : "alarm");
  const T2 = { arrived: ["Touchdown on Halcyon", S.hull > 60 ? "The Meridian settles into Halcyon's green, loud, not-at-all-calm air. Scorched, dented, and whole. The crew walk out into the rain, laughing." : "The Meridian comes down hard, glass spidered, hull groaning, but she comes down. Everyone walks off. Some of them limp."],
    hull: ["Hull breach", "The last crack ran all the way across the glass. Somewhere out here, the Meridian's beacon is still blinking."],
    o2: ["The air ran out", "The engines were still running when the air ran out. Sol kept flying toward Halcyon anyway."] }[why];
  showOverlay("end", `<div class="kick">${why === "arrived" ? `Day ${S.day} · ${S.legIndex} legs flown` : `Lost on leg ${S.legIndex + 1} · ${esc(legType.name)}`}</div>
    <h2>${esc(T2[0])}</h2><p class="lede">${esc(T2[1])}</p>
    <div class="stats"><div><span>Hull</span><b>${Math.round(S.hull)}%</b></div><div><span>Hits taken</span><b>${S.hits}</b></div><div><span>Pickups</span><b>${S.picked}</b></div><div><span>Flight time</span><b>${Math.floor(S.time / 60)}:${String(Math.floor(S.time % 60)).padStart(2, "0")}</b></div></div>
    <button class="go" type="button" id="again">Fly again</button>`);
  $("#again").addEventListener("click", begin);
}
function begin() { newGame(); startSound(); const opts = L.ROUTE[0].options; showLaneChoice(opts); }
function showLaneChoice(opts) {
  mode = "waypoint";
  showOverlay("way", `<div class="kick">Leaving Earth orbit · Leg 1 of ${L.ROUTE.length}</div><h2>Choose your first lane</h2>
    <div class="beat"><p><b>Ada</b> Board is green. Merry's yours, Captain. Where to?</p></div>
    <div class="lanes">${opts.map(id => { const t = L.TYPES[id]; return `<button class="lane" type="button" data-l="${id}" style="--lc:${t.sky[2]}"><b>${esc(t.name)}</b><span>${esc(t.tag)}</span></button>`; }).join("")}</div>`);
  document.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", () => startLeg(b.dataset.l)));
}
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const WHO = { ada: "Ada", wrench: "Wrench", lin: "Lin", priya: "Priya", sol: "Sol", hale: "Control" };

/* ── Overlays ── */
function showOverlay(kind, html) {
  const ov = $("#ov");
  if (!kind) { ov.hidden = true; ov.innerHTML = ""; document.body.classList.remove("paused"); return; }
  ov.className = "ov " + kind; ov.innerHTML = `<div class="screen">${html}</div>`; ov.hidden = false; document.body.classList.add("paused");
}

/* ── HUD & dashboard ── */
const G = { hull: $("#gHull"), fuel: $("#gFuel"), o2: $("#gO2") };
function gauge(el, v, max, lowAt) {
  const f = clamp(v / max, 0, 1); el.style.setProperty("--f", f); el.querySelector("b").textContent = Math.round(v);
  el.classList.toggle("low", v / max < lowAt); el.classList.toggle("crit", v / max < lowAt / 2);
}
function hud(v, boosting, rad) {
  gauge(G.hull, S.hull, S.maxHull, .35); gauge(G.fuel, S.fuel, S.maxFuel, .25); gauge(G.o2, S.o2, 100, .3);
  $("#parts").textContent = S.parts;
  $("#patch").disabled = S.parts < 1 || (S.hull >= S.maxHull && !S.leak);
  if (leg) { const p = clamp(leg.dist / leg.len, 0, 1); $("#prog").style.width = p * 100 + "%"; $("#dist").textContent = ((leg.len - leg.dist) / 1000).toFixed(1) + " km"; }
  $("#spd").textContent = Math.round(v * 3.6) + "";
  $("#warnFuel").hidden = S.fuel > 0; $("#warnLeak").hidden = !S.leak; $("#warnFlare").hidden = !(leg && leg.flareWarn);
  $("#warnFlare").textContent = leg && leg.flareWarn ? `FLARE IN ${Math.max(0, Math.ceil(leg.flareT))}` : "";
  document.body.classList.toggle("alarm", S.hull / S.maxHull < .3 || S.o2 < 20 || S.leak);
  document.body.classList.toggle("boosting", boosting);
  $("#o2haze").style.opacity = clamp((30 - S.o2) / 30, 0, .75);
}
function renderPower() {
  if (!S) return;
  const used = S.eng + S.shd + S.life;
  ["eng", "shd", "life"].forEach(k => {
    const row = document.querySelector(`.pw[data-k="${k}"]`);
    row.querySelector(".pips").innerHTML = Array.from({ length: 4 }, (_, i) => `<i class="${i < S[k] ? "on" : ""}"></i>`).join("");
    row.querySelector(".minus").disabled = S[k] <= 0; row.querySelector(".plus").disabled = S[k] >= 4 || used >= S.power;
  });
  $("#free").textContent = S.power - used;
}
document.querySelectorAll(".pw").forEach(row => {
  const k = row.dataset.k;
  row.querySelector(".minus").addEventListener("click", () => { if (S[k] > 0) { S[k]--; renderPower(); sfx("tick"); } });
  row.querySelector(".plus").addEventListener("click", () => { if (S[k] < 4 && S.eng + S.shd + S.life < S.power) { S[k]++; renderPower(); sfx("tick"); } });
});
$("#patch").addEventListener("click", () => {
  if (!S || S.parts < 1 || mode !== "fly") return;
  S.parts--; sfx("weld");
  if (S.leak) { S.leak = false; toast("LEAK SEALED", "c"); say("wrench", "Sealed! Nobody breathe on that bulkhead for a while."); }
  else { S.hull = Math.min(S.maxHull, S.hull + 14); S.cracks.splice(-2, 2); cracksDraw(); toast("+14 HULL", "o"); }
});

/* Comms & toasts */
let commsTimer = 0;
function say(who, text) {
  if (!who) return; const el = $("#comms");
  el.innerHTML = `<b>${esc(WHO[who] || who)}</b> ${esc(text)}`; el.classList.add("on"); sfx("blip");
  clearTimeout(commsTimer); commsTimer = setTimeout(() => el.classList.remove("on"), 6500);
}
function toast(text, cls) { const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = text; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 1400); }
function flash(kind, a) { const f = $("#flash"); f.className = kind; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = kind === "flare" ? "opacity 1.4s" : "opacity .35s"; f.style.opacity = 0; }); f.style.transition = "none"; }

/* Cracked glass: each big hit adds a crack where it struck */
const glass = $("#glass"), gctx = glass.getContext("2d");
function addCrack(e) {
  let x = rand(.2, .8), y = rand(.2, .7);
  if (e) { const v = e.obj.position.clone().project(camera); x = clamp((v.x + 1) / 2, .1, .9); y = clamp((1 - v.y) / 2, .1, .85); }
  const lines = []; const n = 5 + (Math.random() * 4 | 0);
  for (let i = 0; i < n; i++) { let a = rand(0, Math.PI * 2), px = x, py = y; const seg = []; for (let j = 0; j < 5; j++) { a += rand(-.5, .5); const l = rand(.02, .06); px += Math.cos(a) * l; py += Math.sin(a) * l * 1.4; seg.push([px, py]); } lines.push(seg); }
  S.cracks.push({ x, y, lines }); if (S.cracks.length > 14) S.cracks.shift(); cracksDraw();
}
function cracksDraw() {
  const r = glass.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  glass.width = Math.round(r.width * d); glass.height = Math.round(r.height * d);
  const W = glass.width, H = glass.height; gctx.clearRect(0, 0, W, H); if (!S) return;
  S.cracks.forEach(c => {
    gctx.fillStyle = "rgba(255,255,255,.18)"; gctx.beginPath(); gctx.arc(c.x * W, c.y * H, 5 * d, 0, 7); gctx.fill();
    c.lines.forEach(seg => { gctx.beginPath(); gctx.moveTo(c.x * W, c.y * H); seg.forEach(([px, py]) => gctx.lineTo(px * W, py * H)); gctx.strokeStyle = "rgba(230,245,255,.55)"; gctx.lineWidth = 1.2 * d; gctx.stroke(); gctx.strokeStyle = "rgba(255,255,255,.12)"; gctx.lineWidth = 4 * d; gctx.stroke(); });
  });
}

/* ── Input: drag anywhere in the window to steer; hold BOOST ── */
const pad = $("#window"), knob = $("#knob");
let drag = null;
pad.addEventListener("pointerdown", e => { if (mode !== "fly") return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; pad.setPointerCapture(e.pointerId); knob.style.left = e.clientX - pad.getBoundingClientRect().left + "px"; knob.style.top = e.clientY - pad.getBoundingClientRect().top + "px"; knob.classList.add("on"); });
pad.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; const R = Math.min(70, pad.clientWidth * .18); input.x = clamp((e.clientX - drag.x) / R, -1, 1); input.y = clamp(-(e.clientY - drag.y) / R, -1, 1); knob.style.setProperty("--dx", input.x * 28 + "px"); knob.style.setProperty("--dy", -input.y * 28 + "px"); });
const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; input.x = input.y = 0; knob.classList.remove("on"); knob.style.setProperty("--dx", "0px"); knob.style.setProperty("--dy", "0px"); };
pad.addEventListener("pointerup", endDrag); pad.addEventListener("pointercancel", endDrag);
const boostBtn = $("#boost");
const setBoost = on => { input.boost = on && mode === "fly" && S && S.fuel > 0; boostBtn.classList.toggle("on", input.boost); };
boostBtn.addEventListener("pointerdown", e => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); setBoost(true); });
["pointerup", "pointercancel", "pointerleave"].forEach(t => boostBtn.addEventListener(t, () => setBoost(false)));
addEventListener("keydown", e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; input.keys[k] = true;
  if (k === "Shift" || k === " ") { e.preventDefault(); setBoost(true); }
  if (k === "e" || k === "f") $("#patch").click();
  if (mode === "fly" && /^[1-6]$/.test(k)) { const map = ["eng", "eng", "shd", "shd", "life", "life"], i = +k - 1; document.querySelector(`.pw[data-k="${map[i]}"] .${i % 2 ? "plus" : "minus"}`).click(); }
  if (k.startsWith("Arrow")) e.preventDefault();
});
addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; input.keys[k] = false; if (k === "Shift" || k === " ") setBoost(false); });
addEventListener("blur", () => { input.keys = {}; setBoost(false); });

/* ── Resize ── */
let lastW = 0, lastH = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === lastW && h === lastH) return; lastW = w; lastH = h;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); cracksDraw();
}

/* ── Sound: engine drone + effects, all synthesized ── */
let ac = null, master = null, drone = null, soundOn = true;
function startSound() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = soundOn ? .5 : 0; master.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
      const g = ac.createGain(); g.gain.value = .12; src.connect(lp).connect(g).connect(master); src.start();
      const o = ac.createOscillator(); o.frequency.value = 48; const og = ac.createGain(); og.gain.value = .05; o.connect(og).connect(master); o.start();
      drone = { lp, g, o };
    }
    ac.resume && ac.resume();
  } catch (_) {}
}
function sfx(kind) {
  if (!ac || !soundOn) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.connect(g).connect(master);
  const env = (a, d) => { g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.start(t); o.stop(t + d + .02); };
  if (kind === "thud") { o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + .3); env(.5, .35); }
  else if (kind === "chime") { o.type = "triangle"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + .07); env(.12, .25); }
  else if (kind === "alarm") { o.type = "square"; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + .15); o.frequency.setValueAtTime(660, t + .3); env(.07, .45); }
  else if (kind === "blip") { o.type = "sine"; o.frequency.value = 1400; env(.04, .06); }
  else if (kind === "tick") { o.type = "square"; o.frequency.value = 2200; env(.03, .03); }
  else if (kind === "weld") { o.type = "sawtooth"; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(900, t + .4); env(.06, .45); }
  else if (kind === "crackle") { o.type = "sawtooth"; o.frequency.value = rand(80, 200); env(.05, .08); }
  else if (kind === "arrive") { o.type = "triangle"; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(659, t + .15); o.frequency.setValueAtTime(784, t + .3); env(.12, .6); }
}
function droneTick() { if (drone && S && mode === "fly") { const v = speedNow(); drone.lp.frequency.setTargetAtTime(180 + v * 5, ac.currentTime, .2); drone.g.gain.setTargetAtTime(.08 + (input.boost ? .1 : 0), ac.currentTime, .2); } else if (drone) drone.g.gain.setTargetAtTime(.05, ac.currentTime, .4); }
setInterval(droneTick, 150);
$("#snd").addEventListener("click", e => { soundOn = !soundOn; e.currentTarget.setAttribute("aria-pressed", String(soundOn)); e.currentTarget.textContent = soundOn ? "Sound on" : "Sound off"; if (master) master.gain.value = soundOn ? .5 : 0; if (soundOn) startSound(); });

/* ── Boot: title screen over a live, cruising view ── */
newGame(); startLegLook("belt");
function startLegLook(id) { legType = L.TYPES[id]; leg = { id, dist: 0, len: 1, acc: {}, t: 0, comms: [], commsAt: [], flareT: Infinity }; skyMat.map = skyTex(legType.sky); skyMat.needsUpdate = true; scene.fog.color.set(legType.fog); renderer.setClearColor(legType.fog); sun.color.set(legType.sun); hemi.color.set(legType.sky[2]); for (let z = -40; z > -700; z -= 8) spawnAt(z); }
hud(0, false, false);
$("#launch").addEventListener("click", begin);
requestAnimationFrame(loop);
})();
