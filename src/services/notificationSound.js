/* =========================================================
   Notification sound — a bell-style "cue" (ding … dong) made with
   the Web Audio API, or your own file at
   public/sounds/notification-cue.mp3 if you add one.
   Browsers only allow sound after the user has interacted with
   the page once, so the AudioContext is unlocked on the first
   click / key press.
   The on/off choice is kept per browser in localStorage.
========================================================= */

const STORAGE_KEY = "notificationSound";

let ctx = null;
let lastPlayed = 0;

const getContext = () => {
  if (ctx) return ctx;
  const AudioCtx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  return ctx;
};

const unlock = () => {
  const c = getContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
};

if (typeof window !== "undefined") {
  ["pointerdown", "keydown"].forEach((evt) => window.addEventListener(evt, unlock, { passive: true }));
}

export const isSoundEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

export const setSoundEnabled = (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* sound choice just isn't remembered */
  }
};

// A struck-bell "cue": a fundamental plus a few bell partials that ring out and fade
const bell = (c, freq, start, duration, volume) => {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  out.connect(c.destination);

  [
    [1, 1],
    [2, 0.45],
    [3, 0.22],
    [4.2, 0.12],
  ].forEach(([ratio, level], i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * ratio, start);
    gain.gain.setValueAtTime(level, start);
    // higher partials die away faster, like a real bell
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration / (1 + i * 0.8));
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
};

// Your own cue file wins: put it at frontend/public/sounds/notification-cue.mp3
const CUE_FILE = "/sounds/notification-cue.mp3";
let cueFileMissing = false;

const playCueFile = () =>
  new Promise((resolve, reject) => {
    if (cueFileMissing) return reject(new Error("no cue file"));
    const audio = new Audio(CUE_FILE);
    audio.volume = 0.8;
    audio.addEventListener("error", () => {
      cueFileMissing = true;
      reject(new Error("no cue file"));
    }, { once: true });
    audio.play().then(resolve, reject);
  });

const playCueSynth = (kind) => {
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const t = c.currentTime + 0.01;
  if (kind === "chat") {
    bell(c, 1318.5, t, 0.7, 0.22); // single soft "ding"
  } else if (kind === "urgent") {
    bell(c, 1046.5, t, 0.5, 0.28); // ding-ding-DONG
    bell(c, 1046.5, t + 0.2, 0.5, 0.28);
    bell(c, 783.99, t + 0.42, 1.2, 0.3);
  } else {
    bell(c, 1046.5, t, 1.0, 0.26); // classic two-tone cue: ding … dong
    bell(c, 783.99, t + 0.22, 1.3, 0.26);
  }
};

/** "You win" fanfare for a completed task (always the built-in sound). */
export const playWinSound = ({ force = false } = {}) => {
  if (!force && !isSoundEnabled()) return;
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  // rising arpeggio C-E-G-C … then a held major chord
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(c, f, t + i * 0.11, 0.5, 0.2));
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => bell(c, f, t + 0.5, 1.6, 0.12));
};

/**
 * Play the cue sound. kind: "notification" | "chat" | "urgent".
 * force → play even when muted (the "test sound" button).
 */
export const playNotificationSound = (kind = "notification", { force = false } = {}) => {
  if (!force && !isSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - lastPlayed < 800) return; // a burst of events → one cue
  lastPlayed = now;

  // urgent reminders keep their own pattern; everything else uses the custom file if present
  if (kind === "urgent") {
    playCueSynth(kind);
    return;
  }
  playCueFile().catch(() => playCueSynth(kind));
};
