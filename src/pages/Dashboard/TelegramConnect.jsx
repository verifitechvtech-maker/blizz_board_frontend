import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, Link2Off, Copy } from "lucide-react";
import API from "../../api/config";

// Settings → Notifications: connect this account to the Telegram bot
// (the bot then works the same tasks and sends the same notifications as the app)
const TelegramConnect = ({ notify }) => {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(null); // { code, deepLink, expiresAt }
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await API.get("/api/telegram/status");
      setStatus(res.data?.data || null);
      return res.data?.data;
    } catch {
      setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => clearInterval(pollRef.current);
  }, [loadStatus]);

  // after showing a code, watch for the bot to confirm the link
  const startPolling = (expiresAt) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await loadStatus();
      if (s?.linked) {
        clearInterval(pollRef.current);
        setPending(null);
        notify?.("Telegram connected");
      } else if (Date.now() > new Date(expiresAt).getTime()) {
        clearInterval(pollRef.current);
        setPending(null);
      }
    }, 3000);
  };

  const connect = async () => {
    setBusy(true);
    try {
      const res = await API.post("/api/telegram/link-code");
      const data = res.data?.data;
      setPending(data);
      if (data?.deepLink) window.open(data.deepLink, "_blank", "noopener");
      startPolling(data.expiresAt);
    } catch (error) {
      notify?.(error.response?.data?.message || "Could not create a Telegram code");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await API.delete("/api/telegram/link");
      await loadStatus();
      notify?.("Telegram disconnected");
    } catch (error) {
      notify?.(error.response?.data?.message || "Could not disconnect Telegram");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(`/link ${pending.code}`);
    notify?.("Copied — paste it in the bot chat");
  };

  if (!status) return null;

  return (
    <div className="preference-item" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div className="preference-left">
        <div className="preference-icon">
          <Send size={18} />
        </div>
        <div>
          <p className="preference-name">Telegram</p>
          <p className="preference-description">
            {!status.enabled
              ? "The Telegram bot is not set up on the server yet. Ask your administrator."
              : status.linked
                ? `Connected${status.username ? ` as @${status.username}` : status.firstName ? ` as ${status.firstName}` : ""}. View, create, assign and update tasks from Telegram; changes show here at once.`
                : "Connect the bot to view, create, assign and update tasks from Telegram and get your notifications there."}
          </p>

          {pending && !status.linked && (
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
              {pending.deepLink && (
                <div>
                  Telegram should open — tap <b>Start</b>.{" "}
                  <a href={pending.deepLink} target="_blank" rel="noopener noreferrer">Open @{pending.botUsername}</a>
                </div>
              )}
              <div>
                Or send this to the bot: <code style={{ fontWeight: 700 }}>/link {pending.code}</code>{" "}
                <button type="button" className="secondary-button" style={{ padding: "2px 8px" }} onClick={copyCode} aria-label="Copy code">
                  <Copy size={14} />
                </button>
              </div>
              <div style={{ opacity: 0.7 }}>The code works once and expires in 10 minutes.</div>
            </div>
          )}
        </div>
      </div>

      {status.enabled &&
        (status.linked ? (
          <button type="button" className="secondary-button" onClick={disconnect} disabled={busy}>
            <Link2Off size={16} /> Disconnect
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={connect} disabled={busy}>
            <Send size={16} /> {pending ? "New code" : "Connect Telegram"}
          </button>
        ))}
    </div>
  );
};

export default TelegramConnect;
