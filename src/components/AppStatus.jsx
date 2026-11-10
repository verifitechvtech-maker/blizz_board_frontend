import React, { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";
import { canInstall, isInstalled, onInstallChange, promptInstall } from "../services/pwa";

/* Header "Install app" button — only when the browser offers installing (and not installed yet) */
export const InstallAppButton = ({ className = "" }) => {
  const [available, setAvailable] = useState(() => canInstall() && !isInstalled());
  useEffect(() => onInstallChange((ok) => setAvailable(ok && !isInstalled())), []);
  if (!available) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={promptInstall}
      title="Install Blizz Board as an app on this device"
      aria-label="Install app"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 12px",
        borderRadius: 12,
        border: "1px solid rgba(22,166,184,.35)",
        background: "linear-gradient(135deg,#16a6b8,#08798c)",
        color: "#fff",
        fontSize: 12.5,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <Download size={14} /> Install app
    </button>
  );
};

/* "You're offline" bar at the bottom of every page */
export const OfflineBanner = () => {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 14000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: "calc(100vw - 32px)",
        padding: "10px 16px",
        borderRadius: 999,
        background: "#123b5d",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 12px 30px rgba(8,42,69,.35)",
      }}
    >
      <WifiOff size={15} /> You're offline — changes need a connection. The app reconnects by itself.
    </div>
  );
};
