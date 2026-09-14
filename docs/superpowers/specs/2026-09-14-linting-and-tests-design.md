# CohrWurm: Linter & Tests — Design

Date: 2026-09-14
Status: Approved, pending implementation (revised after Opus review against actual code)

## Purpose

CohrWurm currently has no build tooling, no package manager, no test suite,
and no linter (a deliberate simplification documented in CLAUDE.md). This
adds a minimal, dependency-light dev-tooling layer — a linter and a unit
test suite for the app's core adaptive-logic — without changing how the
app itself is run or deployed (`node server.js`, zero install, single
`index.html` shell stays the source of truth for UI/rendering).

## Non-goals (YAGNI)

- No UI/E2E tests (e.g. Playwright). Only the pure adaptive-logic is
  covered by tests.
- No bundler/build step for the app itself. `type="module"` is served
  directly by the existing static file server.
- No code formatter (Prettier or similar) — not requested.
- No coverage tooling.

## Revision note

An Opus-model review of the first draft of this spec, checked directly
against `index.html`/`server.js`, found several inaccuracies and one real
behavioral bug. This revision folds in the fixes. Original draft is
superseded; no need to diff against it.

## File structure changes

### `logic.mjs` (new — note the `.mjs` extension, not `.js`)

An ES module extracted from the inline `<script>` in `index.html`,
containing the app's pure/state-driven adaptive logic (not
DOM/Audio-object/localStorage-dependent code):

- Data: `MORSE`, `REVERSE`, `KOCH_ORDER`, `PROSIGN_START`, `PROSIGN_END`
- State: `state` — the single mutable state object. `recentBuffer` (the
  rolling 20-attempt promotion buffer) moves from its current module-level
  `var` into `state.recentBuffer`, since a plain top-level `var` cannot be
  reassigned (`recentBuffer = []`) once it's an ES module export — imported
  bindings are read-only live references. This is a behavior-neutral
  relocation, not a logic change.
- Functions: `dotMs()`, `timing()`, `unlockedChars()`, `weightedChar()`,
  `weightedGroup()`, `recordResult()`, `maybePromote()`, `toDots()`,
  `buildSchedule(text, t)`, `nextPromotion()` (new, see below)

**`recordResult()` becomes purely state-mutating.** Currently it also calls
`refreshMeters()` and `scheduleSave()`, both of which stay inline in
`index.html` — extracting it unchanged would create a `logic.mjs` →
`index.html` back-dependency. `recordResult()` keeps only: updating
`state.charStats`, `state.totalReps`, `state.recentBuffer`, and calling
`maybePromote()`. Its single caller, `evaluateCopy()` (stays inline), makes
the `refreshMeters()`/`scheduleSave()` calls itself immediately after
calling `recordResult()` — no behavior change, just moving two calls to
the call site.

**`weightedChar()` recency-weighting bug fix.** The current formula
(`recency = 1 + (pool.length - i) * 0.15`) weighs *older* (earlier-unlocked)
characters more heavily, contradicting both its own inline comment
("newer chars weigh more") and CLAUDE.md's description of the intended
behavior. Fixed as part of this work to `recency = 1 + i * 0.15`, so
higher index (more recently unlocked) characters actually get the higher
weight. This is a small, deliberate behavior change to the learner-facing
character-selection bias, not just a tooling change — tests assert the
*intended* (fixed) behavior.

**`buildSchedule(text, t)` is included** (moved from "stays inline" in the
original draft) — verified to be pure (no Web Audio/DOM calls, takes
`text` and a `timing()` result as plain arguments, returns an array of
`{tone, ms}` events). It's the highest-value test target for prosign
fusion and word/char gap correctness, so it moves into `logic.mjs`
alongside the rest.

**`nextPromotion()` (new, small extraction).** `promotionBlockHtml()`
(stays inline in `index.html`) currently duplicates the entire promotion
decision tree (effWpm-vs-charSpeedWpm gap, next-unlock, speed-raise, the
`Math.min(35, …)` cap) purely to build its status text, independent of
`maybePromote()`'s copy of the same rules. `nextPromotion()` factors this
shared "what happens on the next promotion" decision into one function in
`logic.mjs` that both `maybePromote()` and `promotionBlockHtml()` call, so
the rule set exists in exactly one place.

Explicitly NOT moved into `logic.mjs` (stays inline in `index.html`,
unchanged): `loadProgress()`/`scheduleSave()`/`doSave()` (localStorage),
the rest of the Web Audio engine (`ctx()`, `setLamp()`, `playText()`,
`keyToneOn()`/`keyToneOff()`), and all `render*()`/event handler/UI code.

### `index.html` (changed)

The existing inline `<script>` becomes `<script type="module">` and
imports the extracted names from `./logic.mjs`:

```html
<script type="module">
  import { MORSE, REVERSE, KOCH_ORDER, PROSIGN_START, PROSIGN_END,
           state, dotMs, timing, unlockedChars, weightedChar,
           weightedGroup, recordResult, maybePromote, toDots,
           buildSchedule, nextPromotion } from './logic.mjs';
  // ...rest of the existing inline script, unchanged except:
  //  - recentBuffer references become state.recentBuffer
  //  - evaluateCopy() calls refreshMeters()+scheduleSave() right after recordResult()
  //  - promotionBlockHtml() calls nextPromotion() instead of re-deriving the same rules
</script>
```

Works unmodified against `server.js` because the app is always served over
HTTP, which module scripts require — never opened via `file://`.

### `server.js` (one-line change)

Add `.mjs` to the `TYPES` map (`"text/javascript; charset=utf-8"`, same as
`.js`) so `logic.mjs` is served with the correct content type. This was
incorrectly described as "no changes" in the original draft — corrected
here. No other change; still plain CommonJS, unaffected by anything in
`package.json`.

### `logic.test.mjs` (new)

Unit tests using Node's built-in test runner (`node:test` +
`node:assert/strict` — zero dependencies, Node 18+; `node --test`
auto-discovers `*.test.mjs` files same as `*.test.js`). Covers:

- `dotMs()` / `timing()` — dit/dash/gap durations at various
  `charSpeedWpm`/`effWpm` combinations, confirming the simplified
  Farnsworth model.
- `buildSchedule()` — prosign fusion (`PROSIGN_START`/`END` sentinels
  produce one unbroken event run), word gaps vs. char gaps vs. no
  trailing gap at end of text.
- `weightedChar()` — confirms the fixed recency bias (newer/weaker
  characters weigh more); `Math.random` is stubbed for deterministic
  assertions.
- `recordResult()` / `maybePromote()` / `nextPromotion()` — the
  90%-over-20-attempts threshold, and the fixed promotion order (close
  `effWpm`→`charSpeedWpm` gap first, then unlock next Koch character, then
  raise `charSpeedWpm` once fully unlocked); confirms `recordResult()`
  does NOT call `refreshMeters`/`scheduleSave` (they don't exist in this
  module at all, so this is implicit).
- `toDots()` — pattern-to-visual-dots formatting.

Each test resets `state` (including `state.recentBuffer`) to a known
baseline in a `beforeEach` hook, since `state` is a shared mutable
singleton module-level export.

### `package.json` (new)

No `"type": "module"` at the package level — `server.js` stays plain
CommonJS (`require`, `__dirname`) and is unaffected. `logic.mjs` and
`logic.test.mjs` are ESM by virtue of their `.mjs` extension, independent
of this setting; the browser side (`<script type="module">` in
`index.html`) never consults `package.json` at all.

```json
{
  "name": "cohrwurm",
  "private": true,
  "scripts": {
    "test": "node --test",
    "lint": "eslint ."
  },
  "devDependencies": {
    "eslint": "...",
    "eslint-plugin-html": "..."
  }
}
```

`npm install` is needed only for this dev tooling. Running the app itself
(`node server.js`) remains a zero-install operation, per CLAUDE.md.
`package-lock.json` (generated by `npm install`) is committed — required
for `npm ci` in CI to work.

### `eslint.config.js` (new, flat config)

Lints `logic.mjs`, `logic.test.mjs`, `server.js`, and the inline
`<script type="module">` block inside `index.html` (via
`eslint-plugin-html`, which extracts `<script>` contents from HTML files
for linting — needs an explicit `files: ["**/*.html"]` block in flat
config; ESLint doesn't lint `.html` by default even with the plugin
installed). Three separate config blocks:

- Browser globals (`window`, `document`, `localStorage`, `AudioContext`,
  etc.), `sourceType: "module"`, for `index.html` and `logic.mjs`.
- Node/CommonJS globals (`require`, `process`, `__dirname`) for
  `server.js`.
- `no-empty: ["error", { allowEmptyCatch: true }]` for the block covering
  `index.html`/`logic.mjs`/`server.js` — `loadProgress()`/`doSave()` in
  `index.html` have two intentional empty `catch {}` blocks (swallowing
  localStorage/JSON errors by design); without this the default `no-empty`
  rule flags both immediately on first lint run.

### `.gitignore` (new)

```
node_modules/
```

### `.github/workflows/ci.yml` (new)

Runs on push/PR: `actions/checkout`, `actions/setup-node` (pinned Node
major version, e.g. 20, matching what's used locally, with npm caching
enabled), `npm ci`, `npm run lint`, `npm test`. Dormant until a GitHub
remote exists, but ready to go the moment one is pushed.

## Testing strategy for this change itself

After implementation:
1. `npm install` (generates and commits `package-lock.json`)
2. `npm run lint` — must pass clean across `logic.mjs`, `server.js`,
   `logic.test.mjs`, and the inline script in `index.html`.
3. `npm test` — all `logic.test.mjs` cases pass.
4. Manual smoke check: `node server.js`, load the app in a browser,
   confirm Copy/Send/Flashcards/Progress tabs still work (module import
   didn't break anything at runtime, `recentBuffer`/`recordResult`/
   `promotionBlockHtml` refactors didn't change observable behavior except
   the deliberate `weightedChar()` fix), confirm no console errors.

## Sequencing note

This repo is not yet a git repository. Per the user's explicit request,
`git init` + the first commit happen *after* this tooling work is
complete and verified, as one clean initial commit covering the existing
app plus the new tooling — not as part of this design/implementation step
itself.
