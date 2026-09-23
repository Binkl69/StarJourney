/* StarJourney — ART
   Paints the viewport: parallax stars, the Meridian, and one backdrop per place.
   Everything is drawn in code (no image files), so scenes load instantly and scale to any screen.
   Also draws crew portraits as small SVG illustrations whose faces follow their mood. */
window.ART = (() => {
"use strict";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;

/* ── Seeded noise for stable star fields ── */
function rnd(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function Viewport(canvas) {
  const g = canvas.getContext("2d");
  let W = 0, H = 0, D = 1, t0 = performance.now();
  let scene = "earth", prev = null, fade = 1, warp = 0, warpTarget = 0, shake = 0;
  const layers = [0, 1, 2].map(i => { const r = rnd(11 + i * 97); return Array.from({ length: [140, 70, 28][i] }, () => ({ x: r(), y: r(), s: r() })); });
  const dust = (() => { const r = rnd(5); return Array.from({ length: 60 }, () => ({ x: r(), y: r(), s: r(), v: r() })); })();
  let scroll = 0;

  function resize() {
    const r = canvas.getBoundingClientRect(); D = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * D)); H = Math.max(1, Math.round(r.height * D));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  }

  /* ── Backdrop painters: each paints one place, t = seconds ── */
  const glow = (x, y, r, c0, c1 = "rgba(0,0,0,0)") => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  function planet(x, y, r, base, dark, rim, bands) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    const gr = g.createRadialGradient(x - r * .45, y - r * .45, r * .1, x, y, r * 1.05); gr.addColorStop(0, base); gr.addColorStop(1, dark);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    if (bands) bands(x, y, r);
    const sh = g.createLinearGradient(x - r, y - r, x + r * .9, y + r * .9); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(.55, "rgba(0,0,0,.05)"); sh.addColorStop(1, "rgba(0,0,0,.85)");
    g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.strokeStyle = rim; g.lineWidth = 2 * D; g.globalAlpha = .6; g.stroke(); g.globalAlpha = 1;
    glow(x, y, r * 1.25, "rgba(0,0,0,0)", "rgba(0,0,0,0)");
  }
  const nebula = (t, cols, k = 1) => {
    cols.forEach((c, i) => {
      const a = t * .03 * (i % 2 ? 1 : -1) + i * 1.7;
      const x = W * (.5 + .32 * Math.cos(a + i)), y = H * (.5 + .28 * Math.sin(a * 1.3 + i * 2));
      glow(x, y, Math.max(W, H) * (.45 + .1 * Math.sin(t * .1 + i)) * k, c);
    });
  };
  const P = {
    earth(t) {
      g.fillStyle = "#04060b"; g.fillRect(0, 0, W, H);
      const r = Math.max(W, H) * .75, x = W * .2, y = H * 1.45;
      glow(x, y, r * 1.12, "rgba(94,170,255,.35)");
      planet(x, y, r, "#2f6fa8", "#071a33", "rgba(140,200,255,.9)", (x, y, r) => {
        g.globalAlpha = .18; g.fillStyle = "#fff";
        for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(x + Math.cos(i * 2.1 + t * .01) * r * .6, y - r * .75 + i * r * .04, r * .3, r * .02, .1, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
        g.fillStyle = "rgba(255,200,120,.8)";
        const rr = rnd(3); for (let i = 0; i < 90; i++) { const a = -Math.PI * .5 + (rr() - .5) * 1.4, d = r * (.82 + rr() * .16); g.fillRect(x + Math.cos(a) * d + r * .35, y + Math.sin(a) * d, 1.4 * D, 1.4 * D); }
      });
    },
    deep(t) { g.fillStyle = "#03050a"; g.fillRect(0, 0, W, H); g.save(); g.translate(W * .5, H * .55); g.rotate(-.35); glow(0, 0, W * .6, "rgba(120,110,160,.12)"); g.restore(); },
    fork(t) {
      P.deep(t);
      [["rgba(180,90,255,.5)", .78, .32], ["rgba(255,170,70,.45)", .62, .72], ["rgba(120,140,170,.25)", .9, .62]].forEach(([c, x, y], i) => {
        const p = 1 + .15 * Math.sin(t * 1.3 + i * 2); glow(W * x, H * y, H * .22 * p, c);
        g.fillStyle = "#fff"; g.beginPath(); g.arc(W * x, H * y, 2.2 * D, 0, TAU); g.fill();
      });
    },
    veil(t) { g.fillStyle = "#0d0619"; g.fillRect(0, 0, W, H); nebula(t, ["rgba(160,60,235,.8)", "rgba(240,90,200,.45)", "rgba(255,190,110,.32)", "rgba(80,60,220,.6)", "rgba(120,40,180,.5)"]); },
    storm(t) {
      P.veil(t);
      const f = Math.sin(t * 2.3) * Math.sin(t * 5.1);
      if (f > .82 && !reduce) { g.fillStyle = `rgba(210,190,255,${(f - .82) * 2.5})`; g.fillRect(0, 0, W, H); }
      g.strokeStyle = "rgba(220,200,255,.5)"; g.lineWidth = 1.2 * D;
      if (!reduce && (t * 3 | 0) % 4 === 0) { g.beginPath(); let x = W * (.3 + .4 * ((t * 7 | 0) % 5) / 5), y = 0; g.moveTo(x, y); while (y < H * .7) { x += (Math.random() - .5) * 40 * D; y += 30 * D; g.lineTo(x, y); } g.stroke(); }
    },
    aurora(t) {
      g.fillStyle = "#090512"; g.fillRect(0, 0, W, H); nebula(t, ["rgba(120,50,190,.4)", "rgba(200,80,180,.18)", "rgba(60,50,160,.35)"], .9);
      // The Aurora: long spine, broken ring, one red light
      const x = W * .68, y = H * .46, s = H / 380;
      g.save(); g.translate(x, y + Math.sin(t * .2) * 4 * s); g.rotate(-.12 + Math.sin(t * .05) * .02);
      g.fillStyle = "#0c0a12"; g.strokeStyle = "rgba(190,170,230,.35)"; g.lineWidth = 1.5 * D;
      g.fillRect(-260 * s, -9 * s, 520 * s, 18 * s); g.strokeRect(-260 * s, -9 * s, 520 * s, 18 * s);
      g.beginPath(); g.ellipse(-90 * s, 0, 34 * s, 110 * s, 0, .4, TAU - .9); g.lineWidth = 9 * s; g.strokeStyle = "#0c0a12"; g.stroke(); g.lineWidth = 1.5 * D; g.strokeStyle = "rgba(190,170,230,.35)"; g.stroke();
      [-200, -40, 60, 150].forEach(px => { g.fillStyle = "#0c0a12"; g.fillRect(px * s, -26 * s, 38 * s, 52 * s); g.strokeRect(px * s, -26 * s, 38 * s, 52 * s); });
      g.beginPath(); g.moveTo(260 * s, -9 * s); g.lineTo(300 * s, -30 * s); g.lineTo(300 * s, 30 * s); g.lineTo(260 * s, 9 * s); g.closePath(); g.fillStyle = "#0c0a12"; g.fill(); g.stroke();
      const on = (t % 2.4) < .3; if (on) glow(-250 * s, -14 * s, 26 * s, "rgba(255,60,60,.9)");
      g.fillStyle = on ? "#ff4d4d" : "#3a1414"; g.beginPath(); g.arc(-250 * s, -14 * s, 3.5 * s, 0, TAU); g.fill();
      g.restore();
    },
    inside(t) {
      g.fillStyle = "#050507"; g.fillRect(0, 0, W, H);
      const cx = W * .5 + Math.sin(t * .4) * W * .05, cy = H * .5 + Math.cos(t * .3) * H * .04;
      g.strokeStyle = "rgba(150,160,180,.18)"; g.lineWidth = 1.5 * D;
      for (let i = 1; i <= 7; i++) { const k = i / 7, w = W * .9 * k, h = H * .9 * k; g.strokeRect(cx - w / 2, cy - h / 2, w, h); }
      [[0, 0], [W, 0], [0, H], [W, H]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cy); g.stroke(); });
      const fl = g.createRadialGradient(cx, cy, 0, cx, cy, H * .55); fl.addColorStop(0, "rgba(255,240,210,.22)"); fl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fl; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,.35)"; dust.forEach(p => { g.fillRect(((p.x + t * .01 * p.v) % 1) * W, ((p.y + t * .004) % 1) * H, D, D); });
      const vg = g.createRadialGradient(W / 2, H / 2, H * .2, W / 2, H / 2, W * .7); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.9)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    },
    core(t) {
      g.fillStyle = "#07040f"; g.fillRect(0, 0, W, H); nebula(t, ["rgba(110,60,200,.35)", "rgba(220,120,255,.15)"], .8);
      const x = W * .64, y = H * .5; glow(x, y, H * .5, "rgba(230,210,255,.35)");
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(x, y); g.rotate(t * (.05 + i * .02) * (i % 2 ? -1 : 1));
        g.beginPath(); g.ellipse(0, 0, H * (.12 + i * .07), H * (.05 + i * .025), i * .5, 0, TAU);
        g.strokeStyle = `rgba(${200 + i * 8},${180 + i * 10},255,${.55 - i * .06})`; g.lineWidth = (2.2 - i * .2) * D; g.stroke(); g.restore();
      }
      glow(x, y, H * .08, "rgba(255,255,255,.95)");
      for (let i = 0; i < 4; i++) { const a = i * 1.2 + t * .02; g.fillStyle = "rgba(255,230,160,.9)"; g.fillRect(x + Math.cos(a) * H * .5 - 2 * D, y + Math.sin(a) * H * .2, 4 * D, 3 * D); }
    },
    halcyon(t) {
      g.fillStyle = "#02060a"; g.fillRect(0, 0, W, H);
      const r = H * .62, x = W * .7, y = H * .62;
      glow(x, y, r * 1.35, "rgba(120,230,190,.25)");
      planet(x, y, r, "#3f9f7a", "#062018", "rgba(170,255,220,.9)", (x, y, r) => {
        g.globalAlpha = .35; g.fillStyle = "#f4fff8";
        for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(x + Math.sin(i * 1.7 + t * .02) * r * .5, y - r * .8 + i * r * .14, r * (.25 + .15 * Math.sin(i)), r * .035, .15, 0, TAU); g.fill(); }
        g.globalAlpha = .5; g.fillStyle = "#2a6b8f"; g.beginPath(); g.ellipse(x - r * .3, y + r * .1, r * .28, r * .18, .4, 0, TAU); g.fill(); g.globalAlpha = 1;
      });
      glow(W * .05, H * .1, H * .3, "rgba(255,240,200,.35)");
    },
  };

  /* ── The Meridian ── */
  function ship(t) {
    const s = H / 420, x = W * (.24 + warp * .06) + Math.sin(t * .6) * 3 * s, y = H * .54 + Math.sin(t * .9) * 4 * s;
    g.save(); g.translate(x + (shake ? (Math.random() - .5) * shake * D : 0), y); g.scale(s, s);
    const plume = 40 + warp * 160 + Math.sin(t * 20) * 4;
    const pg = g.createLinearGradient(-60, 0, -60 - plume, 0); pg.addColorStop(0, "rgba(94,230,224,.95)"); pg.addColorStop(1, "rgba(94,230,224,0)");
    g.fillStyle = pg; g.beginPath(); g.moveTo(-58, -7); g.lineTo(-60 - plume, 0); g.lineTo(-58, 7); g.closePath(); g.fill();
    g.fillStyle = "#1a212b"; g.strokeStyle = "#8a919b"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-58, -9); g.lineTo(-44, -12); g.lineTo(-44, 12); g.lineTo(-58, 9); g.closePath(); g.fill(); g.stroke();   // drive
    g.fillRect(-44, -10, 24, 20); g.strokeRect(-44, -10, 24, 20);                                                            // reactor
    g.beginPath(); g.moveTo(-40, -10); g.lineTo(-44, -28); g.lineTo(-24, -28); g.lineTo(-28, -10); g.moveTo(-40, 10); g.lineTo(-44, 28); g.lineTo(-24, 28); g.lineTo(-28, 10); g.stroke(); // radiators
    g.fillRect(-20, -4, 62, 8); g.strokeRect(-20, -4, 62, 8);                                                                // spine
    g.fillRect(-12, -30, 12, 60); g.strokeRect(-12, -30, 12, 60);                                                            // hab ring
    [8, 20].forEach(px => { g.fillRect(px, -13, 9, 9); g.strokeRect(px, -13, 9, 9); g.fillRect(px, 4, 9, 9); g.strokeRect(px, 4, 9, 9); }); // cargo
    g.fillRect(42, -8, 20, 16); g.strokeRect(42, -8, 20, 16);                                                                // command
    g.beginPath(); g.moveTo(62, -8); g.lineTo(76, 0); g.lineTo(62, 8); g.closePath(); g.fill(); g.stroke();                    // nose
    g.fillStyle = "rgba(255,200,120,.9)"; [46, 51, 56].forEach(px => g.fillRect(px, -3, 3, 2));                               // windows
    g.fillStyle = (t % 1.6) < .15 ? "#ff7a2e" : "#5a2a10"; g.beginPath(); g.arc(-6, -30, 2, 0, TAU); g.fill();              // beacon
    g.restore();
  }

  /* ── Stars: three parallax layers; streak into lines during warp ── */
  function stars(dt, tint) {
    scroll += dt * (0.004 + warp * .5);
    layers.forEach((L, i) => {
      const sp = [.25, .6, 1.4][i], sz = [0.8, 1.2, 1.8][i] * D;
      g.fillStyle = tint; g.strokeStyle = tint;
      L.forEach(p => {
        const x = (((p.x - scroll * sp) % 1) + 1) % 1 * W, y = p.y * H;
        g.globalAlpha = .35 + p.s * .6;
        if (warp > .05) { g.lineWidth = sz; g.beginPath(); g.moveTo(x, y); g.lineTo(x + warp * sp * 180 * D, y); g.stroke(); }
        else g.fillRect(x, y, sz, sz);
      });
    });
    g.globalAlpha = 1;
  }

  let last = performance.now(), running = true;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    resize();
    warp += (warpTarget - warp) * Math.min(1, dt * 3);
    if (shake) shake = Math.max(0, shake - dt * 20);
    if (prev && fade < 1) { (P[prev] || P.deep)(t); g.globalAlpha = fade; }
    (P[scene] || P.deep)(t); g.globalAlpha = 1;
    if (fade < 1) fade = Math.min(1, fade + dt * .8);
    stars(reduce ? 0 : dt, scene === "halcyon" || scene === "earth" ? "#cfe8ff" : "#f1e9ff");
    if (scene !== "inside") ship(t);
    const vg = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (running && !reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener("resize", () => { if (reduce) requestAnimationFrame(frame); });

  return {
    set(name) { if (name === scene) return; prev = scene; scene = name; fade = reduce ? 1 : 0; if (reduce) requestAnimationFrame(frame); },
    warp(on) { warpTarget = on ? 1 : 0; },
    jolt() { shake = 10; },
  };
}

/* ── Portraits: flat SVG busts; mood moves brows, eyes and mouth ── */
const LOOK = {
  ada:    { skin:"#7a4a33", hair:"#17110e", suit:"#26303b", accent:"#ff7a2e", bg:"#1b2330", hairBack:"", hairFront:"M24 30 Q25 14 40 13 Q55 14 56 30 Q52 21 40 20 Q28 21 24 30 Z" },
  wrench: { skin:"#d7a07e", hair:"#b8562b", suit:"#3a3122", accent:"#ffb300", bg:"#2a2218", hairBack:"", hairFront:"M22 29 Q22 10 40 10 Q58 10 58 29 L58 25 Q40 19 22 25 Z", extra:'<rect x="27" y="21" width="26" height="6" rx="3" fill="#1d2630"/><circle cx="33" cy="24" r="3.2" fill="#5ee6e0" opacity=".8"/><circle cx="47" cy="24" r="3.2" fill="#5ee6e0" opacity=".8"/>', stubble:true },
  lin:    { skin:"#ecc9a4", hair:"#1f171a", suit:"#27373a", accent:"#e9e7e2", bg:"#18272a", hairBack:"M21 32 Q20 12 40 12 Q60 12 59 32 L59 50 L52 50 L52 30 L28 30 L28 50 L21 50 Z", hairFront:"M24 29 Q26 15 40 15 Q54 15 56 29 Q48 23 40 26 Q32 23 24 29 Z" },
  priya:  { skin:"#a86b4a", hair:"#140e0c", suit:"#2a2838", accent:"#5ee6e0", bg:"#221d30", hairBack:"M20 34 Q18 11 40 11 Q62 11 60 34 Q63 58 54 70 L50 44 L30 44 L26 70 Q17 58 20 34 Z", hairFront:"M23 30 Q24 14 40 14 Q56 14 57 30 Q50 20 38 22 Q30 23 23 30 Z", extra:'<path d="M57 36 Q62 44 52 50" stroke="#ff7a2e" stroke-width="1.6" fill="none"/><circle cx="52" cy="50" r="1.8" fill="#ff7a2e"/>' },
};
const MOOD = {
  calm:[0, .6, 1], happy:[-1, 3, 1], keen:[-1, 2, 1.1], proud:[-1.5, 3, .9], worried:[3, -1, 1.1], sad:[4, -2.5, .8], scared:[4.5, "o", 1.25], awed:[3, "o", 1.2],
  angry:[-4, -1.5, .9], annoyed:[-2.5, -1, .8], grim:[-2, -1, .85], intense:[-2, 0, 1.05], guarded:[-1, -.6, .7], nervous:[3, 1, 1.1], dry:[-1, .3, .75],
};
const MOOD_WORD = { calm:"steady", happy:"happy", keen:"keen", proud:"proud", worried:"worried", sad:"sad", scared:"shaken", awed:"awed", angry:"angry", annoyed:"annoyed", grim:"grim", intense:"driven", guarded:"guarded", nervous:"nervous", dry:"unimpressed" };
function portrait(id, mood = "calm", state = "ok") {
  if (id === "sol") return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#1d140c"/><circle cx="40" cy="40" r="24" fill="none" stroke="#ff7a2e" stroke-width="2"/><circle cx="40" cy="40" r="15" fill="none" stroke="#ff7a2e" stroke-width="1" opacity=".5"/><path d="M20 40 h8 l3 -9 l5 18 l4 -14 l3 8 l3 -3 h14" fill="none" stroke="#ffb07a" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  if (id === "hale") return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#10161d"/><circle cx="40" cy="50" r="5" fill="#8a919b"/><path d="M28 38 a17 17 0 0 1 24 0 M22 32 a26 26 0 0 1 36 0 M16 26 a35 35 0 0 1 48 0" fill="none" stroke="#8a919b" stroke-width="2" stroke-linecap="round"/><text x="40" y="70" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="7" fill="#586070" letter-spacing="1">EARTH</text></svg>`;
  const L = LOOK[id]; if (!L) return "";
  const [b, m, e] = MOOD[mood] || MOOD.calm;
  const by = 31, bi = by - b * .7, bo = by + b * .25;
  const eyeR = 1.7 * e;
  const mouth = m === "o" ? `<ellipse cx="40" cy="47.5" rx="2.4" ry="3" fill="#2a1410"/>` : `<path d="M34 47 Q40 ${47 + m} 46 47" stroke="#2a1410" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  const gone = state !== "ok";
  return `<svg viewBox="0 0 80 80" aria-hidden="true" style="${gone ? "filter:grayscale(1) brightness(.5)" : ""}">
    <rect width="80" height="80" fill="${L.bg}"/>
    ${L.hairBack ? `<path d="${L.hairBack}" fill="${L.hair}"/>` : ""}
    <path d="M10 80 Q12 60 40 58 Q68 60 70 80 Z" fill="${L.suit}"/>
    <path d="M30 60 L40 70 L50 60" stroke="${L.accent}" stroke-width="2.4" fill="none"/>
    <rect x="35" y="50" width="10" height="10" fill="${L.skin}"/>
    <ellipse cx="40" cy="35" rx="15" ry="18" fill="${L.skin}"/>
    ${L.stubble ? `<path d="M27 42 Q40 56 53 42 Q52 52 40 53 Q28 52 27 42 Z" fill="#000" opacity=".12"/>` : ""}
    <path d="${L.hairFront}" fill="${L.hair}"/>
    ${L.extra || ""}
    <path d="M${29} ${bo} L${37} ${bi}" stroke="#1a100c" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M${51} ${bo} L${43} ${bi}" stroke="#1a100c" stroke-width="1.8" stroke-linecap="round"/>
    <ellipse cx="33.5" cy="36" rx="${eyeR}" ry="${eyeR * 1.1}" fill="#1a100c"/>
    <ellipse cx="46.5" cy="36" rx="${eyeR}" ry="${eyeR * 1.1}" fill="#1a100c"/>
    ${mouth}
  </svg>`;
}

return { Viewport, portrait, MOOD_WORD };
})();
