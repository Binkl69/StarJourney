/* StarJourney — CONTENT
   Everything a writer touches lives here: crew, loadouts, event cards, crises, endings.
   The engine (game.js) never needs to change to add a new card.

   Event card shape:
     id, title, tags (node types it can appear at, or "any"), once (default true), weight,
     when(ctx)   -> bool   optional condition for the card to be dealt
     setup(ctx)  -> object optional; picks who/what the card is about, stored as ctx.v
     text(ctx)   -> string
     choices: [{ label, hint, req(ctx)->bool optional, go(ctx)->string outcome }]

   ctx helpers (see game.js):
     ctx.S (state), ctx.roll(p), ctx.pick(arr), ctx.alive(), ctx.role("medic") -> crew|null,
     ctx.check("pilot", base) -> bool (skill check), ctx.hurt(c, n), ctx.stress(c|"all", n),
     ctx.res("fuel"|"sup"|"hull"|"parts", delta), ctx.days(n), ctx.sys(name[,state]),
     ctx.discover(text), ctx.first(c), ctx.avgStress(), ctx.shuffle(arr)
     ctx.flag(k) reads a story flag; ctx.set(k) sets one.
*/
window.SJ = (() => {

const ROSTER = [
  { id:"okafor", name:"Cmdr. Ada Okafor", first:"Ada",   role:"pilot",     stress:15, line:"Merry flies straight when you let her." },
  { id:"vey",    name:"Tomas \"Wrench\" Vey", first:"Wrench", role:"engineer", stress:30, line:"If it rattles, it's working." },
  { id:"sato",   name:"Dr. Lin Sato",     first:"Lin",   role:"medic",     stress:15, line:"Everyone drink water. That's an order." },
  { id:"raman",  name:"Priya Raman",      first:"Priya", role:"scientist", stress:25, line:"I named a dust grain. Don't tell Ada." },
  { id:"kell",   name:"Jonah Kell",       first:"Jonah", role:"engineer",  stress:40, line:"I read the manual. Twice. It didn't help." },
  { id:"hollis", name:"Bex Hollis",       first:"Bex",   role:"pilot",     stress:10, line:"Odds are just numbers that haven't met me." },
];

const LOADOUTS = [
  { id:"light",    name:"Fast & light", desc:"Extra fuel, thin supplies. Race the clock.",       fuel:95, sup:56, parts:2 },
  { id:"balanced", name:"Balanced",     desc:"A bit of everything. Nothing to spare.",           fuel:82, sup:68, parts:3 },
  { id:"heavy",    name:"Hauler",       desc:"Full larder and spares. Slow, thirsty engines.",   fuel:72, sup:82, parts:5 },
];

const EVENTS = [
  // ── Derelicts ──────────────────────────────
  { id:"pod", title:"The Knocking Pod", tags:["derelict"],
    setup: c => ({ eng: c.role("engineer") || c.pick(c.alive()) }),
    text: c => `${c.first(c.v.eng)} found a sealed cryo pod in the derelict's hold. Something inside is knocking. Slowly. Politely.`,
    choices: [
      { label:"Open it", hint:"Risky · crew", go: c => {
          if (c.roll(.5)) { c.set("charts"); return "A half-frozen navigator named Nadia climbs out, thanks everyone, and hands over her star charts before falling asleep for two days."; }
          c.hurt(c.v.eng, 55); c.stress("all", 10); return `The pod vents something caustic. ${c.first(c.v.eng)} takes it full in the face. Nobody is opening pods again.`; } },
      { label:"Scan it first", hint:"+2 days · needs scientist", req: c => !!c.role("scientist"), go: c => {
          c.days(2); c.set("charts"); return `${c.first(c.role("scientist"))} confirms a live human. The navigator, Nadia, is grateful and gives you her star charts.`; } },
      { label:"Space it", hint:"Crew stress", go: c => {
          c.set("spaced_pod"); c.stress("all", 15); return "The pod tumbles away into the dark. The knocking stops being audible. Everyone keeps hearing it anyway."; } },
    ] },
  { id:"salvage", title:"Salvage Rights", tags:["derelict"],
    text: () => "The derelict's machine shop is mostly intact. Stripping it properly would take time.",
    choices: [
      { label:"Strip it bare", hint:"+3 parts · +4 days", go: c => { c.res("parts", 3); c.days(4); return "Three crates of good parts and one crate of mystery parts. Whoever opens the mystery crate first gets to name it."; } },
      { label:"Grab what's easy", hint:"+1 part", go: c => { c.res("parts", 1); return "In and out in an hour. One useful coupling, one very old sandwich."; } },
      { label:"Leave it", hint:"Nothing", go: () => "Some ships should be left alone." },
    ] },
  { id:"logs", title:"Captain's Last Log", tags:["derelict"],
    text: () => "The derelict's final log is still playing on loop: a captain arguing with her crew about turning back.",
    choices: [
      { label:"Listen to the end", hint:"Stress · maybe useful", go: c => { c.stress("all", 8); c.set("warned"); return "She turned back. She shouldn't have. Her last words are coordinates for a storm to avoid. Noted."; } },
      { label:"Switch it off", hint:"Nothing", go: () => "Some stories are better left unfinished." },
    ] },

  // ── Nebulae ────────────────────────────────
  { id:"static", title:"Static in the Walls", tags:["nebula"],
    setup: c => ({ eng: c.role("engineer") }),
    text: () => "The nebula's charge is building up in the hull. Every surface crackles. Hair is doing things.",
    choices: [
      { label:"Vent it through the hull", hint:"−8 hull", go: c => { c.res("hull", -8); return "A bang like a cathedral bell. Charge gone, a few plates scorched."; } },
      { label:"Ground it by hand", hint:"Engineer check", req: c => !!c.v.eng, go: c => {
          if (c.check("engineer", .55)) return `${c.first(c.v.eng)} walks the grounding cable through the whole ship. Perfect. Insufferable about it, but perfect.`;
          c.hurt(c.v.eng, 40); return `${c.first(c.v.eng)} gets thrown across the corridor. Alive. Eyebrows not.`; } },
      { label:"Power down and wait", hint:"+5 days", go: c => { c.days(5); return "Five days of cold, dark quiet while the charge bleeds off."; } },
    ] },
  { id:"lights", title:"Pretty Lights", tags:["nebula"],
    text: () => "The nebula is glowing violet and gold outside the observation port. The crew keeps drifting over to look.",
    choices: [
      { label:"Take an evening off", hint:"+2 days · less stress", go: c => { c.days(2); c.stress("all", -18); return "Blankets, bad tea, the most beautiful thing any of them have ever seen. Nobody talks about Halcyon for a whole night."; } },
      { label:"Keep to schedule", hint:"Slight stress", go: c => { c.stress("all", 5); return "Shutters down. Work continues. Someone draws the nebula on a whiteboard anyway."; } },
    ] },

  // ── Planets ────────────────────────────────
  { id:"ice", title:"Ice World", tags:["planet"],
    text: () => "A small frozen world. The spectrometer says the surface is almost pure water ice.",
    choices: [
      { label:"Land the shuttle and harvest", hint:"−6 fuel · +25 supplies · small risk", go: c => {
          c.res("fuel", -6); c.res("sup", 25);
          if (c.roll(.25)) { c.res("hull", -6); return "Full tanks of water and a hard landing on the way back up. Worth it."; }
          return "Clean ice, full tanks. The water tastes like nothing, which is the best thing water can taste like."; } },
      { label:"Survey from orbit", hint:"+1 day · discovery · needs scientist", req: c => !!c.role("scientist"), go: c => {
          c.days(1); c.discover("Subsurface ocean on an unnamed ice world"); return `${c.first(c.role("scientist"))} finds an ocean under the ice. She's been smiling for a day straight.`; } },
      { label:"Fly past", hint:"Nothing", go: () => "It shrinks behind you, glittering." },
    ] },
  { id:"sling", title:"Slingshot", tags:["planet"],
    text: () => "A gas giant sits right on your line. A tight gravity assist would save time and fuel, if the pilot threads it.",
    choices: [
      { label:"Tight line", hint:"Pilot check · big reward", go: c => {
          if (c.check("pilot", .45)) { c.days(-6); c.res("fuel", 6); return "Merry whips around the giant like a stone from a sling. Six days saved. Someone cheers over the intercom."; }
          c.res("hull", -15); c.stress("all", 10); return "Too deep. Atmospheric buffeting tears off an antenna and most of everyone's composure."; } },
      { label:"Safe line", hint:"Small gain", go: c => { c.res("fuel", 2); return "A gentle, boring, perfect assist."; } },
    ] },

  // ── Trade posts ────────────────────────────
  { id:"nail", title:"The Rusty Nail", tags:["trade"], once:false, weight:3,
    text: () => "A trading post built out of three dead ships welded together. The owner, a man called Dace, is already smiling at your cargo.",
    choices: [
      { label:"Trade 2 parts for fuel", hint:"−2 parts · +20 fuel", req: c => c.S.parts >= 2, go: c => { c.res("parts", -2); c.res("fuel", 20); return "Dace's fuel smells wrong but burns right."; } },
      { label:"Trade 2 parts for food", hint:"−2 parts · +22 supplies", req: c => c.S.parts >= 2, go: c => { c.res("parts", -2); c.res("sup", 22); return "Real vegetables. Actual, crunchy vegetables."; } },
      { label:"Take a loan", hint:"+25 fuel · you'll owe", req: c => !c.flag("debt"), go: c => { c.res("fuel", 25); c.set("debt"); return "Dace is happy to help. Dace is always happy to help. Dace has your transponder code now."; } },
      { label:"Move on", hint:"Nothing", go: () => "Dace waves goodbye. It feels like a promise." },
    ] },

  // ── Anomalies ──────────────────────────────
  { id:"echo", title:"The Echo", tags:["anomaly"],
    text: () => "Comms picks up a message in your own voice, stamped nine days from now: \"Don't trust the quiet.\"",
    choices: [
      { label:"Study it", hint:"+4 days · discovery · needs scientist", req: c => !!c.role("scientist"), go: c => {
          c.days(4); c.discover("A signal that arrived before it was sent"); c.set("warned"); return "It's real, it's you, and it breaks physics in at least two ways. Priya is writing furiously."; } },
      { label:"Heed it", hint:"Be ready", go: c => { c.set("warned"); c.stress("all", 5); return "Everyone sleeps in their boots for a while."; } },
      { label:"Ignore it", hint:"Nothing", go: () => "Probably a reflection. Probably." },
    ] },
  { id:"slip", title:"Time Slip", tags:["anomaly"],
    text: () => "Every clock on board disagrees. The ship's chronometer, the crew's watches and Sol are all arguing about what day it is.",
    choices: [
      { label:"Trust the stars", hint:"Gamble · days", go: c => {
          if (c.roll(.5)) { c.days(-7); return "Star positions say you've gained a week. Nobody can explain it, so nobody tries."; }
          c.days(9); c.stress("all", 8); return "You've lost nine days. Nobody remembers them. That's the worrying part."; } },
      { label:"Trust Sol", hint:"Safe", go: c => { c.days(1); return "Sol picks a day with total confidence. You go with it."; } },
    ] },

  // ── Anywhere ───────────────────────────────
  { id:"meteors", title:"Micrometeoroid Shower", tags:["any"], weight:2,
    text: c => `Proximity alarm. A cloud of gravel is crossing your path at 30 km/s. ${c.sys("shields")==="ok" ? "Shields are up." : "Shields are down."}`,
    choices: [
      { label:"Push through", hint: c => c.sys("shields")==="ok" ? "−5 hull" : "−18 hull", go: c => {
          c.res("hull", c.sys("shields")==="ok" ? -5 : -18); return "It sounds like rain on a tin roof. Rain made of bullets."; } },
      { label:"Hide behind the cargo spine", hint:"+3 days · −3 hull", go: c => { c.days(3); c.res("hull", -3); return "Slow and safe. The cargo spine looks like it lost a fight."; } },
    ] },
  { id:"fever", title:"Fever", tags:["any"], when: c => c.alive().length >= 2,
    setup: c => ({ sick: c.pick(c.alive()) }),
    text: c => `${c.first(c.v.sick)} is running 39.8° and getting worse.`,
    choices: [
      { label:"Treat it", hint:"Medic check", req: c => !!c.role("medic") && c.role("medic") !== c.v.sick, go: c => {
          if (c.check("medic", .6)) return `${c.first(c.role("medic"))} catches it early. ${c.first(c.v.sick)} is complaining about the food again by morning.`;
          c.hurt(c.v.sick, 25); return "Treatment helps, eventually. It's a rough week."; } },
      { label:"Quarantine", hint:"−8 supplies · stress", go: c => { c.res("sup", -8); c.stress("all", 6); c.hurt(c.v.sick, 10); return "Separate rations, separate air. Lonely, but contained."; } },
      { label:"Ride it out", hint:"Risky · crew", go: c => { if (c.roll(.5)) { c.hurt(c.v.sick, 55); return `${c.first(c.v.sick)} nearly doesn't make it.`; } return "It breaks on day three. Lucky."; } },
    ] },
  { id:"fever2", title:"Cabin Fever", tags:["any"], when: c => c.alive().length >= 2 && c.avgStress() > 45,
    setup: c => { const [a,b] = c.shuffle(c.alive()); return { a, b }; },
    text: c => `${c.first(c.v.a)} and ${c.first(c.v.b)} had a screaming match about whose turn it was to clean the CO₂ filters. It's not really about the filters.`,
    choices: [
      { label:"Mediate", hint:"Medic helps", go: c => { const m = c.role("medic"); c.stress(c.v.a, m ? -25 : -10); c.stress(c.v.b, m ? -25 : -10); return m ? `${c.first(m)} sits them down. Tears. Hugs. A new filter rota.` : "An awkward talk. It helps a bit."; } },
      { label:"Movie night", hint:"−5 supplies · less stress", go: c => { c.res("sup", -5); c.stress("all", -12); return "Everyone watches a terrible old film together. It fixes more than it should."; } },
      { label:"Let them sort it out", hint:"Risky", go: c => { if (c.roll(.5)) { c.hurt(c.v.a, 15); c.hurt(c.v.b, 15); return "They sort it out. With fists. Then they share a bag of ice."; } return "They don't talk for a week. Then they do."; } },
    ] },
  { id:"bday", title:"Birthday", tags:["any"], when: c => c.S.sup > 30,
    setup: c => ({ who: c.pick(c.alive()) }),
    text: c => `It's ${c.first(c.v.who)}'s birthday. Sol has reminded everyone eleven times.`,
    choices: [
      { label:"Bake something", hint:"−6 supplies · less stress", go: c => { c.res("sup", -6); c.stress("all", -20); return "It's technically a cake. There is a candle. Nobody lights it because of the oxygen."; } },
      { label:"No time", hint:"Stress", go: c => { c.stress(c.v.who, 15); return "Nobody says anything. That's worse."; } },
    ] },
  { id:"sol", title:"Sol Has a Question", tags:["any"],
    text: () => "Sol, during the night shift: \"Control, a question. When I run the crew's simulations, I've started to worry about them. Is that a malfunction?\"",
    choices: [
      { label:"No. That's caring.", hint:"Something changes", go: c => { c.set("ai_awake"); return "A long pause. \"Thank you, Control.\" The ship feels different after that. Warmer."; } },
      { label:"Yes. Run a diagnostic.", hint:"Nothing", go: c => { c.set("ai_tool"); return "\"Understood.\" The diagnostic comes back clean. Sol doesn't ask again."; } },
    ] },
  { id:"quiet", title:"The Quiet", tags:["unknown","any"],
    text: () => "Nothing on sensors. Nothing on comms. No stars in one direction, for a while. Just the hum.",
    choices: [
      { label:"Log it and keep going", hint:"Stress", go: c => { c.stress("all", c.flag("warned") ? 2 : 10); return c.flag("warned") ? "You were warned about the quiet. Everyone stays sharp. Nothing happens." : "Nothing happens. Nobody sleeps."; } },
      { label:"\"Sol, sing something.\"", hint:"Less stress", go: c => { c.stress("all", -6); return "Sol sings an old sea shanty, badly, with total commitment."; } },
    ] },

  // ── Story payoffs (conditions on flags) ──────
  { id:"knock2", title:"Knocking Again", tags:["any"], when: c => c.flag("spaced_pod"),
    text: () => "At 03:00, every crew member wakes up at once. There's a slow, polite knocking on the outer hull.",
    choices: [
      { label:"Check the airlock camera", hint:"Stress", go: c => { c.stress("all", 15); return "Nothing there. The knocking stops. The log shows it lasted exactly as long as it did on the pod."; } },
      { label:"Tell everyone it's thermal creaking", hint:"Small stress", go: c => { c.stress("all", 6); return "Nobody believes you, but everyone is grateful you said it."; } },
    ] },
  { id:"charts", title:"Nadia's Charts", tags:["any"], when: c => c.flag("charts") && !c.flag("charts_used"),
    text: () => "Nadia wakes up and looks at your route. \"Oh, you don't want to go that way. There's a shortcut.\"",
    choices: [
      { label:"Take the shortcut", hint:"−8 days", go: c => { c.set("charts_used"); c.days(-8); return "It's real. Eight days saved. Nadia goes back to sleep, satisfied."; } },
    ] },
  { id:"dace", title:"Dace Wants His Money", tags:["any"], when: c => c.flag("debt") && !c.flag("debt_paid"),
    text: () => "A fast little ship pulls alongside. \"Dace says hi,\" says a voice. \"Dace says pay up.\"",
    choices: [
      { label:"Pay in parts", hint:"−3 parts", req: c => c.S.parts >= 3, go: c => { c.res("parts", -3); c.set("debt_paid"); return "They take the parts and wave. Friendly, in a threatening way."; } },
      { label:"Pay in fuel", hint:"−20 fuel", go: c => { c.res("fuel", -20); c.set("debt_paid"); return "They siphon it straight out of the tanks. Painful."; } },
      { label:"Outrun them", hint:"Pilot check", go: c => { if (c.check("pilot", .5)) { c.set("debt_paid"); return "Merry has more in her than anyone thought. They give up."; } c.res("hull", -20); return "They put three holes in the cargo spine before giving up."; } },
    ] },
  { id:"chair", title:"The Empty Chair", tags:["any"], when: c => c.S.crew.some(m => !m.alive),
    setup: c => ({ dead: c.S.crew.find(m => !m.alive) }),
    text: c => `Nobody sits in ${c.first(c.v.dead)}'s chair at dinner.`,
    choices: [
      { label:"Hold a service", hint:"+2 days · less stress", go: c => { c.days(2); c.stress("all", -12); return "Stories, some laughter, a lot of quiet. The chair stays empty, but it's easier to look at."; } },
      { label:"Keep moving", hint:"Stress", go: c => { c.stress("all", 12); return "Nobody talks about it. It follows everyone around the ship."; } },
    ] },
];

/* Crises: a timed power-routing decision. You have a few power units; each system you don't power suffers. */
const CRISES = [
  { id:"breach", title:"Hull breach · Section 4", text:"Pressure dropping. You can't keep everything running.",
    systems:[
      { id:"bulk",  name:"Emergency bulkheads", miss:"−20 hull, a crew member caught in the section", go: c => { c.res("hull", -22); c.hurt(c.pick(c.alive()), 50); } },
      { id:"life",  name:"Life support",        miss:"−12 supplies, crew stress", go: c => { c.res("sup", -12); c.stress("all", 12); } },
      { id:"eng",   name:"Engines",             miss:"Engines damaged",           go: c => { c.sys("engines", "damaged"); } },
      { id:"sens",  name:"Sensors",             miss:"Sensors damaged",           go: c => { c.sys("sensors", "damaged"); } },
    ] },
  { id:"surge", title:"Reactor surge", text:"Core temperature spiking. Shed load or lose something.",
    systems:[
      { id:"cool",  name:"Coolant pumps", miss:"−15 hull, radiation stress", go: c => { c.res("hull", -18); c.stress("all", 18); } },
      { id:"shld",  name:"Shields",       miss:"Shields damaged",            go: c => { c.sys("shields", "damaged"); } },
      { id:"life",  name:"Life support",  miss:"Life support damaged",       go: c => { c.sys("life", "damaged"); } },
      { id:"cryo",  name:"Food cryo",     miss:"−18 supplies spoil",         go: c => { c.res("sup", -18); } },
    ] },
  { id:"fire", title:"Fire in the hab ring", text:"Smoke in two modules. Fire suppression and air scrubbing are both power-hungry.",
    systems:[
      { id:"supp",  name:"Fire suppression", miss:"A crew member badly burned", go: c => { c.hurt(c.pick(c.alive()), 60); } },
      { id:"scrub", name:"Air scrubbers",    miss:"Everyone breathes smoke",    go: c => { c.alive().forEach(m => c.hurt(m, 18)); } },
      { id:"eng",   name:"Engines",          miss:"Engines damaged",            go: c => { c.sys("engines", "damaged"); } },
      { id:"store", name:"Stores bay",       miss:"−2 parts burned",            go: c => { c.res("parts", -2); } },
    ] },
];

/* Endings are checked top to bottom; first match wins. */
const ENDINGS = [
  { id:"lost",     when: s => s.hull <= 0, title:"Lost in the Dark",
    text: s => "The Meridian's hull gave out somewhere between the stars. Her last telemetry packet reached Earth forty minutes after she was gone." },
  { id:"alone",    when: s => s.crew.every(m => !m.alive), title:"Merry Arrives Alone",
    text: s => s.flags.ai_awake ? "The ship reaches Halcyon with no one aboard but Sol, who lands carefully and plants the crew's names in the soil first." : "The ship reaches orbit on autopilot. Nobody answers when Halcyon calls." },
  { id:"heroes",   when: s => s.crew.filter(m=>m.alive).length === s.crew.length && s.hull >= 60, title:"Heroes of the Drift",
    text: s => "Every one of them walks off the ship. Halcyon is loud and green and nothing like the name promised. It's perfect." },
  { id:"quiet",    when: s => s.crew.filter(m=>m.alive).length >= 3, title:"The Quiet Arrival",
    text: s => "They land, a little bruised, a little older. They don't talk about all of it. They don't need to." },
  { id:"skeleton", when: s => true, title:"Skeleton Crew",
    text: s => "What's left of the crew brings Merry down on Halcyon. They carry the others' names with them." },
];

return { ROSTER, LOADOUTS, EVENTS, CRISES, ENDINGS, TARGET_DAY: 140, JUMPS: 8 };
})();
