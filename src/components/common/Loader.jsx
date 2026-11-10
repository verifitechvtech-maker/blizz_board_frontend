import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/* =========================================================
   Preloaders
   PageLoader    → shown while a page (lazy chunk) or the workspace loads
                   fullScreen = covers the window (login, first load)
   RouteProgress → thin top bar on every page change
========================================================= */

const loaderCss = `
  .pl-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:50vh;
    color:var(--ts-navy,#123b5d);font-family:inherit}
  .pl-wrap.full{position:fixed;inset:0;z-index:15000;min-height:0;background:var(--ts-page-bg,#f4fafc)}
  .pl-ring{position:relative;width:54px;height:54px}
  .pl-ring::before,.pl-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:4px solid transparent}
  .pl-ring::before{border-top-color:#16a6b8;border-right-color:#16a6b8;animation:plSpin .9s linear infinite}
  .pl-ring::after{inset:9px;border-bottom-color:#123b5d;border-left-color:#123b5d;animation:plSpin 1.3s linear infinite reverse}
  .pl-dot{position:absolute;inset:21px;border-radius:50%;background:#16a6b8;animation:plPulse 1.2s ease-in-out infinite}
  .pl-text{font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--ts-muted,#6e8799)}
  .rp-bar{position:fixed;top:0;left:0;z-index:16000;height:3px;width:100%;pointer-events:none;transform-origin:left;
    background:linear-gradient(90deg,#16a6b8,#1677a8,#16a6b8);box-shadow:0 0 8px rgba(22,166,184,.6);
    animation:rpGrow .7s ease-out forwards, rpFade .3s .7s ease forwards}
  @keyframes plSpin{to{transform:rotate(360deg)}}
  @keyframes plPulse{0%,100%{transform:scale(.6);opacity:.6}50%{transform:scale(1);opacity:1}}
  @keyframes rpGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes rpFade{to{opacity:0}}
  @media (prefers-reduced-motion: reduce){
    .pl-ring::before,.pl-ring::after,.pl-dot{animation-duration:3s}
    .rp-bar{animation:rpFade .4s .2s ease forwards}
  }
`;

export const PageLoader = ({ text = "Loading…", fullScreen = false }) => (
  <div className={`pl-wrap ${fullScreen ? "full" : ""}`} role="status" aria-live="polite">
    <style>{loaderCss}</style>
    <div className="pl-ring" aria-hidden="true">
      <span className="pl-dot" />
    </div>
    <div className="pl-text">{text}</div>
  </div>
);

export const RouteProgress = () => {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setRun((n) => n + 1);
  }, [pathname]);

  if (!run) return null;
  return (
    <>
      <style>{loaderCss}</style>
      {/* new key restarts the animation on each page change */}
      <div key={run} className="rp-bar" aria-hidden="true" />
    </>
  );
};

export default PageLoader;
