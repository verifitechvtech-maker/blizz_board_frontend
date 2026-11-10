import React, { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  ListTodo,
  Waves,
  Sparkles,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import API from "../../api/config";
import { homePathFor } from "../../services/permissions";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  // Forgot password → request goes to the user's administrator
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");

  const openForgot = () => {
    setForgotEmail(form.email || "");
    setForgotMessage("");
    setForgotError("");
    setShowForgot(true);
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    if (forgotSending) return;
    if (!/^\S+@\S+\.\S+$/.test(forgotEmail.trim())) {
      setForgotError("Enter the email address you use to sign in.");
      return;
    }
    setForgotSending(true);
    setForgotError("");
    try {
      const res = await API.post("/api/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotMessage(res.data?.message || "Your administrator has been notified.");
    } catch (err) {
      setForgotError(err.response?.data?.message || "Could not send the request. Please try again.");
    } finally {
      setForgotSending(false);
    }
  };

  const navigate = useNavigate();
  const location = useLocation();
  // came from a protected link (e.g. /meet/… in an invitation email) → go back there after login
  const returnTo = typeof location.state?.from === "string" && location.state.from.startsWith("/") && !location.state.from.startsWith("//")
    ? location.state.from
    : null;

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);

    try {
      // ✅ REAL API CALL — replaces the demo setTimeout
      const response = await API.post("/api/auth/login", {
        email: form.email,
        password: form.password,
      });

    //   console.log("API response:", response.data);

      if (response.data.success) {
        const userData = response.data.data;

        // 🔑 FIX 1: Save TOKEN to localStorage
        if (!userData.token) {
          throw new Error("The server did not return a session token.");
        }
        localStorage.setItem("token", userData.token);

        // 🔑 FIX 2: Save USER (role + permissions, without the token) to localStorage
        const { token: _token, ...profile } = userData;
        localStorage.setItem("user", JSON.stringify(profile));
        window.dispatchEvent(new Event("user-updated"));

        // 🔑 FIX 3: Show success message
        toast.success(`Welcome, ${userData.name}!`, {
          position: "top-right",
          autoClose: 2000,
        });

        // 🔑 FIX 4: Navigate to dashboard based on role
        navigate(returnTo || homePathFor(userData), { replace: true });
      } else {
        setError(response.data.message || "Login failed");
        toast.error(response.data.message || "Login failed", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    } catch (err) {
      console.error("Login error:", err);
      const message =
        err.response?.data?.message || err.message || "Login failed. Please try again.";
      setError(message);
      toast.error(message, {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* =====================================================
          ANIMATED OCEAN BACKGROUND
      ====================================================== */}

      <div className="ocean-background">

        {/* Large Ocean Glows */}
        <div className="ocean-glow ocean-glow-one"></div>
        <div className="ocean-glow ocean-glow-two"></div>
        <div className="ocean-glow ocean-glow-three"></div>

        {/* Light Rays */}
        <div className="light-ray ray-one"></div>
        <div className="light-ray ray-two"></div>
        <div className="light-ray ray-three"></div>

        {/* Floating Bubbles */}
        <div className="bubble bubble-one"></div>
        <div className="bubble bubble-two"></div>
        <div className="bubble bubble-three"></div>
        <div className="bubble bubble-four"></div>
        <div className="bubble bubble-five"></div>
        <div className="bubble bubble-six"></div>
        <div className="bubble bubble-seven"></div>
        <div className="bubble bubble-eight"></div>

        {/* Flowing Ocean Lines */}
        <div className="ocean-line line-one"></div>
        <div className="ocean-line line-two"></div>
        <div className="ocean-line line-three"></div>
        <div className="ocean-line line-four"></div>

        {/* Small Particles */}
        <div className="ocean-particle particle-one"></div>
        <div className="ocean-particle particle-two"></div>
        <div className="ocean-particle particle-three"></div>
        <div className="ocean-particle particle-four"></div>
        <div className="ocean-particle particle-five"></div>
        <div className="ocean-particle particle-six"></div>
      </div>

      {/* =====================================================
          MAIN CONTAINER
      ====================================================== */}

      <div className="login-container">

        {/* =================================================
            LEFT SIDE
        ================================================== */}

        <section className="login-showcase">

          {/* BRAND */}
          <div className="brand">

            <div className="brand-icon">
              <ListTodo
                size={25}
                strokeWidth={2.5}
              />
            </div>

            <div>
              <div className="brand-name">
                TaskFlow
              </div>

              <div className="brand-subtitle">
                Task Management
              </div>
            </div>

          </div>

          {/* SHOWCASE CONTENT */}
          <div className="showcase-content">

            <div className="eyebrow">
              <span className="eyebrow-dot"></span>
              SMART WORKSPACE
            </div>

            <h1>
              Manage your work.
              <span>Move forward.</span>
            </h1>

            <p>
              Organize tasks, collaborate with your team,
              track progress, and keep everything moving
              from one intelligent workspace.
            </p>

            {/* FEATURES */}

            <div className="feature-list">

              <div className="feature-item">

                <div className="feature-icon">
                  <CheckCircle2 size={18} />
                </div>

                <div>
                  <strong>
                    Organize everything
                  </strong>

                  <span>
                    Keep tasks, projects and priorities together.
                  </span>
                </div>

              </div>

              <div className="feature-item">

                <div className="feature-icon">
                  <ShieldCheck size={18} />
                </div>

                <div>
                  <strong>
                    Secure workspace
                  </strong>

                  <span>
                    Designed for teams with controlled access.
                  </span>
                </div>

              </div>

              <div className="feature-item">

                <div className="feature-icon">
                  <Sparkles size={18} />
                </div>

                <div>
                  <strong>
                    Simple collaboration
                  </strong>

                  <span>
                    Make team progress visible and actionable.
                  </span>
                </div>

              </div>

            </div>

          </div>

          {/* FOOTER STATS */}

          <div className="showcase-footer">

            <div className="mini-stat">
              <strong>01</strong>
              <span>Workspace</span>
            </div>

            <div className="mini-divider"></div>

            <div className="mini-stat">
              <strong>24/7</strong>
              <span>Productivity</span>
            </div>

            <div className="mini-divider"></div>

            <div className="mini-stat">
              <strong>∞</strong>
              <span>Possibilities</span>
            </div>

          </div>

        </section>

        {/* =================================================
            LOGIN PANEL
        ================================================== */}

        <section className="login-panel">

          <div className="login-card">

            {/* TOP DECORATION */}
            <div className="card-top-decoration"></div>

            {/* CARD DECORATIVE ORBS */}
            <div className="card-orb card-orb-one"></div>
            <div className="card-orb card-orb-two"></div>

            {/* LOGIN HEADER */}

            <div className="login-header">

              <div className="login-icon">
                <Waves size={25} />
              </div>

              <div className="welcome-badge">
                Welcome back
              </div>

              <h2>
                Sign in to TaskFlow
              </h2>

              <p>
                Enter your details to access your workspace.
              </p>

            </div>

            {/* Error message */}
            {error && (
              <div className="login-error">
                <ShieldCheck size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* =================================================
                LOGIN FORM
            ================================================== */}

            <form onSubmit={handleSubmit}>

              {/* EMAIL */}

              <div className="form-group">

                <label htmlFor="email">
                  Email address
                </label>

                <div className="input-wrapper">

                  <Mail
                    className="input-icon"
                    size={19}
                  />

                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />

                </div>

              </div>

              {/* PASSWORD */}

              <div className="form-group">

                <div className="password-label-row">

                  <label htmlFor="password">
                    Password
                  </label>

                  <button
                    type="button"
                    className="forgot-password"
                    onClick={openForgot}
                  >
                    Forgot password?
                  </button>

                </div>

                <div className="input-wrapper">

                  <Lock
                    className="input-icon"
                    size={19}
                  />

                  <input
                    id="password"
                    name="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleChange}
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>

                </div>

              </div>

              {/* REMEMBER ME */}

              <div className="login-options">

                <label className="remember-option">

                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) =>
                      setRememberMe(
                        e.target.checked
                      )
                    }
                  />

                  <span className="custom-checkbox">
                    <CheckCircle2 size={13} />
                  </span>

                  <span>
                    Remember me
                  </span>

                </label>

              </div>

              {/* LOGIN BUTTON */}

              <button
                type="submit"
                className={`login-button ${
                  loading ? "loading" : ""
                }`}
                disabled={loading}
              >

                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={19} />
                  </>
                )}

              </button>

            </form>

            {/* SECURITY NOTE */}

            <div className="security-note">

              <ShieldCheck size={16} />

              <span>
                Your workspace connection is protected.
              </span>

            </div>

            {/* BOTTOM */}

            <div className="login-bottom">

              <span>
                TaskFlow
              </span>

              <span className="bottom-dot">
                •
              </span>

              <span>
                Task Management Platform
              </span>

            </div>

          </div>

        </section>

      </div>

      {/* =====================================================
          ALL STYLES
      ====================================================== */}

      <style>{`

        /* =====================================================
           GLOBAL
        ====================================================== */

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          min-height: 100%;
        }

        body {
          overflow-x: hidden;
        }


        /* =====================================================
           MAIN PAGE
        ====================================================== */

        .login-page {
          min-height: 100vh;
          width: 100%;
          position: relative;
          overflow: hidden;

          color: #073b4c;

          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          background:
            radial-gradient(
              circle at 8% 10%,
              rgba(103, 232, 249, 0.55),
              transparent 25%
            ),
            radial-gradient(
              circle at 92% 15%,
              rgba(45, 212, 191, 0.35),
              transparent 28%
            ),
            radial-gradient(
              circle at 70% 85%,
              rgba(56, 189, 248, 0.30),
              transparent 30%
            ),
            linear-gradient(
              135deg,
              #ecfeff 0%,
              #dffaff 28%,
              #d5f7f7 55%,
              #e8fbff 78%,
              #f4feff 100%
            );
        }

        .login-error {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          margin-bottom: 20px;
          border-radius: 12px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background: rgba(254, 226, 226, 0.7);
          color: #dc2626;
          font-size: 12px;
          font-weight: 600;
        }

        .login-error svg {
          flex-shrink: 0;
        }


        /* =====================================================
           OCEAN BACKGROUND
        ====================================================== */

        .ocean-background {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }


        /* =====================================================
           OCEAN GLOWS
        ====================================================== */

        .ocean-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        .ocean-glow-one {
          width: 520px;
          height: 520px;

          left: -180px;
          top: -180px;

          background:
            radial-gradient(
              circle,
              rgba(34, 211, 238, 0.35),
              rgba(34, 211, 238, 0.08) 45%,
              transparent 72%
            );

          filter: blur(2px);

          animation:
            oceanGlowOne 13s ease-in-out infinite;
        }

        .ocean-glow-two {
          width: 600px;
          height: 600px;

          right: -250px;
          bottom: -260px;

          background:
            radial-gradient(
              circle,
              rgba(20, 184, 166, 0.25),
              rgba(45, 212, 191, 0.08) 45%,
              transparent 72%
            );

          filter: blur(2px);

          animation:
            oceanGlowTwo 16s ease-in-out infinite;
        }

        .ocean-glow-three {
          width: 380px;
          height: 380px;

          left: 43%;
          top: 5%;

          background:
            radial-gradient(
              circle,
              rgba(56, 189, 248, 0.16),
              transparent 70%
            );

          animation:
            oceanGlowThree 9s ease-in-out infinite;
        }


        /* =====================================================
           LIGHT RAYS
        ====================================================== */

        .light-ray {
          position: absolute;

          width: 180px;
          height: 850px;

          top: -250px;

          opacity: 0.15;

          filter: blur(4px);

          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.95),
              rgba(255, 255, 255, 0)
            );

          transform: rotate(24deg);

          animation:
            rayMove 12s ease-in-out infinite;
        }

        .ray-one {
          left: 15%;
          animation-delay: 0s;
        }

        .ray-two {
          left: 47%;
          opacity: 0.1;
          animation-delay: 4s;
        }

        .ray-three {
          right: 10%;
          opacity: 0.12;
          animation-delay: 7s;
        }


        /* =====================================================
           FLOATING BUBBLES
        ====================================================== */

        .bubble {
          position: absolute;

          border-radius: 50%;

          border:
            1px solid rgba(255, 255, 255, 0.8);

          background:
            radial-gradient(
              circle at 30% 25%,
              rgba(255, 255, 255, 0.95),
              rgba(103, 232, 249, 0.18) 45%,
              rgba(34, 211, 238, 0.04) 70%,
              transparent 75%
            );

          box-shadow:
            inset 2px 2px 5px rgba(255, 255, 255, 0.8),
            0 8px 25px rgba(34, 211, 238, 0.08);

          animation:
            bubbleFloat 10s ease-in-out infinite;
        }

        .bubble-one {
          width: 22px;
          height: 22px;
          left: 7%;
          top: 72%;
        }

        .bubble-two {
          width: 10px;
          height: 10px;
          left: 18%;
          top: 30%;
          animation-duration: 7s;
          animation-delay: 1s;
        }

        .bubble-three {
          width: 16px;
          height: 16px;
          left: 35%;
          top: 82%;
          animation-duration: 11s;
          animation-delay: 2s;
        }

        .bubble-four {
          width: 30px;
          height: 30px;
          left: 58%;
          top: 18%;
          animation-duration: 13s;
          animation-delay: 3s;
        }

        .bubble-five {
          width: 12px;
          height: 12px;
          right: 12%;
          top: 34%;
          animation-duration: 8s;
          animation-delay: 1.5s;
        }

        .bubble-six {
          width: 20px;
          height: 20px;
          right: 25%;
          bottom: 14%;
          animation-duration: 12s;
          animation-delay: 4s;
        }

        .bubble-seven {
          width: 8px;
          height: 8px;
          right: 8%;
          bottom: 35%;
          animation-duration: 9s;
        }

        .bubble-eight {
          width: 14px;
          height: 14px;
          left: 46%;
          bottom: 10%;
          animation-duration: 14s;
        }


        /* =====================================================
           FLOWING OCEAN LINES
        ====================================================== */

        .ocean-line {
          position: absolute;

          width: 130%;
          height: 150px;

          left: -15%;

          border-top:
            1px solid rgba(34, 211, 238, 0.18);

          border-radius: 50%;

          opacity: 0.7;

          animation:
            oceanFlow 13s ease-in-out infinite;
        }

        .line-one {
          top: 17%;
          transform: rotate(-4deg);
        }

        .line-two {
          top: 39%;
          transform: rotate(3deg);
          animation-delay: 2s;
        }

        .line-three {
          top: 64%;
          transform: rotate(-2deg);
          animation-delay: 4s;
        }

        .line-four {
          top: 84%;
          transform: rotate(4deg);
          animation-delay: 6s;
        }


        /* =====================================================
           PARTICLES
        ====================================================== */

        .ocean-particle {
          position: absolute;

          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: #22d3ee;

          box-shadow:
            0 0 12px rgba(34, 211, 238, 0.7);

          opacity: 0.45;

          animation:
            particleFloat 7s ease-in-out infinite;
        }

        .particle-one {
          left: 11%;
          top: 20%;
        }

        .particle-two {
          left: 29%;
          top: 62%;
          animation-delay: 2s;
        }

        .particle-three {
          left: 52%;
          top: 12%;
          animation-delay: 4s;
        }

        .particle-four {
          left: 74%;
          top: 27%;
          animation-delay: 1s;
        }

        .particle-five {
          right: 14%;
          top: 70%;
          animation-delay: 3s;
        }

        .particle-six {
          left: 42%;
          bottom: 8%;
          animation-delay: 5s;
        }


        /* =====================================================
           MAIN LAYOUT
        ====================================================== */

        .login-container {
          position: relative;
          z-index: 5;

          min-height: 100vh;
          width: 100%;

          max-width: 1420px;

          margin: 0 auto;

          padding: 34px;

          display: grid;

          grid-template-columns:
            1fr
            510px;

          gap: 70px;

          align-items: center;
        }


        /* =====================================================
           LEFT SHOWCASE
        ====================================================== */

        .login-showcase {
          min-height: 690px;

          display: flex;
          flex-direction: column;

          justify-content: space-between;

          padding:
            35px
            15px
            35px
            35px;

          position: relative;
        }


        /* =====================================================
           BRAND
        ====================================================== */

        .brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .brand-icon {
          width: 48px;
          height: 48px;

          border-radius: 15px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #06b6d4,
              #22d3ee,
              #14b8a6
            );

          box-shadow:
            0 12px 30px
              rgba(8, 145, 178, 0.20),

            inset 0 1px 0
              rgba(255, 255, 255, 0.7);

          animation:
            iconFloat 4s ease-in-out infinite;
        }

        .brand-name {
          font-size: 22px;
          font-weight: 850;

          letter-spacing: -0.7px;

          color: #064b5a;
        }

        .brand-subtitle {
          margin-top: 2px;

          color: #60909b;

          font-size: 11px;

          font-weight: 700;

          text-transform: uppercase;

          letter-spacing: 1.8px;
        }


        /* =====================================================
           SHOWCASE
        ====================================================== */

        .showcase-content {
          max-width: 650px;
          margin-top: 25px;
        }

        .eyebrow {
          display: inline-flex;

          align-items: center;

          gap: 9px;

          padding:
            8px
            13px;

          border:
            1px solid
            rgba(8, 145, 178, 0.14);

          background:
            rgba(255, 255, 255, 0.52);

          border-radius: 999px;

          color: #087c91;

          font-size: 10px;

          font-weight: 800;

          letter-spacing: 1.8px;

          backdrop-filter: blur(12px);

          box-shadow:
            0 8px 25px
              rgba(8, 145, 178, 0.05);
        }

        .eyebrow-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #14b8a6;

          box-shadow:
            0 0 0 4px
              rgba(20, 184, 166, 0.10),

            0 0 14px
              rgba(20, 184, 166, 0.6);

          animation:
            dotPulse 2s infinite;
        }

        .showcase-content h1 {
          margin:
            25px
            0
            20px;

          max-width: 680px;

          font-size:
            clamp(
              45px,
              5vw,
              76px
            );

          line-height: 0.98;

          letter-spacing: -4px;

          font-weight: 850;

          color: #064b5a;
        }

        .showcase-content h1 span {
          display: block;

          color: transparent;

          background:
            linear-gradient(
              90deg,
              #0891b2,
              #06b6d4,
              #14b8a6,
              #0284c7
            );

          background-size: 250% auto;

          -webkit-background-clip: text;
          background-clip: text;

          animation:
            gradientText 6s linear infinite;
        }

        .showcase-content > p {
          max-width: 580px;

          color: #608894;

          font-size: 16px;

          line-height: 1.8;

          margin: 0;
        }


        /* =====================================================
           FEATURES
        ====================================================== */

        .feature-list {
          display: flex;
          flex-direction: column;

          gap: 14px;

          margin-top: 35px;
        }

        .feature-item {
          display: flex;

          align-items: center;

          gap: 14px;

          width: fit-content;

          padding:
            10px
            14px;

          border-radius: 15px;

          border:
            1px solid
            rgba(8, 145, 178, 0.08);

          background:
            rgba(255, 255, 255, 0.42);

          backdrop-filter: blur(12px);

          transition:
            0.3s ease;

          box-shadow:
            0 8px 30px
              rgba(8, 145, 178, 0.035);
        }

        .feature-item:hover {
          transform:
            translateX(7px)
            translateY(-2px);

          border-color:
            rgba(8, 145, 178, 0.18);

          background:
            rgba(255, 255, 255, 0.65);

          box-shadow:
            0 12px 35px
              rgba(8, 145, 178, 0.08);
        }

        .feature-icon {
          width: 36px;
          height: 36px;

          flex-shrink: 0;

          border-radius: 11px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #0891b2;

          background:
            rgba(34, 211, 238, 0.10);

          border:
            1px solid
            rgba(34, 211, 238, 0.16);
        }

        .feature-item strong {
          display: block;

          font-size: 13px;

          color: #155563;

          margin-bottom: 3px;
        }

        .feature-item span {
          display: block;

          color: #71949d;

          font-size: 11px;
        }


        /* =====================================================
           SHOWCASE FOOTER
        ====================================================== */

        .showcase-footer {
          display: flex;

          align-items: center;

          gap: 20px;

          color: #6e949d;
        }

        .mini-stat {
          display: flex;

          flex-direction: column;

          gap: 3px;
        }

        .mini-stat strong {
          color: #19758a;

          font-size: 17px;

          font-weight: 800;
        }

        .mini-stat span {
          font-size: 9px;

          text-transform: uppercase;

          letter-spacing: 1.2px;
        }

        .mini-divider {
          width: 1px;
          height: 30px;

          background:
            rgba(8, 145, 178, 0.15);
        }


        /* =====================================================
           LOGIN PANEL
        ====================================================== */

        .login-panel {
          display: flex;

          justify-content: center;
        }


        /* =====================================================
           LOGIN CARD
        ====================================================== */

        .login-card {
          position: relative;

          width: 100%;

          padding: 42px;

          overflow: hidden;

          border-radius: 30px;

          border:
            1px solid
            rgba(8, 145, 178, 0.16);

          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.96),
              rgba(240, 253, 255, 0.91)
            );

          box-shadow:
            0 30px 80px
              rgba(8, 100, 120, 0.14),

            0 0 0 1px
              rgba(255, 255, 255, 0.8)
              inset,

            0 0 70px
              rgba(34, 211, 238, 0.08);

          backdrop-filter:
            blur(25px);

          animation:
            cardAppear 0.8s ease-out;
        }

        .login-card::before {
          content: "";

          position: absolute;

          width: 250px;
          height: 250px;

          right: -140px;
          top: -130px;

          border-radius: 50%;

          background:
            rgba(34, 211, 238, 0.10);

          filter: blur(5px);
        }

        .login-card::after {
          content: "";

          position: absolute;

          width: 180px;
          height: 180px;

          left: -120px;
          bottom: -100px;

          border-radius: 50%;

          background:
            rgba(20, 184, 166, 0.08);

          filter: blur(8px);
        }


        /* =====================================================
           CARD ORBS
        ====================================================== */

        .card-orb {
          position: absolute;

          border-radius: 50%;

          pointer-events: none;
        }

        .card-orb-one {
          width: 100px;
          height: 100px;

          right: 25px;
          top: 90px;

          background:
            radial-gradient(
              circle,
              rgba(34, 211, 238, 0.10),
              transparent 70%
            );

          animation:
            cardOrbOne 8s ease-in-out infinite;
        }

        .card-orb-two {
          width: 140px;
          height: 140px;

          left: -70px;
          bottom: 100px;

          background:
            radial-gradient(
              circle,
              rgba(20, 184, 166, 0.08),
              transparent 70%
            );

          animation:
            cardOrbTwo 10s ease-in-out infinite;
        }


        /* =====================================================
           CARD TOP LINE
        ====================================================== */

        .card-top-decoration {
          position: absolute;

          top: 0;

          left: 40px;
          right: 40px;

          height: 3px;

          background:
            linear-gradient(
              90deg,
              transparent,
              #06b6d4,
              #14b8a6,
              #38bdf8,
              transparent
            );

          box-shadow:
            0 0 20px
              rgba(34, 211, 238, 0.4);
        }


        /* =====================================================
           LOGIN HEADER
        ====================================================== */

        .login-header {
          position: relative;

          z-index: 2;

          margin-bottom: 31px;
        }

        .login-icon {
          width: 52px;
          height: 52px;

          border-radius: 16px;

          display: flex;
          align-items: center;
          justify-content: center;

          margin-bottom: 18px;

          color: #0891b2;

          border:
            1px solid
            rgba(8, 145, 178, 0.14);

          background:
            linear-gradient(
              135deg,
              rgba(34, 211, 238, 0.13),
              rgba(20, 184, 166, 0.07)
            );

          box-shadow:
            0 12px 30px
              rgba(8, 100, 120, 0.08),

            inset 0 1px
              rgba(255, 255, 255, 0.8);

          animation:
            loginIconFloat 4s ease-in-out infinite;
        }

        .welcome-badge {
          color: #0f9f91;

          font-size: 10px;

          font-weight: 800;

          text-transform: uppercase;

          letter-spacing: 1.8px;

          margin-bottom: 9px;
        }

        .login-header h2 {
          margin: 0;

          color: #073b4c;

          font-size: 27px;

          line-height: 1.2;

          letter-spacing: -1px;

          font-weight: 800;
        }

        .login-header p {
          margin:
            9px
            0
            0;

          color: #71919a;

          font-size: 13px;

          line-height: 1.6;
        }


        /* =====================================================
           FORM
        ====================================================== */

        .form-group {
          position: relative;

          z-index: 2;

          margin-bottom: 22px;
        }

        .form-group label {
          display: block;

          margin-bottom: 9px;

          color: #245766;

          font-size: 12px;

          font-weight: 700;
        }

        .password-label-row {
          display: flex;

          justify-content: space-between;

          align-items: center;
        }

        .forgot-password {
          border: 0;

          background: transparent;

          padding: 0;

          color: #0786a0;

          cursor: pointer;

          font-size: 11px;

          font-weight: 700;

          transition:
            0.2s ease;
        }

        .forgot-password:hover {
          color: #06a6c4;
        }


        /* =====================================================
           INPUT
        ====================================================== */

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;

          left: 15px;

          top: 50%;

          transform:
            translateY(-50%);

          color: #77a0aa;

          pointer-events: none;

          transition:
            0.25s ease;
        }

        .input-wrapper input {
          width: 100%;

          height: 52px;

          border:
            1px solid
            rgba(8, 145, 178, 0.14);

          border-radius: 15px;

          outline: none;

          padding:
            0
            46px;

          color: #073b4c;

          background:
            rgba(255, 255, 255, 0.70);

          font-size: 13px;

          transition:
            0.25s ease;

          box-shadow:
            inset 0 1px 0
              rgba(255, 255, 255, 0.9);
        }

        .input-wrapper input::placeholder {
          color: #94afb6;
        }

        .input-wrapper input:hover {
          border-color:
            rgba(8, 145, 178, 0.25);
        }

        .input-wrapper input:focus {
          border-color:
            rgba(8, 145, 178, 0.48);

          background:
            #ffffff;

          box-shadow:
            0 0 0 4px
              rgba(34, 211, 238, 0.07),

            0 8px 25px
              rgba(8, 100, 120, 0.08);
        }

        .input-wrapper:focus-within
        .input-icon {
          color: #06a6c4;
        }


        /* =====================================================
           PASSWORD TOGGLE
        ====================================================== */

        .password-toggle {
          position: absolute;

          right: 14px;

          top: 50%;

          transform:
            translateY(-50%);

          display: flex;

          align-items: center;
          justify-content: center;

          border: 0;

          background: transparent;

          color: #70949d;

          cursor: pointer;

          padding: 4px;

          transition:
            0.2s ease;
        }

        .password-toggle:hover {
          color: #06a6c4;
        }


        /* =====================================================
           REMEMBER
        ====================================================== */

        .login-options {
          position: relative;

          z-index: 2;

          display: flex;

          justify-content: space-between;

          align-items: center;

          margin-top: -2px;

          margin-bottom: 23px;
        }

        .remember-option {
          display: flex !important;

          align-items: center;

          gap: 9px;

          cursor: pointer;

          margin: 0 !important;

          color: #72929b !important;

          font-size: 11px !important;

          font-weight: 600 !important;
        }

        .remember-option input {
          display: none;
        }

        .custom-checkbox {
          width: 17px;
          height: 17px;

          border-radius: 5px;

          display: flex;

          align-items: center;
          justify-content: center;

          color: transparent;

          border:
            1px solid
            rgba(8, 145, 178, 0.18);

          background:
            rgba(255, 255, 255, 0.8);

          transition:
            0.2s ease;
        }

        .remember-option
        input:checked
        + .custom-checkbox {
          color: #ffffff;

          border-color: #06b6d4;

          background:
            linear-gradient(
              135deg,
              #06b6d4,
              #14b8a6
            );

          box-shadow:
            0 0 15px
              rgba(34, 211, 238, 0.20);
        }


        /* =====================================================
           LOGIN BUTTON
        ====================================================== */

        .login-button {
          position: relative;

          z-index: 2;

          width: 100%;

          height: 54px;

          border: 0;

          border-radius: 15px;

          display: flex;

          align-items: center;

          justify-content: center;

          gap: 10px;

          cursor: pointer;

          color: #ffffff;

          font-size: 13px;

          font-weight: 850;

          background:
            linear-gradient(
              110deg,
              #0891b2,
              #06b6d4,
              #14b8a6
            );

          background-size: 200% 100%;

          box-shadow:
            0 14px 35px
              rgba(8, 145, 178, 0.18),

            inset 0 1px 0
              rgba(255, 255, 255, 0.35);

          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            background-position 0.4s ease;
        }

        .login-button:hover {
          transform:
            translateY(-2px);

          background-position:
            100% 0;

          box-shadow:
            0 18px 45px
              rgba(8, 145, 178, 0.25),

            inset 0 1px 0
              rgba(255, 255, 255, 0.45);
        }

        .login-button:active {
          transform:
            translateY(0);
        }

        .login-button:disabled {
          cursor:
            not-allowed;

          opacity:
            0.8;
        }

        .login-button.loading {
          pointer-events:
            none;
        }


        /* =====================================================
           SPINNER
        ====================================================== */

        .spinner {
          width: 17px;
          height: 17px;

          border-radius: 50%;

          border:
            2px solid
            rgba(255, 255, 255, 0.35);

          border-top-color:
            #ffffff;

          animation:
           @keyframes spin 0.7s linear infinite;
        }


        /* =====================================================
           SECURITY
        ====================================================== */

        .security-note {
          position: relative;

          z-index: 2;

          display: flex;

          justify-content: center;

          align-items: center;

          gap: 7px;

          margin-top: 21px;

          color: #72949d;

          font-size: 10px;
        }

        .security-note svg {
          color: #14b8a6;
        }


        /* =====================================================
           LOGIN BOTTOM
        ====================================================== */

        .login-bottom {
          position: relative;

          z-index: 2;

          display: flex;

          justify-content: center;

          align-items: center;

          gap: 8px;

          margin-top: 31px;

          padding-top: 19px;

          border-top:
            1px solid
            rgba(8, 145, 178, 0.08);

          color: #78969e;

          font-size: 9px;

          font-weight: 600;
        }

        .login-bottom span:first-child {
          color: #19758a;
        }

        .bottom-dot {
          color: #8bb6bf;
        }


        /* =====================================================
           ANIMATIONS
        ====================================================== */

        @keyframes cardAppear {
          from {
            opacity: 0;

            transform:
              translateY(25px)
              scale(0.97);
          }

          to {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes iconFloat {
          0%,
          100% {
            transform:
              translateY(0);
          }

          50% {
            transform:
              translateY(-5px);
          }
        }

        @keyframes loginIconFloat {
          0%,
          100% {
            transform:
              translateY(0)
              rotate(0deg);
          }

          50% {
            transform:
              translateY(-4px)
              rotate(2deg);
          }
        }

        @keyframes dotPulse {
          0%,
          100% {
            transform:
              scale(1);

            opacity: 1;
          }

          50% {
            transform:
              scale(1.35);

            opacity: 0.65;
          }
        }

        @keyframes gradientText {
          0% {
            background-position:
              0% center;
          }

          100% {
            background-position:
              250% center;
          }
        }

        @keyframes oceanGlowOne {
          0%,
          100% {
            transform:
              translate3d(0, 0, 0)
              scale(1);
          }

          50% {
            transform:
              translate3d(90px, 55px, 0)
              scale(1.12);
          }
        }

        @keyframes oceanGlowTwo {
          0%,
          100% {
            transform:
              translate3d(0, 0, 0)
              scale(1);
          }

          50% {
            transform:
              translate3d(-90px, -60px, 0)
              scale(1.15);
          }
        }

        @keyframes oceanGlowThree {
          0%,
          100% {
            transform:
              scale(1);

            opacity:
              0.4;
          }

          50% {
            transform:
              scale(1.3);

            opacity:
              0.8;
          }
        }

        @keyframes rayMove {
          0% {
            transform:
              translateX(-120px)
              rotate(24deg);

            opacity:
              0;
          }

          30% {
            opacity:
              0.16;
          }

          70% {
            opacity:
              0.1;
          }

          100% {
            transform:
              translateX(220px)
              rotate(24deg);

            opacity:
              0;
          }
        }

        @keyframes bubbleFloat {
          0%,
          100% {
            transform:
              translate3d(0, 0, 0)
              scale(1);
          }

          25% {
            transform:
              translate3d(12px, -35px, 0)
              scale(1.05);
          }

          50% {
            transform:
              translate3d(-8px, -70px, 0)
              scale(0.95);
          }

          75% {
            transform:
              translate3d(18px, -105px, 0)
              scale(1.08);
          }
        }

        @keyframes oceanFlow {
          0%,
          100% {
            transform:
              translateX(-2%)
              rotate(0deg)
              scaleY(1);
          }

          50% {
            transform:
              translateX(4%)
              rotate(2deg)
              scaleY(1.12);
          }
        }

        @keyframes particleFloat {
          0%,
          100% {
            transform:
              translate3d(0, 0, 0);

            opacity:
              0.2;
          }

          50% {
            transform:
              translate3d(25px, -40px, 0);

            opacity:
              0.8;
          }
        }

        @keyframes cardOrbOne {
          0%,
          100% {
            transform:
              translate(0, 0)
              scale(1);
          }

          50% {
            transform:
              translate(-20px, 15px)
              scale(1.15);
          }
        }

        @keyframes cardOrbTwo {
          0%,
          100% {
            transform:
              translate(0, 0)
              scale(1);
          }

          50% {
            transform:
              translate(25px, -20px)
              scale(1.1);
          }
        }

        @keyframes spin {
          to {
            transform:
              rotate(360deg);
          }
        }


        /* =====================================================
           TABLET
        ====================================================== */

        @media (max-width: 1100px) {

          .login-container {
            grid-template-columns:
              1fr
              450px;

            gap: 35px;

            padding: 25px;
          }

          .showcase-content h1 {
            font-size: 58px;
          }

          .login-showcase {
            padding-left: 10px;
          }
        }


        /* =====================================================
           MOBILE / SMALL LAPTOP
        ====================================================== */

        @media (max-width: 900px) {

          .login-container {
            grid-template-columns: 1fr;

            max-width: 650px;

            gap: 20px;
          }

          .login-showcase {
            min-height: auto;

            padding:
              20px
              0;
          }

          .showcase-content {
            margin-top: 70px;
          }

          .showcase-content h1 {
            font-size: 58px;
          }

          .showcase-footer {
            margin-top: 50px;
          }

          .login-panel {
            width: 100%;
          }
        }


        /* =====================================================
           MOBILE
        ====================================================== */

        @media (max-width: 600px) {

          .login-container {
            padding: 18px;
          }

          .login-showcase {
            padding:
              10px
              0;
          }

          .brand-icon {
            width: 42px;
            height: 42px;
          }

          .brand-name {
            font-size: 19px;
          }

          .showcase-content {
            margin-top: 50px;
          }

          .showcase-content h1 {
            font-size: 45px;

            letter-spacing:
              -2.5px;
          }

          .showcase-content > p {
            font-size: 14px;
          }

          .feature-list {
            margin-top: 25px;
          }

          .feature-item {
            width: 100%;
          }

          .showcase-footer {
            display: none;
          }

          .login-card {
            padding:
              29px
              22px;

            border-radius:
              24px;
          }

          .login-header h2 {
            font-size: 24px;
          }

          .card-top-decoration {
            left: 25px;
            right: 25px;
          }
        }


        /* =====================================================
           VERY SMALL MOBILE
        ====================================================== */

        @media (max-width: 400px) {

          .showcase-content h1 {
            font-size: 39px;
          }

          .login-card {
            padding:
              25px
              18px;
          }

          .login-header h2 {
            font-size: 22px;
          }
        }


        /* =====================================================
           REDUCE MOTION
        ====================================================== */

        @media (prefers-reduced-motion: reduce) {

          *,
          *::before,
          *::after {
            animation-duration:
              0.01ms !important;

            animation-iteration-count:
              1 !important;

            scroll-behavior:
              auto !important;
          }
        }

      `}</style>

      {/* ================= FORGOT PASSWORD ================= */}
      {showForgot && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && !forgotSending && setShowForgot(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center",
            justifyContent: "center", padding: 16, background: "rgba(6,59,70,.45)",
          }}
        >
          <form
            onSubmit={submitForgot}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            style={{
              width: "100%", maxWidth: 420, background: "#fff", borderRadius: 18, padding: 24,
              boxShadow: "0 24px 60px rgba(6,59,70,.25)", display: "flex", flexDirection: "column", gap: 12,
              color: "#123B5D", fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, background: "#E8F7F8", color: "#16A6B8",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ShieldCheck size={19} />
              </div>
              <h3 id="forgot-title" style={{ margin: 0, fontSize: 18 }}>Forgot your password?</h3>
            </div>

            {forgotMessage ? (
              <>
                <p style={{ margin: 0, fontSize: 14, color: "#17724A", background: "#EAF8F1", border: "1px solid #BDE5D0", borderRadius: 12, padding: "10px 12px", lineHeight: 1.5 }}>
                  <CheckCircle2 size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  {forgotMessage}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#6E8799" }}>
                  When your administrator sets a new password you will receive an email with a one-time link to view it.
                </p>
                <button type="button" onClick={() => setShowForgot(false)} className="login-button" style={{ marginTop: 4 }}>
                  Back to login
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "#4f6f7a", lineHeight: 1.5 }}>
                  Passwords are managed by your administrator. Enter your email and we'll send them a reset request.
                </p>
                <div className="input-wrapper">
                  <Mail className="input-icon" size={18} />
                  <input
                    type="email"
                    autoFocus
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-label="Email address"
                  />
                </div>
                {forgotError && <p style={{ margin: 0, fontSize: 13, color: "#b34444" }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    disabled={forgotSending}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #D5E7EE", background: "#fff", color: "#4f6f7a", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSending}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#16A6B8,#0b8f87)", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: forgotSending ? 0.7 : 1 }}
                  >
                    {forgotSending ? "Sending..." : "Send request to admin"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default Login;