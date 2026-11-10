import React, { useCallback, useEffect, useState } from "react";
import API from "../../api/config";
import { Trophy, Medal, RefreshCw } from "lucide-react";

/* =========================================================
   Dashboard → Score, level & badges
   GET /api/tasks/scoreboard → { me, leaderboard, levels }
   Points per completed task = the score (1–10) the assigner gives.
   Refreshes live when a task of mine is completed.
========================================================= */

const AchievementsCard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bump, setBump] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await API.get("/api/tasks/scoreboard");
      setData(res.data.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load your score.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // the "you win" screen fires score:updated; task notifications may change the leaderboard
    const onScore = () => {
      setBump(true);
      setTimeout(() => setBump(false), 1200);
      load();
    };
    window.addEventListener("score:updated", onScore);
    window.addEventListener("realtime:notification", load);
    return () => {
      window.removeEventListener("score:updated", onScore);
      window.removeEventListener("realtime:notification", load);
    };
  }, [load]);

  const me = data?.me;
  const level = me?.level;
  const earned = me?.badges?.filter((b) => b.earned).length || 0;

  return (
    <section className="ocean-card ach-card">
      <style>{`
        .ach-card{margin-top:18px}
        .ach-grid{display:grid;grid-template-columns:1.1fr 1.4fr 1fr;gap:18px;padding-top:6px}
        .ach-level{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px;border-radius:18px;
          color:#fff;background:linear-gradient(150deg,#0b4f6c,#0f9b91);text-align:center}
        .ach-level-icon{font-size:46px;line-height:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.3))}
        .ach-level-name{font-size:18px;font-weight:900;letter-spacing:.04em}
        .ach-points{font-size:34px;font-weight:900;line-height:1;transition:transform .3s}
        .ach-points.bump{animation:achBump 1.1s ease}
        .ach-points small{display:block;margin-top:4px;font-size:10px;font-weight:700;letter-spacing:.12em;opacity:.8}
        .ach-bar{width:100%;height:8px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden}
        .ach-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#fde68a,#facc15);transition:width .8s ease}
        .ach-next{font-size:11px;opacity:.9}
        .ach-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;color:#5f7f8f;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .ach-badges{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .ach-badge{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:14px;border:1px solid #dcebef;background:#fff;text-align:center}
        .ach-badge b{font-size:24px;line-height:1}
        .ach-badge span{font-size:10.5px;font-weight:700;color:#123B5D;line-height:1.25}
        .ach-badge.locked{background:#f6f9fa}
        .ach-badge.locked b{filter:grayscale(1);opacity:.35}
        .ach-badge.locked span{color:#9aaeb8}
        .ach-board{display:flex;flex-direction:column;gap:6px}
        .ach-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:11px;background:#f7fbfc;font-size:12px}
        .ach-row.me{background:#E8F7F8;outline:1px solid #9fdde1}
        .ach-rank{width:22px;text-align:center;font-weight:900;color:#6E8799}
        .ach-row-name{flex:1;min-width:0;font-weight:700;color:#123B5D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ach-row-pts{font-weight:900;color:#0b8f87}
        .ach-empty{padding:14px;text-align:center;color:#6E8799;font-size:12px}
        .ach-error{color:#b91c1c;font-size:12px}
        .ach-refresh{border:0;background:transparent;color:#0b8f87;cursor:pointer;display:flex}
        @keyframes achBump{0%{transform:scale(1)}30%{transform:scale(1.25)}100%{transform:scale(1)}}
        @media (max-width:1100px){.ach-grid{grid-template-columns:1fr 1fr}.ach-board-col{grid-column:1 / -1}}
        @media (max-width:640px){.ach-grid{grid-template-columns:1fr}.ach-badges{grid-template-columns:repeat(2,1fr)}}
        @media (prefers-reduced-motion: reduce){.ach-points.bump{animation:none}}
      `}</style>

      <div className="ocean-card-header">
        <div className="ocean-card-title">
          <div className="ocean-card-title-icon">
            <Trophy size={15} />
          </div>
          <div>
            <h2>Score &amp; Badges</h2>
            <p>Each approved task earns the score (1–10) its assigner gives — level up and unlock badges</p>
          </div>
        </div>
        <button type="button" className="ach-refresh" onClick={load} title="Refresh" aria-label="Refresh score">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && <div className="ach-error">{error}</div>}

      {loading && !data ? (
        <div className="ach-empty">Loading your score...</div>
      ) : me ? (
        <div className="ach-grid">
          <div className="ach-level">
            <div className="ach-level-icon">{level.icon}</div>
            <div className="ach-level-name">{level.name}</div>
            <div className={`ach-points ${bump ? "bump" : ""}`}>
              {me.points}
              <small>TOTAL POINTS</small>
            </div>
            <div className="ach-bar" aria-label={`${level.progress}% to the next level`}>
              <i style={{ width: `${level.progress}%` }} />
            </div>
            <div className="ach-next">
              {level.next ? `${level.toNext} points to ${level.next.icon} ${level.next.name}` : "Highest level reached 👑"}
            </div>
            <div className="ach-next">{me.completed} tasks completed</div>
          </div>

          <div>
            <div className="ach-section-title">
              <span>Badges</span>
              <span>{earned} / {me.badges.length}</span>
            </div>
            <div className="ach-badges">
              {me.badges.map((b) => (
                <div
                  key={b.key}
                  className={`ach-badge ${b.earned ? "" : "locked"}`}
                  title={`${b.name} — ${b.description}${b.earned ? " (earned)" : " (locked)"}`}
                >
                  <b>{b.icon}</b>
                  <span>{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ach-board-col">
            <div className="ach-section-title">
              <span><Medal size={11} style={{ verticalAlign: "-1px" }} /> Leaderboard</span>
            </div>
            <div className="ach-board">
              {(data.leaderboard || []).length === 0 ? (
                <div className="ach-empty">No scores yet.</div>
              ) : (
                data.leaderboard.map((row) => (
                  <div key={row.userId} className={`ach-row ${row.userId === me.userId ? "me" : ""}`}>
                    <span className="ach-rank">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}</span>
                    <span className="ach-row-name" title={row.name}>
                      {row.level.icon} {row.name}{row.userId === me.userId ? " (you)" : ""}
                    </span>
                    <span className="ach-row-pts">{row.points}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default AchievementsCard;
