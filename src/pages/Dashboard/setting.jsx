import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../../api/config";
import { hasPermission } from "../../services/permissions";
import ChatFileBackup from "./ChatFileBackup";
import TelegramConnect from "./TelegramConnect";
import { disablePush, enablePush } from "../../services/pushNotifications";
import {
  UserRound,
  ShieldCheck,
  CreditCard,
  Camera,
  Mail,
  Phone,
  Building2,
  FileText,
  Save,
  Mic,
  MonitorUp,
  Sparkles,
  ChevronDown,
  Check,
  Trash2,
  AlertTriangle,
  LockKeyhole,
  Eye,
  EyeOff,
  Globe2,
  Bell,
  Palette,
  CheckCircle2,
  Waves,
  Cloud,
  Zap,
  CalendarDays,
  X,
  Archive,
} from "lucide-react";

const Settings = () => {
  const [activeTab, setActiveTab] = useState("profile");
  const canSeeChatBackup = useMemo(() => {
    try {
      return hasPermission(JSON.parse(localStorage.getItem("user") || "null"), "chat", "view");
    } catch {
      return false;
    }
  }, []);

  // Loaded from GET /api/auth/me — never hardcoded
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    department: "",
    bio: "",
  });
  const [role, setRole] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState(null);

  const [preferences, setPreferences] = useState({
    microphone: true,
    keepAwake: true,
    aiSummary: true,
    emailNotifications: true,
    taskReminders: true,
    desktopNotifications: true,
    telegramNotifications: true,
  });

  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [aiProvider, setAiProvider] = useState("Gemini");
  const [language, setLanguage] = useState("English");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  const [saved, setSaved] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [toast, setToast] = useState("");

  const canEditOwnDepartment = ["Admin", "SuperAdmin"].includes(role);

  const applyServerData = useCallback((me) => {
    setRole(me.role || "");
    setProfile({
      fullName: me.name || "",
      email: me.email || "",
      phone: me.phone || "",
      department: me.department || "",
      bio: me.bio || "",
    });
    const prefs = me.preferences || {};
    setPreferences((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.keys(prev)
          .filter((key) => typeof prefs[key] === "boolean")
          .map((key) => [key, prefs[key]])
      ),
    }));
    if (prefs.aiProvider) setAiProvider(prefs.aiProvider);
    if (prefs.language) setLanguage(prefs.language);
    if (prefs.timezone) setTimezone(prefs.timezone);
    setServerSnapshot(me);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setLoadError("");
    try {
      const response = await API.get("/api/auth/me");
      applyServerData(response.data?.data || {});
    } catch (error) {
      setLoadError(error.response?.data?.message || "Failed to load your settings.");
    } finally {
      setLoadingProfile(false);
    }
  }, [applyServerData]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const initials = useMemo(() => {
    return profile.fullName
      .split(" ")
      .map((name) => name.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile.fullName]);

  const showToast = (message) => {
    setToast(message);

    setTimeout(() => {
      setToast("");
    }, 2800);
  };

  const updateProfile = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));

    setSaved(false);
  };

  const togglePreference = (field) => {
    // Desktop notifications → push for this browser (permission must be asked from the click)
    if (field === "desktopNotifications" && !preferences.desktopNotifications) {
      enablePush().then((result) => {
        if (result === "denied") {
          setPreferences((prev) => ({ ...prev, desktopNotifications: false }));
          showToast("Notifications are blocked in this browser. Allow them from the lock icon in the address bar.");
        } else if (result === "unsupported") {
          showToast("This browser does not support push notifications.");
        }
      });
    }

    setPreferences((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));

    setSaved(false);
  };

  const handleSaveProfile = async () => {
    if (savingProfile) return;

    if (!profile.fullName.trim()) {
      showToast("Full name cannot be empty");
      return;
    }

    setSavingProfile(true);
    try {
      const [profileRes] = await Promise.all([
        API.put("/api/auth/me", {
          name: profile.fullName.trim(),
          phone: profile.phone.trim(),
          bio: profile.bio,
          ...(canEditOwnDepartment ? { department: profile.department } : {}),
        }),
        API.put("/api/auth/me/preferences", {
          ...preferences,
          aiProvider,
          language,
          timezone,
        }),
      ]);

      const me = profileRes.data?.data;
      if (me) {
        applyServerData({ ...me, preferences: { ...me.preferences, ...preferences, aiProvider, language, timezone } });
        // keep header / nav in sync with the saved name
        try {
          const stored = JSON.parse(localStorage.getItem("user") || "{}");
          localStorage.setItem("user", JSON.stringify({
            ...stored,
            name: me.name,
            phone: me.phone,
            department: me.department,
            preferences: { ...(stored.preferences || {}), ...preferences },
          }));
          window.dispatchEvent(new Event("user-updated"));
        } catch {
          /* ignore storage errors */
        }
      }

      if (!preferences.desktopNotifications) disablePush(); // switched off → stop pushes to this browser

      setSaved(true);
      showToast("Profile settings saved successfully");
      setTimeout(() => {
        setSaved(false);
      }, 2500);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to save your settings");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!security.currentPassword) {
      showToast("Enter your current password");
      return;
    }

    if (!security.newPassword) {
      showToast("Enter a new password");
      return;
    }

    if (security.newPassword.length < 6) {
      showToast("New password must be at least 6 characters");
      return;
    }

    if (security.newPassword !== security.confirmPassword) {
      showToast("New passwords do not match");
      return;
    }

    if (savingPassword) return;
    setSavingPassword(true);
    try {
      await API.put("/api/auth/change-password", {
        currentPassword: security.currentPassword,
        newPassword: security.newPassword,
      });
      showToast("Password updated successfully");
      setSecurity({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  // Accounts are removed by an administrator (Users page); nothing is deleted here.
  const handleDeleteAccount = () => {
    setDeleteModal(false);
    showToast(
      ["Admin", "SuperAdmin"].includes(role)
        ? "Ask the Super Admin to remove administrator accounts"
        : "Ask your administrator to delete your account"
    );
  };

  return (
    <div className="settings-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .settings-page {
          min-height: 100vh;
          padding: 26px;
          background:
            radial-gradient(circle at 5% 5%, rgba(56, 189, 248, 0.13), transparent 28%),
            radial-gradient(circle at 95% 10%, rgba(20, 184, 166, 0.10), transparent 28%),
            linear-gradient(135deg, #f4fbfc 0%, #eef8fa 45%, #f8fbfd 100%);
          color: #12334b;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .settings-shell {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .settings-hero {
          position: relative;
          overflow: hidden;
          min-height: 190px;
          border-radius: 28px;
          padding: 30px 34px;
          background:
            linear-gradient(
              135deg,
              #073b4c 0%,
              #075985 48%,
              #0f766e 100%
            );
          box-shadow:
            0 22px 55px rgba(7, 59, 76, 0.18),
            inset 0 1px rgba(255,255,255,0.14);
          color: white;
        }

        .settings-hero::before {
          content: "";
          position: absolute;
          width: 330px;
          height: 330px;
          right: -90px;
          top: -150px;
          border-radius: 50%;
          background: rgba(255,255,255,0.09);
        }

        .settings-hero::after {
          content: "";
          position: absolute;
          width: 250px;
          height: 250px;
          right: 160px;
          bottom: -200px;
          border-radius: 50%;
          border: 45px solid rgba(255,255,255,0.06);
        }

        .hero-content {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 25px;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .hero-icon {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.13);
          border: 1px solid rgba(255,255,255,0.2);
          backdrop-filter: blur(12px);
        }

        .hero-icon svg {
          width: 30px;
          height: 30px;
        }

        .hero-title {
          margin: 0;
          font-size: 30px;
          line-height: 1.15;
          letter-spacing: -0.7px;
          font-weight: 800;
        }

        .hero-subtitle {
          margin: 8px 0 0;
          color: rgba(255,255,255,0.72);
          font-size: 14px;
        }

        .hero-status {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.15);
          color: #d8fff7;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #5eead4;
          box-shadow: 0 0 0 5px rgba(94,234,212,0.12);
        }

        .content-grid {
          display: grid;
          grid-template-columns: 270px minmax(0, 1fr);
          gap: 22px;
          margin-top: 22px;
          align-items: start;
        }

        .settings-sidebar {
          position: sticky;
          top: 20px;
          padding: 15px;
          border: 1px solid #d8e9ef;
          border-radius: 24px;
          background: rgba(255,255,255,0.86);
          box-shadow: 0 12px 35px rgba(10, 68, 89, 0.08);
          backdrop-filter: blur(15px);
        }

        .side-label {
          padding: 9px 12px 12px;
          color: #7190a3;
          font-size: 10px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-weight: 800;
        }

        .tab-button {
          width: 100%;
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          margin-bottom: 6px;
          border-radius: 15px;
          color: #5d788b;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
          font-weight: 700;
          transition: 0.2s ease;
        }

        .tab-button:hover {
          background: #edf8fa;
          color: #087f87;
        }

        .tab-button.active {
          color: white;
          background: linear-gradient(135deg, #087f87, #0874a6);
          box-shadow: 0 9px 22px rgba(8, 127, 135, 0.20);
        }

        .tab-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #edf7f8;
          color: #087f87;
        }

        .tab-button.active .tab-icon {
          background: rgba(255,255,255,0.15);
          color: white;
        }

        .tab-text {
          flex: 1;
        }

        .tab-arrow {
          opacity: 0.45;
        }

        .sidebar-footer {
          margin-top: 18px;
          padding: 15px;
          border-radius: 17px;
          background: linear-gradient(135deg, #ecfbfa, #edf8ff);
          border: 1px solid #d6eeee;
        }

        .sidebar-footer-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 800;
          color: #12546a;
        }

        .sidebar-footer-text {
          margin: 7px 0 0;
          font-size: 11px;
          line-height: 1.55;
          color: #7190a3;
        }

        .main-content {
          min-width: 0;
        }

        .section-card {
          background: rgba(255,255,255,0.93);
          border: 1px solid #d8e7ed;
          border-radius: 24px;
          padding: 26px;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(12, 67, 88, 0.055);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 24px;
        }

        .section-title-wrap {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .section-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #087f87;
          background: #e9f8f7;
          border: 1px solid #cdecea;
        }

        .section-title {
          margin: 0;
          font-size: 19px;
          color: #12334b;
          font-weight: 800;
        }

        .section-description {
          margin: 4px 0 0;
          font-size: 12px;
          color: #7892a2;
        }

        .profile-banner {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 19px;
          margin-bottom: 25px;
          border-radius: 20px;
          background:
            linear-gradient(
              135deg,
              #edfafa 0%,
              #eff9ff 100%
            );
          border: 1px solid #d4e9ee;
        }

        .avatar {
          width: 78px;
          height: 78px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 23px;
          color: white;
          font-size: 25px;
          font-weight: 800;
          background: linear-gradient(145deg, #0f766e, #087f87, #0874a6);
          box-shadow: 0 12px 25px rgba(8,127,135,0.20);
        }

        .profile-banner-content {
          flex: 1;
        }

        .profile-name {
          margin: 0;
          color: #12334b;
          font-size: 18px;
          font-weight: 800;
        }

        .profile-email {
          margin: 4px 0 0;
          color: #678294;
          font-size: 13px;
        }

        .profile-tags {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
        }

        .tag-ocean {
          color: #087f87;
          background: #dff7f4;
        }

        .tag-blue {
          color: #17648a;
          background: #e5f3fb;
        }

        .upload-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #cde2e8;
          background: white;
          color: #18556d;
          padding: 10px 13px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .upload-button:hover {
          background: #f1fafb;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        .field-label {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          color: #28475a;
          font-size: 12px;
          font-weight: 800;
        }

        .field-input,
        .field-select,
        .field-textarea {
          width: 100%;
          border: 1px solid #d7e6eb;
          outline: none;
          border-radius: 13px;
          background: #f8fbfc;
          color: #183b50;
          font-family: inherit;
          font-size: 13px;
          transition: 0.2s ease;
        }

        .field-input,
        .field-select {
          height: 45px;
          padding: 0 13px;
        }

        .field-textarea {
          min-height: 105px;
          resize: vertical;
          padding: 13px;
          line-height: 1.55;
        }

        .field-input:focus,
        .field-select:focus,
        .field-textarea:focus {
          border-color: #43a8ad;
          background: white;
          box-shadow: 0 0 0 4px rgba(67,168,173,0.10);
        }

        .input-with-icon {
          position: relative;
        }

        .input-with-icon .field-input {
          padding-left: 41px;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #73a0ae;
          pointer-events: none;
        }

        .save-row {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #e4eef1;
        }

        .primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 43px;
          padding: 0 17px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(135deg, #078b83, #0874a6);
          color: white;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 9px 22px rgba(8,127,135,0.18);
        }

        .primary-button:hover {
          transform: translateY(-1px);
        }

        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 43px;
          padding: 0 17px;
          border: 1px solid #d5e5ea;
          border-radius: 12px;
          background: white;
          color: #47677a;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .preference-list {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        .preference-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 17px;
          border-radius: 16px;
          border: 1px solid #dce9ed;
          background: #fbfdfe;
          transition: 0.2s ease;
        }

        .preference-item:hover {
          border-color: #b9dfe3;
          background: #f7fcfd;
        }

        .preference-left {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .preference-icon {
          width: 39px;
          height: 39px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 12px;
          background: #e9f8f7;
          color: #087f87;
        }

        .preference-name {
          margin: 0;
          color: #24475a;
          font-size: 13px;
          font-weight: 800;
        }

        .preference-description {
          margin: 4px 0 0;
          color: #7b94a3;
          font-size: 11px;
        }

        .toggle {
          width: 46px;
          height: 25px;
          padding: 3px;
          border: 0;
          border-radius: 999px;
          background: #d5e2e6;
          cursor: pointer;
          transition: 0.2s ease;
          flex-shrink: 0;
        }

        .toggle.on {
          background: linear-gradient(135deg, #0f9f93, #0874a6);
        }

        .toggle-thumb {
          width: 19px;
          height: 19px;
          display: block;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.16);
          transition: transform 0.2s ease;
        }

        .toggle.on .toggle-thumb {
          transform: translateX(21px);
        }

        .select-wrap {
          position: relative;
          width: 180px;
          flex-shrink: 0;
        }

        .select-wrap select {
          appearance: none;
          width: 100%;
          height: 40px;
          padding: 0 35px 0 12px;
          border-radius: 11px;
          border: 1px solid #d6e6eb;
          background: white;
          color: #33576b;
          font-size: 12px;
          outline: none;
        }

        .select-arrow {
          position: absolute;
          right: 11px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #7594a3;
        }

        .security-box {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
        }

        .password-field {
          position: relative;
        }

        .password-field .field-input {
          padding-right: 42px;
        }

        .password-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          border: 0;
          background: transparent;
          color: #7190a0;
          cursor: pointer;
        }

        .security-tip {
          display: flex;
          gap: 11px;
          margin-top: 19px;
          padding: 14px;
          border-radius: 14px;
          background: #effafa;
          border: 1px solid #d3eeee;
          color: #527587;
          font-size: 11px;
          line-height: 1.5;
        }

        .subscription-card {
          position: relative;
          overflow: hidden;
          padding: 24px;
          border-radius: 20px;
          background:
            linear-gradient(135deg, #073b4c, #075985 58%, #0f766e);
          color: white;
        }

        .subscription-card::after {
          content: "";
          position: absolute;
          width: 230px;
          height: 230px;
          right: -110px;
          top: -110px;
          border-radius: 50%;
          border: 40px solid rgba(255,255,255,0.07);
        }

        .subscription-content {
          position: relative;
          z-index: 2;
        }

        .subscription-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 15px;
        }

        .plan-label {
          color: rgba(255,255,255,0.62);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .plan-name {
          margin: 6px 0 0;
          font-size: 24px;
          font-weight: 850;
        }

        .plan-badge {
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(94,234,212,0.14);
          color: #99f6e4;
          border: 1px solid rgba(153,246,228,0.2);
          font-size: 10px;
          font-weight: 800;
        }

        .plan-details {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 24px;
        }

        .plan-detail {
          padding: 13px;
          border-radius: 14px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.09);
        }

        .plan-detail-label {
          color: rgba(255,255,255,0.55);
          font-size: 10px;
        }

        .plan-detail-value {
          margin-top: 5px;
          font-size: 13px;
          font-weight: 800;
        }

        .danger-card {
          border-color: #ffd6d6;
          background: linear-gradient(135deg, #fff, #fffafa);
        }

        .danger-card .section-icon {
          color: #dc2626;
          background: #fff0f0;
          border-color: #ffdcdc;
        }

        .danger-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .danger-title {
          margin: 0;
          color: #b42323;
          font-size: 17px;
          font-weight: 800;
        }

        .danger-description {
          margin: 6px 0 0;
          color: #8d6b6b;
          font-size: 12px;
        }

        .danger-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 0 15px;
          border: 1px solid #ffcaca;
          border-radius: 11px;
          background: #fff4f4;
          color: #dc2626;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .danger-button:hover {
          background: #fee2e2;
        }

        .toast {
          position: fixed;
          right: 25px;
          bottom: 25px;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 17px;
          border-radius: 14px;
          background: #073b4c;
          color: white;
          box-shadow: 0 15px 35px rgba(7,59,76,0.25);
          font-size: 12px;
          font-weight: 700;
          animation: slideIn 0.25s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(4, 25, 35, 0.62);
          backdrop-filter: blur(6px);
        }

        .delete-modal {
          width: 100%;
          max-width: 450px;
          padding: 26px;
          border-radius: 24px;
          background: white;
          box-shadow: 0 30px 80px rgba(0,0,0,0.25);
          animation: modalIn 0.2s ease;
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .modal-icon {
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: #fff0f0;
          color: #dc2626;
        }

        .modal-title {
          margin: 18px 0 8px;
          color: #17374a;
          font-size: 20px;
          font-weight: 850;
        }

        .modal-text {
          margin: 0;
          color: #718898;
          font-size: 12px;
          line-height: 1.6;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          margin-top: 23px;
        }

        .confirm-delete {
          min-height: 41px;
          padding: 0 15px;
          border: 0;
          border-radius: 11px;
          background: #dc2626;
          color: white;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 1100px) {
          .content-grid {
            grid-template-columns: 1fr;
          }

          .settings-sidebar {
            position: static;
          }

          .settings-sidebar nav {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
          }

          .side-label,
          .sidebar-footer {
            display: none;
          }

          .tab-button {
            margin: 0;
          }

          .security-box {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .settings-page {
            padding: 13px;
          }

          .settings-hero {
            padding: 23px;
            border-radius: 21px;
          }

          .hero-content {
            align-items: flex-start;
            flex-direction: column;
          }

          .hero-title {
            font-size: 25px;
          }

          .settings-sidebar nav {
            grid-template-columns: 1fr;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .field.full {
            grid-column: auto;
          }

          .profile-banner {
            align-items: flex-start;
            flex-direction: column;
          }

          .upload-button {
            width: 100%;
            justify-content: center;
          }

          .preference-item {
            align-items: flex-start;
          }

          .select-wrap {
            width: 135px;
          }

          .plan-details {
            grid-template-columns: 1fr;
          }

          .danger-content {
            align-items: flex-start;
            flex-direction: column;
          }

          .danger-button {
            width: 100%;
            justify-content: center;
          }

          .section-card {
            padding: 19px;
            border-radius: 19px;
          }
        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .settings-page .settings-hero {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
        }

      `}</style>

      <div className="settings-shell">

        {/* HERO */}
        <section className="settings-hero">
          <div className="hero-content">
            <div className="hero-left">
              <div className="hero-icon">
                <Waves />
              </div>

              <div>
                <h1 className="hero-title">Workspace Settings</h1>
                <p className="hero-subtitle">
                  Manage your profile, preferences, security and workspace
                  experience.
                </p>
              </div>
            </div>

            <div className="hero-status">
              <span className="status-dot" />
              Workspace synced
            </div>
          </div>
        </section>

        <div className="content-grid">

          {/* SIDEBAR */}
          <aside className="settings-sidebar">
            <div className="side-label">Settings menu</div>

            <nav>
              <button
                className={`tab-button ${
                  activeTab === "profile" ? "active" : ""
                }`}
                onClick={() => setActiveTab("profile")}
              >
                <span className="tab-icon">
                  <UserRound size={18} />
                </span>
                <span className="tab-text">Profile</span>
                <span className="tab-arrow">›</span>
              </button>

              <button
                className={`tab-button ${
                  activeTab === "security" ? "active" : ""
                }`}
                onClick={() => setActiveTab("security")}
              >
                <span className="tab-icon">
                  <ShieldCheck size={18} />
                </span>
                <span className="tab-text">Security</span>
                <span className="tab-arrow">›</span>
              </button>

              {canSeeChatBackup && (
                <button
                  className={`tab-button ${activeTab === "backup" ? "active" : ""}`}
                  onClick={() => setActiveTab("backup")}
                >
                  <span className="tab-icon">
                    <Archive size={18} />
                  </span>
                  <span className="tab-text">Chat file backup</span>
                  <span className="tab-arrow">›</span>
                </button>
              )}

              {/* <button
                className={`tab-button ${
                  activeTab === "subscription" ? "active" : ""
                }`}
                onClick={() => setActiveTab("subscription")}
              >
                <span className="tab-icon">
                  <CreditCard size={18} />
                </span>
                <span className="tab-text">Subscription</span>
                <span className="tab-arrow">›</span>
              </button> */}
            </nav>

            <div className="sidebar-footer">
              <div className="sidebar-footer-title">
                <Sparkles size={14} />
                Ocean workspace
              </div>

              <p className="sidebar-footer-text">
                Your preferences are stored for this workspace and can be
                changed anytime.
              </p>
            </div>
          </aside>

          {/* MAIN */}
          <main className="main-content">

            {/* PROFILE */}
            {loadError && (
              <section className="section-card" style={{ borderColor: "#fecaca", color: "#b91c1c" }}>
                <AlertTriangle size={16} /> {loadError}{" "}
                <button className="secondary-button" onClick={loadProfile}>Retry</button>
              </section>
            )}

            {activeTab === "profile" && (
              <>
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <UserRound size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Profile Information
                        </h2>

                        <p className="section-description">
                          Keep your personal and organization details updated.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="profile-banner">
                    <div className="avatar">{initials}</div>

                    <div className="profile-banner-content">
                      <h3 className="profile-name">
                        {profile.fullName || "Your Name"}
                      </h3>

                      <p className="profile-email">
                        {profile.email || "your@email.com"}
                      </p>

                      <div className="profile-tags">
                        <span className="tag tag-ocean">
                          <CheckCircle2 size={11} />
                          Administrator
                        </span>

                        <span className="tag tag-blue">
                          <Building2 size={11} />
                          {profile.department || "Workspace"}
                        </span>
                      </div>
                    </div>

                    <button
                      className="upload-button"
                      disabled
                      title="Profile photos are not supported yet"
                      style={{ opacity: 0.6, cursor: "not-allowed" }}
                    >
                      <Camera size={15} />
                      Change photo
                    </button>
                  </div>

                  <div className="form-grid">

                    <div className="field">
                      <label className="field-label">
                        <UserRound size={14} />
                        Full Name
                      </label>

                      <div className="input-with-icon">
                        <UserRound className="input-icon" size={15} />

                        <input
                          className="field-input"
                          value={profile.fullName}
                          onChange={(e) =>
                            updateProfile("fullName", e.target.value)
                          }
                          placeholder="Enter your full name"
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label">
                        <Mail size={14} />
                        Email Address
                      </label>

                      <div className="input-with-icon">
                        <Mail className="input-icon" size={15} />

                        <input
                          type="email"
                          className="field-input"
                          value={profile.email}
                          readOnly
                          title="Your login email is managed by your administrator"
                          style={{ opacity: 0.75, cursor: "not-allowed" }}
                          placeholder={loadingProfile ? "Loading..." : "Email"}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label">
                        <Phone size={14} />
                        Phone
                      </label>

                      <div className="input-with-icon">
                        <Phone className="input-icon" size={15} />

                        <input
                          className="field-input"
                          value={profile.phone}
                          onChange={(e) =>
                            updateProfile("phone", e.target.value)
                          }
                          placeholder="Enter phone number"
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label">
                        <Building2 size={14} />
                        Department
                      </label>

                      <select
                        className="field-select"
                        value={profile.department}
                        disabled={!canEditOwnDepartment}
                        title={
                          canEditOwnDepartment
                            ? undefined
                            : "Your department is assigned by your administrator"
                        }
                        onChange={(e) =>
                          updateProfile("department", e.target.value)
                        }
                      >
                        <option value="">No department</option>
                        {profile.department &&
                          ![
                            "Management", "Development", "Marketing",
                            "Human Resources", "Finance", "Operations",
                          ].includes(profile.department) && (
                            <option>{profile.department}</option>
                          )}
                        <option>Management</option>
                        <option>Development</option>
                        <option>Marketing</option>
                        <option>Human Resources</option>
                        <option>Finance</option>
                        <option>Operations</option>
                      </select>
                    </div>

                    <div className="field full">
                      <label className="field-label">
                        <FileText size={14} />
                        About You
                      </label>

                      <textarea
                        className="field-textarea"
                        value={profile.bio}
                        onChange={(e) =>
                          updateProfile("bio", e.target.value)
                        }
                        placeholder="Tell your team something about yourself..."
                      />
                    </div>

                  </div>

                  <div className="save-row">
                    <button
                      className="secondary-button"
                      disabled={savingProfile || !serverSnapshot}
                      onClick={() => serverSnapshot && applyServerData(serverSnapshot)}
                    >
                      Reset
                    </button>

                    <button
                      className="primary-button"
                      onClick={handleSaveProfile}
                      disabled={savingProfile || loadingProfile}
                    >
                      {saved ? (
                        <>
                          <Check size={16} />
                          Saved
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          {savingProfile ? "Saving..." : "Save Profile"}
                        </>
                      )}
                    </button>
                  </div>
                </section>

                {/* RECORDING */}
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <Mic size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Recording Preferences
                        </h2>

                        <p className="section-description">
                          Configure meeting recording and AI preferences.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="preference-list">

                    <PreferenceRow
                      icon={<Mic size={18} />}
                      title="Microphone recording"
                      description="Allow meeting and agenda recording to use your microphone."
                      enabled={preferences.microphone}
                      onToggle={() => togglePreference("microphone")}
                    />

                    <PreferenceRow
                      icon={<MonitorUp size={18} />}
                      title="Keep screen awake"
                      description="Prevent your device from sleeping during meeting recording."
                      enabled={preferences.keepAwake}
                      onToggle={() => togglePreference("keepAwake")}
                    />

                    <div className="preference-item">
                      <div className="preference-left">
                        <div className="preference-icon">
                          <Sparkles size={18} />
                        </div>

                        <div>
                          <p className="preference-name">
                            AI summarization
                          </p>

                          <p className="preference-description">
                            Select which AI service creates meeting summaries.
                          </p>
                        </div>
                      </div>

                      <div className="select-wrap">
                        <select
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value)}
                        >
                          <option>Gemini</option>
                          <option>OpenAI</option>
                          <option>Disabled</option>
                        </select>

                        <ChevronDown
                          className="select-arrow"
                          size={14}
                        />
                      </div>
                    </div>

                  </div>
                </section>

                {/* NOTIFICATIONS */}
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <Bell size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Notifications
                        </h2>

                        <p className="section-description">
                          Decide which workspace updates you want to receive.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="preference-list">

                    <PreferenceRow
                      icon={<Mail size={18} />}
                      title="Email notifications"
                      description="Receive important workspace updates by email."
                      enabled={preferences.emailNotifications}
                      onToggle={() =>
                        togglePreference("emailNotifications")
                      }
                    />

                    <PreferenceRow
                      icon={<CalendarDays size={18} />}
                      title="Task reminders"
                      description="Get notified when assigned tasks are approaching."
                      enabled={preferences.taskReminders}
                      onToggle={() =>
                        togglePreference("taskReminders")
                      }
                    />

                    <PreferenceRow
                      icon={<Bell size={18} />}
                      title="Desktop notifications"
                      description="Push notifications for tasks, reviews, support and chat — even when the app is closed."
                      enabled={preferences.desktopNotifications}
                      onToggle={() =>
                        togglePreference("desktopNotifications")
                      }
                    />

                    <TelegramConnect notify={showToast} />

                    <PreferenceRow
                      icon={<Bell size={18} />}
                      title="Telegram notifications"
                      description="Send task updates and reminders to your connected Telegram chat."
                      enabled={preferences.telegramNotifications}
                      onToggle={() =>
                        togglePreference("telegramNotifications")
                      }
                    />

                  </div>
                </section>

                {/* REGIONAL */}
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <Globe2 size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Regional Preferences
                        </h2>

                        <p className="section-description">
                          Customize language and time display.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="form-grid">

                    <div className="field">
                      <label className="field-label">
                        Language
                      </label>

                      <select
                        className="field-select"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        <option>English</option>
                        <option>Tamil</option>
                        <option>Hindi</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">
                        Timezone
                      </label>

                      <select
                        className="field-select"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                      >
                        <option>Asia/Kolkata</option>
                        <option>Asia/Singapore</option>
                        <option>Europe/London</option>
                        <option>America/New_York</option>
                      </select>
                    </div>

                  </div>
                </section>
              </>
            )}

            {/* SECURITY */}
            {activeTab === "security" && (
              <>
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <LockKeyhole size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Password & Security
                        </h2>

                        <p className="section-description">
                          Keep your workspace account secure.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="security-box">

                    <PasswordInput
                      label="Current Password"
                      value={security.currentPassword}
                      onChange={(value) =>
                        setSecurity((prev) => ({
                          ...prev,
                          currentPassword: value,
                        }))
                      }
                      visible={showCurrentPassword}
                      setVisible={setShowCurrentPassword}
                    />

                    <PasswordInput
                      label="New Password"
                      value={security.newPassword}
                      onChange={(value) =>
                        setSecurity((prev) => ({
                          ...prev,
                          newPassword: value,
                        }))
                      }
                      visible={showNewPassword}
                      setVisible={setShowNewPassword}
                    />

                    <PasswordInput
                      label="Confirm Password"
                      value={security.confirmPassword}
                      onChange={(value) =>
                        setSecurity((prev) => ({
                          ...prev,
                          confirmPassword: value,
                        }))
                      }
                      visible={showConfirmPassword}
                      setVisible={setShowConfirmPassword}
                    />

                  </div>

                  <div className="security-tip">
                    <ShieldCheck size={18} />

                    <div>
                      Use a strong password containing uppercase letters,
                      lowercase letters, numbers and special characters.
                      Avoid reusing passwords from other services.
                    </div>
                  </div>

                  <div className="save-row">
                    <button
                      className="primary-button"
                      onClick={handlePasswordChange}
                      disabled={savingPassword}
                    >
                      <LockKeyhole size={16} />
                      {savingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </section>

                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <ShieldCheck size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Account Protection
                        </h2>

                        <p className="section-description">
                          Additional security information for your account.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="preference-list">

                    <div className="preference-item">
                      <div className="preference-left">
                        <div className="preference-icon">
                          <ShieldCheck size={18} />
                        </div>

                        <div>
                          <p className="preference-name">
                            Two-factor authentication
                          </p>

                          <p className="preference-description">
                            Add an additional verification step when signing
                            in.
                          </p>
                        </div>
                      </div>

                      <button
                        className="secondary-button"
                        onClick={() =>
                          showToast("Two-factor setup opened")
                        }
                      >
                        Configure
                      </button>
                    </div>

                    <div className="preference-item">
                      <div className="preference-left">
                        <div className="preference-icon">
                          <Globe2 size={18} />
                        </div>

                        <div>
                          <p className="preference-name">
                            Active sessions
                          </p>

                          <p className="preference-description">
                            Review devices currently connected to your account.
                          </p>
                        </div>
                      </div>

                      <button
                        className="secondary-button"
                        onClick={() =>
                          showToast("Session manager opened")
                        }
                      >
                        View sessions
                      </button>
                    </div>

                  </div>
                </section>
              </>
            )}

            {/* CHAT FILE BACKUP */}
            {activeTab === "backup" && canSeeChatBackup && <ChatFileBackup />}

            {/* SUBSCRIPTION */}
            {activeTab === "subscription" && (
              <>
                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <CreditCard size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Subscription
                        </h2>

                        <p className="section-description">
                          Review your current workspace plan and usage.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="subscription-card">
                    <div className="subscription-content">

                      <div className="subscription-top">
                        <div>
                          <div className="plan-label">
                            Current workspace plan
                          </div>

                          <div className="plan-name">
                            Professional
                          </div>
                        </div>

                        <div className="plan-badge">
                          Active
                        </div>
                      </div>

                      <div className="plan-details">

                        <div className="plan-detail">
                          <div className="plan-detail-label">
                            Users
                          </div>

                          <div className="plan-detail-value">
                            25 / 50
                          </div>
                        </div>

                        <div className="plan-detail">
                          <div className="plan-detail-label">
                            Storage
                          </div>

                          <div className="plan-detail-value">
                            12 GB / 50 GB
                          </div>
                        </div>

                        <div className="plan-detail">
                          <div className="plan-detail-label">
                            Renewal
                          </div>

                          <div className="plan-detail-value">
                            Sep 2026
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </section>

                <section className="section-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <div className="section-icon">
                        <Zap size={20} />
                      </div>

                      <div>
                        <h2 className="section-title">
                          Workspace Features
                        </h2>

                        <p className="section-description">
                          Features available with your current plan.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="preference-list">

                    <FeatureRow
                      icon={<Check size={18} />}
                      title="Unlimited task management"
                    />

                    <FeatureRow
                      icon={<Check size={18} />}
                      title="Task Bank and reusable templates"
                    />

                    <FeatureRow
                      icon={<Check size={18} />}
                      title="Meeting minutes and action plans"
                    />

                    <FeatureRow
                      icon={<Check size={18} />}
                      title="Calendar and team scheduling"
                    />

                    <FeatureRow
                      icon={<Check size={18} />}
                      title="Advanced workspace reports"
                    />

                  </div>

                  <div className="save-row">
                    <button
                      className="primary-button"
                      onClick={() =>
                        showToast("Subscription management opened")
                      }
                    >
                      <CreditCard size={16} />
                      Manage Subscription
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* DELETE ACCOUNT */}
            <section className="section-card danger-card">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon">
                    <Trash2 size={20} />
                  </div>

                  <div>
                    <h2 className="section-title">
                      Delete Account
                    </h2>

                    <p className="section-description">
                      Permanently remove your account and workspace access.
                    </p>
                  </div>
                </div>
              </div>

              <div className="danger-content">
                <div>
                  <h3 className="danger-title">
                    Permanently delete your account
                  </h3>

                  <p className="danger-description">
                    This action cannot be undone. All account-related access
                    and data may be permanently removed.
                  </p>
                </div>

                <button
                  className="danger-button"
                  onClick={() => setDeleteModal(true)}
                >
                  <Trash2 size={15} />
                  Delete My Account
                </button>
              </div>
            </section>

          </main>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteModal && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteModal(false)}
        >
          <div
            className="delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-icon">
              <AlertTriangle size={25} />
            </div>

            <h2 className="modal-title">
              Delete your account?
            </h2>

            <p className="modal-text">
              This will permanently remove your account access. This action
              should only be performed if you are completely sure.
            </p>

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setDeleteModal(false)}
              >
                Cancel
              </button>

              <button
                className="confirm-delete"
                onClick={handleDeleteAccount}
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------
   PREFERENCE ROW
------------------------------------------------------- */

const PreferenceRow = ({
  icon,
  title,
  description,
  enabled,
  onToggle,
}) => {
  return (
    <div className="preference-item">
      <div className="preference-left">
        <div className="preference-icon">
          {icon}
        </div>

        <div>
          <p className="preference-name">
            {title}
          </p>

          <p className="preference-description">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        className={`toggle ${enabled ? "on" : ""}`}
        onClick={onToggle}
        aria-label={`Toggle ${title}`}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
};

/* -------------------------------------------------------
   PASSWORD INPUT
------------------------------------------------------- */

const PasswordInput = ({
  label,
  value,
  onChange,
  visible,
  setVisible,
}) => {
  return (
    <div className="field">
      <label className="field-label">
        <LockKeyhole size={14} />
        {label}
      </label>

      <div className="password-field">
        <input
          type={visible ? "text" : "password"}
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
        />

        <button
          type="button"
          className="password-eye"
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------
   FEATURE ROW
------------------------------------------------------- */

const FeatureRow = ({ icon, title }) => {
  return (
    <div className="preference-item">
      <div className="preference-left">
        <div
          className="preference-icon"
          style={{
            color: "#0f766e",
            background: "#e4f8f4",
          }}
        >
          {icon}
        </div>

        <div>
          <p className="preference-name">
            {title}
          </p>

          <p className="preference-description">
            Included with your Professional workspace plan.
          </p>
        </div>
      </div>

      <span className="tag tag-ocean">
        Included
      </span>
    </div>
  );
};

export default Settings;