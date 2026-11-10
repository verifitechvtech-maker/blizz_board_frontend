import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../services/socket";
import { playWinSound } from "../services/notificationSound";

/* =========================================================
   "YOU WIN!" screen — shown to the person whose task was completed.
   Backend pushes socket event "task:celebrate" with
   { taskName, approvedBy, earned, score, level, levelUp, newBadges }.
   Confetti + fanfare + animated score counter, game style.
========================================================= */

const COLORS = ["#16a6b8", "#f59e0b", "#ef4444", "#22c55e", "#6366f1", "#ec4899", "#facc15"];

const Confetti = () => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 1.8,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
        round: Math.random() > 0.6,
      })),
    []
  );
  return (
    <div className="cel-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
};

// counts up from the old score to the new one
const useCountUp = (to, from, run) => {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) return undefined;
    let frame;
    const start = performance.now();
    const duration = 1200;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, run]);
  return value;
};

const Celebration = () => {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const closeRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    const onCelebrate = (payload) => {
      if (!payload) return;
      setQueue((q) => (q.some((x) => x.taskId === payload.taskId && x.score === payload.score) ? q : [...q, payload]));
    };
    // other parts of the page can trigger it too
    const onWindow = (e) => onCelebrate(e.detail);
    socket?.on("task:celebrate", onCelebrate);
    window.addEventListener("task:celebrate", onWindow);
    return () => {
      socket?.off("task:celebrate", onCelebrate);
      window.removeEventListener("task:celebrate", onWindow);
    };
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    playWinSound();
    window.dispatchEvent(new CustomEvent("score:updated", { detail: current }));
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setQueue((q) => q.slice(1));
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current]);

  const score = useCountUp(current?.score || 0, Math.max(0, (current?.score || 0) - (current?.earned || 0)), Boolean(current));

  if (!current) return null;
  const close = () => setQueue((q) => q.slice(1));
  const level = current.level || {};

  return (
    <div className="cel-overlay" role="dialog" aria-modal="true" aria-label="Task completed" onClick={close}>
      <style>{`
        .cel-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px;
          background:radial-gradient(circle at 50% 40%,rgba(14,116,144,.55),rgba(6,24,38,.85));animation:celFade .25s ease-out}
        .cel-confetti{position:fixed;inset:0;overflow:hidden;pointer-events:none}
        .cel-confetti span{position:absolute;top:-20px;animation-name:celFall;animation-timing-function:linear;animation-iteration-count:1;animation-fill-mode:forwards}
        .cel-card{position:relative;width:min(420px,100%);padding:30px 24px 22px;border-radius:24px;text-align:center;color:#fff;
          background:linear-gradient(160deg,#0b4f6c,#0f9b91);box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 0 0 2px rgba(255,255,255,.18);
          animation:celPop .55s cubic-bezier(.2,1.6,.4,1)}
        .cel-trophy{font-size:64px;line-height:1;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35));animation:celBounce 1.2s ease-in-out infinite}
        .cel-win{margin:10px 0 2px;font-size:34px;font-weight:900;letter-spacing:.06em;
          background:linear-gradient(90deg,#fde68a,#fff,#fde68a);-webkit-background-clip:text;background-clip:text;color:transparent;
          background-size:200% 100%;animation:celShine 2s linear infinite}
        .cel-sub{margin:0;font-size:13px;opacity:.9}
        .cel-task{margin:6px auto 0;max-width:90%;font-size:14px;font-weight:700;overflow-wrap:anywhere}
        .cel-points{display:inline-block;margin:16px 0 4px;padding:6px 16px;border-radius:999px;background:#facc15;color:#422006;font-size:20px;font-weight:900;
          box-shadow:0 6px 18px rgba(250,204,21,.45);animation:celPop .6s .25s both cubic-bezier(.2,1.6,.4,1)}
        .cel-score{margin-top:10px;font-size:13px;opacity:.9}
        .cel-score strong{display:block;font-size:40px;font-weight:900;line-height:1.1}
        .cel-level{margin:12px auto 0;max-width:300px}
        .cel-level-row{display:flex;justify-content:space-between;font-size:11px;opacity:.9;margin-bottom:5px}
        .cel-bar{height:9px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden}
        .cel-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#fde68a,#facc15);animation:celGrow 1.2s .3s both ease-out}
        .cel-levelup{display:inline-block;margin-top:14px;padding:6px 14px;border-radius:10px;background:rgba(255,255,255,.16);font-weight:900;font-size:15px;animation:celPulse 1s ease-in-out infinite}
        .cel-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:14px}
        .cel-badge{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.14);font-size:12px;font-weight:700;animation:celPop .5s both cubic-bezier(.2,1.6,.4,1)}
        .cel-badge b{font-size:18px}
        .cel-btn{margin-top:20px;padding:11px 26px;border:0;border-radius:12px;background:#fff;color:#0b4f6c;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.25)}
        .cel-btn:focus-visible{outline:3px solid #facc15;outline-offset:2px}
        @keyframes celFall{to{transform:translateY(110vh) rotate(720deg)}}
        @keyframes celPop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes celFade{from{opacity:0}to{opacity:1}}
        @keyframes celBounce{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-10px) rotate(4deg)}}
        @keyframes celShine{to{background-position:-200% 0}}
        @keyframes celGrow{from{width:0}}
        @keyframes celPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
        @media (prefers-reduced-motion: reduce){
          .cel-overlay *,.cel-card{animation:none!important}
          .cel-confetti{display:none}
        }
      `}</style>

      <Confetti />

      <div className="cel-card" onClick={(e) => e.stopPropagation()}>
        <div className="cel-trophy">🏆</div>
        <div className="cel-win">YOU WIN!</div>
        <p className="cel-sub">
          Task completed{current.approvedBy ? ` · approved by ${current.approvedBy}` : ""}
        </p>
        <div className="cel-task">“{current.taskName}”</div>

        <div className="cel-points">+{current.earned} XP</div>

        <div className="cel-score">
          Your score
          <strong>{score}</strong>
        </div>

        <div className="cel-level">
          <div className="cel-level-row">
            <span>{level.icon} {level.name}</span>
            <span>{level.next ? `${level.toNext} to ${level.next}` : "Max level"}</span>
          </div>
          <div className="cel-bar"><i style={{ width: `${level.progress ?? 100}%` }} /></div>
        </div>

        {current.levelUp && <div className="cel-levelup">⬆ LEVEL UP — {level.icon} {level.name}!</div>}

        {current.newBadges?.length > 0 && (
          <div className="cel-badges">
            {current.newBadges.map((b, i) => (
              <span className="cel-badge" key={b.key} style={{ animationDelay: `${0.4 + i * 0.15}s` }} title={b.description}>
                <b>{b.icon}</b> New badge: {b.name}
              </span>
            ))}
          </div>
        )}

        <button type="button" className="cel-btn" ref={closeRef} onClick={close}>
          {queue.length > 1 ? `Next (${queue.length - 1} more)` : "Awesome!"}
        </button>
      </div>
    </div>
  );
};

export default Celebration;
