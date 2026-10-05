// Story, puzzles and hints. Pure logic, no drawing: interact() returns a list of actions and
// apply() changes the state, so the whole game can be played (and tested) without a screen.
"use strict";

const Story = (() => {
  const ITEMS = {
    rope: "ROPE", net: "FISHING NET", key: "RUSTY KEY", fish: "FISH",
    oil: "LAMP OIL", lantern: "LANTERN", lens: "GREAT LENS",
  };

  // puzzle steps in the order a typical player meets them (the funnel in the analysis)
  const STEPS = ["net", "rope", "key", "gate", "lantern", "fish", "oil", "lantern_oil",
    "lantern_lit", "shadow", "lens", "lamp_lens", "lamp_oil", "lamp_lit"];

  const SPEAKERS = {
    cuetip: { name: "CUETIP", color: "#4fa8ff" },
    moss: { name: "MOSS", color: "#f08a4b" },
    pip: { name: "PIP", color: "#f4f1e8" },
    journal: { name: "KEEPER'S JOURNAL", color: "#e8dcc0" },
    hint: { name: "HINT", color: "#2de2ff" },
  };

  const has = (s, i) => s.inv.includes(i);
  const f = (s, k) => !!s.flags[k];
  const say = (who, text) => ({ say: text, who });
  const C = (text) => say("cuetip", text);
  const give = (item) => ({ give: item });
  const take = (item) => ({ take: item });
  const flag = (k) => ({ flag: k });
  const go = (scene) => ({ go: scene });
  const solve = (step) => ({ solve: step });
  const lit = (s) => f(s, "lantern_lit");

  function newState() {
    return { scene: "beach", inv: [], flags: {}, solved: [], t: 0, hints: 0, nudges: 0,
      hintTier: {}, done: false };
  }

  function itemName(s, item) {
    if (item === "lantern") return lit(s) ? "LIT LANTERN" : f(s, "lantern_oil") ? "OILED LANTERN" : "EMPTY LANTERN";
    return ITEMS[item];
  }

  // ------------------------------------------------------------------ scenes
  // rect: [x, y, w, h] on the 320x140 scene. walkX: where Cuetip stands to use it (null: no walk).
  const SCENES = {
    beach: {
      name: "THE BEACH", floor: 132, entries: { village: 286, cave: 66 },
      enter: () => [],
      hotspots: [
        { id: "cave", name: "SEA CAVE", rect: [4, 70, 44, 50], walkX: 58,
          act: (s) => lit(s)
            ? [go("cave")]
            : [C("IT'S PITCH BLACK IN THERE. SOMETHING IS BREATHING.")],
          use: { lantern: (s) => lit(s) ? [go("cave")] : [C("AN UNLIT LANTERN WON'T HELP IN THE DARK.")] } },
        { id: "wreck", name: "BROKEN BOAT", rect: [68, 80, 66, 48], walkX: 104,
          act: (s) => f(s, "rope_taken")
            ? [C("NOTHING ELSE USEFUL HERE. JUST SPLINTERS AND SEAWEED.")]
            : [C("A WRECKED ROWBOAT. A COIL OF ROPE IS STILL TIED TO IT."), C("CUETIP WORKS THE KNOT LOOSE."),
              give("rope"), flag("rope_taken"), solve("rope")] },
        { id: "pool", name: "TIDE POOL", rect: [172, 112, 58, 22], walkX: 162,
          act: (s) => f(s, "fish_caught")
            ? [C("THE OTHER FISH ARE HIDING NOW. SMART FISH.")]
            : [C("LITTLE SILVER FISH DART AROUND. TOO QUICK TO GRAB WITH BARE HANDS.")],
          use: {
            net: (s) => f(s, "fish_caught")
              ? [C("ONE FISH IS PLENTY.")]
              : [C("SWISH! GOT ONE."), give("fish"), flag("fish_caught"), solve("fish")],
            fish: () => [C("NO TAKE-BACKS. PIP NEEDS THIS ONE.")],
          } },
        { id: "sea", name: "THE SEA", rect: [60, 72, 160, 26], walkX: null,
          act: () => [C("SOMEWHERE OUT THERE IS SHADOW ISLE. NO THANKS.")] },
        { id: "far_lighthouse", name: "LIGHTHOUSE", rect: [268, 12, 24, 36], walkX: null,
          act: () => [C("THE LIGHTHOUSE. DARK AS THE ABYSS. I SHOULD GET UP THERE.")] },
        { id: "to_village", name: "TO THE VILLAGE", rect: [298, 92, 22, 46], walkX: 318, exit: true,
          act: () => [go("village")] },
      ],
    },

    village: {
      name: "LANTERNFALL", floor: 132, entries: { beach: 30, cliff: 290 },
      enter: (s) => f(s, "seen_village") ? [] : [flag("seen_village"),
        C("A LITTLE FISHING VILLAGE. EVERY SHUTTER IS CLOSED.")],
      hotspots: [
        { id: "moss", name: "MOSS", rect: [26, 96, 44, 34], walkX: 92,
          act: (s) => {
            if (!f(s, "met_moss")) {
              return [flag("met_moss"),
                say("moss", "WELL I'LL BE. A LITTLE BLUE FELLA, WASHED UP WITH THE TIDE."),
                C("I'M CUETIP. WHY IS THE LIGHTHOUSE DARK?"),
                say("moss", "THE SHADOWS STOLE ITS GREAT LENS AND HID IT IN THE SEA CAVE."),
                say("moss", "OLD KEEPER WENT IN AFTER IT. NEVER CAME BACK."),
                say("moss", "NO LIGHT MEANS NO SHIPS COME HOME, AND THE SHADOWS GET BOLDER EVERY NIGHT."),
                C("I'VE OUTRUN SHADOWS BEFORE. I'LL RELIGHT IT."),
                say("moss", "HA! THEN TAKE MY OLD NET. A BODY ALWAYS NEEDS A NET IN LANTERNFALL."),
                give("net"), solve("net")];
            }
            if (!f(s, "key_found") && !f(s, "gate_open")) {
              return [say("moss", "THE LIGHTHOUSE KEY? KEEPER DROPPED IT DOWN THE WELL LAST SPRING."),
                say("moss", "BUCKET ROPE SNAPPED FISHING IT OUT. NOBODY'S FIXED IT SINCE.")];
            }
            if (!f(s, "oil_bought")) {
              return [say("moss", "LAMP OIL? PIP'S GOT IT. PIP WANTS A FISH FOR EVERYTHING, THAT GULL.")];
            }
            return [say("moss", "GO ON, LITTLE ONE. THE WHOLE COVE IS COUNTING ON YOU.")];
          },
          use: {
            fish: () => [say("moss", "KEEP IT. I'M A CRAB, I EAT SEAWEED. PIP'S THE HUNGRY ONE.")],
            net: () => [say("moss", "IT'S YOURS NOW. GOOD FOR CATCHING FISH IN THE TIDE POOL.")],
            lens: () => [say("moss", "THE GREAT LENS! BLESS YOUR LITTLE BLUE HEAD. UP THE TOWER WITH IT!")],
          } },
        { id: "well", name: "OLD WELL", rect: [136, 60, 42, 64], walkX: 124,
          act: (s) => f(s, "key_found")
            ? [C("JUST COLD WATER DOWN THERE NOW.")]
            : [C("THE BUCKET ROPE IS SNAPPED. SOMETHING GLINTS AT THE BOTTOM.")],
          use: {
            rope: () => [C("CUETIP TIES THE ROPE TO THE BUCKET AND LOWERS IT DOWN..."),
              C("...AND HAULS UP A RUSTY KEY!"), take("rope"), give("key"), flag("key_found"), solve("key")],
            fish: () => [C("THE FISH WOULD LIKE THAT. PIP WOULD NOT.")],
          } },
        { id: "pip", name: "PIP", rect: [228, 66, 40, 34], walkX: 214,
          act: (s) => {
            if (f(s, "oil_bought")) return [say("pip", "PIP IS SHOPKEEPING. ALSO DIGESTING. COME BACK NEVER.")];
            if (!f(s, "met_pip")) {
              return [flag("met_pip"),
                say("pip", "SQUAWK! WELCOME TO PIP'S SUPPLIES! FINEST LAMP OIL IN THE COVE!"),
                C("COULD I HAVE SOME? IT'S FOR THE LIGHTHOUSE."),
                say("pip", "PIP DOESN'T DO FREE. PIP DOES FISH. BRING PIP A FISH.")];
            }
            return [say("pip", "FISH. F-I-S-H. NO FISH, NO OIL. PIP HAS STANDARDS.")];
          },
          use: {
            fish: () => [say("pip", "OOH, STILL WIGGLING! A DEAL'S A DEAL."), take("fish"), give("oil"),
              flag("oil_bought"), flag("met_pip"), solve("oil"),
              C("A WHOLE JUG OF LAMP OIL. THAT SHOULD LAST.")],
            net: () => [say("pip", "PIP DOESN'T WANT A NET. PIP WANTS WHAT GOES IN THE NET.")],
            key: () => [say("pip", "SHINY, BUT YOU CAN'T EAT A KEY. PIP HAS TRIED.")],
            rope: () => [say("pip", "ROPE? IS IT FISH-FLAVORED? NO? THEN NO.")],
          } },
        { id: "cottages", name: "COTTAGES", rect: [4, 30, 76, 62], walkX: null,
          act: () => [C("THE SHUTTERS ARE BOLTED. EVERYONE IS HIDING FROM THE DARK.")] },
        { id: "to_beach", name: "TO THE BEACH", rect: [0, 92, 18, 46], walkX: 2, exit: true,
          act: () => [go("beach")] },
        { id: "to_cliff", name: "CLIFF PATH", rect: [298, 70, 22, 68], walkX: 318, exit: true,
          act: () => [go("cliff")] },
      ],
    },

    cliff: {
      name: "LIGHTHOUSE CLIFF", floor: 130, entries: { village: 30, tower: 196 },
      enter: (s) => f(s, "seen_cliff") ? [] : [flag("seen_cliff"),
        C("WHOA. IT'S EVEN BIGGER UP CLOSE.")],
      hotspots: [
        { id: "door", name: "LIGHTHOUSE DOOR", rect: [152, 94, 26, 34], walkX: 196,
          act: (s) => f(s, "gate_open")
            ? [go("tower")]
            : [C("LOCKED TIGHT. THE KEYHOLE IS CRUSTED WITH SALT.")],
          use: {
            key: () => [C("A LITTLE WIGGLE... CLICK! THE DOOR CREAKS OPEN."), take("key"),
              flag("gate_open"), solve("gate")],
          } },
        { id: "tower", name: "LIGHTHOUSE", rect: [136, 0, 58, 92], walkX: null,
          act: (s) => f(s, "lamp_lit") ? [C("SHINING BRIGHT.")]
            : [C("THE LAMP AT THE TOP IS COLD AND DARK.")] },
        { id: "sea_cliff", name: "THE SEA", rect: [0, 74, 120, 24], walkX: null,
          act: () => [C("A LONG WAY DOWN. NO BOATS OUT THERE TONIGHT.")] },
        { id: "to_village", name: "TO THE VILLAGE", rect: [0, 96, 18, 42], walkX: 2, exit: true,
          act: () => [go("village")] },
      ],
    },

    tower: {
      name: "INSIDE THE LIGHTHOUSE", floor: 128, entries: { cliff: 44, lamp: 262 },
      enter: (s) => f(s, "seen_tower") ? [] : [flag("seen_tower"),
        C("DUSTY. LOOKS LIKE THE KEEPER LEFT IN A HURRY.")],
      hotspots: [
        { id: "door_out", name: "DOOR OUT", rect: [0, 60, 22, 50], walkX: 2, exit: true,
          act: () => [go("cliff")] },
        { id: "stove", name: "IRON STOVE", rect: [22, 58, 54, 56], walkX: 88,
          act: () => [C("A FEW EMBERS STILL GLOW INSIDE. THE KEEPER KEPT IT BURNING.")],
          use: {
            lantern: (s) => lit(s) ? [C("THE LANTERN IS ALREADY LIT.")]
              : f(s, "lantern_oil")
                ? [C("CUETIP TOUCHES THE WICK TO THE EMBERS..."), C("IT CATCHES! THE LANTERN GLOWS."),
                  flag("lantern_lit"), solve("lantern_lit")]
                : [C("THE WICK IS DRY. IT NEEDS OIL BEFORE IT WILL CATCH.")],
            oil: () => [C("POUR OIL ON A HOT STOVE? THAT SOUNDS LIKE A VERY BAD IDEA.")],
            fish: () => [C("GRILLED FISH... NO! FOCUS, CUETIP.")],
          } },
        { id: "hook", name: "LANTERN", rect: [106, 52, 30, 36], walkX: 120,
          when: (s) => !f(s, "lantern_taken"),
          act: () => [C("AN OLD SHIP'S LANTERN. EMPTY, BUT THE WICK LOOKS GOOD."),
            give("lantern"), flag("lantern_taken"), solve("lantern")] },
        { id: "journal", name: "KEEPER'S JOURNAL", rect: [184, 80, 64, 32], walkX: 214,
          act: () => [say("journal", "DAY 312. THE SHADOWS TOOK THE GREAT LENS. THEY'VE HIDDEN IT IN THE SEA CAVE."),
            say("journal", "THEY HATE LIGHT. I'LL LIGHT A LANTERN AT THE STOVE AND GO GET IT BACK."),
            say("journal", "IF I DON'T RETURN: THE LAMP NEEDS ITS LENS, OIL, AND A FLAME.")] },
        { id: "stairs", name: "STAIRS UP", rect: [252, 10, 66, 100], walkX: 280, exit: true,
          act: () => [go("lamp")] },
      ],
    },

    lamp: {
      name: "THE LAMP ROOM", floor: 132, entries: { tower: 54 },
      enter: (s) => f(s, "seen_lamp") ? [] : [flag("seen_lamp"),
        C("THE LAMP ROOM. YOU CAN SEE THE WHOLE COVE FROM UP HERE.")],
      hotspots: [
        { id: "lamp", name: "GREAT LAMP", rect: [132, 30, 58, 92], walkX: 112,
          act: (s) => {
            const missing = [!f(s, "lamp_lens") && "ITS LENS", !f(s, "lamp_oil") && "OIL"].filter(Boolean);
            if (missing.length) return [C("THE GREAT LAMP. IT'S MISSING " + missing.join(" AND ") + ".")];
            return [C("LENS IN, OIL IN. IT JUST NEEDS A FLAME.")];
          },
          use: {
            lens: () => [C("CUETIP HEAVES THE GREAT LENS INTO PLACE. CLUNK."), take("lens"),
              flag("lamp_lens"), solve("lamp_lens")],
            oil: (s) => f(s, "lamp_oil") ? [C("IT'S FULL.")]
              : [C("GLUG GLUG GLUG. THE RESERVOIR IS FULL."), flag("lamp_oil"), solve("lamp_oil")],
            lantern: (s) => {
              if (!lit(s)) return [C("THE LANTERN ISN'T LIT. I NEED A FLAME.")];
              if (!f(s, "lamp_lens") || !f(s, "lamp_oil")) {
                return [C("NOT YET. THE JOURNAL SAID: LENS, OIL, AND A FLAME.")];
              }
              return [C("HERE GOES..."), flag("lamp_lit"), solve("lamp_lit"), { end: true }];
            },
          } },
        { id: "window", name: "WINDOW", rect: [198, 12, 116, 82], walkX: null,
          act: (s) => f(s, "lamp_lens")
            ? [C("THE SHADOWS ARE CREEPING UP THE BEACH. HURRY!")]
            : [C("THE WHOLE COVE IS DARK. SHADOWS ARE CREEPING UP THE BEACH.")] },
        { id: "stairs_down", name: "STAIRS DOWN", rect: [8, 104, 54, 30], walkX: 36, exit: true,
          act: () => [go("tower")] },
      ],
    },

    cave: {
      name: "THE SEA CAVE", floor: 132, entries: { beach: 280 },
      enter: (s) => f(s, "seen_cave") ? [] : [flag("seen_cave"),
        C("IT'S COLD IN HERE. AND I'M NOT ALONE.")],
      hotspots: [
        { id: "shadow", name: "SHADOW", rect: [222, 58, 50, 40], walkX: 196,
          when: (s) => !f(s, "shadow_gone"),
          act: () => [C("A SHADOW IS COILED AROUND SOMETHING THAT SPARKLES. IT HISSES AT ME.")],
          use: {
            lantern: () => [C("CUETIP RAISES THE LANTERN HIGH..."),
              C("THE SHADOW SHRIEKS AND MELTS INTO THE CRACKS!"), flag("shadow_gone"), solve("shadow")],
            net: () => [C("YOU CAN'T CATCH A SHADOW IN A NET. TRUST ME, I'VE TRIED.")],
          } },
        { id: "lens", name: "GREAT LENS", rect: [228, 82, 36, 24], walkX: 210,
          when: (s) => f(s, "shadow_gone") && !f(s, "lens_taken"),
          act: () => [C("THE GREAT LENS! HEAVY, BUT I CAN MANAGE."), give("lens"),
            flag("lens_taken"), solve("lens")] },
        { id: "hat", name: "OLD HAT", rect: [128, 110, 30, 16], walkX: 142,
          act: () => [C("THE KEEPER'S HAT. THEY MADE IT THIS FAR..."),
            C("I'LL FINISH WHAT YOU STARTED, KEEPER.")] },
        { id: "water", name: "DARK WATER", rect: [56, 118, 70, 16], walkX: null,
          act: () => [C("I'M NOT PUTTING MY FEET IN THAT.")] },
        { id: "to_beach_cave", name: "OUT TO THE BEACH", rect: [290, 36, 30, 96], walkX: 318, exit: true,
          act: () => [go("beach")] },
      ],
    },
  };

  const INTRO = [
    C("...UGH. WHERE AM I?"),
    C("THE LAST THING I REMEMBER IS JUMPING OFF SHADOW ISLE."),
    C("THAT LIGHTHOUSE ON THE CLIFF IS DARK. AND THE SHADOWS... THEY FOLLOWED ME HERE."),
  ];

  // ------------------------------------------------------------------ goals and hints
  // The first goal that isn't done yet is "where the player is". act: how to do it, used by
  // the tests to play the whole game and so checks every hint points at a working solution.
  const GOALS = [
    { id: "net", done: (s) => f(s, "met_moss"), act: ["village", "moss"],
      hint: ["SOMEONE IN THE VILLAGE MIGHT KNOW WHAT'S GOING ON. HEAD RIGHT.",
        "TALK TO MOSS, THE HERMIT CRAB IN THE VILLAGE."] },
    { id: "rope", done: (s) => f(s, "rope_taken"), act: ["beach", "wreck"],
      hint: ["MOSS SAID THE WELL'S ROPE SNAPPED. THE BEACH IS FULL OF JUNK.",
        "TAKE THE ROPE FROM THE BROKEN BOAT ON THE BEACH."] },
    { id: "key", done: (s) => f(s, "key_found"), act: ["village", "well", "rope"],
      hint: ["SOMETHING GLINTS AT THE BOTTOM OF THE WELL.",
        "CLICK THE ROPE IN YOUR BAG, THEN CLICK THE OLD WELL."] },
    { id: "gate", done: (s) => f(s, "gate_open"), act: ["cliff", "door", "key"],
      hint: ["THAT KEY MUST OPEN SOMETHING. TRY THE CLIFF PATH PAST THE VILLAGE.",
        "CLICK THE KEY IN YOUR BAG, THEN CLICK THE LIGHTHOUSE DOOR."] },
    { id: "lantern", done: (s) => f(s, "lantern_taken"), act: ["tower", "hook"],
      hint: ["THE KEEPER MUST HAVE LEFT SOMETHING USEFUL INSIDE THE LIGHTHOUSE.",
        "TAKE THE LANTERN OFF ITS HOOK INSIDE THE LIGHTHOUSE."] },
    { id: "fish", done: (s) => f(s, "fish_caught"), act: ["beach", "pool", "net"],
      hint: ["AN EMPTY LANTERN NEEDS OIL. PIP IN THE VILLAGE SELLS IT, FOR A FISH.",
        "CLICK THE NET IN YOUR BAG, THEN CLICK THE TIDE POOL ON THE BEACH."] },
    { id: "oil", done: (s) => f(s, "oil_bought"), act: ["village", "pip", "fish"],
      hint: ["PIP WAS VERY CLEAR ABOUT WHAT PIP WANTS.",
        "CLICK THE FISH IN YOUR BAG, THEN CLICK PIP."] },
    { id: "lantern_oil", done: (s) => f(s, "lantern_oil"), act: ["*", "oil", "lantern"],
      hint: ["AN EMPTY LANTERN WON'T BURN. YOU CAN COMBINE THINGS IN YOUR BAG.",
        "CLICK THE LAMP OIL IN YOUR BAG, THEN CLICK THE LANTERN."] },
    { id: "lantern_lit", done: (s) => f(s, "lantern_lit"), act: ["tower", "stove", "lantern"],
      hint: ["THE KEEPER'S STOVE STILL HAS EMBERS IN IT.",
        "CLICK THE LANTERN IN YOUR BAG, THEN CLICK THE STOVE IN THE LIGHTHOUSE."] },
    { id: "shadow", done: (s) => f(s, "shadow_gone"), act: ["cave", "shadow", "lantern"],
      hint: ["THE JOURNAL SAYS THE LENS IS IN THE SEA CAVE, AND SHADOWS HATE LIGHT.",
        "GO INTO THE SEA CAVE ON THE BEACH. CLICK THE LIT LANTERN, THEN THE SHADOW."] },
    { id: "lens", done: (s) => f(s, "lens_taken"), act: ["cave", "lens"],
      hint: ["SOMETHING SPARKLES WHERE THE SHADOW WAS.",
        "PICK UP THE GREAT LENS IN THE SEA CAVE."] },
    { id: "lamp_lens", done: (s) => f(s, "lamp_lens"), act: ["lamp", "lamp", "lens"],
      hint: ["THE JOURNAL SAID THE LAMP NEEDS ITS LENS, OIL, AND A FLAME.",
        "CLIMB TO THE LAMP ROOM. CLICK THE LENS IN YOUR BAG, THEN THE GREAT LAMP."] },
    { id: "lamp_oil", done: (s) => f(s, "lamp_oil"), act: ["lamp", "lamp", "oil"],
      hint: ["THE LAMP HAS ITS LENS. WHAT ELSE DID THE JOURNAL SAY?",
        "CLICK THE LAMP OIL IN YOUR BAG, THEN THE GREAT LAMP."] },
    { id: "lamp_lit", done: (s) => f(s, "lamp_lit"), act: ["lamp", "lamp", "lantern"],
      hint: ["LENS, OIL... AND A FLAME.",
        "CLICK THE LIT LANTERN IN YOUR BAG, THEN THE GREAT LAMP."] },
  ];

  function currentGoal(s) { return GOALS.find((g) => !g.done(s)) || null; }

  // ------------------------------------------------------------------ actions
  const NOPE = ["THAT DOESN'T WORK.", "HMM. NO.", "I DON'T THINK THAT'S IT.", "NOPE."];

  function visibleHotspots(s, sceneId = s.scene) {
    return SCENES[sceneId].hotspots.filter((h) => !h.when || h.when(s));
  }

  function interact(s, hotspotId, item = null) {
    const hs = visibleHotspots(s).find((h) => h.id === hotspotId);
    if (!hs) return [];
    if (!item) return hs.act(s);
    const fn = hs.use && hs.use[item];
    if (fn) return fn(s);
    if (hs.exit) return hs.act(s);
    return [C(NOPE[(s.inv.length + hotspotId.length + item.length) % NOPE.length])];
  }

  function combine(s, a, b) {
    const pair = [a, b].sort().join("+");
    if (pair === "lantern+oil") {
      if (f(s, "lantern_oil")) return [C("THE LANTERN IS ALREADY FULL.")];
      return [C("CUETIP FILLS THE LANTERN WITH OIL. PLENTY LEFT IN THE JUG."),
        flag("lantern_oil"), solve("lantern_oil")];
    }
    if (pair === "fish+net") return [C("IT'S ALREADY CAUGHT. IT CAN'T GET MORE CAUGHT.")];
    if (pair === "key+rope") return [C("A KEY ON A ROPE. VERY FASHIONABLE. NOT VERY USEFUL.")];
    return [C(NOPE[(a.length + b.length) % NOPE.length])];
  }

  // Apply one non-dialogue action to the state. Returns true if it changed anything.
  function apply(s, a) {
    if (a.give && !has(s, a.give)) { s.inv.push(a.give); return true; }
    if (a.take && has(s, a.take)) { s.inv.splice(s.inv.indexOf(a.take), 1); return true; }
    if (a.flag && !s.flags[a.flag]) { s.flags[a.flag] = true; return true; }
    if (a.go) { s.scene = a.go; return true; }
    if (a.solve && !s.solved.includes(a.solve)) { s.solved.push(a.solve); return true; }
    if (a.end) { s.done = true; return true; }
    return false;
  }

  return { ITEMS, STEPS, SPEAKERS, SCENES, INTRO, GOALS, newState, itemName, currentGoal,
    visibleHotspots, interact, combine, apply };
})();
