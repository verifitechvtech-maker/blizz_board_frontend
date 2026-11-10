import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, Link2Off, Copy, ExternalLink, X } from "lucide-react";
import API from "../api/config";
import { getStoredUser } from "../services/permissions";

/* =========================================================
   Top bar → Telegram
   Shows whether Telegram alerts are on, and lets the person
   turn them on / off, connect the bot or disconnect it.
========================================================= */

const saveStoredPreference = (value) => {
  try {
    const user = getStoredUser();
    if (!user) return;
    const next = { ...user, preferences: { ...(user.preferences || {}), telegramNotifications: value } };
    localStorage.setItem("user", JSON.stringify(next));
    window.dispatchEvent(new Event("user-updated"));
  } catch {
    /* ignore */
  }
};

const TelegramToggle = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // { enabled, linked, username, firstName, botUsername }
  const [on, setOn] = useState(() => getStoredUser()?.preferences?.telegramNotifications !== false);
  const [pending, setPending] = useState(null); // { code, deepLink, botUsername, expiresAt }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wrapRef = useRef(null);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await API.get("/api/telegram/status");
      const data = res.data?.data || null;
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => clearInterval(pollRef.current);
  }, [loadStatus]);

  // keep the switch in step with Settings → Notifications
  useEffect(() => {
    const sync = () => setOn(getStoredUser()?.preferences?.telegramNotifications !== false);
    window.addEventListener("user-updated", sync);
    return () => window.removeEventListener("user-updated", sync);
  }, []);

  // close when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const openPanel = () => {
    setMessage("");
    setOpen((v) => !v);
    if (!open) loadStatus();
  };

  const toggle = async () => {
    const value = !on;
    setBusy(true);
    setMessage("");
    try {
      await API.put("/api/auth/me/preferences", { telegramNotifications: value });
      setOn(value);
      saveStoredPreference(value);
      setMessage(value ? "Telegram alerts turned on" : "Telegram alerts turned off");
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not change the setting");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await API.post("/api/telegram/link-code");
      const data = res.data?.data;
      setPending(data);
      if (data?.deepLink) window.open(data.deepLink, "_blank", "noopener");
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const s = await loadStatus();
        if (s?.linked) {
          clearInterval(pollRef.current);
          setPending(null);
          setMessage("Telegram connected");
        } else if (Date.now() > new Date(data.expiresAt).getTime()) {
          clearInterval(pollRef.current);
          setPending(null);
        }
      }, 3000);
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not create a Telegram code");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage("");
    try {
      await API.delete("/api/telegram/link");
      await loadStatus();
      setMessage("Telegram disconnected");
    } catch (err) {
      setMessage(err.response?.data?.message || "Could not disconnect Telegram");
    } finally {
      setBusy(false);
    }
  };

  const linked = Boolean(status?.linked);
  const active = linked && on;
  const dotColor = active ? "#22c55e" : linked ? "#94a3b8" : "#f59e0b";
  const title = !status?.enabled
    ? "Telegram"
    : active
      ? "Telegram alerts: On"
      : linked
        ? "Telegram alerts: Off"
        : "Telegram: not connected";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="header-action"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={openPanel}
        style={active ? { color: "#229ED9" } : undefined}
      >
        <Send size={18} />
        {status?.enabled && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: "0 0 0 2px #fff",
            }}
          />
        )}
      </button>

      {open && (
        <div style={st.panel} role="dialog" aria-label="Telegram alerts">
          <div style={st.head}>
            <div style={st.headIcon}>
              <Send size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={st.title}>Telegram alerts</div>
              <div style={st.sub}>
                {!status
                  ? "Loading…"
                  : !status.enabled
                    ? "Not set up on the server"
                    : linked
                      ? `Connected${status.username ? ` as @${status.username}` : status.firstName ? ` as ${status.firstName}` : ""}`
                      : "Not connected"}
              </div>
            </div>
            <button type="button" style={st.close} onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {status && !status.enabled && (
            <p style={st.text}>The Telegram bot is not configured on the server yet. Ask your administrator.</p>
          )}

          {status?.enabled && linked && (
            <>
              <div style={st.row}>
                <div>
                  <div style={st.rowTitle}>Send my alerts to Telegram</div>
                  <div style={st.sub}>New tasks, status changes, reviews and comments</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={busy}
                  onClick={toggle}
                  style={{ ...st.switch, background: on ? "#229ED9" : "#cbd5e1" }}
                >
                  <span style={{ ...st.knob, transform: on ? "translateX(20px)" : "translateX(0)" }} />
                </button>
              </div>
              <div style={{ ...st.state, color: on ? "#15803d" : "#64748b" }}>{on ? "On" : "Off"}</div>
              <button type="button" style={st.linkBtn} onClick={disconnect} disabled={busy}>
                <Link2Off size={14} /> Disconnect Telegram
              </button>
            </>
          )}

          {status?.enabled && !linked && (
            <>
              <p style={st.text}>Connect the bot to get your task alerts on Telegram and work with tasks from there.</p>
              {pending && (
                <div style={st.codeBox}>
                  {pending.deepLink && (
                    <a href={pending.deepLink} target="_blank" rel="noopener noreferrer" style={st.openLink}>
                      <ExternalLink size={14} /> Open @{pending.botUsername} and tap Start
                    </a>
                  )}
                  <div style={{ marginTop: 6 }}>
                    Or send the bot: <code style={{ fontWeight: 800 }}>/link {pending.code}</code>{" "}
                    <button
                      type="button"
                      style={st.copy}
                      aria-label="Copy code"
                      onClick={() => {
                        navigator.clipboard?.writeText(`/link ${pending.code}`);
                        setMessage("Copied — paste it in the bot chat");
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <div style={st.sub}>Works once, expires in 10 minutes. This updates by itself when connected.</div>
                </div>
              )}
              <button type="button" style={st.primary} onClick={connect} disabled={busy}>
                <Send size={15} /> {pending ? "New code" : "Connect Telegram"}
              </button>
            </>
          )}

          {message && <div style={st.message}>{message}</div>}
        </div>
      )}
    </div>
  );
};

const st = {
  panel: {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    width: 300,
    maxWidth: "calc(100vw - 24px)",
    background: "#fff",
    border: "1px solid #dbe9ee",
    borderRadius: 16,
    boxShadow: "0 18px 40px rgba(16,47,73,.18)",
    padding: 16,
    zIndex: 7000,
    color: "#1f3b4d",
    textAlign: "left",
  },
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "#e8f5fc",
    color: "#229ED9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: 800, fontSize: 14 },
  sub: { fontSize: 12, color: "#6f8796", lineHeight: 1.5 },
  close: { border: "none", background: "transparent", color: "#6f8796", cursor: "pointer", padding: 4 },
  text: { fontSize: 13, color: "#4d6a7a", lineHeight: 1.6, margin: "0 0 12px" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #eef3f5" },
  rowTitle: { fontWeight: 700, fontSize: 13 },
  switch: {
    position: "relative",
    flexShrink: 0,
    width: 44,
    height: 24,
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    padding: 2,
    transition: "background .2s",
  },
  knob: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,.25)",
    transition: "transform .2s",
  },
  state: { fontSize: 12, fontWeight: 800, marginBottom: 10 },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    color: "#dc2626",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
  primary: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "none",
    background: "#229ED9",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
  },
  codeBox: { background: "#f4fafc", border: "1px solid #dbe9ee", borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 10 },
  openLink: { display: "inline-flex", alignItems: "center", gap: 5, color: "#229ED9", fontWeight: 700, textDecoration: "none" },
  copy: { border: "1px solid #dbe9ee", background: "#fff", borderRadius: 6, padding: "1px 6px", cursor: "pointer", verticalAlign: "middle" },
  message: { marginTop: 10, fontSize: 12, color: "#087f8c", fontWeight: 600 },
};

export default TelegramToggle;
