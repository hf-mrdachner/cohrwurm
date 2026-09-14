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
