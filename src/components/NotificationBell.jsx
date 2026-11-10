import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Bell, X, CheckCheck, MessageCircle, ClipboardCheck, LifeBuoy, AlertTriangle, RefreshCw, Volume2, VolumeX, Award, RotateCcw, ListChecks, MailOpen } from "lucide-react";
import API from "../api/config";
import { getSocket } from "../services/socket";
import { isSoundEnabled, playNotificationSound, setSoundEnabled } from "../services/notificationSound";
import Celebration from "./Celebration";
import { enablePush, isPushActive, pushSupported, syncPush } from "../services/pushNotifications";

const PROMPT_DISMISSED_KEY = "pushPromptDismissed";

/* =========================================================
   Real-time notifications
   • notification:new  → task assigned / reassigned / status / reminders / tickets
   • chat:message:new  → pop-up when you're not on the Chats page
   Shows a toast, updates the bell, and a desktop notification
   when the tab is in the background (if allowed).
========================================================= */

const ICONS = {
  task_assigned: ClipboardCheck,
  task_reassigned: RefreshCw,
  task_status: CheckCheck,
  task_completed: Award,
  task_rework: RotateCcw,
  task_comment: MessageCircle,
  task_subtask: ListChecks,
  task_viewed: MailOpen,
  task_reminder: AlertTriangle,
  task_overdue: AlertTriangle,
  support_ticket: LifeBuoy,
  support_reply: LifeBuoy,
  chat: MessageCircle,
};

const TITLES = {
  task_assigned: "New task assigned",
  task_reassigned: "Task reassigned",
  task_status: "Task status updated",
  task_completed: "Your task is completed 🎉",
  task_rework: "Rework requested",
  task_comment: "New comment",
  task_subtask: "New subtask assigned",
  task_viewed: "Task opened from email",
  task_reminder: "Task reminder",
  task_overdue: "Task deadline reached",
  support_ticket: "New support ticket",
  support_reply: "Support ticket update",
};

const linkFor = (n, role) => {
  if (n.type === "support_ticket") return role === "SuperAdmin" ? "/superadmin/dashboard" : "/dashboard/support";
  if (n.type === "support_reply") return "/dashboard/support";
  return "/dashboard/tasks";
};

const textOf = (n) =>
  n.type === "task_status" && n.actorName
    ? `${n.actorName} changed "${n.taskName}" ${n.fromStatus} → ${n.toStatus}`
    : n.message;

const timeAgo = (date) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(date).toLocaleDateString();
};

const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const desktopNotify = (title, body, onClick) => {
  const user = getUser();
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (user?.preferences?.desktopNotifications === false) return; // Settings → Desktop notifications off
  if (!document.hidden) return; // the in-page toast is enough
  if (isPushActive()) return; // the push notification (public/sw.js) shows it instead
  try {
    const n = new Notification(title, { body, tag: `${title}-${body}`.slice(0, 64) });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers block constructor notifications */
  }
};

const NotificationBell = ({ buttonClassName = "header-action notification-button" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [permission, setPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [promptHidden, setPromptHidden] = useState(() => {
    try {
      return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [ringing, setRinging] = useState(false);
  const ringTimer = useRef(null);
  const wrapRef = useRef(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  // chime + shake the bell for a moment
  const ring = useCallback((kind) => {
    playNotificationSound(kind);
    setRinging(true);
    clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => setRinging(false), 900);
  }, []);

  useEffect(() => () => clearTimeout(ringTimer.current), []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playNotificationSound("notification", { force: true }); // let them hear it
  };

  // "You have N unread notifications" pop-up — once per sign-in, only when something is unread
  const [unreadPopup, setUnreadPopup] = useState(0);
  const popupKey = () => `unreadPopupShown:${(localStorage.getItem("token") || "").slice(-16)}`;

  const load = useCallback(async () => {
    try {
      const res = await API.get("/api/notifications", { params: { limit: 20 } });
      setItems(res.data.data || []);
      const count = res.data.unread || 0;
      setUnread(count);
      try {
        if (count > 0 && !sessionStorage.getItem(popupKey())) {
          sessionStorage.setItem(popupKey(), "1");
          setUnreadPopup(count);
        }
      } catch {
        /* storage blocked → no pop-up */
      }
    } catch {
      /* bell stays usable */
    }
  }, []);

  useEffect(() => {
    if (!unreadPopup) return undefined;
    const onKey = (e) => e.key === "Escape" && setUnreadPopup(0);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [unreadPopup]);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return undefined;

    const onNotification = (n) => {
      // let open pages (Dashboard, Tasks) refresh their data
      window.dispatchEvent(new CustomEvent("realtime:notification", { detail: n }));
      setItems((prev) => [n, ...prev.filter((x) => x._id !== n._id)].slice(0, 30));
      setUnread((u) => u + 1);
      const title = TITLES[n.type] || "Notification";
      const body = textOf(n);
      const go = () => navigate(linkFor(n, getUser()?.role));
      const urgent = n.type === "task_overdue" || n.type === "task_reminder" || n.type === "task_rework";
      // a completed task gets the "you win" fanfare instead (components/Celebration.jsx)
      if (n.type !== "task_completed") ring(urgent ? "urgent" : "notification");
      (urgent ? toast.warn : toast.info)(
        <div style={{ cursor: "pointer" }}>
          <strong style={{ display: "block", fontSize: 13 }}>{title}</strong>
          <span style={{ fontSize: 12 }}>{body}</span>
        </div>,
        { onClick: go, autoClose: 7000, toastId: n._id }
      );
      desktopNotify(title, body, go);
    };

    const onChatMessage = (payload) => {
      if (pathRef.current.startsWith("/dashboard/chats")) return; // already looking at chat
      const msg = payload?.message || {};
      const from = msg.sender?.name || "Someone";
      const text = String(msg.text || (msg.attachments?.length ? "📎 Attachment" : "New message")).slice(0, 140);
      const go = () => navigate("/dashboard/chats");
      ring("chat");
      toast(
        <div style={{ cursor: "pointer" }}>
          <strong style={{ display: "block", fontSize: 13 }}>💬 {from}</strong>
          <span style={{ fontSize: 12 }}>{text}</span>
        </div>,
        { onClick: go, autoClose: 6000, toastId: `chat-${msg._id || Date.now()}` }
      );
      desktopNotify(`New message from ${from}`, text, go);
    };

    socket.on("notification:new", onNotification);
    socket.on("chat:message:new", onChatMessage);
    socket.on("connect", load); // catch up after reconnecting
    return () => {
      socket.off("notification:new", onNotification);
      socket.off("chat:message:new", onChatMessage);
      socket.off("connect", load);
    };
  }, [load, navigate, ring]);

  // close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markAll = async () => {
    try {
      await API.patch("/api/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      API.patch(`/api/notifications/${n._id}/read`).catch(() => {});
    }
    navigate(linkFor(n, getUser()?.role));
  };

  // already allowed in this browser → make sure the server has the subscription
  useEffect(() => {
    syncPush(getUser());
  }, []);

  const askDesktop = async () => {
    if (!("Notification" in window)) return;
    const result = await enablePush();
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    if (result === "granted") {
      setPromptHidden(true);
      // keep Settings → "Desktop notifications" in sync
      try {
        await API.put("/api/auth/me/preferences", { desktopNotifications: true });
        const u = getUser();
        if (u) localStorage.setItem("user", JSON.stringify({ ...u, preferences: { ...(u.preferences || {}), desktopNotifications: true } }));
      } catch {
        /* permission still granted */
      }
      toast.success("Push notifications are on for this browser.");
    } else if (result === "denied") {
      toast.info("Notifications are blocked. Allow them from the lock icon in the address bar.");
    }
  };

  const dismissPrompt = () => {
    setPromptHidden(true);
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    } catch {
      /* hidden for this visit */
    }
  };

  const showPrompt = permission === "default" && !promptHidden && pushSupported();

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {unreadPopup > 0 &&
        createPortal(
          <div className="unp-overlay" onMouseDown={(e) => e.target === e.currentTarget && setUnreadPopup(0)}>
            <style>{`
              .unp-overlay{position:fixed;inset:0;z-index:11500;display:flex;justify-content:center;align-items:flex-start;padding:28px 16px;
                background:rgba(8,42,69,.42);backdrop-filter:blur(3px);animation:unpFade .25s ease-out}
              .unp-card{position:relative;width:min(460px,100%);border-radius:22px;overflow:hidden;background:#fff;
                box-shadow:0 30px 80px rgba(8,42,69,.35),0 0 0 1px rgba(22,166,184,.15);animation:unpIn .55s cubic-bezier(.2,1.4,.4,1)}
              .unp-head{position:relative;display:flex;align-items:center;gap:14px;padding:20px 20px 18px;color:#fff;overflow:hidden;
                background:linear-gradient(135deg,#123f67 0%,#14577d 48%,#0f8a9b 100%)}
              .unp-head::before,.unp-head::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.08)}
              .unp-head::before{width:160px;height:160px;right:-40px;top:-70px;animation:unpFloat 6s ease-in-out infinite}
              .unp-head::after{width:90px;height:90px;right:70px;bottom:-55px;animation:unpFloat 7s ease-in-out infinite reverse}
              .unp-bell{position:relative;flex-shrink:0;width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;
                background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
              .unp-bell svg{animation:unpRing 1.4s ease-in-out .5s 2;transform-origin:50% 3px}
              .unp-count{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:flex;align-items:center;justify-content:center;
                background:#ff6b6b;color:#fff;font-size:11px;font-weight:900;box-shadow:0 0 0 3px #14577d;animation:unpPulse 1.8s ease-out .8s infinite}
              .unp-title{position:relative;flex:1;min-width:0}
              .unp-title strong{display:block;font-size:17px;letter-spacing:.01em}
              .unp-title span{display:block;margin-top:2px;font-size:12.5px;color:rgba(255,255,255,.82)}
              .unp-close{position:relative;display:flex;border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:10px;padding:6px;cursor:pointer;transition:background .2s}
              .unp-close:hover{background:rgba(255,255,255,.24)}
              .unp-list{display:flex;flex-direction:column;gap:6px;padding:14px 16px 4px;max-height:260px;overflow-y:auto}
              .unp-item{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:10px 12px;border:1px solid #e3eff3;border-radius:14px;
                background:#f7fbfc;cursor:pointer;opacity:0;animation:unpItem .4s ease-out forwards;transition:transform .15s,border-color .15s,background .15s}
              .unp-item:hover{transform:translateX(3px);border-color:#9fdde1;background:#eefafb}
              .unp-icon{flex-shrink:0;width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#e7f8fa;color:#08798c}
              .unp-item b{display:block;font-size:12.5px;color:#123b5d}
              .unp-item small{display:block;margin-top:1px;font-size:12px;color:#5f7f8f;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
              .unp-time{flex-shrink:0;font-size:10.5px;color:#8aa3b0;white-space:nowrap}
              .unp-more{padding:2px 4px 0;font-size:11.5px;color:#6e8799}
              .unp-actions{display:flex;gap:10px;justify-content:flex-end;padding:14px 16px 16px}
              .unp-btn{border:0;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:800;cursor:pointer;transition:transform .15s,box-shadow .15s}
              .unp-btn.ghost{background:#f0f5f7;color:#4a6f83}
              .unp-btn.primary{color:#fff;background:linear-gradient(135deg,#16a6b8,#08798c);box-shadow:0 10px 22px rgba(22,166,184,.32)}
              .unp-btn:hover{transform:translateY(-1px)}
              .unp-btn:focus-visible,.unp-close:focus-visible,.unp-item:focus-visible{outline:3px solid #7fe3ee;outline-offset:2px}
              @keyframes unpFade{from{opacity:0}to{opacity:1}}
              @keyframes unpIn{from{opacity:0;transform:translateY(-24px) scale(.94)}to{opacity:1;transform:none}}
              @keyframes unpItem{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
              @keyframes unpRing{0%,100%{transform:rotate(0)}15%{transform:rotate(18deg)}30%{transform:rotate(-15deg)}45%{transform:rotate(11deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}}
              @keyframes unpPulse{0%{box-shadow:0 0 0 3px #14577d,0 0 0 3px rgba(255,107,107,.6)}80%,100%{box-shadow:0 0 0 3px #14577d,0 0 0 12px rgba(255,107,107,0)}}
              @keyframes unpFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
              @media (prefers-reduced-motion: reduce){
                .unp-overlay,.unp-card,.unp-item,.unp-bell svg,.unp-count,.unp-head::before,.unp-head::after{animation:none!important;opacity:1}
              }
            `}</style>
            <div className="unp-card" role="dialog" aria-modal="true" aria-labelledby="unread-popup-title">
              <div className="unp-head">
                <span className="unp-bell" aria-hidden="true">
                  <Bell size={22} />
                  <span className="unp-count">{unreadPopup > 99 ? "99+" : unreadPopup}</span>
                </span>
                <span className="unp-title">
                  <strong id="unread-popup-title">Unread Notifications</strong>
                  <span>
                    You have {unreadPopup} unread notification{unreadPopup === 1 ? "" : "s"} waiting for you
                  </span>
                </span>
                <button type="button" className="unp-close" onClick={() => setUnreadPopup(0)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              {/* the newest unread ones — click to open */}
              <div className="unp-list">
                {items
                  .filter((n) => !n.read)
                  .slice(0, 3)
                  .map((n, i) => {
                    const Icon = ICONS[n.type] || Bell;
                    return (
                      <button
                        type="button"
                        key={n._id}
                        className="unp-item"
                        style={{ animationDelay: `${0.25 + i * 0.12}s` }}
                        onClick={() => {
                          setUnreadPopup(0);
                          openItem(n);
                        }}
                      >
                        <span className="unp-icon"><Icon size={15} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{TITLES[n.type] || "Notification"}</b>
                          <small>{textOf(n)}</small>
                        </span>
                        <span className="unp-time">{timeAgo(n.createdAt)}</span>
                      </button>
                    );
                  })}
                {unreadPopup > 3 && <div className="unp-more">+ {unreadPopup - 3} more</div>}
              </div>

              <div className="unp-actions">
                <button type="button" className="unp-btn ghost" onClick={() => setUnreadPopup(0)}>
                  Later
                </button>
                <button
                  type="button"
                  className="unp-btn primary"
                  autoFocus
                  onClick={() => {
                    setUnreadPopup(0);
                    setOpen(true);
                  }}
                >
                  View all
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      <Celebration />
      {showPrompt && (
        <div style={styles.prompt} role="dialog" aria-label="Enable push notifications">
          <span style={styles.promptIcon}><Bell size={18} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 13, color: "#123B5D" }}>Turn on push notifications?</strong>
            <span style={{ fontSize: 12, color: "#5f7f8f" }}>Get tasks, reviews, support replies and chat messages even when the app is closed.</span>
            <span style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={styles.promptYes} onClick={askDesktop}>Enable</button>
              <button type="button" style={styles.promptNo} onClick={dismissPrompt}>Not now</button>
            </span>
          </span>
        </div>
      )}
      <style>{`
        @keyframes bellRing { 0%,100% { transform: rotate(0); } 15% { transform: rotate(16deg); } 30% { transform: rotate(-14deg); } 45% { transform: rotate(10deg); } 60% { transform: rotate(-8deg); } 75% { transform: rotate(4deg); } }
        .bell-ringing { animation: bellRing .9s ease-in-out; transform-origin: 50% 2px; }
        @media (prefers-reduced-motion: reduce) { .bell-ringing { animation: none; } }
      `}</style>
      <button
        type="button"
        className={buttonClassName}
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={17} strokeWidth={2} className={ringing ? "bell-ringing" : undefined} />
        {unread > 0 && (
          <>
            <span style={styles.badge}>{unread > 99 ? "99+" : unread}</span>
            <span className="notification-pulse" />
          </>
        )}
      </button>

      {open && (
        <div style={styles.panel} role="dialog" aria-label="Notifications">
          <div style={styles.head}>
            <strong>Notifications</strong>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {unread > 0 && (
                <button type="button" style={styles.link} onClick={markAll}>Mark all read</button>
              )}
              <button
                type="button"
                style={styles.sound}
                onClick={toggleSound}
                title={soundOn ? "Sound on — click to mute" : "Sound off — click to turn on"}
                aria-label={soundOn ? "Mute notification sound" : "Turn on notification sound"}
                aria-pressed={soundOn}
              >
                {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </span>
          </div>
          {permission === "default" && (
            <button type="button" style={styles.enable} onClick={askDesktop}>
              🔔 Turn on push notifications (even when the app is closed)
            </button>
          )}
          <div style={styles.list}>
            {items.length === 0 && <div style={styles.empty}>You're all caught up.</div>}
            {items.map((n) => {
              const Icon = ICONS[n.type] || Bell;
              return (
                <button
                  type="button"
                  key={n._id}
                  onClick={() => openItem(n)}
                  style={{ ...styles.item, background: n.read ? "#fff" : "#F2FBFC" }}
                >
                  <span style={styles.icon}><Icon size={14} /></span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={styles.title}>{TITLES[n.type] || "Notification"}</span>
                    <span style={styles.text}>{textOf(n)}</span>
                    <span style={styles.time}>{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span style={styles.dot} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  badge: {
    position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999,
    background: "#e11d48", color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: "17px", textAlign: "center",
    boxShadow: "0 0 0 2px #fff",
  },
  panel: {
    position: "absolute", right: 0, top: "calc(100% + 10px)", width: 360, maxWidth: "calc(100vw - 24px)", zIndex: 1200,
    background: "#fff", borderRadius: 16, border: "1px solid #D5E7EE", boxShadow: "0 24px 60px rgba(6,59,70,.18)", overflow: "hidden",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #EEF5F6", fontSize: 14, color: "#123B5D" },
  sound: { border: "none", background: "transparent", color: "#0b8f87", cursor: "pointer", display: "flex", padding: 2 },
  link: { border: "none", background: "transparent", color: "#0b8f87", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  prompt: { position: "fixed", right: 16, bottom: 16, zIndex: 12000, display: "flex", gap: 12, width: "min(360px, calc(100vw - 32px))", padding: 14, borderRadius: 16, background: "#fff", border: "1px solid #d5e7ee", boxShadow: "0 18px 44px rgba(18,59,93,.18)", textAlign: "left" },
  promptIcon: { flexShrink: 0, width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "#E8F7F8", color: "#0b8f87" },
  promptYes: { border: 0, borderRadius: 10, padding: "7px 14px", background: "linear-gradient(135deg,#16a6b8,#08798c)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" },
  promptNo: { border: "1px solid #d5e7ee", borderRadius: 10, padding: "7px 14px", background: "#fff", color: "#5f7f8f", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  enable: { width: "100%", border: "none", borderBottom: "1px solid #EEF5F6", background: "#FFFBF0", color: "#8a5a00", fontSize: 12, padding: "9px 14px", cursor: "pointer", textAlign: "left" },
  list: { maxHeight: 420, overflowY: "auto" },
  empty: { padding: 20, fontSize: 13, color: "#6E8799", textAlign: "center" },
  item: { width: "100%", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", border: "none", borderBottom: "1px solid #F1F6F8", cursor: "pointer" },
  icon: { width: 28, height: 28, flexShrink: 0, borderRadius: 9, background: "#E8F7F8", color: "#0b8f87", display: "flex", alignItems: "center", justifyContent: "center" },
  title: { display: "block", fontSize: 12, fontWeight: 800, color: "#123B5D" },
  text: { display: "block", fontSize: 12, color: "#3d5a68", lineHeight: 1.4, marginTop: 1, wordBreak: "break-word" },
  time: { display: "block", fontSize: 10, color: "#8aa1ad", marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#16A6B8", marginTop: 6, flexShrink: 0 },
};

export default NotificationBell;
