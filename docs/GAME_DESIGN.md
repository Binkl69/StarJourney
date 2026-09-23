# StarJourney — Game Design (v0.1, draft)

> Status: **Plan approved → Tasks stage.** Brainstorm → **Plan** → Tasks → Build.
> This doc is the single source of truth for what we're building. Change it before changing code.

---

## 1. One-line pitch

**Guide one ship on one long journey to a distant world — from Mission Control. Every run takes a different path, tells a different story, and ends with a different ship, crew and landing.**

Think *The Oregon Trail* × *FTL* × *80 Days*, seen entirely through a glowing NASA-style mission control dashboard.

## 2. How the two ideas merge

| Your idea (story journey) | My idea (Flight Director loop) | Merged |
|---|---|---|
| One journey, same destination | Short repeatable missions | **One run = one full journey** (~20–30 min) |
| Multiple paths | Plan the mission | **Branching route map** — pick your next waypoint |
| Stories unfold, decisions matter | Crises you triage | **Events** at each waypoint: story choices *and* system crises |
| Arrival: how intact, when, who lands | Success/fail → rewards | **Arrival report** scores the run and unlocks new content |

The destination is fixed. The **journey is the variable.** That's what makes it replayable.

## 3. Design pillars (the rules we judge every feature by)

1. **The dashboard *is* the game.** Every panel shows something you act on. No decorative-only screens.
2. **Every choice costs something.** No free "right answer" — trade fuel vs. time vs. crew vs. hull.
3. **Short runs, long memory.** A run is one sitting; unlocks and crew legacies carry between runs.
4. **Stories from systems, not scripts.** The story emerges from small, reusable event cards reacting to your state — not a giant hand-written tree.
5. **Indie-sized.** Browser-first, no engine, playable from a link. If a feature needs a big team, cut it.

## 4. The core loop

```
 ┌─► PREPARE ──► TRAVEL ──► EVENT ──► (repeat TRAVEL/EVENT) ──► ARRIVAL ──► LEGACY ─┐
 │   pick crew,   choose     story or     ~10–15 waypoints        who lands,   unlocks, │
 │   ship,cargo   next node  crisis                               ship state,  new crew,│
 │                on map     choice                               score        new events
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

### Inside one run
- **Prepare:** choose 4 crew from a roster, a ship frame, and a limited cargo budget (fuel, food/O₂, spare parts, research probes).
- **Travel:** a star map with branching lanes (like *Slay the Spire*'s map). Each node shows a type icon: nebula, derelict, planet, anomaly, trade post, "unknown". Travel burns fuel and time.
- **Event:** a card appears on the comms panel. You pick 2–4 responses. Outcomes change resources, crew stats/relationships, ship systems, and can set **story flags** that trigger later events.
- **Crisis (sometimes):** a real-time-ish triage moment — e.g. hull breach: reroute power between life support, engines and shields before a timer runs out. This is the "Flight Director" feel.
- **Arrival:** the ISV *Meridian* reaches **Halcyon**. The run is graded on:
  - **Who lands** (surviving crew, their state, their story arcs)
  - **Ship integrity** (hull, systems)
  - **When** (days elapsed — early, on time, late)
  - **What you bring** (cargo, discoveries)
  Different combos produce different **ending cards** ("The Quiet Arrival", "Skeleton Crew", "Heroes of the Drift"…).

### Between runs (the "endless" part)
- **Legacy points** unlock new crew, ship frames, route regions and event decks.
- **Discovered events** fill a logbook (collection hook).
- **Crew memories:** a crew member who survived a run can return with a trait earned on it.

## 5. Core systems (kept deliberately small)

| System | What it tracks | Shown on panel |
|---|---|---|
| **Resources** | Fuel, O₂/food, spare parts, credits | Gauges + trend graphs |
| **Ship** | Hull %, 4 systems (engines, life support, shields, comms) each OK/damaged/offline | Schematic with status lights |
| **Crew** (4) | Health, stress, one skill (pilot/engineer/medic/scientist), 1–2 traits, relationships | Crew roster cards with vitals |
| **Time** | Mission day counter vs. target arrival | Mission clock |
| **Story flags** | Hidden facts set by choices ("smuggler_debt", "ai_awake") | Mission log |

### Why "event cards with conditions" (the key technical decision)
A hand-written branching story is like a **choose-your-own-adventure book**: every choice doubles the pages, and you run out of writing budget fast.

Instead we use a **deck of event cards**, each with *conditions* ("only appears if a medic is alive and O₂ < 30%") and *effects*. The game shuffles in whichever cards fit your current situation. It's like a **good DJ** — a finite record collection, but the set is different every night because it reacts to the crowd.

Result: 60 well-written cards can produce thousands of distinct journeys. Adding content = adding a card to a data file, no new code.

## 6. Look & feel

- Dark mission-control dashboard, monospace readouts, glowing accent colours, subtle scanlines, live-updating graphs and blinking status lights (to be matched to the reference page once we have a screenshot/code).
- Main layout (desktop): **star map** centre, **ship schematic** left, **crew roster** right, **comms/event panel** bottom, **mission clock + resources** top bar.
- Mobile: same panels as swipeable tabs.
- Sound (later): radio chatter beeps, alarm klaxon for crises, ambient hum.

## 7. Tech approach (recommended)

- **Plain HTML/CSS/JavaScript, no game engine.** Matches the reference, loads instantly, runs on phones, free to host (GitHub Pages).
- **Content as data** (JSON-style files for events, crew, ships) separate from game logic — so writing stories never requires touching the engine.
- **Seeded randomness:** each run has a seed, so a great run can be shared ("try seed ORION-42").
- **Save to the browser** (localStorage) for legacy progress. No accounts, no server for now.

## 8. Scope for the first prototype ("vertical slice")

Goal: *Is one run fun, and do I want to press "new run"?*

- 1 destination, 1 ship, roster of 6 crew (pick 4)
- Map of ~12 waypoints with branches
- 20 event cards + 3 crisis types
- 4 ending cards
- Basic legacy: unlock 1 extra crew member after first arrival
- Dashboard styling close to the reference

**Not in the prototype:** sound, multiple ships, multiple destinations, save/load mid-run, art beyond UI.

## 9. Risks & open questions

| Risk | Mitigation |
|---|---|
| Writing enough events to stay fresh | Condition-driven cards; reuse via variables (crew names, resources) |
| Choices feel random, not meaningful | Always preview the *kind* of cost ("risky: hull") before choosing |
| Runs too long for "one more go" | Target 20–30 min; tune waypoint count |
| Dashboard looks great but is confusing | Introduce panels gradually over the first run |

**Decisions made:**
- **Tone: mixed.** Rule of thumb: *the stakes are serious, the people are funny.* Space is cold and deadly (tense, like *Alien*); the crew are warm, stubborn and joke to cope (like *The Martian* / *Firefly*). Every event card should have at least one line of character, even in a crisis.
- **Permadeath: yes.** Crew can die within a run. A death is permanent for that run; their name goes on a memorial wall in the logbook.
- **Names (see §11).**

**Still open:**
- Reference page: product owner will send it; we match the look before styling work starts.

## 10. Task list — prototype milestones

Each milestone ends with something you can open and play/click.

| # | Milestone | You can… |
|---|---|---|
| M1 ✅ | **Dashboard shell** (`index.html`) — layout, panels, mission clock, fake live telemetry, styled to reference | See the look on desktop & phone |
| M2 | **Run state + prepare screen** — pick 4 of 6 crew, cargo budget | Start a run with your chosen crew |
| M3 | **Star map** — seeded branching map, travel costs fuel/time | Fly waypoint to waypoint |
| M4 | **Event engine + first 10 cards** — conditions, choices, effects, story flags | Make story choices that change the ship/crew |
| M5 | **Crew & ship consequences** — stress, injury, death, system damage | Lose someone. Feel it. |
| M6 | **Crises (3 types)** — timed power-routing triage | Save (or fail to save) the ship under pressure |
| M7 | **Arrival + 4 endings** — scoring who/when/how intact | Finish a full run |
| M8 | **Legacy + remaining 10 cards** — logbook, memorial wall, 1 unlock, save in browser | Hit "new run" and want to |

**Playtest gate after M7:** is one run fun? If not, fix the loop before adding content.

## 11. Names

- **Ship: ISV *Meridian*** — a meridian is a line you navigate by; also sounds like a ship people would trust with their lives. Crew call her "Merry" (the humour half of the tone).
- **Destination: Halcyon** — a habitable moon. "Halcyon" means calm and peaceful, which is a quiet irony given the journey there.
- **Mission control callsign: "Meridian Control"** — that's you.
- **Starting crew roster (6):** Cmdr. Ada Okafor (pilot), Tomas "Wrench" Vey (engineer), Dr. Lin Sato (medic), Priya Raman (scientist), Jonah Kell (engineer, backup), Sol (ship AI assistant — not a crew slot yet, but a voice in the comms log).
