# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CohrWurm is a personal, German-language Morse code (CW) trainer for an amateur radio hobbyist, built around the Koch method. It started as a Claude Artifact and was moved to a local static site so it doesn't depend on any particular Claude account login. The runtime app itself is still dependency-free and zero-install (`node server.js` and nothing else, no `npm install` needed to run it). There is now, in addition, a dev-tooling layer — ESLint and Node's built-in `node:test` — that does require `npm install` before `npm run lint`/`npm test` will work; see Commands below.

## Commands

Run the app locally:
```
node server.js
```
Serves on `http://localhost:8080` (override with `PORT=xxxx node server.js`). `server.js` is a dependency-free Node static file server — no `npm install` step exists or is needed to run the app. Edits to `index.html` or `logic.mjs` take effect on browser reload; the server does not need restarting (it reads files from disk per request). Because `index.html` loads `logic.mjs` via `<script type="module">`, the app can no longer be opened directly from disk (`file://...`) — module imports are blocked by CORS in that context — so it must be served over HTTP via `node server.js`.

Dev tooling (linting, tests) is a separate, optional layer with its own dependencies:
```
npm install
npm run lint
npm test
```
`npm install` is only needed once, to pull in the dev-only dependencies (`eslint`, `eslint-plugin-html`, `@eslint/js`) declared in `package.json`. `npm run lint` runs ESLint (`eslint.config.mjs`, flat config), which also lints the inline script in `index.html` via `eslint-plugin-html`. `npm test` runs `node --test`, which executes `logic.test.mjs` (19 unit tests via `node:test`) against `logic.mjs`. Neither is required to run the app itself.

## Architecture

The app is split across two files. `logic.mjs` is an ES module holding the Morse/Koch data and the pure/state-driven adaptive logic: `MORSE`/`REVERSE`, `KOCH_ORDER`, `PROSIGN_START`/`PROSIGN_END`, the `state` object, `dotMs`/`timing`, `unlockedChars`, `weightedChar`/`weightedGroup`, `recordResult`/`nextPromotion`/`maybePromote`, `toDots`, and `buildSchedule`. This module has no DOM or Web Audio dependency and is unit-tested directly by `logic.test.mjs`. `index.html` — HTML shell + inline `<style>` + inline `<script type="module">` (a single IIFE) — imports from `logic.mjs` and keeps everything else: UI rendering, Web Audio playback, localStorage persistence, and the `promotionBlockHtml()`/event-handling glue. `server.js` only serves static files and has no other role; when this is eventually deployed to a Hetzner VPS, the intent is to run the same `server.js` as-is (behind nginx/TLS), so keep server-side logic out of it unless the deployment plan changes.

Inside `logic.mjs` and the `index.html` script, in order of concern:

- **Morse data** (`logic.mjs`): `MORSE` (char → dit/dash pattern) and `REVERSE` (pattern → char) cover A–Z, 0–9, and `. , ? /`. `KOCH_ORDER` is the fixed 40-character Koch-method teaching order (the LCWO.net sequence) — this array's order *is* the curriculum; unlocking is just an index into it.
- **State & adaptive logic** (`logic.mjs`): `state` holds `unlockedCount` (how far into `KOCH_ORDER` the learner has progressed), `charSpeedWpm`/`effWpm` (character speed vs. effective/Farnsworth speed), `charStats` (per-character correct/total), and `totalReps`. `recordResult()` feeds a rolling 20-attempt `recentBuffer`; `maybePromote()` checks it against a 90% threshold and advances in a fixed order: first close the gap between `effWpm` and `charSpeedWpm`, then unlock the next Koch character, then (once everything is unlocked) raise `charSpeedWpm` itself. `weightedChar()` biases random character selection toward newer/weaker characters using this same `charStats`. `index.html` imports these and reads `nextPromotion()` to render the promotion-progress copy in `promotionBlockHtml()`.
- **Persistence** (`index.html`): `localStorage` only (key `cohrwurm-progress-v1`), synchronous, debounced via `scheduleSave()`. There is no cross-device sync — that's a deliberate simplification for now (an earlier Claude-Artifact version used a real per-user database; the plan is to reintroduce shared/cross-device persistence with a small backend once this is deployed to Hetzner).
- **Audio engine** (`index.html`): pure Web Audio API, no audio files. `timing()` computes dit/dash/gap durations from `charSpeedWpm`/`effWpm` — note this is a *simplified* Farnsworth model (dits/dashes/intra-character gaps run at character speed; inter-character/inter-word gaps run at the slower effective speed), not the exact ARRL ratio formula. `playText()` schedules a whole string as one batch of oscillators against `AudioContext.currentTime` and drives the header "lamp" indicator via `setTimeout`s computed from that same schedule. `keyToneOn()`/`keyToneOff()` are a separate always-on oscillator (gain-gated) used for live manual keying in Send mode, not for scheduled playback.
- **UI shell** (`index.html`): `render()` dispatches on `currentTab` (`copy` | `send` | `flash` | `progress`) into the matching `render*()` function, which rebuilds `#screen`'s contents from scratch each time. The cheat-sheet panel (`renderCheatsheet()`) is *not* part of this tab system — it's global chrome refreshed from `refreshMeters()` so it stays in sync regardless of which tab is active. Event listeners that must not be re-registered on every render (window-level Space-bar keying, the cheat-sheet's click-to-play delegation) are attached once at boot, not inside the per-render functions — re-adding them per render was an earlier bug.
- **Practice modes** (`index.html`): Copy/"Hören" (`renderCopy`/`evaluateCopy` — the learner types live *while* audio plays, not from memory), Send/"Geben" (`renderSend` + the `onKeyDown`/`onKeyUp`/`finalizeSendChar` state machine — times key presses against `timing().dit` to decode dit/dah, Space bar or the on-screen key both drive it), and Flashcards (`renderFlash`/`answerFlash` — single character, click the matching letter). Only Copy/"Hören" routes results through `recordResult()` (feeding `charStats`/`totalReps`/promotion) — it's the one mode that drives Koch progression, matching the method's focus on receiving over sending. Send and Flashcards deliberately don't call it; both still read `charStats` via `weightedChar()`/`weightedGroup()` for character selection, but neither writes to it, so neither counts toward "Durchgänge" or influences promotion.
- **Prosigns**: `PROSIGN_START`/`PROSIGN_END` (`logic.mjs`, near `MORSE`) are sentinel single-character keys (`String.fromCharCode(1)`/`(2)`) mapped to the fused KA/AR patterns (`-.-.-`/`.-.-.`) — sent as one unbroken character, unlike two normal letters in sequence. Used to bookend Copy-mode playback (`doPlay`) and exposed as extra tiles in the cheat sheet (`renderCheatsheet`, matched by the literal `"KA"`/`"AR"` label in the click handler, not the sentinel value, since sentinel bytes never touch the DOM).
- **Theming**: CSS custom properties on `:root`, redefined under `prefers-color-scheme: dark` and `[data-theme]` for explicit overrides — standard light/dark/system pattern, tokens only (no color literals in component rules).
