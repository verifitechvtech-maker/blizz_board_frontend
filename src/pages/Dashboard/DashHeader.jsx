
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { hasPermission } from "../../services/permissions";
import NotificationBell from "../../components/NotificationBell";
import TelegramToggle from "../../components/TelegramToggle";
import { getSocket } from "../../services/socket";
import {
  Bell,
  ChevronDown,
  Menu,
  Search,
  Sparkles,
  X,
  Command,
  Settings,
  UserRound,
  LogOut,
  CheckSquare,
  ClipboardList,
  CornerDownLeft,
  Loader2,
} from "lucide-react";
import { unsubscribePushOnLogout } from "../../services/pushNotifications";
import { trackLogout } from "../../services/activity";
import { InstallAppButton } from "../../components/AppStatus";
import { SERVER_URL as ENV_SERVER_URL } from "../../config/env";

const API_URL = ENV_SERVER_URL; // server origin — paths below add /api

const DashHeader = ({
  navLinks = [],
  activeLink,
  handleNavClick,
  menuOpen,
  setMenuOpen,
  isMobile = false,
  isTablet = false,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({});
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchData, setSearchData] = useState({ tasks: [], meetings: [], loaded: false });
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeResult, setActiveResult] = useState(0);

  const profileRef = useRef(null);
  const searchRef = useRef(null);
  const unreadCountsRef = useRef(new Map());

  // Responsive detection
  const [viewport, setViewport] = useState({
    mobile:
      typeof window !== "undefined" && window.innerWidth <= 767,
    tablet:
      typeof window !== "undefined" &&
      window.innerWidth >= 768 &&
      window.innerWidth <= 1100,
  });

  useEffect(() => {
    const onResize = () => {
      setViewport({
        mobile: window.innerWidth <= 767,
        tablet:
          window.innerWidth >= 768 &&
          window.innerWidth <= 1100,
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveMobile = isMobile || viewport.mobile;
  const effectiveTablet = isTablet || viewport.tablet;
  const isCompact = effectiveMobile || effectiveTablet;

  // Load current user
  useEffect(() => {
    const loadUser = () => {
      try {
        setCurrentUser(
          JSON.parse(localStorage.getItem("user") || "{}")
        );
      } catch {
        setCurrentUser({});
      }
    };

    loadUser();
    window.addEventListener("storage", loadUser);
    window.addEventListener("user-updated", loadUser);

    return () => {
      window.removeEventListener("storage", loadUser);
      window.removeEventListener("user-updated", loadUser);
    };
  }, []);

  const userRole = useMemo(
    () =>
      String(currentUser?.role || "")
        .trim()
        .toLowerCase(),
    [currentUser]
  );

  const isAdmin = useMemo(
    () => ["admin", "superadmin"].includes(userRole),
    [userRole]
  );

  const userName = useMemo(
    () =>
      currentUser?.name ||
      currentUser?.fullName ||
      currentUser?.username ||
      "User",
    [currentUser]
  );

  const userEmail = useMemo(
    () => currentUser?.email || "no-email@Blizzboard.app",
    [currentUser]
  );

  const userRoleLabel = useMemo(() => {
    if (userRole === "superadmin") return "Super Admin";
    if (userRole === "admin") return "Administrator";
    if (userRole === "manager") return "Manager";
    return "Team Member";
  }, [userRole]);

  // Settings page holds the profile too; any role granted settings.view can open it
  const canOpenSettings = useMemo(
    () => hasPermission(currentUser, "settings", "view"),
    [currentUser]
  );

  const avatarInitial = useMemo(() => {
    const value = String(userName || "").trim();
    return value ? value.charAt(0).toUpperCase() : "U";
  }, [userName]);

  // Shared pages live under /dashboard for every role (the profile is a Settings tab)
  const basePath = "/dashboard";
  const settingsPath = "/dashboard/settings";
  const profilePath = settingsPath;

  const finalNavLinks = useMemo(() => {
    let links = Array.isArray(navLinks) ? [...navLinks] : [];

    // navLinks arrive already filtered by the user's permissions (maindash.jsx)
    const hasSettings = links.some(
      (link) =>
        String(link?.label || "")
          .trim()
          .toLowerCase() === "settings"
    );

    if (!hasSettings && canOpenSettings) {
      links.push({
        label: "Settings",
        path: settingsPath,
        icon: Settings,
      });
    }

    return links;
  }, [navLinks, canOpenSettings, settingsPath]);

  // ------------------------------------------------------------
  // WORKSPACE SEARCH — pages, tasks and meetings the user can see
  //   GET /api/tasks     (already scoped to the user by the backend)
  //   GET /api/meetings  (creator / attendees / admins only)
  // Picking a task or meeting opens its page with ?search=<name>.
  // ------------------------------------------------------------

  const canSearch = (path) => finalNavLinks.some((link) => link.path === path);

  const loadSearchData = async () => {
    if (searchData.loaded || searchLoading) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSearchLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    const get = (path, allowed) =>
      allowed
        ? axios.get(`${API_URL}${path}`, { headers }).then((r) => (Array.isArray(r.data?.data) ? r.data.data : []))
        : Promise.resolve([]);

    const [tasks, meetings] = await Promise.allSettled([
      get("/api/tasks", canSearch("/dashboard/tasks")),
      get("/api/meetings", canSearch("/dashboard/mom")),
    ]);

    setSearchData({
      tasks: tasks.status === "fulfilled" ? tasks.value : [],
      meetings: meetings.status === "fulfilled" ? meetings.value : [],
      loaded: true,
    });
    setSearchLoading(false);
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const has = (...values) => values.some((v) => String(v || "").toLowerCase().includes(q));

    if (!q) {
      return finalNavLinks.slice(0, 6).map((link) => ({
        key: `page-${link.path}`, kind: "page", title: link.label, subtitle: "Page", path: link.path, icon: link.icon,
      }));
    }

    const pages = finalNavLinks
      .filter((link) => has(link.label))
      .map((link) => ({ key: `page-${link.path}`, kind: "page", title: link.label, subtitle: "Page", path: link.path, icon: link.icon }));

    // one task assigned to several people shows once
    const seenGroups = new Set();
    const tasks = searchData.tasks
      .filter((t) => has(t.name, t.referenceId, t.description, t.assignedUser, t.department))
      .filter((t) => {
        if (!t.taskGroupId) return true;
        if (seenGroups.has(t.taskGroupId)) return false;
        seenGroups.add(t.taskGroupId);
        return true;
      })
      .slice(0, 6)
      .map((t) => ({
        key: `task-${t.id}`,
        kind: "task",
        title: t.name || "Untitled task",
        subtitle: [t.status, t.dueDate && `Due ${t.dueDate}`, t.assignedUser].filter(Boolean).join(" · "),
        path: "/dashboard/tasks",
        query: t.name,
        icon: CheckSquare,
      }));

    const meetings = searchData.meetings
      .filter((m) => has(m.title, m.agenda, m.description, m.location))
      .slice(0, 5)
      .map((m) => ({
        key: `meeting-${m._id}`,
        kind: "meeting",
        title: m.title || "Untitled meeting",
        subtitle: [m.meetingDate && new Date(m.meetingDate).toLocaleDateString(), m.status].filter(Boolean).join(" · ") || "Meeting",
        path: "/dashboard/mom",
        query: m.title,
        icon: ClipboardList,
      }));

    return [...pages, ...tasks, ...meetings];
  }, [searchQuery, searchData, finalNavLinks]);

  useEffect(() => setActiveResult(0), [searchQuery]);

  const openSearch = () => {
    setProfileOpen(false);
    setSearchOpen(true);
    loadSearchData();
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const openResult = (result) => {
    if (!result) return;
    closeSearch();

    if (!result.query) {
      navigateTo(result.path);
      return;
    }

    navigateTo(`${result.path}?search=${encodeURIComponent(result.query)}`);
    // the page may already be open → tell it to apply the search
    window.dispatchEvent(new CustomEvent("workspace-search", { detail: { path: result.path, query: result.query } }));
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      openResult(searchResults[activeResult]);
    }
  };

  // Ctrl / ⌘ + K opens the search
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  });

  // fresh tasks / meetings next time the search opens
  useEffect(() => {
    const stale = () => setSearchData((d) => ({ ...d, loaded: false }));
    window.addEventListener("realtime:notification", stale);
    return () => window.removeEventListener("realtime:notification", stale);
  }, []);

  // ------------------------------------------------------------
  // CHAT UNREAD COUNT + LIVE SOCKET.IO NOTIFICATIONS
  // Backend events:
  //   chat:message:new
  //   chat:unread:update
  // Backend endpoint:
  //   GET /api/chat/conversations
  // ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let socket;

    const token = localStorage.getItem("token");

    unreadCountsRef.current.clear();
    setUnreadChatCount(0);

    if (!token) return undefined;

    const updateTotal = () => {
      const total = [...unreadCountsRef.current.values()].reduce(
        (sum, count) => sum + count,
        0
      );

      setUnreadChatCount(total);
    };

    const loadUnreadCounts = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/api/chat/conversations`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (cancelled) return;

        const conversations = Array.isArray(
          response.data?.conversations
        )
          ? response.data.conversations
          : [];

        const nextCounts = new Map();

        conversations.forEach((conversation) => {
          const id = String(conversation?._id || "");
          const count = Math.max(
            0,
            Number(conversation?.unreadCount) || 0
          );

          if (id && count > 0) {
            nextCounts.set(id, count);
          }
        });

        // Replace the snapshot with the latest server counts.
        unreadCountsRef.current = nextCounts;
        updateTotal();
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Unable to load chat unread count:",
            error.response?.data?.message || error.message
          );
        }
      }
    };

    // Shared per-tab connection (also used by the notification bell)
    socket = getSocket();
    if (!socket) return undefined;

    const handleUnreadUpdate = (payload) => {
      if (!payload?.conversationId || cancelled) return;

      const conversationId = String(payload.conversationId);
      const count = Math.max(
        0,
        Number(payload.unreadCount) || 0
      );

      if (count > 0) {
        unreadCountsRef.current.set(conversationId, count);
      } else {
        unreadCountsRef.current.delete(conversationId);
      }

      updateTotal();
    };

    // Refresh the server snapshot when a new message arrives.
    const handleNewMessage = () => {
      loadUnreadCounts();
    };

    const handleReconnect = () => {
      loadUnreadCounts();
    };

    socket.on("chat:unread:update", handleUnreadUpdate);
    socket.on("chat:message:new", handleNewMessage);
    socket.on("connect", handleReconnect);

    loadUnreadCounts();

    return () => {
      cancelled = true;

      if (socket) {
        socket.off("chat:unread:update", handleUnreadUpdate);
        socket.off("chat:message:new", handleNewMessage);
        socket.off("connect", handleReconnect);
      }
    };
  }, []);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }

      if (
        searchRef.current &&
        !searchRef.current.contains(event.target)
      ) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setSearchOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () =>
      document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!isCompact && menuOpen && typeof setMenuOpen === "function") {
      setMenuOpen(false);
    }
  }, [isCompact, menuOpen, setMenuOpen]);

  const navigateTo = (path) => {
    setProfileOpen(false);
    setSearchOpen(false);

    if (typeof handleNavClick === "function") {
      handleNavClick(path);
    }
  };

  const handleProfileToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setSearchOpen(false);
    setProfileOpen((previous) => !previous);
  };

  const handleLogout = () => {
    setProfileOpen(false);
    setSearchOpen(false);

    if (typeof setMenuOpen === "function") {
      setMenuOpen(false);
    }

    trackLogout(); // Activity page: "Logged out"
    unsubscribePushOnLogout(); // this browser stops getting this user's pushes
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    sessionStorage.clear();

    window.location.replace("/login");
  };

  const handleSearchToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (searchOpen) closeSearch();
    else openSearch();
  };

  const handleMenuToggle = () => {
    if (typeof setMenuOpen !== "function") return;

    setProfileOpen(false);
    setSearchOpen(false);
    setMenuOpen((previous) => !previous);
  };

  const isNavActive = (link) => {
    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname
        : "";

    return (
      activeLink === link.label ||
      currentPath === link.path
    );
  };

  // Reusable badge for desktop and mobile
  const renderChatBadge = (link) => {
    const isChat =
      String(link?.label || "").trim().toLowerCase() === "chat";

    if (!isChat || unreadChatCount <= 0) return null;

    return (
      <span
        className="chat-unread-badge"
        aria-label={`${unreadChatCount} unread messages`}
        title={`${unreadChatCount} unread messages`}
      >
        {unreadChatCount > 99 ? "99+" : unreadChatCount}
      </span>
    );
  };

  return (
    <>
      <header className="dashboard-header">
        <div className="header-top">
          <div className="header-left">
            {isCompact && (
              <button
                type="button"
                className="mobile-menu-button"
                onClick={handleMenuToggle}
                aria-label="Toggle navigation"
                aria-expanded={menuOpen}
              >
                {menuOpen ? (
                  <X size={20} strokeWidth={2.2} />
                ) : (
                  <Menu size={20} strokeWidth={2.2} />
                )}
              </button>
            )}

            <div
              className="brand-wrapper"
              onClick={() => navigateTo(basePath)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigateTo(basePath);
              }}
            >
              <div className="brand-logo">
                <div className="brand-logo-shine" />
                <div className="brand-logo-ring" />
                <Sparkles size={21} strokeWidth={2.3} />
              </div>

              <div className="brand-text">
                <div className="brand-title">
                  Blizz <span>Board</span>
                </div>
                <div className="brand-subtitle">
                  TASK MANAGEMENT
                </div>
              </div>
            </div>
          </div>

          <div className="header-right">
            {!effectiveMobile && (
              <div
                className={`search-wrapper ${
                  searchOpen ? "search-is-open" : ""
                }`}
                ref={searchRef}
              >
                {searchOpen && (
                  <div className="search-panel">
                    <div className="search-input-wrapper">
                      <Search size={15} strokeWidth={2} />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search pages, tasks, meetings..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        aria-label="Search workspace"
                        aria-controls="workspace-search-results"
                      />
                      {searchLoading ? (
                        <Loader2 size={14} className="search-spin" />
                      ) : (
                        <span className="search-shortcut">
                          <Command size={10} /> 
                        </span>
                      )}
                    </div>

                    <div className="search-results" id="workspace-search-results" role="listbox">
                      {!searchQuery.trim() && <div className="search-group-label">Go to</div>}
                      {searchResults.length === 0 ? (
                        <div className="search-empty">
                          {searchLoading ? "Searching..." : `No results for “${searchQuery.trim()}”`}
                        </div>
                      ) : (
                        searchResults.map((result, index) => {
                          const Icon = result.icon || Search;
                          return (
                            <button
                              type="button"
                              key={result.key}
                              role="option"
                              aria-selected={index === activeResult}
                              className={`search-result ${index === activeResult ? "is-active" : ""}`}
                              onMouseEnter={() => setActiveResult(index)}
                              onClick={() => openResult(result)}
                            >
                              <span className={`search-result-icon kind-${result.kind}`}>
                                <Icon size={14} />
                              </span>
                              <span className="search-result-text">
                                <span className="search-result-title">{result.title}</span>
                                <span className="search-result-sub">{result.subtitle}</span>
                              </span>
                              {index === activeResult && <CornerDownLeft size={13} className="search-enter" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="header-action search-button"
                  aria-label="Search"
                  aria-expanded={searchOpen}
                  onClick={handleSearchToggle}
                >
                  {searchOpen ? <X size={17} /> : <Search size={17} />}
                </button>
              </div>
            )}

            {/* Install as an app (shown only when the browser offers it) */}
            <InstallAppButton />

            {/* Telegram alerts on / off, connect or disconnect the bot */}
            <TelegramToggle />

            {/* Real-time notifications (task assigned, status, reminders, tickets, chat) */}
            <NotificationBell />

            <div className="profile-wrapper" ref={profileRef}>
              <button
                type="button"
                className={`profile-button ${
                  profileOpen ? "profile-button-active" : ""
                }`}
                onClick={handleProfileToggle}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <div className="profile-avatar">
                  <span>{avatarInitial}</span>
                  <i />
                </div>

                {!isCompact && (
                  <div className="profile-info">
                    <span className="profile-name">{userName}</span>
                    <span className="profile-role">{userRoleLabel}</span>
                  </div>
                )}

                {!isCompact && (
                  <ChevronDown
                    size={14}
                    className={
                      profileOpen
                        ? "profile-chevron profile-chevron-open"
                        : "profile-chevron"
                    }
                  />
                )}
              </button>

              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="dropdown-wave" />

                  <div className="profile-dropdown-header">
                    <div className="profile-avatar large">
                      {avatarInitial}
                    </div>
                    <div className="dropdown-user-info">
                      <div className="dropdown-name">{userName}</div>
                      <div className="dropdown-email">{userEmail}</div>
                    </div>
                  </div>

                  <div className="profile-role-badge">
                    {userRoleLabel}
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => navigateTo(profilePath)}
                    role="menuitem"
                  >
                    <span className="dropdown-item-icon">
                      <UserRound size={15} />
                    </span>
                    <span>Profile</span>
                  </button>

                  {canOpenSettings && (
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => navigateTo(settingsPath)}
                      role="menuitem"
                    >
                      <span className="dropdown-item-icon">
                        <Settings size={15} />
                      </span>
                      <span>Settings</span>
                    </button>
                  )}

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="dropdown-item logout-item"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <span className="dropdown-item-icon">
                      <LogOut size={15} />
                    </span>
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isCompact && (
          <div className="navigation-area">
            <div className="nav-water-glow nav-water-glow-left" />
            <div className="nav-water-glow nav-water-glow-center" />
            <div className="nav-water-glow nav-water-glow-right" />

            <div className="nav-bubbles">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} />
              ))}
            </div>

            <nav
              className="desktop-navigation"
              aria-label="Main navigation"
            >
              <div className="nav-shimmer" />
              <div className="nav-orbit nav-orbit-one" />
              <div className="nav-orbit nav-orbit-two" />

              {finalNavLinks.map((link, index) => {
                const active = isNavActive(link);
                const Icon = link.icon;

                return (
                  <button
                    key={`${link.path}-${link.label}`}
                    type="button"
                    className={`nav-item ${
                      active ? "nav-item-active" : ""
                    }`}
                    style={{ "--nav-index": index }}
                    title={link.label}
                    onClick={() => navigateTo(link.path)}
                  >
                    <span className="nav-active-water" />

                    <span className="nav-icon-box">
                      {Icon && <Icon size={19} strokeWidth={2} />}
                    </span>

                    <span className="nav-label">{link.label}</span>

                    {renderChatBadge(link)}

                    {active && <span className="nav-live-dot" />}
                  </button>
                );
              })}
            </nav>

            <div className="nav-wave">
              <svg
                viewBox="0 0 1440 54"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  className="wave-back"
                  d="M0,26 C180,2 290,52 460,27 S760,4 930,27 S1210,52 1440,23"
                />
                <path
                  className="wave-front"
                  d="M0,30 C180,8 300,56 470,29 S760,7 930,30 S1220,55 1440,27"
                />
              </svg>
            </div>
          </div>
        )}

        {isCompact && menuOpen && (
          <div className="mobile-menu">
            <div className="mobile-menu-inner">
              <div className="mobile-menu-heading">
                <span>Workspace</span>
                <small>Navigation</small>
              </div>

              <nav className="mobile-navigation">
                {finalNavLinks.map((link, index) => {
                  const active = isNavActive(link);
                  const Icon = link.icon;

                  return (
                    <button
                      key={`${link.path}-${link.label}`}
                      type="button"
                      className={`mobile-nav-item ${
                        active ? "mobile-nav-active" : ""
                      }`}
                      style={{ "--mobile-index": index }}
                      onClick={() => {
                        navigateTo(link.path);
                        if (typeof setMenuOpen === "function") {
                          setMenuOpen(false);
                        }
                      }}
                    >
                      <span className="mobile-nav-wave" />

                      <span className="mobile-icon-box">
                        {Icon && <Icon size={17} strokeWidth={2} />}
                      </span>

                      <span className="mobile-nav-label">
                        {link.label}
                      </span>

                      {renderChatBadge(link)}

                      {active && (
                        <span className="mobile-active-indicator">
                          <i />
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}
      </header>

      <style>{`
        html, body {
          max-width: 100%;
          overflow-x: hidden;
        }

        * { box-sizing: border-box; }

        .dashboard-header {
          position: sticky;
          top: 0;
          z-index: 5000;
          width: 100%;
          max-width: 100%;
          overflow: visible;
          background: #dff7f8;
          border-bottom: 1px solid rgba(30,109,126,.13);
          box-shadow: 0 7px 28px rgba(24,99,115,.09);
        }

        .header-top {
          position: relative;
          z-index: 5001;
          min-height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 28px;
          overflow: visible;
          background:
            radial-gradient(circle at 5% 45%, rgba(33,185,215,.24), transparent 24%),
            radial-gradient(circle at 24% 110%, rgba(23,151,194,.12), transparent 30%),
            linear-gradient(100deg,#d9f4f6,#e9f9f8);
          border-bottom: 1px solid rgba(34,124,142,.10);
        }

        .header-left, .brand-wrapper, .header-right {
          display: flex;
          align-items: center;
        }

        .brand-wrapper {
          gap: 11px;
          cursor: pointer;
          user-select: none;
          min-width: 0;
        }

        .brand-logo {
          position: relative;
          flex-shrink: 0;
          width: 43px;
          height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(135deg,#076f8f,#159fc0,#4ccbd5);
          box-shadow: 0 8px 20px rgba(28,139,163,.23);
          animation: logoFloat 4s ease-in-out infinite;
        }

        .brand-logo-shine {
          position: absolute;
          width: 65px;
          height: 65px;
          border-radius: 50%;
          background: rgba(125,231,245,.65);
          opacity: .23;
          filter: blur(18px);
        }

        .brand-logo-ring {
          position: absolute;
          inset: 5px;
          border: 1px solid rgba(255,255,255,.35);
          border-radius: 10px;
        }

        .brand-logo svg { position: relative; z-index: 2; }

        .brand-text { display: flex; flex-direction: column; }
        .brand-title {
          color: #15535d;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -.6px;
          line-height: 1;
          white-space: nowrap;
        }

        .brand-title span { color: #0785a7; }

        .brand-subtitle {
          margin-top: 5px;
          color: #6b9299;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1.8px;
        }

        .header-right {
          position: relative;
          z-index: 6000;
          gap: 8px;
          flex-shrink: 0;
        }

        .header-action {
          position: relative;
          width: 39px;
          height: 39px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(48,131,148,.16);
          border-radius: 11px;
          background: rgba(255,255,255,.72);
          color: #397985;
          cursor: pointer;
          transition: all .25s ease;
        }

        .header-action:hover {
          color: #087b98;
          background: #fff;
          transform: translateY(-2px);
          box-shadow: 0 8px 18px rgba(35,109,124,.10);
        }

        .notification-button { position: relative; }
        .notification-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 7px;
          height: 7px;
          z-index: 3;
          border-radius: 50%;
          background: #159fc0;
          border: 2px solid #e2f5f6;
        }

        .notification-pulse {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 11px;
          height: 11px;
          border: 1px solid rgba(21,159,192,.45);
          border-radius: 50%;
          animation: notificationPulse 2s ease-out infinite;
        }

        .search-wrapper { position: relative; z-index: 7000; }
        .search-panel {
          position: absolute;
          right: 0;
          top: 48px;
          width: min(380px, calc(100vw - 32px));
          border: 1px solid rgba(44,131,150,.18);
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 18px 40px rgba(33,108,122,.16);
          z-index: 9000;
          overflow: hidden;
          animation: searchDrop .2s ease-out;
        }
        .search-input-wrapper {
          height: 46px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 12px;
          border-bottom: 1px solid #EEF5F6;
        }
        .search-results { max-height: 360px; overflow-y: auto; padding: 6px; }
        .search-group-label { padding: 6px 8px 4px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #8aa1ad; }
        .search-empty { padding: 18px 10px; text-align: center; font-size: 12px; color: #6E8799; }
        .search-result {
          width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px; border: 0; border-radius: 9px;
          background: transparent; cursor: pointer; text-align: left;
        }
        .search-result.is-active { background: #EEF8F9; }
        .search-result-icon {
          width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          background: #E8F7F8; color: #0b8f87;
        }
        .search-result-icon.kind-task { background: #EEF2FF; color: #4f46e5; }
        .search-result-icon.kind-meeting { background: #FFF5E6; color: #b45309; }
        .search-result-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .search-result-title { font-size: 12.5px; font-weight: 700; color: #123B5D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .search-result-sub { font-size: 11px; color: #6E8799; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .search-enter { color: #8aa1ad; flex-shrink: 0; }
        .search-spin { color: #63929d; flex-shrink: 0; animation: searchSpin 1s linear infinite; }
        @keyframes searchSpin { to { transform: rotate(360deg); } }

        .search-input-wrapper svg { color: #63929d; flex-shrink: 0; }
        .search-input-wrapper input {
          width: 100%;
          min-width: 0;
          outline: none;
          border: 0;
          background: transparent;
          color: #225965;
          font-size: 12px;
        }

        .search-shortcut {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 4px 6px;
          border-radius: 6px;
          background: #eef8f9;
          color: #6b9199;
          font-size: 9px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .profile-wrapper {
          position: relative;
          z-index: 8000;
          isolation: isolate;
        }

        .profile-button {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 3px 9px 3px 4px;
          border: 1px solid rgba(48,131,148,.16);
          border-radius: 12px;
          background: rgba(255,255,255,.72);
          cursor: pointer;
          transition: all .25s ease;
        }

        .profile-button:hover, .profile-button-active {
          background: #fff;
          border-color: rgba(29,145,171,.28);
          box-shadow: 0 7px 18px rgba(35,109,124,.09);
        }

        .profile-avatar {
          position: relative;
          width: 33px;
          height: 33px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 10px;
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          background: linear-gradient(135deg,#087fa0,#269fc0,#55cbd6);
        }

        .profile-avatar.large { width: 43px; height: 43px; border-radius: 12px; }
        .profile-info { display: flex; flex-direction: column; align-items: flex-start; }
        .profile-name { color: #255c66; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .profile-role { margin-top: 2px; color: #789ba2; font-size: 9px; }
        .profile-chevron { color: #71949b; transition: transform .25s ease; }
        .profile-chevron-open { transform: rotate(180deg); }

        .profile-dropdown {
          position: absolute;
          top: calc(100% + 9px);
          right: 0;
          z-index: 99999;
          width: min(245px, calc(100vw - 24px));
          padding: 10px;
          overflow: hidden;
          border: 1px solid rgba(49,130,147,.18);
          border-radius: 15px;
          background: #fff;
          box-shadow: 0 22px 50px rgba(33,108,122,.18);
          animation: profileDropIn .18s ease-out;
        }

        .dropdown-wave {
          position: absolute;
          left: -10%;
          top: -24px;
          width: 120%;
          height: 55px;
          border-radius: 50%;
          background: rgba(35,184,205,.12);
        }

        .profile-dropdown-header {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
        }

        .dropdown-user-info { min-width: 0; }
        .dropdown-name { color: #255b65; font-size: 13px; font-weight: 800; }
        .dropdown-email {
          margin-top: 3px;
          color: #7b9ba2;
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 160px;
        }

        .profile-role-badge {
          display: inline-flex;
          margin: 2px 8px 7px;
          padding: 5px 8px;
          border-radius: 999px;
          background: #e8f7f8;
          color: #087c98;
          font-size: 9px;
          font-weight: 800;
        }

        .dropdown-divider { height: 1px; margin: 7px 0; background: rgba(53,129,145,.11); }

        .dropdown-item {
          width: 100%;
          min-height: 39px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 9px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #517981;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all .18s ease;
        }

        .dropdown-item:hover { background: #edf8f9; color: #087c98; }
        .dropdown-item-icon {
          width: 29px;
          height: 29px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #f0f8f9;
          color: #3f8290;
          flex-shrink: 0;
        }

        /* Desktop ocean navigation */
        .navigation-area {
          position: relative;
          z-index: 100;
          width: 100%;
          min-height: 92px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 20px 17px;
          overflow: hidden;
          background:
            radial-gradient(circle at 8% 50%,rgba(31,178,205,.16),transparent 25%),
            radial-gradient(circle at 93% 50%,rgba(30,169,197,.13),transparent 25%),
            linear-gradient(90deg,#d7f2f4,#e0f6f7,#e7f8f7);
        }

        .nav-water-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(45px);
          pointer-events: none;
        }

        .nav-water-glow-left {
          left: -100px; top: -70px; width: 390px; height: 160px;
          background: rgba(30,174,202,.13);
          animation: glowDriftLeft 8s ease-in-out infinite;
        }

        .nav-water-glow-center {
          left: 40%; top: -100px; width: 440px; height: 150px;
          background: rgba(73,190,205,.09);
          animation: glowDriftCenter 10s ease-in-out infinite;
        }

        .nav-water-glow-right {
          right: -100px; top: -70px; width: 380px; height: 160px;
          background: rgba(42,174,194,.11);
          animation: glowDriftRight 9s ease-in-out infinite;
        }

        .nav-bubbles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .nav-bubbles span {
          position: absolute; bottom: -12px; width: 5px; height: 5px;
          border: 1px solid rgba(29,157,180,.22); border-radius: 50%;
          animation: bubbleRise 7s linear infinite;
        }

        .nav-bubbles span:nth-child(1) { left: 13%; }
        .nav-bubbles span:nth-child(2) { left: 28%; animation-delay: 2s; }
        .nav-bubbles span:nth-child(3) { left: 49%; animation-delay: 4s; }
        .nav-bubbles span:nth-child(4) { left: 65%; animation-delay: 1s; }
        .nav-bubbles span:nth-child(5) { left: 81%; animation-delay: 3s; }
        .nav-bubbles span:nth-child(6) { left: 91%; animation-delay: 5s; }

        .desktop-navigation {
          position: relative;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: min(96vw,1640px);
          max-width: 100%;
          min-width: 0;
          min-height: 64px;
          padding: 6px 10px;
          gap: 2px;
          border-radius: 999px;
          background: linear-gradient(110deg,#102f49,#143653 42%,#102f49);
          border: 1px solid rgba(133,215,230,.13);
          box-shadow: 0 12px 28px rgba(20,54,83,.20);
          overflow: hidden;
        }

        .nav-shimmer {
          position: absolute; top: 0; bottom: 0; left: -25%; width: 22%;
          background: linear-gradient(90deg,transparent,rgba(105,222,232,.12),transparent);
          transform: skewX(-18deg);
          animation: navShimmer 6s ease-in-out infinite;
          pointer-events: none;
        }

        .nav-orbit { position: absolute; border: 1px solid rgba(104,210,224,.07); border-radius: 50%; pointer-events: none; }
        .nav-orbit-one { width: 180px; height: 180px; right: 9%; top: -145px; animation: orbitSpin 13s linear infinite; }
        .nav-orbit-two { width: 120px; height: 120px; left: 15%; bottom: -105px; animation: orbitSpinReverse 10s linear infinite; }

        .nav-item {
          position: relative;
          z-index: 3;
          height: 50px;
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px; /* icon beside the label */
          padding: 0 10px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #a9c0d0;
          font-size: 13px;
          font-weight: 750;
          white-space: nowrap;
          cursor: pointer;
          transition: color .25s ease, transform .25s ease, background .25s ease;
          animation: navItemEnter .55s cubic-bezier(.2,.8,.2,1) both;
          animation-delay: calc(var(--nav-index) * 55ms);
        }

        .nav-item:hover { color: #fff; transform: translateY(-2px); }
        .nav-item-active {
          color: #fff !important;
          background: linear-gradient(135deg,rgba(42,111,151,.72),rgba(29,80,117,.88));
          border: 1px solid rgba(126,219,230,.22);
          box-shadow: 0 6px 16px rgba(7,34,55,.28);
        }

        .nav-active-water {
          position: absolute; left: 9%; right: 9%; bottom: 2px; height: 3px;
          overflow: hidden; border-radius: 999px;
          background: linear-gradient(90deg,transparent,#68d8e4,transparent);
          opacity: 0;
        }

        .nav-item-active .nav-active-water { opacity: 1; }

        .nav-icon-box {
          width: 28px; height: 28px; display: flex;
          align-items: center; justify-content: center; flex-shrink: 0;
          border-radius: 9px; background: rgba(255,255,255,.065);
          color: #8faec2; transition: all .25s ease;
        }

        .nav-item:hover .nav-icon-box { color: #e0fbfd; background: rgba(89,204,219,.12); }
        .nav-item-active .nav-icon-box { color: #fff; background: rgba(107,209,223,.15); }
        .nav-label { line-height: 1; font-size: 12.5px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; }

        .nav-live-dot {
          width: 5px; height: 5px; flex-shrink: 0;
          border-radius: 50%; background: #73dbe5;
          box-shadow: 0 0 0 3px rgba(115,219,229,.08),0 0 12px rgba(115,219,229,.55);
          animation: liveDot 1.8s ease-in-out infinite;
        }

        /* Unread message badge */
        .chat-unread-badge {
          position: relative;
          z-index: 5;
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          background: linear-gradient(135deg,#ff6683,#e11d48);
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 0 12px rgba(255,92,122,.35);
          animation: chatBadgePop .28s ease-out;
        }

        .nav-wave { position: absolute; left: 0; right: 0; bottom: -1px; height: 31px; z-index: 4; pointer-events: none; opacity: .72; }
        .nav-wave svg { width: 100%; height: 100%; display: block; }
        .wave-back, .wave-front { fill: none; stroke-linecap: round; vector-effect: non-scaling-stroke; }
        .wave-back { stroke: rgba(71,193,210,.18); stroke-width: 1.5; stroke-dasharray: 10 12; animation: waveMove 5s linear infinite; }
        .wave-front { stroke: rgba(87,207,220,.30); stroke-width: 1; stroke-dasharray: 5 10; animation: waveMoveReverse 4s linear infinite; }

        /* Mobile and tablet */
        .mobile-menu-button {
          flex-shrink: 0; width: 38px; height: 38px; margin-right: 8px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(48,131,148,.18); border-radius: 11px;
          background: rgba(255,255,255,.75); color: #397985; cursor: pointer;
        }

        .mobile-menu { position: fixed; top: 68px; left: 0; right: 0; z-index: 4900; max-height: calc(100vh - 68px); overflow-y: auto; padding: 10px; background: rgba(218,246,247,.96); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(54,128,145,.15); box-shadow: 0 18px 40px rgba(33,108,122,.14); animation: mobileMenuIn .25s ease-out; }
        .mobile-menu-inner { padding: 10px; border: 1px solid rgba(47,130,147,.17); border-radius: 17px; background: rgba(255,255,255,.91); }
        .mobile-menu-heading { display: flex; align-items: baseline; justify-content: space-between; padding: 5px 8px 12px; }
        .mobile-menu-heading span { color: #245e68; font-size: 13px; font-weight: 900; }
        .mobile-menu-heading small { color: #7ca0a7; font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; }

        .mobile-navigation { display: flex; flex-direction: column; gap: 5px; }

        .mobile-nav-item {
          position: relative; width: 100%; min-height: 47px;
          display: flex; align-items: center; gap: 10px;
          padding: 6px 10px; overflow: hidden; border: 0;
          border-radius: 13px; background: transparent; color: #4d7b83;
          font-size: 13px; font-weight: 700; text-align: left; cursor: pointer;
          animation: mobileItemIn .38s cubic-bezier(.2,.8,.2,1) both;
          animation-delay: calc(var(--mobile-index) * 55ms);
        }

        .mobile-nav-item:hover { color: #087c98; background: #edf8f9; }
        .mobile-nav-active { color: #fff !important; background: linear-gradient(100deg,#143653,#1d587d); box-shadow: 0 7px 17px rgba(20,54,83,.14); }
        .mobile-nav-wave { position: absolute; right: -35px; bottom: -17px; width: 120px; height: 45px; border-top: 1px solid rgba(86,210,221,.18); border-radius: 50%; opacity: 0; }
        .mobile-nav-active .mobile-nav-wave { opacity: 1; animation: mobileWave 3s ease-in-out infinite; }
        .mobile-icon-box { flex-shrink: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(66,140,157,.11); color: #4f8792; }
        .mobile-nav-active .mobile-icon-box { color: #fff; background: rgba(255,255,255,.11); }
        .mobile-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .mobile-active-indicator { position: relative; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
        .mobile-active-indicator::before { content: ""; position: absolute; inset: 0; border: 1px solid rgba(107,209,223,.32); border-radius: 50%; animation: mobileDotRing 1.7s ease-in-out infinite; }
        .mobile-active-indicator i { width: 5px; height: 5px; border-radius: 50%; background: #6bd1df; box-shadow: 0 0 10px rgba(107,209,223,.75); }

        @keyframes logoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes notificationPulse { 0% { transform: scale(.6); opacity: .8; } 70%,100% { transform: scale(1.7); opacity: 0; } }
        @keyframes searchDrop { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes profileDropIn { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes glowDriftLeft { 0%,100% { transform: translateX(0); } 50% { transform: translateX(55px); } }
        @keyframes glowDriftCenter { 0%,100% { transform: translateX(-25px); } 50% { transform: translateX(30px); } }
        @keyframes glowDriftRight { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-50px); } }
        @keyframes bubbleRise { 0% { transform: translateY(15px); opacity: 0; } 15% { opacity: .8; } 100% { transform: translateY(-105px) translateX(15px); opacity: 0; } }
        @keyframes navShimmer { 0% { left: -25%; opacity: 0; } 12% { opacity: 1; } 48% { left: 105%; opacity: .7; } 100% { left: 105%; opacity: 0; } }
        @keyframes orbitSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes orbitSpinReverse { from { transform: rotate(360deg); } to { transform: rotate(0); } }
        @keyframes navItemEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes activeWater { from { left: -40%; } to { left: 120%; } }
        @keyframes liveDot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.35); } }
        @keyframes waveMove { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -120; } }
        @keyframes waveMoveReverse { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 100; } }
        @keyframes mobileMenuIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mobileItemIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes mobileWave { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-16px); } }
        @keyframes mobileDotRing { 0%,100% { transform: scale(.75); opacity: .35; } 50% { transform: scale(1.15); opacity: .9; } }
        @keyframes chatBadgePop { 0% { transform: scale(.65); opacity: 0; } 75% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }

        @media (min-width: 1101px) and (max-width: 1350px) {
          .header-top { padding: 8px 18px; }
          .profile-info, .profile-chevron { display: none; }
          .profile-button { padding: 3px; }
          .brand-title { font-size: 19px; }
          .desktop-navigation { width: calc(100vw - 32px); padding: 6px; }
          .nav-item { padding: 0 6px; gap: 5px; }
          .nav-icon-box { width: 24px; height: 24px; }
          .nav-label { font-size: 11px; }
        }

        @media (min-width: 1101px) and (max-width: 1240px) {
          .nav-label { display: none; }
          .nav-item { flex: 0 1 auto; padding: 0 13px; }
          .nav-live-dot { display: none; }
        }

        @media (min-width: 768px) and (max-width: 1100px) {
          .header-top { padding: 8px 18px; }
          .profile-info, .profile-chevron { display: none; }
          .profile-button { padding: 3px; }
          .brand-title { font-size: 19px; }
        }

        @media (max-width: 767px) {
          .header-top { min-height: 64px; padding: 8px 12px; }
          .brand-logo { width: 40px; height: 40px; }
          .brand-title { font-size: 18px; }
          .brand-subtitle { font-size: 7px; }
          .mobile-menu { top: 64px; max-height: calc(100vh - 64px); }
          .profile-info, .profile-chevron { display: none; }
          .profile-button { padding: 3px; }
          .search-panel { position: fixed; top: 62px; left: 12px; right: 12px; width: auto; }
        }

        @media (max-width: 430px) {
          .header-top { padding: 8px 9px; }
          .brand-text, .search-wrapper, .notification-button { display: none; }
          .header-right { gap: 5px; }
          .header-action { width: 36px; height: 36px; }
          .mobile-menu-button { width: 36px; height: 36px; margin-right: 6px; }
          .profile-dropdown { position: fixed; top: 62px; left: 10px; right: 10px; width: auto; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  );
};

export default DashHeader;
