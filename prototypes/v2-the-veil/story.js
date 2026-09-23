/* StarJourney — STORY (Route: The Veil)
   Everything a writer touches. The engine (engine.js) plays it; the art (art.js) paints it.

   Scene:  { id, place, backdrop, travel:{days,fuel,sup} | fn(g), lines:[Line], choices:[Choice], next }
   Line:   { who:"ada"|"wrench"|"lin"|"priya"|"sol"|"hale"|"narr", mood, text, if(g) }
           Lines spoken by crew who are dead or gone are skipped automatically.
   Choice: { text, hint (string|fn), if(g), locked:"reason", stay:true (conversation: stay in scene),
             do(g) -> [Line] (result lines), next:"sceneId" | fn(g) }

   g (the toolbox): g.trust(id[,n]) · g.hurt(id,n) · g.alive(id) · g.check(id, base) · g.roll(p)
                    g.res("hull"|"fuel"|"sup", n) · g.days(n) · g.flag(k) · g.set(k) · g.S (state)
*/
window.STORY = (() => {

const CREW = {
  ada:    { name:"Ada Okafor",   short:"Ada",    role:"Pilot · First Officer", trust:1 },
  wrench: { name:"Tomas \"Wrench\" Vey", short:"Wrench", role:"Engineer", trust:1 },
  lin:    { name:"Dr. Lin Sato", short:"Lin",    role:"Medic",   trust:1 },
  priya:  { name:"Priya Raman",  short:"Priya",  role:"Scientist", trust:0 },
};
const VOICES = {
  sol:  { name:"Sol", role:"Ship's AI" },
  hale: { name:"Director Hale", role:"Mission Control · Earth" },
};

const SCENES = [

// ── ACT ONE ─────────────────────────────────────────────
{ id:"launch", place:"High Earth orbit", backdrop:"earth",
  lines:[
    { who:"narr", text:"High Earth orbit. The Meridian hangs above the line where day becomes night. Four people and one AI aboard, pointed at a world none of them have ever seen." },
    { who:"hale", text:"Meridian, Control. You are go for Halcyon. Standard route, no detours. Bring them home, Captain. Well. Bring them there." },
    { who:"ada", mood:"calm", text:"Captain on the bridge. Board is green. Merry's ready when you are." },
    { who:"wrench", mood:"happy", text:"Reactor's warm, coffee's warm, and I only cried a little at the loading dock. Let's go." },
    { who:"lin", mood:"calm", text:"Everyone passed their physicals. Wrench barely." },
    { who:"priya", mood:"guarded", text:"…Sorry. Just looking at the route. Halcyon's signal is louder today." },
  ],
  choices:[
    { text:"Give the crew a speech.", hint:"They'd like that.",
      do:g => { ["ada","wrench","lin","priya"].forEach(id => g.trust(id, 1)); return [
        { who:"narr", text:"You keep it short. Something about coming home to somewhere new. Wrench starts clapping too early and doesn't stop." } ]; } },
    { text:"\"Take us out, Ada.\"", hint:"Ada respects brevity.",
      do:g => { g.trust("ada", 2); return [ { who:"ada", mood:"happy", text:"Aye, Captain. Taking us out." } ]; } },
    { text:"\"Priya, you've been staring at that signal for an hour. Why did you really volunteer?\"", hint:"She might not want to answer.",
      do:g => { g.set("asked_priya"); g.trust("priya", -1); return [
        { who:"priya", mood:"guarded", text:"Same reason as everyone. Science. Adventure. The dental plan." },
        { who:"narr", text:"She doesn't look away from the screen." } ]; } },
  ],
  next:"fork" },

{ id:"fork", place:"Beyond the Belt", backdrop:"fork", travel:{ days:18, fuel:8, sup:8 },
  lines:[
    { who:"narr", text:"Eighteen days out. Earth is just a bright star behind you now. Ahead, the charts split three ways." },
    { who:"sol", text:"Captain, we've reached the branch point. Three viable routes to Halcyon. I'd tell you my favourite, but I've been told that's unprofessional." },
    { who:"wrench", mood:"keen", text:"The Shallows. Trading posts the whole way. I know people out there." },
    { who:"lin", mood:"worried", text:"The Long Dark is empty. Empty is safe. I like safe." },
    { who:"priya", mood:"intense", text:"The Veil. Captain, the signal isn't coming from Halcyon. It's coming from inside that nebula." },
    { who:"ada", mood:"calm", text:"Control said standard route. The Veil isn't standard. Your call, Captain." },
  ],
  choices:[
    { text:"Into the Veil.", hint:"Priya's route. Strange, beautiful, dangerous.",
      do:g => { g.trust("priya", 2); g.trust("lin", -1); g.set("route_veil"); return [
        { who:"priya", mood:"happy", text:"Thank you. I mean it." },
        { who:"lin", mood:"worried", text:"I'm going to go count the bandages." } ]; },
      next:"veil1" },
    { text:"The Shallows.", locked:"Not yet charted. Coming in a future build." },
    { text:"The Long Dark.", locked:"Not yet charted. Coming in a future build." },
  ] },

// ── ACT TWO · THE VEIL ──────────────────────────────────
{ id:"veil1", place:"The Veil · outer layer", backdrop:"veil", travel:{ days:10, fuel:6, sup:5 },
  lines:[
    { who:"narr", text:"The Veil swallows the Meridian whole. Violet light pours through every window. The hull ticks as it cools in the charged dust." },
    { who:"wrench", mood:"awed", text:"Okay. Okay, I take back everything I said. This is gorgeous." },
    { who:"sol", text:"Sensors are degraded. Also, Captain, the receivers are picking up something that isn't static." },
    { who:"narr", text:"It plays over the bridge speakers: a woman's voice, calm and tired, counting. Four hundred and twelve. Four hundred and thirteen." },
    { who:"priya", mood:"scared", text:"…Turn it up." },
    { who:"lin", mood:"worried", text:"Priya, you've gone completely white." },
  ],
  choices:[
    { text:"\"Priya. Who is that?\"", hint:g => g.trust("priya") >= 2 ? "She might tell you now." : "She doesn't trust you enough yet.",
      do:g => {
        if (g.trust("priya") >= 2) { g.set("priya_confided"); g.trust("priya", 1); return [
          { who:"priya", mood:"sad", text:"Her name was Asha Raman. Dr. Asha Raman. Science officer on the Aurora." },
          { who:"priya", mood:"sad", text:"She's my mother, Captain. She's been counting for forty years." },
          { who:"narr", text:"Nobody on the bridge says anything for a long time." } ]; }
        g.trust("priya", -1); return [
          { who:"priya", mood:"guarded", text:"Nobody. A recording. Probably an old beacon." },
          { who:"lin", mood:"worried", text:"That was not nobody." } ]; } },
    { text:"Record it. Keep moving.", hint:"The sensible call.",
      do:g => { g.set("recorded"); return [
        { who:"sol", text:"Recording. For what it's worth, Captain, the count is still going up. It isn't a recording. It's live." } ]; } },
    { text:"Shut the receivers off.", hint:"The crew will sleep better. Priya won't forgive it.",
      do:g => { g.trust("priya", -2); g.trust("lin", 1); g.set("receivers_off"); return [
        { who:"narr", text:"The voice cuts out in the middle of a number." },
        { who:"priya", mood:"angry", text:"…Understood, Captain." },
        { who:"narr", text:"She leaves the bridge without another word." } ]; } },
  ],
  next:"static" },

{ id:"static", place:"The Veil · charge front", backdrop:"storm", travel:{ days:6, fuel:4, sup:3 },
  lines:[
    { who:"sol", text:"Charge front ahead. The dust is dumping static into the hull faster than we can bleed it off." },
    { who:"wrench", mood:"happy", text:"Hair's standing up. Everyone's hair. Lin, you look like a dandelion." },
    { who:"lin", mood:"annoyed", text:"Focus, Wrench." },
    { who:"ada", mood:"grim", text:"If that charge arcs through the reactor housing, we lose more than hair. Options, Captain." },
  ],
  choices:[
    { text:"Wrench grounds it by hand.", hint:"His job. His risk.", if:g => g.alive("wrench"),
      do:g => {
        if (g.check("wrench", .55)) { g.trust("wrench", 2); return [
          { who:"wrench", mood:"proud", text:"Grounded! The whole ship! Somebody write that down!" },
          { who:"ada", mood:"happy", text:"Noted, Mr. Vey." } ]; }
        g.hurt("wrench", 60); g.trust("wrench", -1); return [
          { who:"narr", text:"The arc throws Wrench the length of the corridor." },
          { who:"lin", mood:"worried", text:"He's breathing. Burns on both hands. He's going to be unbearable about the scars." } ]; } },
    { text:"Vent it through the hull.", hint:"The ship takes the hit.",
      do:g => { g.res("hull", -18); return [
        { who:"narr", text:"A bang like a cathedral bell. Scorch marks run the whole length of the spine." },
        { who:"wrench", mood:"sad", text:"Poor Merry." } ]; } },
    { text:"Power down and drift until it passes.", hint:"Slow. Cold. Safe.",
      do:g => { g.days(6); g.res("sup", -8); g.trust("lin", 1); return [
        { who:"narr", text:"Six days in the dark with the heaters off. Everyone sleeps in the galley, packed close for warmth. It's oddly nice." } ]; } },
  ],
  next:"aurora" },

{ id:"aurora", place:"The Veil · drift field", backdrop:"aurora", travel:{ days:8, fuel:5, sup:4 },
  lines:[
    { who:"sol", text:"Contact. Large. Not moving under its own power." },
    { who:"narr", text:"It comes out of the violet like the skeleton of a whale: a long spine, a broken ring, one red light still blinking after forty years." },
    { who:"ada", mood:"grim", text:"That's a Pathfinder-class hull. There were only ever three built." },
    { who:"priya", mood:"scared", text:"It's the Aurora." },
    { who:"wrench", mood:"worried", text:"…Nobody make a ghost joke. I'm serious. Nobody." },
  ],
  choices:[
    { text:"\"We're going aboard.\"", hint:"Priya needs this. So might we.",
      do:g => { g.trust("priya", 2); return []; }, next:"board" },
    { text:"Scan her from a distance.", hint:"Careful. Priya will want more.",
      do:g => { g.trust("priya", -1); g.set("scanned"); return []; }, next:"scan" },
    { text:"Leave her. We have our own mission.", hint:"Priya won't forgive this.",
      do:g => { g.trust("priya", -3); g.trust("lin", 1); g.set("left_aurora"); return [
        { who:"priya", mood:"angry", text:"She's RIGHT THERE." },
        { who:"ada", mood:"calm", text:"Captain's call, Priya." } ]; },
      next:"hale" },
  ] },

{ id:"board", place:"Aurora · crew deck", backdrop:"inside",
  lines:[
    { who:"narr", text:"Helmet lamps on. The Aurora's corridors are clean, frozen, and completely empty. No bodies. No damage. Just the smell of very old air." },
    { who:"lin", mood:"worried", text:"No remains anywhere. Forty years, and nobody died here?" },
    { who:"priya", mood:"intense", text:"Her cabin should be… here." },
    { who:"narr", text:"A narrow bunk. A photo taped to the wall: a little girl in a too-big space helmet, grinning. Priya doesn't say anything. She peels it off the wall and slides it inside her suit." },
    { who:"sol", text:"Captain, I've pulled the last log entry. Transcribing: \"Signal decoded. It is not a distress call. It is an invitation. All hands departing by shuttle for the source. We are not afraid.\"" },
    { who:"narr", text:"Something deep in the hull groans. Metal shifts. The Aurora is settling, and she is coming apart." },
    { who:"wrench", mood:"scared", text:"Captain, the frame's going. We need to be off this ship in five minutes." },
    { who:"narr", text:"Priya is still at the terminal, pulling data as fast as it will come." },
  ],
  choices:[
    { text:"\"Everyone out. Now.\"", hint:"Safe. Priya leaves the data behind.",
      do:g => { g.trust("priya", -1); g.trust("ada", 1); return [
        { who:"narr", text:"You drag her out by the suit handle. She doesn't fight you. She doesn't thank you either." } ]; } },
    { text:"Give Priya her five minutes.", hint:"Someone could get hurt.",
      do:g => { g.set("got_recorder");
        if (g.roll(.55 + g.trust("priya") * .04)) { g.trust("priya", 2); return [
          { who:"priya", mood:"happy", text:"Got it! The whole flight recorder!" },
          { who:"narr", text:"You tumble through the airlock with forty seconds to spare." } ]; }
        const who = g.alive("lin") ? "lin" : "priya"; g.hurt(who, 65); g.trust("priya", 1); return [
          { who:"narr", text:`A bulkhead tears loose on the way out. ${who === "lin" ? "Lin" : "Priya"} takes it across the back.` },
          { who:"priya", mood:"sad", text:"I've got the recorder. I'm sorry. I'm so sorry." } ]; } },
    { text:"Stay with her yourself. Send the others back.", hint:"You and Priya, alone on a dying ship.",
      do:g => { g.set("got_recorder"); g.set("captain_stayed"); g.trust("priya", 3); g.trust("ada", -1);
        if (g.roll(.35)) g.res("hull", -12);
        return [
          { who:"narr", text:"You stay. She works. Neither of you speaks until the terminal chimes." },
          { who:"priya", mood:"sad", text:"…Thank you, Captain. I won't forget this." } ]; } },
  ],
  next:"hale" },

{ id:"scan", place:"The Veil · drift field", backdrop:"aurora",
  lines:[
    { who:"sol", text:"Scan complete. No life signs. No remains. Four of her six shuttles are missing from their cradles." },
    { who:"priya", mood:"intense", text:"They left. They went somewhere. Deeper in." },
    { who:"sol", text:"Her beacon is looping a fragment of the final log: \"…is not a distress call. It is an…\" Then it cuts out." },
  ],
  next:"hale" },

{ id:"hale", place:"The Veil · deep layer", backdrop:"veil", travel:{ days:7, fuel:4, sup:4 },
  lines:[
    { who:"sol", text:"Transmission from Earth, Captain. Forty-one minutes old. It's Director Hale." },
    { who:"hale", text:"Meridian, Control. Your telemetry puts you inside the Veil. That is not your route and it is not your mission. You are ordered back to the standard lane. Acknowledge." },
    { who:"hale", text:"And, Mr. Vey. Two gentlemen came to the Center today asking where you were. Very polite. Anything you'd like to tell us?" },
    { who:"wrench", mood:"nervous", text:"…Ha. That's probably about a library book." },
    { who:"ada", mood:"dry", text:"It's not about a library book." },
    { who:"priya", mood:"intense", text:"Captain, the source is less than a week away. We are so close.", if:g => !g.flag("left_aurora") },
  ],
  choices:[
    { text:"\"Wrench. Talk to me. Now.\"", hint:"He's been carrying something.", stay:true, if:g => g.alive("wrench") && !g.flag("wrench_confessed"),
      do:g => { g.set("wrench_confessed"); g.trust("wrench", 2); return [
        { who:"wrench", mood:"sad", text:"I owe money. A lot of it. To people who don't send letters. I signed on because nobody can collect on Halcyon." },
        { who:"lin", mood:"sad", text:"…You could have told us." },
        { who:"wrench", mood:"sad", text:"Could have. Didn't. I'm telling you now." } ]; } },
    { text:"Acknowledge. Turn back to the standard lane.", hint:"By the book. The mystery stays a mystery.",
      do:g => { g.trust("ada", 1); g.trust("lin", 1); g.trust("priya", -3); g.set("obeyed"); return [
        { who:"ada", mood:"calm", text:"Acknowledged. Plotting a course out of the Veil." },
        { who:"priya", mood:"sad", text:"Forty years. And we're turning around." } ]; },
      next:"halcyon" },
    { text:"Ignore it. We go to the source.", hint:"Hale will be furious. Priya won't.",
      do:g => { g.trust("priya", 2); g.trust("ada", -1); g.set("defied"); return [
        { who:"ada", mood:"grim", text:"Logging that we received it. And that we didn't answer." } ]; },
      next:"core" },
    { text:"Tell Control our comms are damaged.", hint:"A lie. Ada will know.",
      do:g => { g.trust("ada", -2); g.trust("wrench", 1); g.set("lied"); return [
        { who:"ada", mood:"annoyed", text:"…Comms damaged. Sure. I'll log it." } ]; },
      next:"core" },
  ] },

// ── ACT THREE ───────────────────────────────────────────
{ id:"core", place:"The Veil · the source", backdrop:"core", travel:{ days:6, fuel:5, sup:4 },
  lines:[
    { who:"narr", text:"At the heart of the Veil, the dust clears into a vast, calm hollow. In the middle: rings of light, slowly turning, each one wider than the Meridian is long." },
    { who:"narr", text:"Four Aurora shuttles float at the edge of the rings, neatly parked. Their cabin lights are on." },
    { who:"sol", text:"Captain… the counting is coming from the rings. And there's more under it. Structure. Grammar. I think it's been waiting for someone to answer." },
    { who:"priya", mood:"intense", text:"I'm suiting up. Someone has to go out there, and it's going to be me." },
    { who:"lin", mood:"worried", text:"Not without a tether and a medic on the channel, you're not." },
    { who:"ada", mood:"calm", text:"Captain?" },
  ],
  choices:[
    { text:"\"Go, Priya. Find her.\"", if:g => g.alive("priya"),
      hint:g => g.trust("priya") >= 4 ? "She may not come back. She may not want to." : "Dangerous. She goes alone.",
      do:g => { g.set("core_contact");
        if (g.trust("priya") >= 4) { g.set("priya_stayed"); g.leave("priya"); return [
          { who:"narr", text:"She drifts toward the rings on a long silver tether. Halfway there, she unclips it." },
          { who:"priya", mood:"calm", text:"It's all right, Captain. She's here. They're all here. It isn't a place you leave. It's a place you arrive." },
          { who:"priya", mood:"happy", text:"Tell Wrench to pay his debts. Tell Lin I drank my water. Tell Ada she was right about everything." },
          { who:"narr", text:"The rings take her gently, like a hand closing." } ]; }
        if (g.roll(.6)) return [
          { who:"narr", text:"She reaches the inner ring and holds on. For three minutes, the channel is silent." },
          { who:"priya", mood:"scared", text:"I heard her, Captain. I heard her say my name." } ];
        g.hurt("priya", 100); return [
          { who:"narr", text:"The rings flare white. Her suit alarms scream across the channel." },
          { who:"lin", mood:"scared", text:"Pull her in! PULL HER IN!" },
          { who:"narr", text:"The tether comes back slack. There's nothing on the end of it but a frayed silver thread." } ]; } },
    { text:"\"I'm going with her.\"", if:g => g.alive("priya"), hint:"You'll see it with your own eyes.",
      do:g => { g.set("core_contact"); g.set("captain_eva"); g.trust("priya", 2); g.trust("ada", -1); return [
        { who:"narr", text:"Two tethers. Violet light on the visors. At the centre of the rings, the counting stops." },
        { who:"narr", text:"Something very old and very patient speaks, in Asha Raman's voice: Welcome. You took the long way." },
        { who:"priya", mood:"sad", text:"…Mum?" },
        { who:"narr", text:"The rings dim. The voice is gone. But Sol recorded those ten seconds, and they will keep scientists busy for a century." } ]; } },
    { text:"No one goes out. Take readings and leave.", hint:"Safe. Priya may never forgive you.",
      do:g => { g.trust("priya", -3); g.set("core_readings"); return [
        { who:"priya", mood:"angry", text:"She waited forty years, and we're taking READINGS." },
        { who:"narr", text:"Sol records everything it can. It's something. It isn't enough." } ]; } },
  ],
  next:"halcyon" },

{ id:"halcyon", place:"Halcyon orbit", backdrop:"halcyon",
  travel:g => g.flag("obeyed") ? { days:16, fuel:10, sup:9 } : { days:10, fuel:8, sup:6 },
  lines:[
    { who:"narr", text:"Halcyon fills the window: green, wrapped in white weather, and very much not calm." },
    { who:"sol", text:"Orbit achieved. Landing window opens in six hours." },
    { who:"lin", mood:"sad", text:"Four seats in the lander. Three of us.", if:g => g.flag("priya_stayed") },
    { who:"wrench", mood:"happy", text:"Nobody can collect on Halcyon. Nobody can collect on Halcyon. Nobody—", if:g => g.flag("wrench_confessed") },
    { who:"ada", mood:"calm", text:"Final call, Captain. How do we bring her down?" },
  ],
  choices:[
    { text:"\"Ada flies it. Straight in.\"", hint:"Fast. Trust your pilot.", if:g => g.alive("ada"),
      do:g => { if (g.check("ada", .55)) return [ { who:"narr", text:"A textbook burn. The Meridian kisses the atmosphere and glides home." } ];
        g.res("hull", -25); g.hurt(g.pickAlive(), 45); return [ { who:"narr", text:"Too steep. Fire on the windows, alarms everywhere, one very hard landing." } ]; } },
    { text:"Slow and careful. Burn the reserves.", hint:g => g.S.fuel >= 12 ? "Uses the last of the fuel." : "Not enough fuel to do it gently.",
      do:g => { if (g.S.fuel >= 12) { g.res("fuel", -12); return [ { who:"narr", text:"Slow, patient, perfect. Nobody breathes until touchdown." } ]; }
        g.res("hull", -15); return [ { who:"narr", text:"Not enough fuel to do it gently. The Meridian does it anyway, loudly." } ]; } },
  ],
  next:"END" },
];

/* Endings: first match wins. */
const ENDINGS = [
  { id:"lost",   when:g => g.S.hull <= 0, title:"Lost in the Veil",
    text:"The Meridian's hull gave out somewhere in the violet dark. Her last telemetry reached Earth forty-one minutes after she was gone." },
  { id:"stayed", when:g => g.flag("priya_stayed"), title:"The One Who Stayed",
    text:"Three of them land on Halcyon. The fourth found what she crossed the stars for, and she didn't come back. None of them are sure she was wrong." },
  { id:"book",   when:g => g.flag("obeyed"), title:"By the Book",
    text:"You followed orders and brought them in the long, safe way. Hale sends a commendation. Priya never mentions the Veil again, which says everything." },
  { id:"taken",  when:g => g.anyDead(), title:"What the Veil Took",
    text:"You found the source. You paid for it. Halcyon's first grave is marked with a ring of stones, and nobody can say whether it was worth it." },
  { id:"long",   when:g => g.flag("captain_eva") || g.flag("core_contact"), title:"The Long Way",
    text:"Everyone walks off the ship. You carry forty years of silence and ten seconds of answer, and Halcyon is louder than anyone expected." },
  { id:"all",    when:() => true, title:"All Hands",
    text:"Everyone makes it. Not everyone got what they came for. But they're here, and they're together, and that has to count for something." },
];

/* Epilogue lines per crew member. */
const EPILOGUE = {
  ada: g => !g.alive("ada") ? "Ada Okafor is buried facing the sky she flew through." :
    g.trust("ada") >= 3 ? "Ada files the landing report. Under 'Captain's conduct' she writes one word: Exemplary." :
    g.trust("ada") <= -1 ? "Ada requests a transfer to the survey fleet. She doesn't say why. She doesn't have to." :
    "Ada takes the first watch on Halcyon and doesn't complain once.",
  wrench: g => !g.alive("wrench") ? "Wrench's toolbox sits in the lander, untouched. Nobody can bring themselves to move it." :
    g.flag("wrench_confessed") ? "Wrench builds a workshop out of the lander's heat shield. The men who came asking never make the trip." :
    "Back on Earth, two polite men are still asking where Tomas Vey went.",
  lin: g => !g.alive("lin") ? "Lin Sato kept everyone alive except herself." :
    g.trust("lin") >= 3 ? "Lin opens Halcyon's first clinic and hangs your photo in the waiting room, slightly crooked." :
    "Lin sleeps for two days straight, then starts counting bandages again.",
  priya: g => g.flag("priya_stayed") ? "Priya Raman is somewhere past the rings, with her mother. The counting has stopped." :
    !g.alive("priya") ? "Priya never got to hear the end of the count." :
    g.flag("captain_eva") ? "Priya pins the photo of the girl in the too-big helmet above her new desk. She finally knows what her mother found." :
    g.flag("core_readings") || g.flag("obeyed") ? "Priya listens to the recording every night. She hasn't forgiven you. Maybe one day." :
    g.flag("got_recorder") ? "Priya spends a year decoding the Aurora's flight recorder. Every page brings her mother a little closer." :
    "Priya keeps the Veil in a folder marked 'Unfinished'.",
};

/* What this route reveals about Halcyon. Three routes = three pieces of the truth. */
const FRAGMENT = {
  route:"The Veil", title:"The Invitation",
  full:"The signal was never a distress call. Something at the heart of the Veil has been inviting people in for forty years, and the Aurora's crew said yes. They didn't die. They went somewhere else.",
  partial:"The Aurora's crew left their ship willingly and flew deeper into the Veil. Their last log calls the signal an invitation. An invitation to what, you never found out.",
  none:"You passed through the Veil and learned almost nothing. Somewhere behind you, the counting goes on.",
  level:g => (g.flag("core_contact") || g.flag("captain_eva")) ? "full" : (g.flag("got_recorder") || g.flag("scanned") || g.flag("core_readings") || g.flag("priya_confided")) ? "partial" : "none",
};
const OTHER_ROUTES = [
  { route:"The Shallows", tease:"Who really sent the Meridian, and why." },
  { route:"The Long Dark", tease:"What is already waiting on Halcyon." },
];

return { CREW, VOICES, SCENES, ENDINGS, EPILOGUE, FRAGMENT, OTHER_ROUTES,
  START:{ scene:"launch", hull:100, fuel:60, sup:50 } };
})();
