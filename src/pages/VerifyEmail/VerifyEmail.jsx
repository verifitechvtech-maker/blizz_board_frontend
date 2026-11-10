import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ShieldCheck, MailCheck, Copy, Check, Eye, Lock, Loader2, AlertTriangle, LogIn, Timer,
} from "lucide-react";
import API from "../../api/config";

/* =========================================================
   EMAIL VERIFICATION + ONE-TIME PASSWORD REVEAL
   The server verifies the email and returns the admin-set
   password ONCE (it is deleted server-side immediately).
   Here it is shown for 30 seconds, then wiped from memory.
========================================================= */

const VerifyEmail = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState("loading"); // loading | ready | revealed | destroyed | error
  const [error, setError] = useState("");
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  // Verify once (StrictMode would otherwise call it twice and burn the link)
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    API.post("/api/auth/verify-email", { token })
      .then((res) => {
        const data = res.data?.data || {};
        setAccount({ name: data.name, email: data.email });
        setSecondsLeft(data.visibleForSeconds || 30);
        if (data.password) {
          setPassword(data.password);
          setState("ready");
        } else {
          setState("destroyed");
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || "This verification link is not valid.");
        setState("error");
      });
  }, [token]);

  // 30-second window → then destroy the password
  useEffect(() => {
    if (state !== "revealed") return undefined;
    if (secondsLeft <= 0) {
      setPassword("");
      setState("destroyed");
      return undefined;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, secondsLeft]);

  // Never leave it on screen if the user leaves the page
  useEffect(() => () => setPassword(""), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still read it */
    }
  };

  const progress = Math.max(0, (secondsLeft / 30) * 100);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerIcon}>
            {state === "error" ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
          </div>
          <div>
            <div style={styles.brand}>Task Management Blizz board</div>
            <h1 style={styles.title}>
              {state === "error" ? "Verification failed" : "Email verification"}
            </h1>
          </div>
        </div>

        <div style={styles.body}>
          {state === "loading" && (
            <p style={styles.muted}><Loader2 size={16} style={styles.spin} /> Verifying your email…</p>
          )}

          {state === "error" && (
            <>
              <p style={styles.errorText}>{error}</p>
              <button style={styles.primary} onClick={() => navigate("/login")}>
                <LogIn size={16} /> Go to login
              </button>
            </>
          )}

          {(state === "ready" || state === "revealed" || state === "destroyed") && account && (
            <div style={styles.successRow}>
              <MailCheck size={18} color="#087d68" />
              <span>
                <strong>{account.email}</strong> is verified. Welcome, {account.name}!
              </span>
            </div>
          )}

          {state === "ready" && (
            <>
              <p style={styles.muted}>
                Your administrator set a password for you. It can be shown <strong>only once</strong>, for
                <strong> 30 seconds</strong>. Make sure nobody is looking at your screen.
              </p>
              <button style={styles.primary} onClick={() => setState("revealed")}>
                <Eye size={16} /> Show my password
              </button>
            </>
          )}

          {state === "revealed" && (
            <>
              <div style={styles.passwordBox}>
                <Lock size={16} color="#16A6B8" />
                <code style={styles.password}>{password}</code>
                <button style={styles.copyBtn} onClick={copy} title="Copy password">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <div style={styles.timerRow}>
                <Timer size={14} />
                Disappears in <strong>{secondsLeft}s</strong>
              </div>
              <div style={styles.track}>
                <div style={{ ...styles.fill, width: `${progress}%` }} />
              </div>
              <p style={styles.hint}>Save it in a password manager, or change it later in Settings → Security.</p>
            </>
          )}

          {state === "destroyed" && (
            <>
              <p style={styles.muted}>
                The password has been destroyed and can't be shown again. If you didn't save it,
                use “Forgot password?” on the login page — your administrator will set a new one.
              </p>
              <button style={styles.primary} onClick={() => navigate("/login")}>
                <LogIn size={16} /> Continue to login
              </button>
            </>
          )}
        </div>
      </div>
      <style>{"@keyframes ve-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, background: "linear-gradient(135deg,#edfafd 0%,#f7fbfd 50%,#eef8fa 100%)",
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
  },
  card: {
    width: "100%", maxWidth: 480, background: "#fff", borderRadius: 20, overflow: "hidden",
    border: "1px solid #D5E7EE", boxShadow: "0 24px 60px rgba(6,59,70,.14)",
  },
  header: {
    display: "flex", gap: 14, alignItems: "center", padding: "22px 24px", color: "#fff",
    background: "linear-gradient(135deg,#063b46 0%,#075e67 42%,#0b8f87 100%)",
  },
  headerIcon: {
    width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,.14)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  brand: { fontSize: 11, letterSpacing: 2, opacity: 0.8 },
  title: { margin: "2px 0 0", fontSize: 20 },
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 14, color: "#123B5D" },
  muted: { margin: 0, fontSize: 14, color: "#4f6f7a", lineHeight: 1.6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  errorText: { margin: 0, fontSize: 14, color: "#b34444", lineHeight: 1.6 },
  successRow: {
    display: "flex", gap: 10, alignItems: "center", fontSize: 14, padding: "10px 12px",
    borderRadius: 12, background: "#EAF8F1", border: "1px solid #BDE5D0", color: "#17724A",
  },
  primary: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px",
    borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, color: "#fff",
    background: "linear-gradient(135deg,#16A6B8,#0b8f87)",
  },
  passwordBox: {
    display: "flex", alignItems: "center", gap: 10, padding: "14px 14px", borderRadius: 12,
    border: "1px dashed #16A6B8", background: "#F2FBFC",
  },
  password: { flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "#063b46", wordBreak: "break-all" },
  copyBtn: {
    width: 34, height: 34, borderRadius: 9, border: "1px solid #D5E7EE", background: "#fff",
    color: "#16A6B8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  timerRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9a6a0a" },
  track: { height: 6, borderRadius: 99, background: "#EEF5F6", overflow: "hidden" },
  fill: { height: "100%", background: "linear-gradient(90deg,#f59e0b,#16A6B8)", transition: "width 1s linear" },
  hint: { margin: 0, fontSize: 12, color: "#6E8799" },
  spin: { animation: "ve-spin 1s linear infinite" },
};

export default VerifyEmail;
