/* StarJourney — CONTENT for the cockpit game.
   Legs are stretches of space you fly through. Each has a look, hazards and pickups.
   Tuning numbers live here so the game can be balanced without touching flight.js. */
window.LEGS = (() => {

/* Colours: sky = nebula tint, fog = distance haze, sun = key light. */
const TYPES = {
  belt: {
    name: "Debris Belt", tag: "Heavy rocks · lots of salvage",
    sky: ["#1b0f08", "#7a3b16", "#e08a3c"], fog: "#1a0f0a", sun: "#ffb070",
    rocks: 1.6, fuel: .5, o2: .6, parts: 1.8, clouds: 0, wrecks: 0, flare: 0,
    comms: [["ada", "Rocks everywhere. Keep her nose clean, Captain."], ["wrench", "Every one of those orange crates is a spare part. Just saying."]],
  },
  giant: {
    name: "Gas Giant Skim", tag: "Fuel-rich · storm cells",
    sky: ["#081420", "#1d5b7a", "#e7c07a"], fog: "#0b1822", sun: "#ffe0a8", planet: { color: "#c98a4b", band: "#8a4f2a", size: 1 },
    rocks: .6, fuel: 2.2, o2: .5, parts: .6, clouds: 1.2, cloudColor: "#ff9a3c", wrecks: 0, flare: 0,
    comms: [["sol", "Atmospheric fuel scoops ready. Fly through the cyan canisters."], ["lin", "Storm cells are charged. Shields up if you go through them."]],
  },
  veil: {
    name: "The Veil", tag: "Low visibility · radiation",
    sky: ["#0c0518", "#4b1c86", "#e05cc8"], fog: "#150a26", sun: "#d7a6ff", fogNear: 60, fogFar: 380,
    rocks: .9, fuel: .8, o2: .8, parts: 1, clouds: 1.8, cloudColor: "#b25cff", wrecks: .3, flare: 0,
    comms: [["priya", "The signal's louder in here. Captain, do you hear the counting?"], ["sol", "Visibility under four hundred metres. Trust the scanner."]],
  },
  wrecks: {
    name: "Derelict Field", tag: "Wrecks to dodge · oxygen & parts",
    sky: ["#060a10", "#1f2f45", "#7aa4c8"], fog: "#0a0f16", sun: "#cfe4ff",
    rocks: .7, fuel: .7, o2: 1.6, parts: 1.6, clouds: 0, wrecks: 1.4, flare: 0,
    comms: [["wrench", "Old hulls. Old tanks. Some of them still have air in them."], ["ada", "Those wrecks don't move, but they don't give way either."]],
  },
  ice: {
    name: "Ice Ring", tag: "Fast small ice · oxygen-rich",
    sky: ["#04101a", "#1a5a7a", "#bff4ff"], fog: "#08161f", sun: "#e8fbff", planet: { color: "#7fb7d6", band: "#4f86a6", size: .8 },
    rocks: 1.3, rockColor: "#bfe6f5", small: true, fuel: .6, o2: 2, parts: .5, clouds: 0, wrecks: 0, flare: 0,
    comms: [["lin", "Ice means water. Water means air. Grab the white tanks."], ["ada", "They're small, but they're fast. Don't get cocky."]],
  },
  flare: {
    name: "Solar Flare Lane", tag: "Short route · solar flares",
    sky: ["#140806", "#6a1f0a", "#ffd27a"], fog: "#160a06", sun: "#fff0c0", star: true,
    rocks: .8, fuel: 1, o2: .7, parts: 1, clouds: 0, wrecks: 0, flare: 1, short: .75,
    comms: [["sol", "Flare activity high. When I call it, route power to shields."], ["wrench", "Shortest way to Halcyon. Also the sunniest. Wear a hat."]],
  },
};

/* The trip: 5 legs. At each waypoint you pick one of two lanes (except the last). */
const ROUTE = [
  { options: ["belt", "giant"] },
  { options: ["veil", "wrecks"] },
  { options: ["ice", "flare"] },
  { options: ["belt", "veil", "giant"], pick: 2 },
  { options: ["halcyon"] },
];
TYPES.halcyon = {
  name: "Halcyon Approach", tag: "Final approach",
  sky: ["#02080a", "#12463a", "#8ff0c8"], fog: "#061210", sun: "#eafff4", planet: { color: "#3f9f7a", band: "#2a6b8f", size: 1.6, final: true },
  rocks: 1, fuel: .5, o2: .6, parts: .4, clouds: .4, cloudColor: "#7fffc8", wrecks: .2, flare: 0,
  comms: [["ada", "There she is. Halcyon. Let's not crash on the doorstep."], ["hale", "Meridian, Control. We see you on final. Bring them home."]],
};

/* Between legs: one short story beat (secondary) and the workshop. */
const WAYPOINT_BEATS = [
  [["hale", "Meridian, Control. Telemetry looks rough. Whatever you're doing out there, keep doing it."], ["wrench", "Hale says hi. Hale also says don't break the ship. Too late, Hale."]],
  [["priya", "Captain, the Aurora went silent somewhere near here. I keep scanning for her."], ["lin", "Everyone's tired. Nobody's hurt. I'll take that."]],
  [["ada", "Halfway. I've flown worse. Not much worse, but worse."], ["sol", "Morale is holding. Air is holding. Hull is… holding-ish."]],
  [["wrench", "If we make it, I'm naming a moon after this ship. A small moon. A moon-ish rock."], ["priya", "The signal's changing, Captain. It's almost like it knows we're coming."]],
];

const UPGRADES = [
  { id: "plating",  name: "Hull plating",     desc: "+25 max hull, and repairs the hull fully.", cost: 4 },
  { id: "tank",     name: "Bigger fuel tank", desc: "+30 fuel capacity, filled on install.",     cost: 3 },
  { id: "scrubber", name: "CO₂ scrubbers",    desc: "Oxygen drains 30% slower.",                 cost: 3 },
  { id: "capacitor",name: "Power capacitor",  desc: "+1 power unit to route.",                   cost: 5 },
  { id: "o2",       name: "Refill oxygen",    desc: "Top up the oxygen tanks.",                  cost: 2, repeat: true },
];

const START = { hull: 100, fuel: 100, o2: 100, parts: 2, power: 6 };

/* Tuning */
const T = {
  legLength: 4200,        // metres of flying per leg
  speed: [30, 48, 62, 76, 90], // by engine power 0..4
  boost: 1.7,
  fuelUse: s => .08 + .06 * s,      // per second by engine power
  o2Use: l => .62 - .12 * l,        // per second by life-support power
  shieldCut: sh => Math.max(.15, 1 - .2 * sh),
  bounds: { x: 16, y: 9 },
};

return { TYPES, ROUTE, WAYPOINT_BEATS, UPGRADES, START, T };
})();
