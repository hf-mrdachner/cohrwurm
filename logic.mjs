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

// Weitere gebräuchliche Betriebszeichen, ebenfalls als fusionierte Sentinels
// (kein Zwischenraum zwischen den Buchstaben, aus denen sie sich historisch
// zusammensetzen): HH (Korrektur), BT (Trennung) und AS (Warten).
export const PROSIGN_CORRECTION = String.fromCharCode(3);
export const PROSIGN_BT = String.fromCharCode(4);
export const PROSIGN_AS = String.fromCharCode(5);
MORSE[PROSIGN_CORRECTION] = "........";
MORSE[PROSIGN_BT] = "-...-";
MORSE[PROSIGN_AS] = ".-...";

export const KOCH_ORDER = ["K","M","U","R","S","A","P","T","L","O","W","I",".","N","J","E","F","0","Y",",",
                   "V","G","5","/","Q","9","Z","H","3","8","B","?","4","2","7","C","1","D","6","X"];

export const state = {
  unlockedCount: 2,
  charSpeedWpm: 15,
  effWpm: 5,
  autoAdvance: true,
  fixedGroups: true,
  effDropOnUnlock: 3,
  charStats: {},   // letter -> {c: correct, t: total}
  totalReps: 0,
  recentBuffer: [],  // rolling booleans for promotion check
  sendWindow: [80, 240]  // last few raw Send-mode press durations (ms); seeded from dotMs(charSpeedWpm) and 3x that
};

export function dotMs(wpm) { return 1200 / wpm; }

var SEND_WINDOW_SIZE = 8;

// Manual keying (mouse/spacebar) can't reliably hit an exact WPM-derived
// dit/dash boundary, especially for beginners - and a real dash:dot ratio
// on a spacebar tends to land closer to 1.5-2x than the idealized 3x. Both a
// single shared threshold and a pair of slow-moving averages can get stuck:
// once a press lands on the wrong side of a stale boundary, nothing pulls
// that boundary back, and the mistake compounds. A rolling window of the
// last few raw presses has no such one-way ratchet - the dot/dash split is
// just this window's min and max, recomputed fresh every time, so genuinely
// new extremes (in either direction) always show up in it immediately.
export function classifySendPress(window, durationMs) {
  var d = durationMs;
  if (d < 20) d = 20;
  if (d > 1500) d = 1500;

  var lo = Math.min.apply(null, window);
  var hi = Math.max.apply(null, window);
  var isDot = d <= (lo + hi) / 2;

  var nextWindow = window.concat([d]);
  if (nextWindow.length > SEND_WINDOW_SIZE) {
    nextWindow = nextWindow.slice(nextWindow.length - SEND_WINDOW_SIZE);
  }
  return { symbol: isDot ? "." : "-", window: nextWindow };
}

// How long to wait after a key-up before treating the character as finished.
// Deliberately based on the learner's own adaptive unit, not timing().charGap:
// that gap is tied to effWpm, which is usually far slower than a real sending
// pace (e.g. 720ms at the default 5 WPM effective speed), so re-using it here
// merges consecutive letters into one unrecognizable run whenever the learner
// pauses less than that between characters - which is most of the time.
export function sendLetterGapMs(unitMs) { return unitMs * 3; }

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

export var PROMOTION_BUFFER_SIZE = 30;
export var CHAR_SOLID_MIN_REPS = 5;
export var CHAR_SOLID_ACC = 0.9;
export var EFF_WPM_MIN = 3;

export function effAfterUnlockDrop(eff, drop) {
  return Math.max(EFF_WPM_MIN, eff - drop);
}

export function charAccuracy(c) {
  var s = state.charStats[c];
  if (!s || s.t < CHAR_SOLID_MIN_REPS) return null;
  return s.c / s.t;
}

export function isCharSolid(c) {
  var acc = charAccuracy(c);
  return acc !== null && acc >= CHAR_SOLID_ACC;
}

// Names the most recently unlocked character while it still isn't solid -
// used to gate unlocking the next one, and to explain the wait in the UI.
export function unlockBlockedBy() {
  if (state.unlockedCount === 0) return null;
  var lastChar = KOCH_ORDER[state.unlockedCount - 1];
  return isCharSolid(lastChar) ? null : lastChar;
}

export function recordResult(ch, correct) {
  if (!state.charStats[ch]) state.charStats[ch] = { c: 0, t: 0 };
  state.charStats[ch].t++;
  if (correct) state.charStats[ch].c++;
  state.totalReps++;
  state.recentBuffer.push(correct);
  if (state.recentBuffer.length > PROMOTION_BUFFER_SIZE) state.recentBuffer.shift();
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
  if (state.recentBuffer.length < PROMOTION_BUFFER_SIZE) return;
  var hits = state.recentBuffer.filter(Boolean).length;
  if (hits / state.recentBuffer.length < 0.9) return;
  var promo = nextPromotion();
  if (promo.type === "unlock" && unlockBlockedBy()) {
    return; // most recently unlocked char isn't proven yet - keep practicing before adding another
  }
  if (promo.type === "raiseEff") state.effWpm = promo.value;
  else if (promo.type === "unlock") {
    state.unlockedCount++;
    // Give the new character more inter-character processing time by easing
    // the effective/Farnsworth speed back down, without touching the
    // character speed itself (Koch's core tenet: characters are always
    // learned at full speed) - it then ramps back up via raiseEff as usual.
    state.effWpm = effAfterUnlockDrop(state.effWpm, state.effDropOnUnlock);
  }
  else state.charSpeedWpm = promo.value;
  state.recentBuffer = [];
}

// Aligns a learner's typed Copy-mode attempt against the expected text via
// edit-distance backtrace (Levenshtein alignment), instead of comparing
// index-for-index. A plain positional compare treats one missed/skipped
// character as a permanent one-position shift, marking every following
// character wrong even though the learner typed the rest correctly. This
// aligns matches/substitutions diagonally and charges only the
// missed/extra characters themselves, so one skip no longer cascades.
export function alignCopyAttempt(expected, got) {
  var n = expected.length, m = got.length;
  var dp = [];
  var row, col;
  for (row = 0; row <= n; row++) dp.push(new Array(m + 1).fill(0));
  for (row = 1; row <= n; row++) dp[row][0] = row;
  for (col = 1; col <= m; col++) dp[0][col] = col;
  for (row = 1; row <= n; row++) {
    for (col = 1; col <= m; col++) {
      var subCost = expected[row - 1] === got[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col - 1] + subCost, // match/substitute
        dp[row - 1][col] + 1,           // deletion: expected char missing from got
        dp[row][col - 1] + 1            // insertion: extra typed char
      );
    }
  }
  var result = [];
  row = n; col = m;
  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && dp[row][col] === dp[row - 1][col - 1] + (expected[row - 1] === got[col - 1] ? 0 : 1)) {
      result.push({ ch: expected[row - 1], ok: expected[row - 1] === got[col - 1] });
      row--; col--;
    } else if (row > 0 && dp[row][col] === dp[row - 1][col] + 1) {
      result.push({ ch: expected[row - 1], ok: false }); // deletion: nothing to charge it against
      row--;
    } else {
      col--; // insertion: extra typed char, doesn't correspond to any expected one
    }
  }
  result.reverse();
  return result;
}

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
