/* StarJourney — ENGINE
   Plays story.js: scene → lines (typewriter) → choices → result lines → next scene.
   Tracks trust, health, ship resources and story flags; picks the ending. */
(() => {
"use strict";
const ST = window.STORY, ART = window.ART;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CREW_IDS = Object.keys(ST.CREW);
const view = ART.Viewport($("#view"));

/* ── Legacy: what you've uncovered across runs (per browser) ── */
const LKEY = "starjourney.v2.legacy";
const RANK = { none: 0, partial: 1, full: 2 };
function loadL() { try { return JSON.parse(localStorage.getItem(LKEY)) || { runs: 0, veil: null, endings: [] }; } catch (_) { return { runs: 0, veil: null, endings: [] }; } }
function saveL() { try { localStorage.setItem(LKEY, JSON.stringify(legacy)); } catch (_) {} }
let legacy = loadL();

/* ── State & the toolbox story.js uses ── */
let S;
const present = id => S.crew[id] && S.crew[id].alive && !S.crew[id].gone;
const g = {
  get S() { return S; },
  trust(id, n) { const c = S.crew[id]; if (!c) return 0; if (n !== undefined && present(id)) { c.trust = clamp(c.trust + n, -5, 5); if (n) pulse(id, n > 0 ? "up" : "down"); } return c.trust; },
  hurt(id, n) { const c = S.crew[id]; if (!c || !present(id)) return; c.hp = clamp(c.hp - n, 0, 100); if (c.hp <= 0) c.alive = false; },
  alive: id => present(id),
  leave(id) { if (S.crew[id]) S.crew[id].gone = true; },
  anyDead: () => CREW_IDS.some(id => !S.crew[id].alive),
  pickAlive() { const a = CREW_IDS.filter(present); return a[Math.floor(Math.random() * a.length)]; },
  check(id, base) { const c = S.crew[id]; if (!present(id)) return Math.random() < base * .5; return Math.random() < clamp(base + c.trust * .05 - (c.hp < 50 ? .1 : 0), .05, .95); },
  roll: p => Math.random() < p,
  res(k, n) { S[k] = k === "hull" ? clamp(S[k] + n, 0, 100) : Math.max(0, S[k] + n); if (k === "hull" && n < 0) view.jolt(); },
  days(n) { S.day += n; },
  flag: k => !!S.flags[k],
  set(k) { S.flags[k] = true; },
};

/* ── Playback ─────────────────────────── */
let queue = [], typing = null, cur = null, choicesUp = false, afterQueue = null;
function newRun() {
  S = { day: 0, hull: ST.START.hull, fuel: ST.START.fuel, sup: ST.START.sup, flags: {}, scene: null, crew: {} };
  CREW_IDS.forEach(id => { S.crew[id] = { trust: ST.CREW[id].trust, hp: 100, alive: true, gone: false, mood: "calm" }; });
  $("#ovEnd").hidden = true; $("#ovTitle").hidden = true;
  renderCrew(); renderStatus(); renderFile();
  enter(ST.START.scene);
}
function scene(id) { return ST.SCENES.find(s => s.id === id); }
function usable(l) { if (l.if && !safe(() => l.if(g), false)) return false; if (ST.CREW[l.who] && !present(l.who)) return false; return true; }
function safe(fn, fb) { try { return fn(); } catch (e) { console.error(e); return fb; } }

function enter(id) {
  if (id === "END") return finish();
  const sc = scene(id); S.scene = id; choicesUp = false; $("#choices").innerHTML = "";
  const tr = typeof sc.travel === "function" ? safe(() => sc.travel(g), null) : sc.travel;
  const arrive = (extra = []) => {
    view.set(sc.backdrop); $("#place").textContent = sc.place; renderStatus(); renderCrew();
    queue = [...extra, ...sc.lines].filter(usable); afterQueue = () => showChoices(sc);
    next();
  };
  if (tr) travel(tr, arrive); else arrive();
}
function travel(tr, done) {
  S.day += tr.days; S.fuel -= tr.fuel; S.sup -= tr.sup;
  const extra = [];
  if (S.fuel < 0) { const d = Math.ceil(-S.fuel * 1.5); S.day += d; S.fuel = 0; extra.push({ who: "sol", text: `Fuel's gone, Captain. We coasted the last stretch on momentum. It cost us ${d} days.` }); }
  if (S.sup < 0) { S.sup = 0; CREW_IDS.filter(present).forEach(id => g.hurt(id, 15)); extra.push({ who: "lin", mood: "worried", text: "We're out of food. Everyone's weak. I can't fix hungry." }); }
  showLine({ who: "caption", text: `${tr.days} days later` });
  view.warp(true);
  const run = S;
  setTimeout(() => { if (S !== run) return; view.warp(false); done(extra); }, reduce ? 300 : 1900);
}
function next() {
  if (typing) return finishTyping();
  if (!queue.length) { const f = afterQueue; afterQueue = null; if (f) f(); return; }
  showLine(queue.shift());
}
function showLine(l) {
  cur = l; const box = $("#line"), who = l.who;
  const crew = ST.CREW[who], voice = who === "you" ? { name: "You", role: "Captain" } : ST.VOICES[who];
  if (crew && l.mood) { S.crew[who].mood = l.mood; renderCrew(); }
  document.querySelectorAll(".cm").forEach(el => el.classList.toggle("speaking", el.dataset.id === who));
  box.className = "line " + ({ narr: "narr", caption: "caption", hale: "hale", you: "you" }[who] || "");
  const name = crew ? crew.name : voice ? voice.name : "";
  const role = crew ? crew.role : voice ? voice.role : "";
  const tag = who === "hale" ? `<span class="tx">Transmission · ${S.day > 0 ? "sent 41 min ago" : "live"}</span>` : "";
  box.innerHTML = (crew || ST.VOICES[who] ? `<div class="pt">${ART.portrait(who, crew ? S.crew[who].mood : "calm")}</div>` : "") +
    `<div class="lb">${name ? `<div class="who"><b>${esc(name)}</b><span>${esc(role)}</span>${tag}</div>` : ""}<p class="say"></p><span class="more" aria-hidden="true">▸</span></div>`;
  type(box.querySelector(".say"), l.text);
  if (who !== "caption" && who !== "you") blip();
}
function type(el, text) {
  if (reduce) { el.textContent = text; typing = null; $("#line").classList.add("done"); return; }
  let i = 0; $("#line").classList.remove("done");
  typing = { el, text, id: setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) finishTyping(); }, 28) };
}
function finishTyping() { if (!typing) return; clearInterval(typing.id); typing.el.textContent = typing.text; typing = null; $("#line").classList.add("done"); }

function showChoices(sc) {
  const list = (sc.choices || []).filter(c => !c.if || safe(() => c.if(g), false)).filter(c => !(c.stay && c._used));
  if (!list.length) return enter(sc.next);
  choicesUp = true; $("#line").classList.add("waiting");
  $("#choices").innerHTML = list.map((c, i) => {
    const hint = c.locked || (typeof c.hint === "function" ? safe(() => c.hint(g), "") : c.hint || "");
    return `<button class="ch${c.locked ? " locked" : ""}" type="button" data-i="${i}" ${c.locked ? "disabled" : ""}><span class="k">${i + 1}</span><span class="t">${esc(c.text)}</span><span class="h">${esc(hint)}</span></button>`;
  }).join("");
  $("#choices").querySelectorAll(".ch").forEach(b => b.addEventListener("click", () => pick(sc, list[+b.dataset.i])));
  const first = $("#choices .ch:not([disabled])"); if (first && matchMedia("(hover:hover)").matches) first.focus({ preventScroll: true });
}
function pick(sc, c) {
  if (!choicesUp || c.locked) return;
  choicesUp = false; $("#choices").innerHTML = ""; $("#line").classList.remove("waiting");
  const before = CREW_IDS.filter(id => S.crew[id].alive);
  // Result lines: the dead are silent; someone leaving this very moment still gets their goodbye.
  const res = (safe(() => c.do ? c.do(g) : [], []) || []).filter(l => (!l.if || safe(() => l.if(g), false)) && (!ST.CREW[l.who] || S.crew[l.who].alive));
  CREW_IDS.filter(id => before.includes(id) && !S.crew[id].alive).forEach(id => {
    res.push({ who: "narr", text: `${ST.CREW[id].name} is gone.` });
    const mourner = ["lin", "ada", "wrench", "priya"].find(m => m !== id && present(m));
    if (mourner) res.push({ who: mourner, mood: "sad", text: ["I'm sorry, Captain. There was nothing left to do.", "…Log it. Somebody log it. I can't.", "We keep going. That's what they'd want. Right?"][Math.floor(Math.random() * 3)] });
  });
  renderCrew(); renderStatus();
  if (c.stay) c._used = true;
  queue = [{ who: "you", text: c.text }, ...res];
  afterQueue = () => {
    if (S.hull <= 0 || !CREW_IDS.some(present)) return finish();
    if (c.stay) return showChoices(sc);
    enter(typeof c.next === "function" ? c.next(g) : (c.next || sc.next));
  };
  next();
}

/* ── Ending ───────────────────────────── */
function finish() {
  choicesUp = false; $("#choices").innerHTML = "";
  const end = ST.ENDINGS.find(e => safe(() => e.when(g), false));
  const lvl = safe(() => ST.FRAGMENT.level(g), "none");
  legacy.runs++; if (!legacy.veil || RANK[lvl] > RANK[legacy.veil]) legacy.veil = lvl;
  if (!legacy.endings.includes(end.id)) legacy.endings.push(end.id);
  saveL(); renderFile();
  const landed = CREW_IDS.filter(present);
  $("#ovEnd").innerHTML = `<div class="sheet"><section class="p end" aria-labelledby="endH"><span class="bk"></span>
    <div class="kicker">${S.hull > 0 ? `Halcyon · Day ${S.day} · ${landed.length} of 4 landed` : "Loss of signal"}</div>
    <h2 id="endH">${esc(end.title)}</h2>
    <p class="lede">${esc(end.text)}</p>
    <div class="epi">${CREW_IDS.map(id => `<div class="ep ${present(id) ? "" : "gone"}"><div class="pt">${ART.portrait(id, S.crew[id].mood, present(id) ? "ok" : "gone")}</div><p>${esc(safe(() => ST.EPILOGUE[id](g), ""))}</p></div>`).join("")}</div>
    <div class="frag"><div class="kicker">The Halcyon File · ${esc(ST.FRAGMENT.route)}</div><h3>${esc(ST.FRAGMENT.title)}${lvl === "full" ? "" : lvl === "partial" ? " (partial)" : " (missing)"}</h3><p>${esc(ST.FRAGMENT[lvl])}</p>
      ${ST.OTHER_ROUTES.map(r => `<p class="tease"><b>${esc(r.route)}</b> · uncharted · ${esc(r.tease)}</p>`).join("")}</div>
    <div class="row"><span class="note">Runs: ${legacy.runs} · Endings found: ${legacy.endings.length}/${ST.ENDINGS.length}</span><button class="go" type="button" id="again">Fly again</button></div>
  </section></div>`;
  $("#ovEnd").hidden = false;
  $("#again").addEventListener("click", () => { ST.SCENES.forEach(s => (s.choices || []).forEach(c => delete c._used)); newRun(); });
}

/* ── Panels ───────────────────────────── */
function renderStatus() {
  const bar = (k, v, max) => `<div class="st ${v / max < .25 ? "low" : ""}"><span class="k">${k}</span><span class="v">${Math.round(v)}${k === "Hull" ? "%" : ""}</span><i style="width:${clamp(v / max * 100, 0, 100)}%"></i></div>`;
  $("#status").innerHTML = `<div class="st day"><span class="k">Day</span><span class="v">${String(S.day).padStart(3, "0")}</span></div>` +
    bar("Hull", S.hull, 100) + bar("Fuel", S.fuel, ST.START.fuel) + bar("Supplies", S.sup, ST.START.sup);
}
function renderCrew() {
  $("#crew").innerHTML = CREW_IDS.map(id => {
    const c = S.crew[id], P = ST.CREW[id];
    const state = !c.alive ? "Lost" : c.gone ? "Stayed behind" : c.hp < 35 ? "Critical" : c.hp < 70 ? "Hurt" : "Fine";
    const t = c.trust, w = Math.abs(t) * 10;
    return `<article class="cm ${c.alive && !c.gone ? "" : "gone"}" data-id="${id}">
      <div class="pt">${ART.portrait(id, c.mood, c.alive && !c.gone ? "ok" : "gone")}</div>
      <div class="info"><h3>${esc(P.short)}</h3><div class="role">${esc(P.role)}</div>
        <div class="mood">${c.alive && !c.gone ? ART.MOOD_WORD[c.mood] || c.mood : ""}<span class="hs ${state === "Fine" ? "" : "bad"}">${state}</span></div>
        <div class="trust" title="Trust ${t > 0 ? "+" : ""}${t}"><span class="k">Trust</span><span class="tb"><i class="${t < 0 ? "neg" : "pos"}" style="width:${w}%;${t < 0 ? `right:50%` : `left:50%`}"></i></span></div>
      </div></article>`;
  }).join("");
  if (cur) document.querySelectorAll(".cm").forEach(el => el.classList.toggle("speaking", el.dataset.id === cur.who));
}
function pulse(id, dir) { setTimeout(() => { const el = document.querySelector(`.cm[data-id="${id}"]`); if (el) { el.classList.remove("up", "down"); void el.offsetWidth; el.classList.add(dir); } }, 30); }
function renderFile() {
  const slots = [{ route: ST.FRAGMENT.route, title: ST.FRAGMENT.title, lvl: legacy.veil }, ...ST.OTHER_ROUTES.map(r => ({ route: r.route, title: "???", lvl: null, locked: true }))];
  $("#file").innerHTML = slots.map(s => `<div class="fs ${s.lvl === "full" ? "full" : s.lvl ? "part" : ""}"><span class="r">${esc(s.route)}</span><span class="t">${s.lvl ? esc(s.title) + (s.lvl === "partial" ? " · partial" : s.lvl === "none" ? " · missing" : "") : s.locked ? "Uncharted" : "Not yet found"}</span></div>`).join("");
}

/* ── Sound: a low hum and soft blips, off until the player turns it on ── */
let ac = null, hum = null, sound = false;
function blip() { if (!sound || !ac) return; const o = ac.createOscillator(), v = ac.createGain(); o.type = "sine"; o.frequency.value = 880 + Math.random() * 220; v.gain.setValueAtTime(.02, ac.currentTime); v.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .08); o.connect(v).connect(ac.destination); o.start(); o.stop(ac.currentTime + .09); }
$("#snd").addEventListener("click", e => {
  sound = !sound; e.currentTarget.setAttribute("aria-pressed", String(sound)); e.currentTarget.textContent = sound ? "Sound on" : "Sound off";
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (sound && !hum) { hum = ac.createGain(); hum.gain.value = .025; [55, 55.4, 82.5].forEach(f => { const o = ac.createOscillator(); o.frequency.value = f; o.connect(hum); o.start(); }); hum.connect(ac.destination); }
    if (hum) hum.gain.setTargetAtTime(sound ? .025 : 0, ac.currentTime, .3);
  } catch (_) {}
});

/* ── Input ────────────────────────────── */
$("#line").addEventListener("click", () => { if (!choicesUp) next(); });
addEventListener("keydown", e => {
  if (!$("#ovEnd").hidden || !$("#ovTitle").hidden) return;
  if ((e.key === " " || e.key === "Enter") && !choicesUp && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); next(); }
  if (choicesUp && /^[1-9]$/.test(e.key)) { const b = document.querySelector(`#choices .ch[data-i="${+e.key - 1}"]`); if (b && !b.disabled) b.click(); }
});
$("#restart").addEventListener("click", () => { clearInterval(typing && typing.id); typing = null; ST.SCENES.forEach(s => (s.choices || []).forEach(c => delete c._used)); $("#ovTitle").hidden = false; });
$("#begin").addEventListener("click", newRun);

/* Boot: title card over the living viewport. */
S = { day: 0, hull: 100, fuel: ST.START.fuel, sup: ST.START.sup, flags: {}, crew: {} };
CREW_IDS.forEach(id => { S.crew[id] = { trust: ST.CREW[id].trust, hp: 100, alive: true, gone: false, mood: "calm" }; });
renderCrew(); renderStatus(); renderFile();
view.set("earth");
$("#runs").textContent = legacy.runs ? `Runs flown: ${legacy.runs}` : "";
})();
