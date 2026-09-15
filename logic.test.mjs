import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state, KOCH_ORDER, PROSIGN_START, dotMs, timing, unlockedChars, toDots, weightedChar, weightedGroup, recordResult, nextPromotion, buildSchedule, classifySendPress, sendLetterGapMs, alignCopyAttempt } from "./logic.mjs";

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

const T = { dit: 60, dash: 180, intraGap: 60, charGap: 180, wordGap: 420 };

test("sendLetterGapMs derives the Send-mode letter-boundary pause from the learner's own adaptive unit (3x), not a fixed value", () => {
  assert.equal(sendLetterGapMs(80), 240);
  assert.equal(sendLetterGapMs(200), 600);
});

test("sendLetterGapMs must not silently balloon back up to the slow Farnsworth charGap from timing() - it ignores charSpeedWpm/effWpm entirely", () => {
  state.charSpeedWpm = 15;
  state.effWpm = 5; // timing().charGap would be 720ms here - a real regression risk
  assert.equal(sendLetterGapMs(80), 240);
});

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

test("classifySendPress reads a press at or below the window's midpoint as a dot", () => {
  const result = classifySendPress([80, 240], 100); // midpoint 160
  assert.equal(result.symbol, ".");
});

test("classifySendPress reads a press above the window's midpoint as a dash", () => {
  const result = classifySendPress([80, 240], 220); // midpoint 160
  assert.equal(result.symbol, "-");
});

test("classifySendPress appends the press to the window and caps it at 8 entries", () => {
  const result = classifySendPress([1, 2, 3, 4, 5, 6, 7, 8], 999);
  assert.deepEqual(result.window, [2, 3, 4, 5, 6, 7, 8, 999]);
});

test("classifySendPress clamps an extreme press before it can distort the window", () => {
  const result = classifySendPress([80, 240], 50000);
  assert.ok(Math.max(...result.window) <= 1500);
});

test("classifySendPress recovers cleanly for a real, noisy recording of an actual (non-professional) spacebar session", () => {
  // Real durations captured from an actual user's attempts at sending M ("--")
  // and K ("-.-") on a spacebar: their dash:dot ratio ran closer to 1.5-2x
  // than the idealized 3x a fixed-ratio threshold assumes. A single shared
  // threshold (and even a pair of slow-moving averages) locked onto "every
  // press is a dot" here and never recovered, because once a real dash lands
  // on the wrong side of a stale boundary, nothing in that design could ever
  // pull the boundary back down. A rolling min/max of the last few presses
  // has no such one-way ratchet - it's recomputed fresh from actual recent
  // extremes every time, so it must find the real split as more data arrives.
  let window = [80, 240];
  const durations = [176, 232, 224, 272, 152, 136, 264, 296];
  const symbols = [];
  for (const d of durations) {
    const r = classifySendPress(window, d);
    window = r.window;
    symbols.push(r.symbol);
  }
  assert.deepEqual(symbols, ["-", "-", "-", "-", ".", ".", "-", "-"]);
});

test("classifySendPress recovers even when the seed is badly mismatched to the learner's real pace", () => {
  // The learner's real dot (~170ms) sits closer to the nominal 15 WPM seed's
  // *dash* (240ms) than to its dot (80ms) - a case that froze a two-estimate
  // EMA design permanently (the dot estimate never budged from 80ms).
  let window = [80, 240];
  const durations = [290, 170, 260, 280, 300, 250, 190, 310, 270, 290]; // K,M,K,M-shaped
  const symbols = [];
  for (const d of durations) {
    const r = classifySendPress(window, d);
    window = r.window;
    symbols.push(r.symbol);
  }
  assert.deepEqual(symbols, ["-", ".", "-", "-", "-", "-", ".", "-", "-", "-"]);
});

test("classifySendPress still adapts smoothly for a consistent slow learner (200ms dot / 600ms dash)", () => {
  let window = [80, 240];
  for (let i = 0; i < 4; i++) {
    let r = classifySendPress(window, 200); window = r.window;
    r = classifySendPress(window, 600); window = r.window;
  }
  const dotResult = classifySendPress(window, 200);
  const dashResult = classifySendPress(window, 600);
  assert.equal(dotResult.symbol, ".");
  assert.equal(dashResult.symbol, "-");
});

test("alignCopyAttempt marks a perfect match entirely correct", () => {
  assert.deepEqual(alignCopyAttempt("SEND", "SEND"), [
    { ch: "S", ok: true }, { ch: "E", ok: true }, { ch: "N", ok: true }, { ch: "D", ok: true }
  ]);
});

test("alignCopyAttempt charges only the missed character, not everything after it (the #1 regression)", () => {
  // Learner missed the E while copying live and kept going, per the app's own
  // advice to not stop for a missed character - the rest was typed correctly.
  assert.deepEqual(alignCopyAttempt("SEND", "SND"), [
    { ch: "S", ok: true }, { ch: "E", ok: false }, { ch: "N", ok: true }, { ch: "D", ok: true }
  ]);
});

test("alignCopyAttempt still marks a true substitution wrong at its own position", () => {
  assert.deepEqual(alignCopyAttempt("SEND", "SAND"), [
    { ch: "S", ok: true }, { ch: "E", ok: false }, { ch: "N", ok: true }, { ch: "D", ok: true }
  ]);
});

test("alignCopyAttempt ignores an extra inserted character rather than shifting the rest wrong", () => {
  assert.deepEqual(alignCopyAttempt("SEND", "SEXND"), [
    { ch: "S", ok: true }, { ch: "E", ok: true }, { ch: "N", ok: true }, { ch: "D", ok: true }
  ]);
});

test("alignCopyAttempt charges every expected character wrong for an empty attempt", () => {
  assert.deepEqual(alignCopyAttempt("HI", ""), [
    { ch: "H", ok: false }, { ch: "I", ok: false }
  ]);
});

test("alignCopyAttempt charges two separate missed characters without shifting anything between them", () => {
  // MORSE typed as MRE - missed the O and the S, kept the rest correct.
  assert.deepEqual(alignCopyAttempt("MORSE", "MRE"), [
    { ch: "M", ok: true }, { ch: "O", ok: false }, { ch: "R", ok: true },
    { ch: "S", ok: false }, { ch: "E", ok: true }
  ]);
});

test("alignCopyAttempt ignores two separate extra inserted characters", () => {
  // CODE typed as COXDEY - stray X and Y typed in, rest correct.
  assert.deepEqual(alignCopyAttempt("CODE", "COXDEY"), [
    { ch: "C", ok: true }, { ch: "O", ok: true }, { ch: "D", ok: true }, { ch: "E", ok: true }
  ]);
});

test("alignCopyAttempt handles a missed character and an unrelated extra character together", () => {
  // PARIS typed as PRISZ - missed the A, and a stray Z typed at the end;
  // far enough apart that it can't be read as a single substitution.
  assert.deepEqual(alignCopyAttempt("PARIS", "PRISZ"), [
    { ch: "P", ok: true }, { ch: "A", ok: false }, { ch: "R", ok: true },
    { ch: "I", ok: true }, { ch: "S", ok: true }
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
