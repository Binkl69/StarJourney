/* StarJourney — DATA
   Everything that isn't rules: rooms you can build, the sector map, derelicts to explore,
   hostile ships, terminal messages and logs. Tune the game here, not in console.js. */
window.DATA = (() => {

/* ── Rooms ──
   sys: the power fader this room adds to the console (null = passive room).
   Rooms marked fixed can't be demolished. cost/refund in SCRAP. */
const ROOMS = {
  bridge:  { name: "BRIDGE",       short: "BRG", fixed: true, desc: "You are here. Everything runs through this panel." },
  reactor: { name: "REACTOR",      short: "RCT", fixed: true, desc: "Makes the power. Push it too hard and it cooks." },
  engine:  { name: "ENGINES",      short: "ENG", fixed: true, sys: "eng", desc: "Charges the jump drive. More power, faster charge." },
  life:    { name: "LIFE SUPPORT", short: "LIF", fixed: true, sys: "life", desc: "Keeps the air breathable. Needs at least 1 power." },
  sensor:  { name: "SENSOR ARRAY", short: "SNS", sys: "sens", cost: 4, desc: "Reveals the map and lets the drone scan further." },
  drone:   { name: "DRONE BAY",    short: "DRN", sys: "drone", cost: 5, desc: "Launches a drone to explore wrecks. Power = drone battery." },
  shield:  { name: "SHIELD GEN",   short: "SHD", sys: "shd", cost: 6, desc: "Each power point is one shield layer in battle." },
  weapon:  { name: "WEAPON BAY",   short: "WPN", sys: "wpn", cost: 8, desc: "Mass driver. Power sets how fast it charges." },
  battery: { name: "BATTERY BANK", short: "BAT", cost: 5, desc: "Reactor can safely run 2 points hotter." },
  coolant: { name: "COOLANT LOOP", short: "CLT", cost: 4, desc: "Coolant switch sheds heat twice as fast." },
  cargo:   { name: "CARGO HOLD",   short: "CRG", cost: 3, desc: "Drone brings back 1 extra scrap from every find." },
};
const BUILDABLE = ["sensor", "drone", "shield", "weapon", "battery", "coolant", "cargo"];
const START_LAYOUT = ["bridge", "reactor", "engine", "life", null, null, null, null, null]; // 3 × 3 grid

const START = { hull: 20, fuel: 8, o2: 100, scrap: 10 };
const TUNE = {
  reactorMax: 8,          // reactor knob positions 0..8
  safeOutput: 5,          // above this the reactor heats up
  heatPerPoint: 2.2,      // heat/sec per point above safe
  coolantShift: 2,        // coolant raises the safe point by this (×2 with coolant loop)
  jumpCharge: 9,          // % per second per engine power point
  o2Drain: 1.6, o2Regen: .8,
  droneBattery: b => 40 + b * 25, droneMove: 3, droneScan: 6,
  weaponCharge: w => w * 11,     // % per second
  shieldRecharge: 3.2,           // seconds per layer
};

/* ── Sector 1: the map on the NAV scope ──
   x,y in 0..100. type decides what happens on arrival. */
const SECTOR = {
  name: "SECTOR 1 · KUIPER VERGE",
  nodes: [
    { id: "start",  x: 10, y: 55, type: "empty",    name: "DEPARTURE POINT" },
    { id: "a",      x: 28, y: 30, type: "derelict", name: "ORE HAULER 'MAGPIE'", map: "hauler" },
    { id: "b",      x: 30, y: 74, type: "rocks",    name: "ICE FIELD" },
    { id: "c",      x: 48, y: 50, type: "beacon",   name: "NAV BEACON 7" },
    { id: "d",      x: 52, y: 18, type: "hostile",  name: "UNKNOWN CONTACT", enemy: "scav" },
    { id: "e",      x: 60, y: 82, type: "station",  name: "RELAY STATION TESSERA", map: "station" },
    { id: "f",      x: 74, y: 40, type: "hostile",  name: "UNKNOWN CONTACT", enemy: "drone" },
    { id: "gate",   x: 92, y: 58, type: "gate",     name: "JUMP GATE" },
  ],
  links: [["start", "a"], ["start", "b"], ["a", "c"], ["b", "c"], ["a", "d"], ["c", "f"], ["b", "e"], ["e", "f"], ["d", "f"], ["f", "gate"], ["e", "gate"]],
  jumpCost: { default: 1, gate: 2 },
};

/* ── Derelicts to explore with the drone ──
   Maps are drawn as text. Legend:
   # wall   . floor   A airlock (drone starts here)   S scrap   F fuel   O oxygen
   L log (read in order)   X fire (drains drone battery)   T sentry turret (shoots if you pass it; SCAN jams it)   C data core
   K cassette tape (plays in the TAPE DECK) */
const MAPS = {
  hauler: {
    title: "ORE HAULER 'MAGPIE'", note: "Cargo hauler. Lost power 11 years ago. Crew manifest: 6.",
    grid: [
      "###########",
      "#S..#..L..#",
      "#.#.#.###.#",
      "#.#...#S..#",
      "#.###.#.#F#",
      "#A....X...#",
      "#.###.#.#.#",
      "#K.S#...#O#",
      "###########",
    ],
    logs: ["MAGPIE LOG 214: CAPTAIN SAYS THE SIGNAL IS JUST A PULSAR. PULSARS DON'T COUNT, CAPTAIN."],
    tape: "magpie",
  },
  station: {
    title: "RELAY STATION TESSERA", note: "Deep-space relay. Automated. Went dark the same week as the AURORA.",
    grid: [
      "#############",
      "#C..T...#..S#",
      "#.#####.#.#.#",
      "#K..S.#...#F#",
      "###.#.#####.#",
      "#L..#...X...#",
      "#.#####.###.#",
      "#A....S.#O..#",
      "#############",
    ],
    logs: ["TESSERA AUTO-LOG: RELAYING AURORA TRANSMISSION TO EARTH. CONTENT: A COUNT. 1. 2. 3. ... RELAY OVERLOADED AT 4,112."],
    tape: "tessera",
    core: "DATA CORE RECOVERED. AURORA'S LAST POSITION: INSIDE THE VEIL, 3 SECTORS SPINWARD. SHE WASN'T LOST. SHE WENT THERE ON PURPOSE.",
  },
};

/* ── Hostiles (seen on the radar) ── */
const ENEMIES = {
  scav:  { name: "SCAVENGER SKIFF", hull: 4, shields: 1, fireEvery: 5.5, dmg: 2, loot: { scrap: 6, fuel: 2 }, hail: "SCAVENGER: 'NICE SHIP. WE'LL TAKE IT.'" },
  drone: { name: "AUTOMATED PICKET", hull: 5, shields: 2, fireEvery: 4.2, dmg: 2, loot: { scrap: 8, fuel: 1 }, hail: "PICKET: 'THIS LANE IS CLOSED. THIS LANE IS CLOSED.'" },
};

/* ── Terminal text ── */
const ARRIVE = {
  empty:    "SECTOR QUIET. NOTHING ON SCOPE.",
  derelict: "DERELICT ON SCOPE. NO LIFE SIGNS. DRONE BAY REQUIRED TO BOARD.",
  station:  "ABANDONED STATION. DOCKING CLAMPS STILL ACTIVE. DRONE BAY REQUIRED TO BOARD.",
  rocks:    "ICE FIELD. HULL SCRAPES LIKELY. SCRAP AND WATER-ICE IN THE ROCKS.",
  beacon:   "NAV BEACON 7 STILL TRANSMITTING. ONE MESSAGE IN BUFFER.",
  hostile:  "CONTACT! WEAPONS LOCK DETECTED. SHIELDS UP.",
  gate:     "JUMP GATE ONLINE. NEXT STOP: SECTOR 2.",
};
const BEACON = "BEACON 7 BUFFER: '...MERIDIAN, IF YOU READ THIS, IT'S HALE. DON'T TRUST THE RELAYS. THE AURORA NEVER STOPPED TALKING. WE JUST STOPPED LISTENING.'";
const CREW = [
  "ADA: BOARD IS YOURS, CONTROL. KEEP HER BALANCED.",
  "WRENCH: REACTOR'S HAPPY UNDER FIVE. ABOVE FIVE SHE SULKS. ABOVE EIGHT SHE EXPLODES.",
  "LIN: LIFE SUPPORT NEEDS ONE POINT OF POWER. JUST ONE. PLEASE.",
];

/* ── Cassette tapes: found in wrecks, played in the TAPE DECK, read aloud by the ship's voice ── */
const TAPES = {
  hale: { label: "HALE · BEACON 7", lines: [
    "THIS IS DIRECTOR HALE. RECORDING ON THE BEACON BECAUSE I DON'T TRUST THE RELAYS ANY MORE.",
    "THE AURORA DIDN'T GO SILENT. SHE KEPT TRANSMITTING. A COUNT. ONE NUMBER EVERY NINE MINUTES.",
    "EARTH CALLED IT INTERFERENCE AND STOPPED LISTENING. I DIDN'T.",
    "IF YOU'RE HEARING THIS, MERIDIAN, THE COUNT IS STILL GOING. FIND OUT WHAT IT'S COUNTING TOWARD." ] },
  magpie: { label: "MAGPIE · CAPT. ORR", lines: [
    "CAPTAIN ORR, ORE HAULER MAGPIE. DAY FOUR HUNDRED AND SOMETHING.",
    "THE CREW WANT TO FOLLOW THE SIGNAL. I SAID NO. WE HAUL ROCKS, WE DON'T CHASE GHOSTS.",
    "THEY TOOK THE LIFEBOAT LAST NIGHT. ALL FIVE OF THEM. LEFT ME THE COFFEE.",
    "IF THE SIGNAL IS A GHOST, IT'S A VERY PATIENT ONE. IT KNOWS OUR NAMES." ] },
  tessera: { label: "TESSERA · RELAY AI", lines: [
    "RELAY STATION TESSERA. AUTOMATED MAINTENANCE LOG. NO HUMAN ACCESS FOR ELEVEN YEARS.",
    "INCOMING PACKET FROM AURORA. CONTENT: INTEGER SEQUENCE. INTENDED RECIPIENT: EARTH.",
    "PACKET CONTAINS A SECOND LAYER. SECOND LAYER IS ADDRESSED TO THE NEXT SHIP THAT ASKS.",
    "SECOND LAYER READS: YOU ARE LATE. WE SAVED YOU A SEAT. COME THROUGH THE VEIL." ] },
};

/* ── Incidents aboard: fires and hull breaches, handled from the SHIP screen ── */
const INCIDENTS = {
  fire:   { name: "FIRE",   fix: 4.5, spread: 14, hullEvery: 7, color: "#ff5a3c" },
  breach: { name: "BREACH", fix: 5.5, o2: 2.6,   color: "#9fd8ff" },
  ventO2: 14,          // air lost when you vent a room to space
  hitChance: .5,       // chance a hull hit also starts a fire or breach
};
const CREW_ABOARD = [
  { id: "ada",    tag: "A", name: "ADA",    home: "bridge",  fix: ["ADA: HANDLED. GET BACK TO WORK, CONTROL.", "ADA: DONE. THAT ONE WAS CLOSE."] },
  { id: "wrench", tag: "W", name: "WRENCH", home: "engine",  fix: ["WRENCH: FIXED IT! WITH TAPE. DON'T ASK.", "WRENCH: SHE'S HAPPY AGAIN. ISH."] },
  { id: "lin",    tag: "L", name: "LIN",    home: "life",    fix: ["LIN: CLEAR. NOBODY BURNED. THIS TIME.", "LIN: SEALED. EVERYONE DRINK WATER."] },
  { id: "priya",  tag: "P", name: "PRIYA",  home: "reactor", fix: ["PRIYA: SORTED. THE SIGNAL GOT LOUDER WHILE I WORKED.", "PRIYA: FIXED. CAN WE GO NOW?"] },
];

return { ROOMS, BUILDABLE, START_LAYOUT, START, TUNE, SECTOR, MAPS, ENEMIES, ARRIVE, BEACON, CREW, TAPES, INCIDENTS, CREW_ABOARD };
})();
