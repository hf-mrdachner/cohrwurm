# CohrWurm: Linter & Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, dependency-light dev-tooling layer (ESLint + Node's built-in test runner) to CohrWurm, extracting the app's pure adaptive-logic into a testable `logic.mjs` ES module without changing how the app is run or deployed.

**Architecture:** Extract Morse data, Koch progression state, and pure/state-driven logic (`timing`, `weightedChar`, `recordResult`, `maybePromote`, `buildSchedule`, etc.) out of `index.html`'s inline script into a new `logic.mjs` ES module, imported back into `index.html` via `<script type="module">`. UI rendering, Web Audio playback, and localStorage persistence stay inline in `index.html`, unchanged in behavior. Add `node --test` unit tests for everything in `logic.mjs`, an ESLint flat config (with `eslint-plugin-html` to also lint the inline script), and a dormant GitHub Actions CI workflow.

**Tech Stack:** Node's built-in `node:test` + `node:assert/strict` (no test framework dependency), ESLint 9 (flat config) + `eslint-plugin-html`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-linting-and-tests-design.md`

## Global Constraints

- The app itself (`node server.js`, opening `index.html`) must keep working with **zero install** — only the new dev tooling (lint/test) requires `npm install`. (Spec: Purpose)
- `package.json` does **not** set `"type": "module"` — `server.js` stays plain CommonJS, unaffected. ESM files use the explicit `.mjs` extension instead (`logic.mjs`, `logic.test.mjs`, `eslint.config.mjs`). (Spec: package.json, File structure)
- No UI/E2E test framework (e.g. Playwright), no bundler, no formatter, no coverage tool. (Spec: Non-goals)
- All extraction/refactor steps in this plan are **behavior-neutral** except one explicit, deliberate fix: `weightedChar()`'s recency weighting is inverted (see Task 3) — everything else must produce byte-identical rendered output and behavior to what exists today.
- **This repository is not yet a git repository.** Per explicit user decision, do NOT run any `git` command in Tasks 1–8. Skip the "Commit" step that would normally end each task below — just leave the working tree as-is and move to the next task. Task 9 (the final task) does `git init` and the one and only commit, covering everything.
- German UI copy (all user-facing strings) must be preserved exactly, including umlauts/ß and the existing HTML entity usage (e.g. `&uuml;`) where it already appears — do not "fix" or retype it.

---

### Task 1: Project scaffolding (`package.json`, `.gitignore`, dev dependencies)

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: an `npm test` script running `node --test`, and an `npm run lint` script running `eslint .`, available to every later task.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "cohrwurm",
  "private": true,
  "scripts": {
    "test": "node --test",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 3: Install dev dependencies**

Run: `npm install --save-dev eslint eslint-plugin-html @eslint/js`

This creates `node_modules/` (already gitignored), `package-lock.json` (must NOT be gitignored — it gets committed in Task 9), and adds a `devDependencies` block with resolved versions to `package.json` automatically. Do not hand-write dependency version numbers.

- [ ] **Step 4: Verify the install**

Run: `npx eslint --version`
Expected: prints an ESLint version string (e.g. `v9.x.x`), confirming the local install works.

Run: `node --test`
Expected: exits cleanly reporting 0 tests found (no test files exist yet) — this confirms `node --test` itself runs without error in this project.

---

### Task 2: `logic.mjs` — Morse data, Koch order, and the simple pure helpers

**Files:**
- Create: `logic.mjs`
- Create: `logic.test.mjs`

**Interfaces:**
- Produces: `MORSE`, `REVERSE`, `KOCH_ORDER`, `PROSIGN_START`, `PROSIGN_END` (data), `state` (mutable object: `{ unlockedCount, charSpeedWpm, effWpm, autoAdvance, fixedGroups, charStats, totalReps, recentBuffer }`), `dotMs(wpm) -> number`, `timing() -> {dit, dash, intraGap, charGap, wordGap}`, `unlockedChars() -> string[]`, `toDots(pattern) -> string`.
- Consumes: nothing (first task to create these files).

- [ ] **Step 1: Write the failing tests**

Create `logic.test.mjs`:

```js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state, KOCH_ORDER, dotMs, timing, unlockedChars, toDots } from "./logic.mjs";

function resetState() {
  state.unlockedCount = 2;
  state.charSpeedWpm = 15;
  state.effWpm = 5;
  state.autoAdvance = true;
  state.fixedGroups = true;
  state.charStats = {};
  state.totalReps = 0;
  state.recentBuffer = [];
}

beforeEach(resetState);

test("dotMs converts WPM to a dit duration in ms using 1200/WPM", () => {
  assert.equal(dotMs(20), 60);
  assert.equal(dotMs(12), 100);
});

test("timing() runs inter-char/word gaps at effWpm when effWpm lags charSpeedWpm", () => {
  state.charSpeedWpm = 20;
  state.effWpm = 5;
  const t = timing();
  const dit = dotMs(20);
  const effDit = dotMs(5);
  assert.equal(t.dit, dit);
  assert.equal(t.dash, dit * 3);
  assert.equal(t.intraGap, dit);
  assert.equal(t.charGap, effDit * 3);
  assert.equal(t.wordGap, effDit * 7);
});

test("timing() runs all gaps at charSpeedWpm once effWpm has caught up", () => {
  state.charSpeedWpm = 15;
  state.effWpm = 15;
  const t = timing();
  const dit = dotMs(15);
  assert.equal(t.charGap, dit * 3);
  assert.equal(t.wordGap, dit * 7);
});

test("unlockedChars returns the first unlockedCount Koch characters, in Koch order", () => {
  state.unlockedCount = 3;
  assert.deepEqual(unlockedChars(), KOCH_ORDER.slice(0, 3));
  assert.deepEqual(unlockedChars(), ["K", "M", "U"]);
});

test("toDots renders . as · and - as −", () => {
  assert.equal(toDots(".-"), "·−");
  assert.equal(toDots("--.-"), "−−·−");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL — `logic.mjs` does not exist yet (module resolution error, e.g. `Cannot find module './logic.mjs'`).

- [ ] **Step 3: Create `logic.mjs`**

```js
export const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-."
};

export const REVERSE = {};
Object.keys(MORSE).forEach(function (k) { REVERSE[MORSE[k]] = k; });

// Betriebsabkürzungen KA (Anfang) / AR (Ende): je zwei Buchstaben ohne
// Zwischenraum gesendet, daher eigene Sentinel-Zeichen statt "K"+"A" bzw.
// "A"+"R", damit sie nie mit normalem Übungstext kollidieren.
export const PROSIGN_START = String.fromCharCode(1);
export const PROSIGN_END = String.fromCharCode(2);
MORSE[PROSIGN_START] = "-.-.-";
MORSE[PROSIGN_END] = ".-.-.";

export const KOCH_ORDER = ["K","M","U","R","S","A","P","T","L","O","W","I",".","N","J","E","F","0","Y",",",
                   "V","G","5","/","Q","9","Z","H","3","8","B","?","4","2","7","C","1","D","6","X"];

export const state = {
  unlockedCount: 2,
  charSpeedWpm: 15,
  effWpm: 5,
  autoAdvance: true,
  fixedGroups: true,
  charStats: {},   // letter -> {c: correct, t: total}
  totalReps: 0,
  recentBuffer: []  // rolling booleans for promotion check
};

export function dotMs(wpm) { return 1200 / wpm; }

export function timing() {
  var charWpm = state.charSpeedWpm;
  var effWpm = Math.min(state.effWpm, charWpm);
  var dit = dotMs(charWpm);
  var dash = dit * 3;
  var intraGap = dit;
  if (effWpm >= charWpm) {
    return { dit: dit, dash: dash, intraGap: intraGap, charGap: dit * 3, wordGap: dit * 7 };
  }
  var effDit = dotMs(effWpm);
  return { dit: dit, dash: dash, intraGap: intraGap, charGap: effDit * 3, wordGap: effDit * 7 };
}

export function unlockedChars() { return KOCH_ORDER.slice(0, state.unlockedCount); }

export function toDots(pattern) {
  return pattern.replace(/\./g, "·").replace(/-/g, "−");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, all tests in `logic.test.mjs` green.

---

### Task 3: `logic.mjs` — `weightedChar()`/`weightedGroup()`, with the recency-weighting fix

**Files:**
- Modify: `logic.mjs`
- Modify: `logic.test.mjs`

**Interfaces:**
- Consumes: `state`, `unlockedChars()` (from Task 2).
- Produces: `weightedChar() -> string` (picks one unlocked character, biased toward more-recently-unlocked and lower-accuracy characters), `weightedGroup(len) -> string`.

- [ ] **Step 1: Write the failing test**

Add to `logic.test.mjs` (new import names alongside the existing ones — change the import line to include `weightedChar, weightedGroup`):

```js
import { state, KOCH_ORDER, dotMs, timing, unlockedChars, toDots, weightedChar, weightedGroup } from "./logic.mjs";
```

Add test cases:

```js
test("weightedChar biases toward more recently unlocked characters (equal accuracy)", () => {
  state.unlockedCount = 3; // pool: K (i=0), M (i=1), U (i=2)
  const originalRandom = Math.random;
  try {
    // weights (accuracy defaults to 0.5 for all -> weakness=1.75 for all):
    // K: 1.75 * (1+0*0.15) = 1.75, M: 1.75*1.15 = 2.0125, U: 1.75*1.30 = 2.275, total = 6.0375
    Math.random = () => 0.999999; // near-total -> falls into the last (highest-weighted) bucket: U
    assert.equal(weightedChar(), "U");
    Math.random = () => 0.000001; // near-zero -> falls into the first bucket: K
    assert.equal(weightedChar(), "K");
  } finally {
    Math.random = originalRandom;
  }
});

test("weightedGroup concatenates weightedChar() results to the requested length", () => {
  state.unlockedCount = 1; // pool: just "K", so every pick is deterministic
  assert.equal(weightedGroup(4), "KKKK");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL — `weightedChar`/`weightedGroup` are not exported by `logic.mjs` yet.

- [ ] **Step 3: Add `weightedChar()`/`weightedGroup()` to `logic.mjs`**

Append to `logic.mjs`:

```js
export function weightedChar() {
  var pool = unlockedChars();
  var weights = pool.map(function (c, i) {
    var s = state.charStats[c];
    var acc = s && s.t >= 3 ? s.c / s.t : 0.5;
    var recency = 1 + i * 0.15; // more recently unlocked chars weigh more
    var weakness = 1 + (1 - acc) * 1.5;
    return recency * weakness;
  });
  var total = weights.reduce(function (a, b) { return a + b; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function weightedGroup(len) {
  var out = "";
  for (var i = 0; i < len; i++) out += weightedChar();
  return out;
}
```

Note the fix versus the current `index.html` code: `recency` is now `1 + i * 0.15` (was `1 + (pool.length - i) * 0.15`), so higher-index (more recently unlocked) characters get the higher weight, matching the inline comment's intent and CLAUDE.md's description of the adaptive logic.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS.

---

### Task 4: `logic.mjs` — `recordResult()`, `maybePromote()`, `nextPromotion()`

**Files:**
- Modify: `logic.mjs`
- Modify: `logic.test.mjs`

**Interfaces:**
- Consumes: `state` (from Task 2), `KOCH_ORDER` (from Task 2).
- Produces: `recordResult(ch, correct)` (updates `state.charStats`/`state.totalReps`/`state.recentBuffer`, then calls `maybePromote()` — does **not** touch the DOM or localStorage), `maybePromote()`, `nextPromotion() -> {type: "raiseEff"|"unlock"|"raiseSpeed", value: number|string}` (the single source of truth for "what happens on the next promotion", used by both `maybePromote()` here and `promotionBlockHtml()` in `index.html`, Task 6).

- [ ] **Step 1: Write the failing tests**

Add to the import line in `logic.test.mjs`:

```js
import { state, KOCH_ORDER, dotMs, timing, unlockedChars, toDots, weightedChar, weightedGroup, recordResult, maybePromote, nextPromotion } from "./logic.mjs";
```

Add test cases:

```js
test("recordResult updates charStats/totalReps and appends to recentBuffer, capped at 20", () => {
  for (let i = 0; i < 25; i++) recordResult("K", i % 2 === 0);
  assert.equal(state.charStats.K.t, 25);
  assert.equal(state.charStats.K.c, 13);
  assert.equal(state.totalReps, 25);
  assert.equal(state.recentBuffer.length, 20);
});

test("nextPromotion proposes raising effWpm first when it lags charSpeedWpm", () => {
  state.charSpeedWpm = 20;
  state.effWpm = 10;
  assert.deepEqual(nextPromotion(), { type: "raiseEff", value: 11 });
});

test("nextPromotion proposes unlocking the next Koch character once effWpm has caught up", () => {
  state.charSpeedWpm = 20;
  state.effWpm = 20;
  state.unlockedCount = 5;
  assert.deepEqual(nextPromotion(), { type: "unlock", value: KOCH_ORDER[5] });
});

test("nextPromotion proposes raising charSpeedWpm, capped at 35, once every character is unlocked", () => {
  state.charSpeedWpm = 35;
  state.effWpm = 35;
  state.unlockedCount = KOCH_ORDER.length;
  assert.deepEqual(nextPromotion(), { type: "raiseSpeed", value: 35 });
});

test("maybePromote does nothing before 20 attempts are recorded", () => {
  for (let i = 0; i < 19; i++) recordResult("K", true);
  assert.equal(state.unlockedCount, 2);
  assert.equal(state.recentBuffer.length, 19);
});

test("maybePromote applies the next promotion at >=90% over the last 20 attempts, and resets recentBuffer", () => {
  state.charSpeedWpm = 20;
  state.effWpm = 20;
  state.unlockedCount = 2;
  for (let i = 0; i < 18; i++) recordResult("K", true);
  recordResult("K", false);
  recordResult("K", true); // 19/20 = 95%, over threshold
  assert.equal(state.unlockedCount, 3);
  assert.equal(state.recentBuffer.length, 0);
});

test("maybePromote does not advance below the 90% threshold", () => {
  state.unlockedCount = 2;
  for (let i = 0; i < 15; i++) recordResult("K", true);
  for (let i = 0; i < 5; i++) recordResult("K", false); // 15/20 = 75%
  assert.equal(state.unlockedCount, 2);
  assert.equal(state.recentBuffer.length, 20);
});

test("maybePromote does nothing when autoAdvance is disabled", () => {
  state.autoAdvance = false;
  for (let i = 0; i < 25; i++) recordResult("K", true);
  assert.equal(state.unlockedCount, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL — `recordResult`/`maybePromote`/`nextPromotion` are not exported by `logic.mjs` yet.

- [ ] **Step 3: Add `recordResult()`, `maybePromote()`, `nextPromotion()` to `logic.mjs`**

Append to `logic.mjs`:

```js
export function recordResult(ch, correct) {
  if (!state.charStats[ch]) state.charStats[ch] = { c: 0, t: 0 };
  state.charStats[ch].t++;
  if (correct) state.charStats[ch].c++;
  state.totalReps++;
  state.recentBuffer.push(correct);
  if (state.recentBuffer.length > 20) state.recentBuffer.shift();
  maybePromote();
}

export function nextPromotion() {
  if (state.effWpm < state.charSpeedWpm) {
    return { type: "raiseEff", value: Math.min(state.charSpeedWpm, state.effWpm + 1) };
  }
  if (state.unlockedCount < KOCH_ORDER.length) {
    return { type: "unlock", value: KOCH_ORDER[state.unlockedCount] };
  }
  return { type: "raiseSpeed", value: Math.min(35, state.charSpeedWpm + 1) };
}

export function maybePromote() {
  if (!state.autoAdvance) return;
  if (state.recentBuffer.length < 20) return;
  var hits = state.recentBuffer.filter(Boolean).length;
  if (hits / state.recentBuffer.length < 0.9) return;
  var promo = nextPromotion();
  if (promo.type === "raiseEff") state.effWpm = promo.value;
  else if (promo.type === "unlock") state.unlockedCount++;
  else state.charSpeedWpm = promo.value;
  state.recentBuffer = [];
}
```

Note: unlike the current `index.html` code, `recordResult()` does **not** call `refreshMeters()`/`scheduleSave()` — those are DOM/localStorage side effects that stay in `index.html` and are called by `evaluateCopy()` (the sole caller of `recordResult()`) in Task 6.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS.

---

### Task 5: `logic.mjs` — `buildSchedule()`

**Files:**
- Modify: `logic.mjs`
- Modify: `logic.test.mjs`

**Interfaces:**
- Consumes: `MORSE` (from Task 2).
- Produces: `buildSchedule(text, t) -> Array<{tone: boolean, ms: number}>` where `t` is a `timing()`-shaped object — pure function, no Web Audio/DOM calls.

- [ ] **Step 1: Write the failing tests**

Add to the import line in `logic.test.mjs`:

```js
import { state, KOCH_ORDER, PROSIGN_START, dotMs, timing, unlockedChars, toDots, weightedChar, weightedGroup, recordResult, maybePromote, nextPromotion, buildSchedule } from "./logic.mjs";
```

(`MORSE` is not imported here — `buildSchedule` is exercised only through literal text like `"E"`/`"AB"`/`PROSIGN_START`, never by reading `MORSE` directly in the test file, so importing it would be an unused import.)

Add test cases:

```js
const T = { dit: 60, dash: 180, intraGap: 60, charGap: 180, wordGap: 420 };

test("buildSchedule converts a single dit character with no trailing gap at end of text", () => {
  assert.deepEqual(buildSchedule("E", T), [{ tone: true, ms: 60 }]); // E = "."
});

test("buildSchedule inserts intraGap within a character and charGap between characters", () => {
  // A = ".-", B = "-..."
  assert.deepEqual(buildSchedule("AB", T), [
    { tone: true, ms: 60 },
    { tone: false, ms: 60 },
    { tone: true, ms: 180 },
    { tone: false, ms: 180 },
    { tone: true, ms: 180 },
    { tone: false, ms: 60 },
    { tone: true, ms: 60 },
    { tone: false, ms: 60 },
    { tone: true, ms: 60 },
    { tone: false, ms: 60 },
    { tone: true, ms: 60 }
  ]);
});

test("buildSchedule uses wordGap for a space between words", () => {
  assert.deepEqual(buildSchedule("E E", T), [
    { tone: true, ms: 60 },
    { tone: false, ms: 420 },
    { tone: true, ms: 60 }
  ]);
});

test("buildSchedule fuses a prosign into one unbroken run of tones (intraGap only, never charGap)", () => {
  // PROSIGN_START pattern is "-.-.-"
  assert.deepEqual(buildSchedule(PROSIGN_START, T), [
    { tone: true, ms: 180 },
    { tone: false, ms: 60 },
    { tone: true, ms: 60 },
    { tone: false, ms: 60 },
    { tone: true, ms: 180 },
    { tone: false, ms: 60 },
    { tone: true, ms: 60 },
    { tone: false, ms: 60 },
    { tone: true, ms: 180 }
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL — `buildSchedule` is not exported by `logic.mjs` yet.

- [ ] **Step 3: Add `buildSchedule()` to `logic.mjs`**

Append to `logic.mjs`:

```js
export function buildSchedule(text, t) {
  var seq = text.toUpperCase().split("");
  var events = [];
  for (var i = 0; i < seq.length; i++) {
    var ch = seq[i];
    if (ch === " ") continue;
    var pattern = MORSE[ch];
    if (!pattern) continue;
    for (var j = 0; j < pattern.length; j++) {
      events.push({ tone: true, ms: pattern[j] === "." ? t.dit : t.dash });
      if (j < pattern.length - 1) events.push({ tone: false, ms: t.intraGap });
    }
    var next = seq[i + 1];
    if (next === undefined) {
      // no trailing gap
    } else if (next === " ") {
      events.push({ tone: false, ms: t.wordGap });
    } else {
      events.push({ tone: false, ms: t.charGap });
    }
  }
  return events;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS. This completes `logic.mjs` — 30-ish tests should now be green.

---

### Task 6: Wire `index.html` and `server.js` to `logic.mjs`

**Files:**
- Modify: `server.js`
- Modify: `index.html:419-598` (script open + data/logic decls → import), `index.html` (`evaluateCopy`, reset button handler)

**Interfaces:**
- Consumes: most exports from `logic.mjs` (Tasks 2–5) — `MORSE, REVERSE, KOCH_ORDER, PROSIGN_START, PROSIGN_END, state, timing, unlockedChars, weightedChar, weightedGroup, recordResult, nextPromotion, toDots, buildSchedule` — but deliberately not `dotMs` or `maybePromote` (see Step 2 note: neither has a remaining call site in `index.html`, both would be flagged as unused imports).
- Produces: a working app, unchanged in observable behavior except the Task-3 `weightedChar()` fix.

- [ ] **Step 1: `server.js` — serve `.mjs` as JavaScript**

In `server.js`, modify the `TYPES` map:

```js
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
```

(Only the `.mjs` line is new — everything else in `server.js` is unchanged.)

- [ ] **Step 2: `index.html` — replace the script tag and extracted declarations with the import**

In `index.html`, find this block (lines 419–528, from the opening `<script>` tag through the blank line just before `function promotionBlockHtml() {`):

```html
<script>
(function () {
  "use strict";

  // ---------- Morse data ----------
  var MORSE = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
    I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
    Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
    Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-."
  };
  var REVERSE = {};
  Object.keys(MORSE).forEach(function (k) { REVERSE[MORSE[k]] = k; });

  // Betriebsabkürzungen KA (Anfang) / AR (Ende): je zwei Buchstaben ohne
  // Zwischenraum gesendet, daher eigene Sentinel-Zeichen statt "K"+"A" bzw.
  // "A"+"R", damit sie nie mit normalem Übungstext kollidieren.
  var PROSIGN_START = String.fromCharCode(1);
  var PROSIGN_END = String.fromCharCode(2);
  MORSE[PROSIGN_START] = "-.-.-";
  MORSE[PROSIGN_END] = ".-.-.";

  var KOCH_ORDER = ["K","M","U","R","S","A","P","T","L","O","W","I",".","N","J","E","F","0","Y",",",
                     "V","G","5","/","Q","9","Z","H","3","8","B","?","4","2","7","C","1","D","6","X"];

  // ---------- State ----------
  var state = {
    unlockedCount: 2,
    charSpeedWpm: 15,
    effWpm: 5,
    autoAdvance: true,
    fixedGroups: true,
    charStats: {},   // letter -> {c: correct, t: total}
    totalReps: 0
  };
  var recentBuffer = []; // rolling booleans for promotion check
  var STORAGE_KEY = "cohrwurm-progress-v1";
  var saveTimer = null;

  function dotMs(wpm) { return 1200 / wpm; }

  function timing() {
    var charWpm = state.charSpeedWpm;
    var effWpm = Math.min(state.effWpm, charWpm);
    var dit = dotMs(charWpm);
    var dash = dit * 3;
    var intraGap = dit;
    if (effWpm >= charWpm) {
      return { dit: dit, dash: dash, intraGap: intraGap, charGap: dit * 3, wordGap: dit * 7 };
    }
    var effDit = dotMs(effWpm);
    return { dit: dit, dash: dash, intraGap: intraGap, charGap: effDit * 3, wordGap: effDit * 7 };
  }

  function unlockedChars() { return KOCH_ORDER.slice(0, state.unlockedCount); }

  function weightedChar() {
    var pool = unlockedChars();
    var weights = pool.map(function (c, i) {
      var s = state.charStats[c];
      var acc = s && s.t >= 3 ? s.c / s.t : 0.5;
      var recency = 1 + (pool.length - i) * 0.15; // newer chars weigh more
      var weakness = 1 + (1 - acc) * 1.5;
      return recency * weakness;
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function weightedGroup(len) {
    var out = "";
    for (var i = 0; i < len; i++) out += weightedChar();
    return out;
  }

  function recordResult(ch, correct) {
    if (!state.charStats[ch]) state.charStats[ch] = { c: 0, t: 0 };
    state.charStats[ch].t++;
    if (correct) state.charStats[ch].c++;
    state.totalReps++;
    recentBuffer.push(correct);
    if (recentBuffer.length > 20) recentBuffer.shift();
    maybePromote();
    refreshMeters();
    scheduleSave();
  }

  function maybePromote() {
    if (!state.autoAdvance) return;
    if (recentBuffer.length < 20) return;
    var hits = recentBuffer.filter(Boolean).length;
    if (hits / recentBuffer.length < 0.9) return;
    if (state.effWpm < state.charSpeedWpm) {
      state.effWpm = Math.min(state.charSpeedWpm, state.effWpm + 1);
    } else if (state.unlockedCount < KOCH_ORDER.length) {
      state.unlockedCount++;
    } else {
      state.charSpeedWpm = Math.min(35, state.charSpeedWpm + 1);
    }
    recentBuffer = [];
  }

```

Replace it with:

```html
<script type="module">
import {
  MORSE, REVERSE, KOCH_ORDER, PROSIGN_START, PROSIGN_END,
  state, timing, unlockedChars, weightedChar, weightedGroup,
  recordResult, nextPromotion, toDots, buildSchedule
} from './logic.mjs';

(function () {
  "use strict";

  // ---------- Persistence bookkeeping ----------
  // (Morse data, Koch order, adaptive-logic state and pure functions now
  // live in logic.mjs and are imported above; this file keeps
  // persistence, audio and UI/rendering.)
  var STORAGE_KEY = "cohrwurm-progress-v1";
  var saveTimer = null;

```

(The next line in the file, `function promotionBlockHtml() {`, is untouched by this edit — it immediately follows.)

Note: `dotMs` and `maybePromote` are deliberately **not** imported here even though `logic.mjs` exports them — neither has any call site left in `index.html` after this extraction (`dotMs` was only ever called from within `timing()`, and `maybePromote` only from within `recordResult()`, both of which moved to `logic.mjs` wholesale). Importing either would trigger ESLint's `no-unused-vars` in Task 7. They stay exported from `logic.mjs` because `logic.test.mjs` imports and tests both directly.

- [ ] **Step 3: `index.html` — `promotionBlockHtml()` uses `nextPromotion()` and `state.recentBuffer`**

Find (inside `promotionBlockHtml()`):

```js
    var action;
    var nextCharHint = "";
    if (state.effWpm < state.charSpeedWpm) {
      action = "das Effektiv-Tempo auf " + Math.min(state.charSpeedWpm, state.effWpm + 1) + " WPM erhöht";
      if (state.unlockedCount < KOCH_ORDER.length) {
        nextCharHint = '<p class="hint">Erst sobald das Effektiv-Tempo ' + state.charSpeedWpm + ' WPM erreicht (aktuell ' + state.effWpm + '), wird "' + KOCH_ORDER[state.unlockedCount] + '" freigeschaltet.</p>';
      }
    } else if (state.unlockedCount < KOCH_ORDER.length) {
      action = "das nächste Zeichen (\"" + KOCH_ORDER[state.unlockedCount] + "\") freigeschaltet";
    } else {
      action = "das Zeichen-Tempo auf " + Math.min(35, state.charSpeedWpm + 1) + " WPM erhöht";
    }
    var n = recentBuffer.length;
    var hits = recentBuffer.filter(Boolean).length;
```

Replace with:

```js
    var promo = nextPromotion();
    var action;
    var nextCharHint = "";
    if (promo.type === "raiseEff") {
      action = "das Effektiv-Tempo auf " + promo.value + " WPM erhöht";
      if (state.unlockedCount < KOCH_ORDER.length) {
        nextCharHint = '<p class="hint">Erst sobald das Effektiv-Tempo ' + state.charSpeedWpm + ' WPM erreicht (aktuell ' + state.effWpm + '), wird "' + KOCH_ORDER[state.unlockedCount] + '" freigeschaltet.</p>';
      }
    } else if (promo.type === "unlock") {
      action = "das nächste Zeichen (\"" + promo.value + "\") freigeschaltet";
    } else {
      action = "das Zeichen-Tempo auf " + promo.value + " WPM erhöht";
    }
    var n = state.recentBuffer.length;
    var hits = state.recentBuffer.filter(Boolean).length;
```

- [ ] **Step 4: `index.html` — remove now-duplicated `buildSchedule()`**

Find (inside the Audio section):

```js
  function buildSchedule(text, t) {
    var seq = text.toUpperCase().split("");
    var events = [];
    for (var i = 0; i < seq.length; i++) {
      var ch = seq[i];
      if (ch === " ") continue;
      var pattern = MORSE[ch];
      if (!pattern) continue;
      for (var j = 0; j < pattern.length; j++) {
        events.push({ tone: true, ms: pattern[j] === "." ? t.dit : t.dash });
        if (j < pattern.length - 1) events.push({ tone: false, ms: t.intraGap });
      }
      var next = seq[i + 1];
      if (next === undefined) {
        // no trailing gap
      } else if (next === " ") {
        events.push({ tone: false, ms: t.wordGap });
      } else {
        events.push({ tone: false, ms: t.charGap });
      }
    }
    return events;
  }

  function setLamp(on) {
```

Replace with just:

```js
  function setLamp(on) {
```

- [ ] **Step 5: `index.html` — remove now-duplicated `toDots()`**

Find:

```js
  function toDots(pattern) {
    return pattern.replace(/\./g, "·").replace(/-/g, "−");
  }

  function renderCheatsheet() {
```

Replace with just:

```js
  function renderCheatsheet() {
```

- [ ] **Step 6: `index.html` — `evaluateCopy()` performs the side effects `recordResult()` no longer does**

Find:

```js
      recordResult(e, ok);
      html += '<span class="' + (ok ? "ok" : "no") + '">' + e + "</span>";
```

Replace with:

```js
      recordResult(e, ok);
      refreshMeters();
      scheduleSave();
      html += '<span class="' + (ok ? "ok" : "no") + '">' + e + "</span>";
```

- [ ] **Step 7: `index.html` — reset button uses `state.recentBuffer`**

Find:

```js
      state.totalReps = 0;
      recentBuffer = [];
      refreshMeters();
```

Replace with:

```js
      state.totalReps = 0;
      state.recentBuffer = [];
      refreshMeters();
```

- [ ] **Step 8: Verify — automated smoke check**

Run: `node --test`
Expected: PASS (unchanged — this task doesn't touch `logic.mjs`/`logic.test.mjs`).

Start the server in the background: `node server.js` (default port 8080; use `run_in_background` if your tool supports it, otherwise open a second terminal).

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8080/logic.mjs`
Expected: `200 text/javascript; charset=utf-8`

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8080/`
Expected: `200 text/html; charset=utf-8`

- [ ] **Step 9: Verify — manual browser smoke check**

Open `http://localhost:8080` in a browser (use browser automation tooling if available; if not, state explicitly in your task report that this step needs a human to confirm, per the "don't claim UI success you couldn't observe" rule).

Check:
- No errors in the DevTools console on load (a module import error here means Step 2's edit or Step 1's MIME type is wrong).
- "Hören" tab: click Abspielen, type along, submit — hear tones, see diff highlighting, see the meter row update (Durchgänge count increases).
- "Geben" tab: press/hold the on-screen key or Space bar — tone plays, decoded letters appear.
- "Flashcards" tab: click a few letters — correct/incorrect feedback shows.
- "Fortschritt" tab: promotion status text renders (in German, matching the original wording), sliders work, "Fortschritt zurücksetzen" resets the meters back to 2/40, 15 WPM, 5 WPM, 0 Durchgänge.
- Reload the page — progress persisted via localStorage survives the reload (confirms `loadProgress`/`doSave` still work against `state` unchanged).

Stop the background server once verified.

---

### Task 7: ESLint flat config

**Files:**
- Create: `eslint.config.mjs`

**Interfaces:**
- Consumes: `eslint`, `@eslint/js`, `eslint-plugin-html` (installed in Task 1); lints `logic.mjs`, `logic.test.mjs`, `server.js`, `index.html` (Tasks 2–6).

- [ ] **Step 1: Create `eslint.config.mjs`**

(Named `.mjs`, not `.js`, so it can use `import`/`export` without needing `"type": "module"` in `package.json` — see Global Constraints.)

```js
import js from "@eslint/js";
import html from "eslint-plugin-html";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  process: "readonly",
  __dirname: "readonly",
  console: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["logic.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals
    }
  },
  {
    files: ["logic.test.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    }
  },
  {
    files: ["server.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  },
  {
    files: ["**/*.html"],
    plugins: { html },
    processor: "html/html",
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    ignores: ["node_modules/**"]
  }
];
```

- [ ] **Step 2: Run lint and fix whatever it actually reports**

Run: `npm run lint`

If it fails with a **configuration/loading error** (not a code finding) mentioning the `html` plugin or its processor — `eslint-plugin-html`'s flat-config API can differ slightly by version — open `node_modules/eslint-plugin-html/README.md` and check its "Flat Config" section for the exact plugin-registration/processor key it expects for the installed version, then adjust the `plugins`/`processor` lines above to match. Re-run `npm run lint` after any such adjustment.

If it reports actual **lint findings** (not a config error), fix them in the flagged file (`logic.mjs`, `logic.test.mjs`, `server.js`, or `index.html`) — do not disable rules to silence real findings unless a specific rule is clearly inappropriate for this project (if so, note which rule and why in your task report).

Expected end state: `npm run lint` exits 0 with no output.

---

### Task 8: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm ci` / `npm run lint` / `npm test` (Tasks 1–7). Dormant until a GitHub remote exists (Task 9 only does a local `git init`, no remote) — this task cannot be verified by actually triggering a run; verify by careful reading instead.

- [ ] **Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Verify**

There is no GitHub remote yet, so this cannot be run in CI as part of this task. Instead:
- Re-read the file and confirm the three run steps (`npm ci`, `npm run lint`, `npm test`) exactly match the `scripts` in `package.json` (Task 1) and that `npm ci` will succeed given `package-lock.json` exists (created in Task 1, to be committed in Task 9 — `npm ci` fails without a lockfile present in the repo).
- Confirm `actions/checkout@v4` and `actions/setup-node@v4` are spelled correctly (typos here fail silently only when the workflow actually runs, so get them right by inspection).

---

### Task 9: Initialize git and create the first commit

**Files:** none (repository-level operation covering everything from Tasks 1–8, plus the pre-existing `index.html`/`server.js`/`CLAUDE.md`/spec/plan docs).

**Interfaces:** none — this is the final task.

- [ ] **Step 1: Confirm the working tree is clean and complete**

Run: `npm test` and `npm run lint` one more time — both must pass before committing anything.

- [ ] **Step 2: Initialize the repository**

Run: `git init`

- [ ] **Step 3: Stage everything**

Run: `git add -A`

Run: `git status`
Expected: shows `index.html`, `server.js`, `CLAUDE.md`, `package.json`, `package-lock.json`, `.gitignore`, `logic.mjs`, `logic.test.mjs`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `docs/superpowers/specs/2026-09-14-linting-and-tests-design.md`, `docs/superpowers/plans/2026-09-14-linting-and-tests.md` staged for commit — and does **not** show `node_modules/` (confirms `.gitignore` is working).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Initial commit: CohrWurm Morse trainer, plus linting and tests

Adds ESLint (flat config, including the inline script in index.html
via eslint-plugin-html) and a node:test unit-test suite for the
adaptive-logic, extracted from index.html's inline script into a new
logic.mjs ES module. A GitHub Actions workflow runs both on push/PR.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016YgsW3nukhtq1LpJw41i9o
EOF
)"
```

- [ ] **Step 5: Verify**

Run: `git log --oneline`
Expected: one commit.

Run: `git status`
Expected: clean working tree.
