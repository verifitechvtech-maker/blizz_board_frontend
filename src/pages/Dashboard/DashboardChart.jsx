import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  EmojiPicker,
  AttachButton,
  PendingFiles,
  MessageAttachments,
  GroupCreator,
  GroupMembersPanel,
  validateChatFiles,
} from "./ChatExtras";
import {
  Search,
  MessageCircle,
  Users,
  UserPlus,
  MoreHorizontal,
  Send,
  Check,
  CheckCheck,
  ArrowLeft,
  Plus,
  Bell,
  ShieldCheck,
  X,
  RefreshCw,
  AlertCircle,
  Volume2,
  VolumeX,
  ChevronDown,
  Building2,
  MessageSquare,
  Timer,
} from "lucide-react";
import { API_URL as ENV_API_URL, SOCKET_URL as ENV_SOCKET_URL } from "../../config/env";

const API_URL = ENV_API_URL;
const SOCKET_URL = ENV_SOCKET_URL;

// Chat permissions (enforced by the API as well)
const chatCan = (action) => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "null");
    return u?.role === "SuperAdmin" || Boolean(u?.permissions?.chat?.includes(action));
  } catch {
    return false;
  }
};

const getStoredUser = () => {
  for (const key of ["currentUser", "user"]) {
    try {
      const value = localStorage.getItem(key);
      if (value) return JSON.parse(value);
    } catch {
      // Ignore invalid stored data.
    }
  }
  return null;
};

const getAuthToken = () => {
  const stored = getStoredUser();
  const user = stored?.user || stored;

  return (
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    stored?.token ||
    stored?.accessToken ||
    user?.token ||
    user?.accessToken ||
    ""
  );
};

const getId = (value) => {
  if (value == null || value === "") return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    return String(
      value._id ??
        value.id ??
        value.userId ??
        value.senderId ??
        value.conversationId ??
        value.departmentId ??
        value.$oid ??
        ""
    );
  }

  return "";
};

const getCurrentUserId = () => {
  const stored = getStoredUser();
  const user = stored?.user || stored;

  return getId(user?._id ?? user?.id ?? user?.userId ?? user?.user_id);
};

const API = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

API.interceptors.request.use(
  (config) => {
    const token = getAuthToken();

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const getArray = (response, key) => {
  const data = response?.data;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.[key])) return data.data[key];
  if (Array.isArray(data?.data?.data)) return data.data.data;

  return [];
};

const getName = (user) => {
  if (!user) return "Unknown user";
  if (typeof user === "string") return user;

  return (
    user.name ||
    user.fullName ||
    user.username ||
    user.email ||
    "Unknown user"
  );
};

const getDepartmentName = (user) => {
  const department = user?.department || user?.assignedDepartment;

  if (typeof department === "string") return department;

  return department?.name || department?.departmentName || "";
};

const getRoleName = (user) => {
  if (typeof user?.role === "string") return user.role;

  return user?.role?.name || user?.role?.title || "";
};

const getInitial = (name) =>
  String(name || "?").trim().charAt(0).toUpperCase() || "?";

const getTime = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getErrorMessage = (error) => {
  const status = error?.response?.status;
  const message = error?.response?.data?.message;

  if (status === 401) {
    return message || "Session expired. Please log in again.";
  }

  if (status === 403) {
    return message || "You do not have permission to access this chat.";
  }

  if (status === 404) {
    return message || "Chat API endpoint was not found.";
  }

  if (status === 500) {
    return message || "Server error. Check your backend terminal.";
  }

  if (!error?.response) {
    return "Cannot connect to the backend on port 5000.";
  }

  return message || error.message || "Something went wrong.";
};

const normalizeIncomingMessage = (payload = {}) => {
  const message =
    payload?.message ||
    payload?.data?.message ||
    payload?.data?.data?.message ||
    payload?.data ||
    payload;

  if (!message || typeof message !== "object") {
    return { conversationId: "", message: null };
  }

  const conversationId = getId(
    payload?.conversationId ??
      payload?.conversation?._id ??
      payload?.conversation ??
      message?.conversationId ??
      message?.conversation?._id ??
      message?.conversation
  );

  return { conversationId, message };
};

const getMessageSenderId = (message) =>
  getId(
    message?.sender ??
      message?.senderId ??
      message?.userId ??
      message?.createdBy ??
      message?.author ??
      message?.user
  );

// Read receipt on my own messages:
// grey ✓ = sent, light ✓✓ = seen by some group members, blue ✓✓ = seen
const SeenTick = ({ message, chat, meId }) => {
  const others = (chat?.participants || []).filter((p) => getId(p) !== meId);
  const readers = (message.readBy || []).map(getId).filter((id) => id && id !== meId);

  if (!readers.length) {
    return (
      <span className="seen-tick" title="Sent" aria-label="Sent">
        <Check size={12} />
      </span>
    );
  }

  const everyone = !others.length || others.every((p) => readers.includes(getId(p)));
  const names = others
    .filter((p) => readers.includes(getId(p)))
    .map(getName)
    .filter(Boolean);
  const label =
    chat?.type === "private" || !names.length
      ? "Seen"
      : everyone
        ? "Seen by everyone"
        : `Seen by ${names.join(", ")}`;

  return (
    <span className={`seen-tick ${everyone ? "seen" : "partial"}`} title={label} aria-label={label}>
      <CheckCheck size={12} />
    </span>
  );
};

const getUnreadCount = (conversation) =>
  Math.max(
    0,
    Number(
      conversation?.unreadCount ??
        conversation?.unreadMessagesCount ??
        conversation?.unreadMessageCount ??
        conversation?.unread_count ??
        0
    ) || 0
  );

// Disappearing messages (same values as the backend's DISAPPEAR_OPTIONS)
const DISAPPEAR_OPTIONS = [
  { seconds: 0, label: "Off" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 604800, label: "7 days" },
  { seconds: 7776000, label: "90 days" },
];

const disappearLabel = (seconds) =>
  DISAPPEAR_OPTIONS.find((o) => o.seconds === Number(seconds || 0))?.label || "Off";

const isExpired = (message, now) =>
  Boolean(message?.expiresAt) && new Date(message.expiresAt).getTime() <= now;

const isDepartmentConversation = (conversation) =>
  conversation?.type === "department" || conversation?.type === "group";

export default function Chats() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);

  const [search, setSearch] = useState("");
  const [newChatSearch, setNewChatSearch] = useState("");
  const [messageText, setMessageText] = useState("");

  const [showNewChat, setShowNewChat] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);

  const [newChatTab, setNewChatTab] = useState("users");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const canSend = chatCan("send");
  const canUpload = chatCan("upload");
  const canDownload = chatCan("download");
  const canCreateGroup = chatCan("create_group");
  const canManageMembers = chatCan("manage_members");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [savingDisappear, setSavingDisappear] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const soundEnabledRef = useRef(true);
  const audioContextRef = useRef(null);
  const socketRef = useRef(null);
  const selectedConversationRef = useRef(null);
  const currentUserIdRef = useRef(getCurrentUserId());

  const messageAreaRef = useRef(null);
  const messageEndRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const currentUserId = getCurrentUserId();

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  /* -------------------- SCROLLING -------------------- */

  const scrollToLatestMessage = useCallback((behavior = "smooth") => {
    const container = messageAreaRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollDown(false);
  }, []);

  const handleMessageAreaScroll = useCallback(() => {
    const container = messageAreaRef.current;
    if (!container) return;

    const distance =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    const nearBottom = distance < 100;

    shouldAutoScrollRef.current = nearBottom;
    setShowScrollDown(
      !nearBottom && container.scrollHeight > container.clientHeight
    );
  }, []);

  useEffect(() => {
    if (messagesLoading) return;

    const container = messageAreaRef.current;
    if (!container) return;

    if (shouldAutoScrollRef.current) {
      requestAnimationFrame(() => scrollToLatestMessage("auto"));
    } else {
      handleMessageAreaScroll();
    }
  }, [
    messages,
    messagesLoading,
    selectedConversation,
    scrollToLatestMessage,
    handleMessageAreaScroll,
  ]);

  /* -------------------- NOTIFICATION SOUND -------------------- */

  const unlockAudio = useCallback(async () => {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = new AudioContextClass();
    }

    const context = audioContextRef.current;

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  }, []);

  const playNotificationSound = useCallback(async () => {
    if (!soundEnabledRef.current) return;

    try {
      const context = await unlockAudio();

      if (!context || context.state !== "running") return;

      const playTone = (frequency, offset, duration) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        const start = context.currentTime + offset;
        const end = start + duration;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };

        oscillator.start(start);
        oscillator.stop(end);
      };

      playTone(880, 0, 0.15);
      playTone(1175, 0.18, 0.18);
    } catch (err) {
      console.error("Notification sound failed:", err);
    }
  }, [unlockAudio]);

  const testNotificationSound = useCallback(async () => {
    soundEnabledRef.current = true;
    setSoundEnabled(true);

    try {
      await playNotificationSound();
    } catch (err) {
      console.error("Unable to play test sound:", err);
    }
  }, [playNotificationSound]);

  const toggleNotificationSound = useCallback(async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      return;
    }

    soundEnabledRef.current = true;
    setSoundEnabled(true);

    try {
      await playNotificationSound();
    } catch (err) {
      console.error("Unable to enable notification sound:", err);
    }
  }, [playNotificationSound]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;

      if (context && context.state !== "closed") {
        context.close().catch(() => {});
      }
    },
    []
  );

  /* -------------------- LOAD CHAT DATA -------------------- */

  const loadChats = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const [usersResult, conversationsResult, departmentsResult] =
        await Promise.allSettled([
          API.get("/chat/users"),
          API.get("/chat/conversations"),
          API.get("/chat/departments"),
        ]);

      const authFailure = [
        usersResult,
        conversationsResult,
        departmentsResult,
      ].find(
        (result) =>
          result.status === "rejected" &&
          result.reason?.response?.status === 401
      );

      if (authFailure) throw authFailure.reason;

      if (usersResult.status === "fulfilled") {
        setUsers(getArray(usersResult.value, "users"));
      } else {
        console.error("Unable to load users:", usersResult.reason);
      }

      if (conversationsResult.status === "fulfilled") {
        setConversations(
          getArray(conversationsResult.value, "conversations")
        );
      } else {
        console.error(
          "Unable to load conversations:",
          conversationsResult.reason
        );
      }

      if (departmentsResult.status === "fulfilled") {
        setDepartments(getArray(departmentsResult.value, "departments"));
      } else {
        console.error(
          "Unable to load departments:",
          departmentsResult.reason
        );
      }

      if (
        usersResult.status === "rejected" &&
        conversationsResult.status === "rejected" &&
        departmentsResult.status === "rejected"
      ) {
        throw usersResult.reason;
      }

      setError("");
    } catch (err) {
      console.error("loadChats:", err);
      setError(getErrorMessage(err));
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadChats(false);
      }
    }, 15000);

    const handleFocus = () => loadChats(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadChats]);

  /* -------------------- CONVERSATION HELPERS -------------------- */

  const getConversationName = useCallback(
    (conversation) => {
      if (!conversation) return "Conversation";

      if (isDepartmentConversation(conversation)) {
        return (
          conversation.name ||
          conversation.department?.name ||
          "Department conversation"
        );
      }

      if (conversation.name) return conversation.name;

      const participants = conversation.participants || [];
      const other = participants.find(
        (participant) => getId(participant) !== currentUserId
      );

      return getName(other);
    },
    [currentUserId]
  );

  const getLastMessage = (conversation) => {
    const lastMessage = conversation?.lastMessage;

    if (!lastMessage) return "No messages yet";
    if (typeof lastMessage === "string") return lastMessage;

    if (!lastMessage.text && lastMessage.attachments?.length) {
      return `📎 ${lastMessage.attachments.length > 1 ? `${lastMessage.attachments.length} files` : lastMessage.attachments[0].name}`;
    }
    return lastMessage.text || lastMessage.message || "Message";
  };

  const getConversationTime = (conversation) =>
    getTime(
      conversation?.lastMessage?.createdAt ||
        conversation?.lastMessageAt ||
        conversation?.updatedAt
    );

  const activeChat = useMemo(
    () =>
      conversations.find(
        (conversation) =>
          getId(conversation) === getId(selectedConversation)
      ) || selectedConversation,
    [conversations, selectedConversation]
  );

  const activeChatName = getConversationName(activeChat);

  // re-check every 15 s so disappearing messages vanish on time without a reload
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !isExpired(message, now)),
    [messages, now]
  );

  const disappearAfter = Number(activeChat?.disappearAfter || 0);

  // Same rule as the backend: private → either person, group → group admins / Admin, department → Admin / Manager
  const canChangeDisappear = useMemo(() => {
    if (!activeChat || !canSend) return false;
    const role = getStoredUser()?.role;
    if (activeChat.type === "group") {
      return (
        role === "SuperAdmin" ||
        getId(activeChat.admin_id) === String(currentUserId) ||
        (activeChat.groupAdmins || []).map(getId).includes(String(currentUserId))
      );
    }
    if (activeChat.type === "department") return ["SuperAdmin", "Admin", "Manager"].includes(role);
    return true;
  }, [activeChat, canSend, currentUserId]);

  const changeDisappearing = async (seconds) => {
    const id = getId(activeChat);
    if (!id || seconds === disappearAfter) return;
    setSavingDisappear(true);
    setMessageError("");
    try {
      const response = await API.put(`/chat/${id}/disappearing`, { seconds });
      const note = response.data?.message;
      setConversations((prev) =>
        prev.map((c) =>
          getId(c) === id
            ? { ...c, disappearAfter: seconds, ...(note ? { lastMessage: note, lastMessageAt: note.createdAt } : {}) }
            : c
        )
      );
      setSelectedConversation((prev) => (prev && getId(prev) === id ? { ...prev, disappearAfter: seconds } : prev));
      if (note) setMessages((prev) => (prev.some((m) => getId(m) === getId(note)) ? prev : [...prev, note]));
    } catch (err) {
      setMessageError(getErrorMessage(err));
    } finally {
      setSavingDisappear(false);
    }
  };

  useEffect(() => {
    selectedConversationRef.current = activeChat;
  }, [activeChat]);

  const filteredConversations = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) return conversations;

    return conversations.filter((conversation) =>
      `${getConversationName(conversation)} ${getLastMessage(conversation)}`
        .toLowerCase()
        .includes(value)
    );
  }, [conversations, search, getConversationName]);

  const filteredUsers = useMemo(() => {
    const value = newChatSearch.toLowerCase().trim();

    return users.filter((user) => {
      if (currentUserId && getId(user) === currentUserId) return false;

      const searchable = [
        getName(user),
        user.email,
        getDepartmentName(user),
        getRoleName(user),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(value);
    });
  }, [users, newChatSearch, currentUserId]);

  const filteredDepartments = useMemo(() => {
    const value = newChatSearch.toLowerCase().trim();

    // Show existing departments returned by the API. Do not hide records
    // just because their status field is missing or uses another label.
    return departments.filter((department) => {
      const name = String(
        department?.name ||
          department?.departmentName ||
          department?.title ||
          ""
      );
      const description = String(department?.description || "");

      return `${name} ${description}`.toLowerCase().includes(value);
    });
  }, [departments, newChatSearch]);

  const totalUnreadCount = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + getUnreadCount(conversation),
        0
      ),
    [conversations]
  );

  /* -------------------- LOAD MESSAGES -------------------- */

  const loadMessages = useCallback(async (conversation) => {
    const conversationId = getId(conversation);

    if (!conversationId) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    setMessageError("");

    try {
      const response = await API.get(
        `/chat/${conversationId}/messages`
      );

      setMessages(getArray(response, "messages"));

      setConversations((previous) =>
        previous.map((item) =>
          getId(item) === conversationId
            ? { ...item, unreadCount: 0 }
            : item
        )
      );
    } catch (err) {
      console.error("loadMessages:", err);
      setMessageError(getErrorMessage(err));
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const openChat = async (conversation) => {
    shouldAutoScrollRef.current = true;
    setShowScrollDown(false);
    setSelectedConversation(conversation);
    selectedConversationRef.current = conversation;
    setMobileChat(true);
    setShowInfo(false);
    setMessageError("");

    await loadMessages(conversation);
  };

  /* -------------------- CREATE PRIVATE CHAT -------------------- */

  const startPrivateChat = async (user) => {
    const userId = getId(user);

    if (!userId) {
      setError("The selected user has no valid ID.");
      return;
    }

    setStartingChat(true);
    setError("");

    try {
      const response = await API.post("/chat/private", { userId });

      const conversation =
        response.data?.conversation ||
        response.data?.data?.conversation ||
        response.data?.data;

      if (!conversation || !getId(conversation)) {
        throw new Error("The server did not return a valid conversation.");
      }

      shouldAutoScrollRef.current = true;
      setSelectedConversation(conversation);
      selectedConversationRef.current = conversation;
      setShowNewChat(false);
      setNewChatSearch("");
      setMobileChat(true);

      await loadChats(false);
      await loadMessages(conversation);
    } catch (err) {
      console.error("startPrivateChat:", err);
      setError(getErrorMessage(err));
    } finally {
      setStartingChat(false);
    }
  };

  /* -------------------- GROUPS -------------------- */

  const createGroup = async (name, memberIds) => {
    setCreatingGroup(true);
    setError("");
    try {
      const response = await API.post("/chat/groups", { name, memberIds });
      const conversation = response.data?.conversation;
      shouldAutoScrollRef.current = true;
      setSelectedConversation(conversation);
      selectedConversationRef.current = conversation;
      setShowNewChat(false);
      setMobileChat(true);
      await loadChats(false);
      await loadMessages(conversation);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreatingGroup(false);
    }
  };

  const updateGroup = async (changes) => {
    const id = getId(activeChat);
    try {
      const response = await API.patch(`/chat/groups/${id}`, changes);
      const conversation = response.data?.conversation;
      setConversations((prev) => prev.map((c) => (getId(c) === id ? { ...c, ...conversation } : c)));
      await loadMessages(activeChat);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const leaveGroup = async () => {
    const id = getId(activeChat);
    if (!window.confirm("Leave this group? You will no longer see its messages.")) return;
    try {
      await API.post(`/chat/groups/${id}/leave`);
      setSelectedConversation(null);
      selectedConversationRef.current = null;
      setShowInfo(false);
      await loadChats(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  /* -------------------- CREATE DEPARTMENT CHAT -------------------- */

  const startDepartmentChat = async (department) => {
    const departmentId = getId(department);

    if (!departmentId) {
      setError("The selected department has no valid ID.");
      return;
    }

    setStartingChat(true);
    setError("");

    try {
      // Uses an existing Department record; does not create a department.
      const response = await API.post("/chat/department", {
        departmentId,
      });

      const conversation =
        response.data?.conversation ||
        response.data?.data?.conversation ||
        response.data?.data;

      if (!conversation || !getId(conversation)) {
        throw new Error(
          "The server did not return a valid department conversation."
        );
      }

      shouldAutoScrollRef.current = true;
      setSelectedConversation(conversation);
      selectedConversationRef.current = conversation;
      setShowNewChat(false);
      setNewChatSearch("");
      setMobileChat(true);
      setShowInfo(false);

      await loadChats(false);
      await loadMessages(conversation);
    } catch (err) {
      console.error("startDepartmentChat:", err);
      setError(getErrorMessage(err));
    } finally {
      setStartingChat(false);
    }
  };

  /* -------------------- SEND MESSAGE -------------------- */

  const sendMessage = async () => {
    const text = messageText.trim();
    const conversationId = getId(activeChat);

    if ((!text && !pendingFiles.length) || !conversationId || sending) return;

    shouldAutoScrollRef.current = true;
    setShowScrollDown(false);
    setSending(true);
    setMessageError("");

    try {
      let body = { text };
      if (pendingFiles.length) {
        body = new FormData();
        body.append("text", text);
        pendingFiles.forEach((f) => body.append("files", f));
      }
      const response = await API.post(
        `/chat/${conversationId}/messages`,
        body,
        pendingFiles.length ? { headers: { "Content-Type": "multipart/form-data" } } : undefined
      );

      const newMessage =
        response.data?.message ||
        response.data?.data?.message ||
        response.data?.data;

      if (newMessage && typeof newMessage === "object") {
        setMessages((previous) => {
          const messageId = getId(newMessage);

          if (
            messageId &&
            previous.some((item) => getId(item) === messageId)
          ) {
            return previous;
          }

          return [...previous, newMessage];
        });

        setConversations((previous) =>
          previous.map((conversation) =>
            getId(conversation) === conversationId
              ? {
                  ...conversation,
                  lastMessage: newMessage,
                  lastMessageAt:
                    newMessage.createdAt || new Date().toISOString(),
                  unreadCount: 0,
                }
              : conversation
          )
        );
      } else {
        await loadMessages(activeChat);
      }

      setMessageText("");
      setPendingFiles([]);
      await loadChats(false);
    } catch (err) {
      console.error("sendMessage:", err);
      setMessageError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();

    if ((messageText.trim() || pendingFiles.length) && !sending) {
      sendMessage();
    }
  };

  /* -------------------- SOCKET.IO -------------------- */

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      console.warn("Chat notifications: no authentication token found.");
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const refreshConversations = () => {
      API.get("/chat/conversations")
        .then((response) => {
          setConversations(getArray(response, "conversations"));
        })
        .catch((err) => {
          console.error("Unable to refresh conversations:", err);
        });
    };

    const handleIncomingMessage = (payload = {}) => {
      const { conversationId, message } =
        normalizeIncomingMessage(payload);

      if (!conversationId || !message) {
        refreshConversations();
        return;
      }

      const id = String(conversationId);
      const senderId = getMessageSenderId(message);
      const activeUserId = currentUserIdRef.current;
      const selected = selectedConversationRef.current;
      const isOpen = getId(selected) === id;

      if (
        senderId &&
        activeUserId &&
        senderId !== activeUserId &&
        soundEnabledRef.current
      ) {
        playNotificationSound();
      }

      setConversations((previous) =>
        previous.map((conversation) =>
          getId(conversation) === id
            ? {
                ...conversation,
                lastMessage: message,
                lastMessageAt:
                  message.createdAt || new Date().toISOString(),
              }
            : conversation
        )
      );

      if (isOpen) {
        API.get(`/chat/${id}/messages`)
          .then((response) => {
            setMessages(getArray(response, "messages"));

            setConversations((previous) =>
              previous.map((conversation) =>
                getId(conversation) === id
                  ? { ...conversation, unreadCount: 0 }
                  : conversation
              )
            );
          })
          .catch((err) => {
            console.error("Unable to refresh open chat:", err);
          });
      }

      refreshConversations();
    };

    const handleUnreadUpdate = (payload = {}) => {
      const conversationId =
        payload?.conversationId || payload?.data?.conversationId;

      const count =
        payload?.unreadCount ?? payload?.data?.unreadCount;

      if (!conversationId || count === undefined) {
        refreshConversations();
        return;
      }

      const id = String(conversationId);
      const unreadCount = Math.max(0, Number(count) || 0);

      setConversations((previous) =>
        previous.map((conversation) =>
          getId(conversation) === id
            ? { ...conversation, unreadCount }
            : conversation
        )
      );
    };

    socket.on("connect", () => {
      console.log("Chat notifications connected:", socket.id);
      refreshConversations();
    });

    socket.on("connect_error", (err) => {
      console.error("Chat socket connection failed:", err.message);
    });

    // the other side opened the chat → mark my messages as seen
    const handleMessagesRead = (payload = {}) => {
      const id = String(payload.conversationId || "");
      const readerId = String(payload.readerId || "");
      if (!id || !readerId || getId(selectedConversationRef.current) !== id) return;

      setMessages((previous) =>
        previous.map((message) => {
          if (getMessageSenderId(message) !== currentUserIdRef.current) return message;
          const readBy = (message.readBy || []).map(getId);
          return readBy.includes(readerId)
            ? message
            : { ...message, readBy: [...readBy, readerId] };
        })
      );
    };

    socket.on("chat:message:new", handleIncomingMessage);
    socket.on("chat:unread:update", handleUnreadUpdate);
    socket.on("chat:messages:read", handleMessagesRead);
    // groups created / renamed / members changed → refresh the list
    const handleGroupChange = () => refreshConversations();
    const handleRemoved = (payload) => {
      if (getId(selectedConversationRef.current) === String(payload?.conversationId)) {
        setSelectedConversation(null);
        selectedConversationRef.current = null;
      }
      refreshConversations();
    };
    socket.on("chat:conversation:update", handleGroupChange);
    socket.on("chat:conversation:removed", handleRemoved);

    return () => {
      socket.off("chat:conversation:update", handleGroupChange);
      socket.off("chat:conversation:removed", handleRemoved);
      socket.off("connect");
      socket.off("connect_error");
      socket.off("chat:message:new", handleIncomingMessage);
      socket.off("chat:unread:update", handleUnreadUpdate);
      socket.off("chat:messages:read", handleMessagesRead);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [playNotificationSound]);

  /* -------------------- UI -------------------- */

  return (
    <div className="chat-page">
      <style>{`
        .chat-page,.chat-page *{box-sizing:border-box}
        .chat-page .composer-tool{flex-shrink:0;width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#6E8799;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.2s}
        .chat-page .composer-tool:hover:not(:disabled){background:#E8F7F8;color:#0b8f87}
        .chat-page .composer-tool:disabled{opacity:.45;cursor:not-allowed}
        .chat-page .composer-locked{font-size:12px;color:#9a6a0a;background:#FFF7E6;border:1px solid #F3DDA9;border-radius:10px;padding:7px 10px;margin-bottom:8px}
        .chat-page{
          min-height:calc(100vh - 110px);padding:18px;color:#16324a;
          background:radial-gradient(circle at 5% 10%,#22d3ee1f,transparent 28%),
          radial-gradient(circle at 92% 12%,#14b8a61a,transparent 28%),
          linear-gradient(135deg,#f5fbfc,#eef8fa 45%,#f7fbfd);
          font-family:Inter,system-ui,-apple-system,sans-serif
        }
        .chat-shell{
          max-width:1600px;height:calc(100vh - 145px);min-height:560px;
          margin:auto;display:flex;overflow:hidden;border:1px solid #d6e7ec;
          border-radius:22px;background:#ffffffed;box-shadow:0 20px 55px #0e50661a
        }
        .chat-sidebar{
          width:330px;flex-shrink:0;display:flex;flex-direction:column;
          border-right:1px solid #dcebef;background:linear-gradient(180deg,#f1fafbf5,#f9fcfd)
        }
        .sidebar-top{padding:20px;border-bottom:1px solid #dcebef}
        .sidebar-heading,.sidebar-title-wrap,.header-actions,.chat-name-row,
        .conversation-header,.conversation-user,.conversation-actions,
        .composer-box,.modal-header,.contact-option{display:flex;align-items:center}
        .sidebar-heading,.chat-name-row,.conversation-header,.modal-header{justify-content:space-between}
        .sidebar-title-wrap{gap:11px}
        .chat-icon-box{
          width:42px;height:42px;display:grid;place-items:center;border-radius:13px;
          color:white;background:linear-gradient(135deg,#075985,#0f766e)
        }
        .sidebar-title{margin:0;font-size:21px;font-weight:800}
        .sidebar-subtitle{margin:4px 0 0;color:#7b95a7;font-size:11px}
        .header-actions{gap:7px}
        .icon-button{
          width:35px;height:35px;display:grid;place-items:center;flex-shrink:0;
          border:1px solid #d7e7ec;border-radius:10px;color:#547087;
          background:white;cursor:pointer;transition:.2s ease
        }
        .icon-button:hover{color:#0f766e;border-color:#80c9d4;transform:translateY(-1px)}
        .icon-button.sound-enabled{color:#0f766e;background:#e4f8f4;border-color:#9ddbd0}
        .icon-button.sound-muted{color:#8b99a5;background:#f2f5f7}
        .chat-search,.modal-search{position:relative;margin-top:17px}
        .chat-search svg,.modal-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#8ca4b4}
        .chat-search input,.modal-search input{
          width:100%;height:42px;padding:0 12px 0 38px;outline:none;
          border:1px solid #dcebef;border-radius:11px;color:#18374e;background:#edf6f8
        }
        .chat-search input:focus,.modal-search input:focus{border-color:#7ccbd1;background:white}
        .chat-list{flex:1;min-height:0;overflow-y:auto;padding:10px;scrollbar-width:thin;scrollbar-color:#0891b2 #e6f4f6}
        .chat-list::-webkit-scrollbar{width:7px}
        .chat-list::-webkit-scrollbar-track{background:#e6f4f6;border-radius:10px}
        .chat-list::-webkit-scrollbar-thumb{background:#0891b2;border-radius:10px}
        .chat-item{
          display:flex;align-items:center;gap:11px;width:100%;margin-bottom:4px;
          padding:12px;border:1px solid transparent;border-radius:14px;
          text-align:left;background:transparent;cursor:pointer;transition:.2s ease
        }
        .chat-item:hover{background:#f1f9fa;transform:translateX(2px)}
        .chat-item.active{background:#ddf7f7e6;border-color:#b7dfe2}
        .avatar{
          width:44px;height:44px;display:grid;place-items:center;flex-shrink:0;
          border-radius:14px;color:white;font-weight:800;
          background:linear-gradient(135deg,#075985,#0f9b91)
        }
        .chat-content{min-width:0;flex:1}
        .chat-name{overflow:hidden;color:#1a3850;font-size:12px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .chat-time{flex-shrink:0;color:#91a5b3;font-size:10px}
        .chat-preview-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;margin-top:5px}
        .chat-preview{overflow:hidden;color:#7b93a2;font-size:11px;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
        .chat-unread-badge{
          min-width:20px;height:20px;padding:0 6px;display:inline-flex;align-items:center;
          justify-content:center;flex-shrink:0;border-radius:999px;color:white;
          background:#0f9b91;font-size:10px;font-weight:800;line-height:1;animation:badgePop .25s ease
        }
        .chat-item.active .chat-unread-badge{background:#075985}
        @keyframes badgePop{from{transform:scale(.7);opacity:.3}to{transform:scale(1);opacity:1}}
        .sidebar-bottom{padding:13px;border-top:1px solid #dcebef}
        .workspace-mini{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:#eff8fa}
        .workspace-mini-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;color:#0f766e;background:white}
        .workspace-mini strong{display:block;font-size:11px}
        .workspace-mini span{display:block;margin-top:3px;color:#8aa0ad;font-size:9px}
        .chat-main{min-width:0;flex:1;display:flex;flex-direction:column;background:linear-gradient(135deg,#fbfefe,#f4fbfc)}
        .empty-chat{flex:1;display:grid;place-items:center;padding:30px;text-align:center}
        .empty-inner{max-width:420px}
        .empty-chat-icon{width:75px;height:75px;display:grid;place-items:center;margin:0 auto 22px;border-radius:23px;color:white;background:linear-gradient(135deg,#075985,#0f9b91)}
        .empty-title{color:#18364e;font-size:22px;font-weight:800}
        .empty-description{color:#7891a2;font-size:13px;line-height:1.7}
        .start-button{
          display:inline-flex;align-items:center;gap:8px;padding:12px 16px;
          border:0;border-radius:11px;color:white;background:linear-gradient(135deg,#075985,#0f9b91);
          font-weight:700;cursor:pointer;transition:.2s ease
        }
        .start-button:hover{transform:translateY(-2px);box-shadow:0 8px 20px #0f766e30}
        .conversation-header{min-height:74px;padding:12px 20px;border-bottom:1px solid #dcecef;background:#fffffff0}
        .conversation-user{min-width:0;gap:11px}
        .conversation-user-info{min-width:0}
        .conversation-user-info h3{margin:0;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}
        .online-status{margin-top:4px;color:#7793a3;font-size:10px}
        .conversation-actions{display:flex;gap:7px}
        .message-area{
          position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
          padding:24px;scroll-behavior:smooth;scrollbar-width:thin;
          scrollbar-color:#0891b2 #e4f3f5;overscroll-behavior-y:contain
        }
        .message-area::-webkit-scrollbar{width:9px}
        .message-area::-webkit-scrollbar-track{background:#e4f3f5;border-radius:12px;margin:8px 0}
        .message-area::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#22d3ee,#0891b2,#0e7490);border:2px solid #e4f3f5;border-radius:12px;min-height:35px}
        .scroll-bottom-button{
          position:sticky;bottom:8px;float:right;z-index:5;display:flex;align-items:center;
          justify-content:center;gap:7px;min-height:38px;padding:0 13px;
          border:1px solid #a5e5e8;border-radius:999px;color:#075985;background:#ffffffed;
          box-shadow:0 6px 20px #07598525;font-size:11px;font-weight:800;cursor:pointer
        }
        .date-divider{display:flex;align-items:center;gap:12px;margin:4px 0 25px;color:#9aadb8;font-size:10px}
        .date-divider:before,.date-divider:after{content:"";flex:1;height:1px;background:#deebee}
        .message-row{display:flex;margin-bottom:16px}
        .message-row.mine{justify-content:flex-end}
        .message-bubble-wrap{max-width:min(75%,620px)}
        .sender-label{margin:0 0 5px 4px;color:#839aa8;font-size:9px;font-weight:700}
        .message-row.mine .sender-label{text-align:right}
        .message-bubble{
          padding:11px 14px;border:1px solid #dbe9ed;border-radius:15px 15px 15px 5px;
          background:white;color:#38546a;font-size:12px;line-height:1.6;
          overflow-wrap:anywhere;white-space:pre-wrap
        }
        .message-row.mine .message-bubble{border-color:#0e8d91;border-radius:15px 15px 5px 15px;color:white;background:linear-gradient(135deg,#075985,#0f9b91)}
        .message-meta{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:5px;color:#98aab5;font-size:9px}
        .seen-tick{display:inline-flex;color:#98aab5}
        .seen-tick.partial{color:#7fb3c9}
        .seen-tick.seen{color:#0ea5e9}
        .composer{padding:13px 18px 17px;border-top:1px solid #dcecef;background:#fffffff0}
        .composer-box{gap:8px;padding:8px;border:1px solid #d7e7eb;border-radius:14px;background:#f7fbfc}
        .composer-box:focus-within{border-color:#74cbd0;background:white}
        .composer-box textarea{flex:1;min-width:0;min-height:38px;max-height:100px;resize:vertical;padding:9px 3px;border:0;outline:none;background:transparent;font:inherit;font-size:12px}
        .send-button{width:40px;height:40px;display:grid;place-items:center;flex-shrink:0;border:0;border-radius:11px;color:white;background:linear-gradient(135deg,#075985,#0f9b91);cursor:pointer}
        .send-button:disabled{opacity:.5;cursor:not-allowed}
        .info-panel{width:250px;flex-shrink:0;padding:18px;border-left:1px solid #dcebef;background:#f7fcfd}
        .info-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
        .info-heading h3{font-size:13px}
        .profile-card{padding:12px 0 20px;border-bottom:1px solid #dcebef;text-align:center}
        .large-avatar{width:65px;height:65px;display:grid;place-items:center;margin:auto;border-radius:20px;color:white;background:linear-gradient(135deg,#075985,#0f9b91);font-size:22px;font-weight:800}
        .profile-card h4{margin:12px 0 5px;font-size:14px}
        .profile-card p{color:#8ba0ac;font-size:10px}
        .info-section{padding:17px 0;border-bottom:1px solid #dcebef}
        .info-section-title{color:#8ca0ad;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .info-item{margin-top:12px;color:#557184;font-size:11px}
        .disappear-chip{display:inline-flex;align-items:center;gap:3px;margin-left:8px;padding:1px 7px;border-radius:999px;background:#E8F7F8;color:#0b8f87;font-size:10px;font-weight:700;vertical-align:middle}
        .disappear-help{margin:8px 0 0;color:#7a909c;font-size:10.5px;line-height:1.5}
        .disappear-options{display:flex;flex-direction:column;gap:4px;margin-top:10px}
        .disappear-option{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #dcebef;border-radius:9px;background:#fff;color:#38546a;font-size:11.5px;cursor:pointer}
        .disappear-option.selected{border-color:#74cbd0;background:#EEF8F9;color:#0b6f6a;font-weight:700}
        .disappear-option.disabled{cursor:not-allowed;opacity:.65}
        .disappear-option input{accent-color:#0f9b91;margin:0}
        .system-note{display:flex;justify-content:center;margin:4px 0 16px}
        .system-note span{display:inline-flex;align-items:center;gap:6px;max-width:85%;padding:6px 12px;border-radius:10px;background:#FFF8E6;color:#8a5a00;font-size:11px;line-height:1.5;text-align:center}
        .status-message{display:flex;align-items:flex-start;gap:8px;margin:12px 18px 0;padding:10px 12px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
        .status-message.error{background:#fef2f2;color:#b91c1c}
        .loading-state{padding:35px 15px;color:#7b93a2;text-align:center;font-size:12px}
        .loading-state p{margin:10px 0}
        .modal-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:#081f2d70;backdrop-filter:blur(5px)}
        .new-chat-modal{width:min(460px,100%);max-height:80vh;overflow:hidden;border:1px solid #d4e8ec;border-radius:18px;background:white;box-shadow:0 30px 70px #08374840}
        .modal-header{padding:16px 20px;border-bottom:1px solid #e1edef}
        .modal-header h3{margin:0;font-size:15px}
        .modal-body{max-height:calc(80vh - 120px);overflow-y:auto;padding:15px}
        .modal-search{margin:0 0 12px}
        .chat-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;padding:5px;border-radius:12px;background:#eef7f9}
        .chat-tab{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 6px;border:0;border-radius:9px;color:#6b8796;background:transparent;font-size:11px;font-weight:800;cursor:pointer}
        .chat-tab.active{color:#075985;background:white;box-shadow:0 2px 8px #07598512}
        .contact-option{gap:10px;width:100%;padding:10px;border:0;border-radius:11px;text-align:left;background:white;cursor:pointer}
        .contact-option:hover{background:#eef8f9}
        .contact-option:disabled{opacity:.5;cursor:not-allowed}
        .contact-option-info{flex:1;min-width:0}
        .contact-option-info strong{display:block;font-size:12px}
        .contact-option-info span{display:block;margin-top:3px;color:#91a4af;font-size:10px;overflow-wrap:anywhere}
        .back-mobile{display:none}
        .department-icon{background:linear-gradient(135deg,#0e7490,#0f766e)}
        @media(max-width:1100px){.info-panel{display:none}}
        @media(max-width:800px){
          .chat-page{padding:8px}.chat-shell{height:calc(100vh - 130px);min-height:500px}
          .chat-sidebar{width:100%}.chat-main{display:none}
          .chat-shell.mobile-open .chat-sidebar{display:none}
          .chat-shell.mobile-open .chat-main{display:flex}
          .back-mobile{display:grid}.conversation-header{padding:10px}
          .message-area{padding:15px 10px}.message-bubble-wrap{max-width:85%}
          .composer{padding:10px}
        }
        @media(max-width:480px){
          .sidebar-top{padding:14px}.sidebar-title{font-size:18px}
          .conversation-actions{gap:4px}.conversation-actions .icon-button{width:31px;height:31px}
          .message-bubble{font-size:11px}
        }
      `}</style>

      <div className={`chat-shell ${mobileChat ? "mobile-open" : ""}`}>
        <aside className="chat-sidebar">
          <div className="sidebar-top">
            <div className="sidebar-heading">
              <div className="sidebar-title-wrap">
                <div className="chat-icon-box">
                  <MessageCircle size={21} />
                </div>
                <div>
                  <h2 className="sidebar-title">Chats</h2>
                  <p className="sidebar-subtitle">
                    Team communication workspace
                  </p>
                </div>
              </div>

              <div className="header-actions">
                <button
                  className="icon-button"
                  title="Start new conversation"
                  onClick={() => {
                    setError("");
                    setNewChatTab("users");
                    setNewChatSearch("");
                    setShowNewChat(true);
                  }}
                >
                  <Plus size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Refresh chats and departments"
                  onClick={() => loadChats()}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            <div className="chat-search">
              <Search size={16} />
              <input
                placeholder="Search conversations..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="status-message error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="chat-list">
            {loading ? (
              <div className="loading-state">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="loading-state">
                <MessageCircle size={30} />
                <p>No conversations yet.</p>
                <button
                  className="start-button"
                  onClick={() => {
                    setNewChatTab("users");
                    setShowNewChat(true);
                  }}
                >
                  <UserPlus size={15} />
                  Start a conversation
                </button>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const id = getId(conversation);
                const name = getConversationName(conversation);
                const isActive = getId(activeChat) === id;
                const unreadCount = getUnreadCount(conversation);
                const isDepartment = isDepartmentConversation(conversation);

                return (
                  <button
                    key={id}
                    className={`chat-item ${isActive ? "active" : ""}`}
                    onClick={() => openChat(conversation)}
                  >
                    <div className={`avatar ${isDepartment ? "department-icon" : ""}`}>
                      {isDepartment ? (
                        <Building2 size={19} />
                      ) : (
                        getInitial(name)
                      )}
                    </div>

                    <div className="chat-content">
                      <div className="chat-name-row">
                        <span className="chat-name">{name}</span>
                        <span className="chat-time">
                          {getConversationTime(conversation)}
                        </span>
                      </div>

                      <div className="chat-preview-row">
                        <span className="chat-preview">
                          {conversation.type === "group" ? "Group · " : isDepartment ? "Department · " : ""}
                          {getLastMessage(conversation)}
                        </span>

                        {unreadCount > 0 && (
                          <span
                            className="chat-unread-badge"
                            title={`${unreadCount} unread messages`}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="sidebar-bottom">
            <div className="workspace-mini">
              <div className="workspace-mini-icon">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>Team workspace</strong>
                <span>
                  {totalUnreadCount > 0
                    ? `${totalUnreadCount} unread message${totalUnreadCount === 1 ? "" : "s"}`
                    : `${departments.length} department${departments.length === 1 ? "" : "s"} available`}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <main className="chat-main">
          {!activeChat ? (
            <div className="empty-chat">
              <div className="empty-inner">
                <div className="empty-chat-icon">
                  <MessageCircle size={30} />
                </div>
                <h2 className="empty-title">Your conversations live here</h2>
                <p className="empty-description">
                  Start a private chat with a teammate or select an existing
                  department to message its members.
                </p>
                <button
                  className="start-button"
                  onClick={() => {
                    setNewChatTab("users");
                    setShowNewChat(true);
                  }}
                >
                  <UserPlus size={15} />
                  Start a conversation
                </button>
              </div>
            </div>
          ) : (
            <>
              <header className="conversation-header">
                <div className="conversation-user">
                  <button
                    className="icon-button back-mobile"
                    onClick={() => setMobileChat(false)}
                    title="Back to conversations"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <div
                    className={`avatar ${
                      isDepartmentConversation(activeChat)
                        ? "department-icon"
                        : ""
                    }`}
                  >
                    {isDepartmentConversation(activeChat) ? (
                      <Building2 size={19} />
                    ) : (
                      getInitial(activeChatName)
                    )}
                  </div>

                  <div className="conversation-user-info">
                    <h3>{activeChatName}</h3>
                    <div className="online-status">
                      {activeChat.type === "group"
                        ? `Group · ${(activeChat.participants || []).length} members`
                        : isDepartmentConversation(activeChat)
                        ? "Department conversation · Members can participate"
                        : "Private conversation"}
                      {disappearAfter > 0 && (
                        <span className="disappear-chip" title="New messages disappear after this time">
                          <Timer size={11} /> {disappearLabel(disappearAfter)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="conversation-actions">
                  <button
                    className={`icon-button ${disappearAfter > 0 ? "sound-enabled" : ""}`}
                    title={
                      disappearAfter > 0
                        ? `Disappearing messages: ${disappearLabel(disappearAfter)}`
                        : "Disappearing messages: Off"
                    }
                    aria-label="Disappearing messages settings"
                    onClick={() => setShowInfo(true)}
                  >
                    <Timer size={16} />
                  </button>

                  <button
                    className={`icon-button ${
                      soundEnabled ? "sound-enabled" : "sound-muted"
                    }`}
                    title={
                      soundEnabled
                        ? "Mute notification sounds"
                        : "Enable notification sounds"
                    }
                    aria-label={
                      soundEnabled
                        ? "Mute notification sounds"
                        : "Enable notification sounds"
                    }
                    aria-pressed={soundEnabled}
                    onClick={toggleNotificationSound}
                  >
                    {soundEnabled ? (
                      <Volume2 size={16} />
                    ) : (
                      <VolumeX size={16} />
                    )}
                  </button>

                  <button
                    className="icon-button"
                    title="Test notification sound"
                    onClick={testNotificationSound}
                  >
                    <Bell size={15} />
                  </button>

                  <button
                    className="icon-button"
                    title="Conversation information"
                    onClick={() => setShowInfo((previous) => !previous)}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
              </header>

              {messageError && (
                <div className="status-message error">
                  <AlertCircle size={16} />
                  <span>{messageError}</span>
                </div>
              )}

              <div
                className="message-area"
                ref={messageAreaRef}
                onScroll={handleMessageAreaScroll}
                aria-label="Chat messages"
              >
                <div className="date-divider">
                  <span>Messages</span>
                </div>

                {messagesLoading ? (
                  <div className="loading-state">Loading messages...</div>
                ) : visibleMessages.length === 0 ? (
                  <div className="loading-state">
                    No messages in this conversation yet.
                  </div>
                ) : (
                  visibleMessages.map((message, index) => {
                    if (message.system) {
                      return (
                        <div key={getId(message) || `system-${index}`} className="system-note">
                          <span><Timer size={12} /> {message.text}</span>
                        </div>
                      );
                    }
                    const senderId = getMessageSenderId(message);
                    const mine =
                      Boolean(currentUserId) && senderId === currentUserId;

                    const senderName = mine
                      ? "You"
                      : getName(
                          message.sender ||
                            message.senderId ||
                            message.user
                        );

                    return (
                      <div
                        key={
                          getId(message) ||
                          `${message.createdAt || "message"}-${index}`
                        }
                        className={`message-row ${mine ? "mine" : ""}`}
                      >
                        <div className="message-bubble-wrap">
                          <div className="sender-label">{senderName}</div>
                          <div className="message-bubble">
                            {(message.text || message.message) && (
                              <div>{message.text || message.message}</div>
                            )}
                            <MessageAttachments
                              api={API}
                              attachments={message.attachments || []}
                              canDownload={canDownload}
                            />
                          </div>
                          <div className="message-meta">
                            {message.expiresAt && (
                              <Timer size={10} aria-label="Disappearing message" />
                            )}
                            <span>{getTime(message.createdAt)}</span>
                            {mine && <SeenTick message={message} chat={activeChat} meId={currentUserId} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={messageEndRef} />

                {showScrollDown && (
                  <button
                    className="scroll-bottom-button"
                    type="button"
                    onClick={() => scrollToLatestMessage("smooth")}
                    aria-label="Scroll to latest messages"
                    title="Scroll to latest messages"
                  >
                    <ChevronDown size={16} />
                    Latest messages
                  </button>
                )}
              </div>

              <div className="composer">
                {!canSend && (
                  <div className="composer-locked">You can read this conversation but don't have permission to send messages.</div>
                )}
                <PendingFiles files={pendingFiles} onRemove={(i) => setPendingFiles((prev) => prev.filter((_, j) => j !== i))} />
                <div className="composer-box">
                  <EmojiPicker
                    disabled={!canSend || sending}
                    onPick={(emoji) => setMessageText((t) => t + emoji)}
                  />
                  {canUpload && (
                    <AttachButton
                      disabled={!canSend || sending}
                      onFiles={(list) => {
                        const { accepted, problems } = validateChatFiles(list, pendingFiles);
                        setPendingFiles((prev) => [...prev, ...accepted]);
                        setMessageError(problems.join(". "));
                      }}
                    />
                  )}
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${activeChatName}...`}
                    rows={1}
                    aria-label={`Message ${activeChatName}`}
                    disabled={sending || !canSend}
                  />
                  <button
                    className="send-button"
                    onClick={sendMessage}
                    disabled={(!messageText.trim() && !pendingFiles.length) || sending || !canSend}
                    title={sending ? "Sending message..." : "Send message"}
                    type="button"
                  >
                    <Send size={17} />
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        {activeChat && showInfo && (
          <aside className="info-panel">
            <div className="info-heading">
              <h3>Conversation</h3>
              <button
                className="icon-button"
                onClick={() => setShowInfo(false)}
                title="Close information"
              >
                <X size={15} />
              </button>
            </div>

            <div className="profile-card">
              <div className="large-avatar">
                {getInitial(activeChatName)}
              </div>
              <h4>{activeChatName}</h4>
              <p>
                {activeChat.type === "group"
                  ? "Group conversation"
                  : isDepartmentConversation(activeChat)
                  ? "Department conversation"
                  : "Private conversation"}
              </p>
            </div>

            <div className="info-section">
              <div className="info-section-title">Disappearing messages</div>
              <p className="disappear-help">
                When on, new messages are deleted for everyone after the chosen time. Messages already sent are not affected.
              </p>
              <div className="disappear-options" role="radiogroup" aria-label="Disappearing messages">
                {DISAPPEAR_OPTIONS.map((option) => (
                  <label
                    key={option.seconds}
                    className={`disappear-option ${disappearAfter === option.seconds ? "selected" : ""} ${
                      !canChangeDisappear || savingDisappear ? "disabled" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="disappear"
                      checked={disappearAfter === option.seconds}
                      disabled={!canChangeDisappear || savingDisappear}
                      onChange={() => changeDisappearing(option.seconds)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {!canChangeDisappear && (
                <p className="disappear-help">
                  {activeChat.type === "group"
                    ? "Only group admins can change this."
                    : activeChat.type === "department"
                    ? "Only an Admin or Manager can change this."
                    : "You don't have permission to change this."}
                </p>
              )}
            </div>

            {activeChat.type === "group" && (
              <GroupMembersPanel
                group={activeChat}
                users={users}
                currentUserId={currentUserId}
                canManage={
                  canManageMembers &&
                  ((activeChat.groupAdmins || []).map(String).includes(String(currentUserId)) ||
                    ["Admin", "SuperAdmin"].includes(getStoredUser()?.role))
                }
                onUpdate={updateGroup}
                onLeave={leaveGroup}
              />
            )}

            <div className="info-section">
              <div className="info-section-title">Conversation details</div>
              <div className="info-item">
                <MessageCircle
                  size={14}
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                {activeChat.type || "private"}
              </div>
              <div className="info-item">
                <Users
                  size={14}
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                {activeChat.type === "department"
                  ? "Department members"
                  : `${(activeChat.participants || []).length} participants`}
              </div>
              {activeChat.department?.name && (
                <div className="info-item">
                  <Building2
                    size={14}
                    style={{ verticalAlign: "middle", marginRight: 8 }}
                  />
                  {activeChat.department.name}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* NEW CONVERSATION MODAL */}
      {showNewChat && (
        <div
          className="modal-overlay"
          onClick={() => setShowNewChat(false)}
        >
          <div
            className="new-chat-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Start New Conversation</h3>
              <button
                className="icon-button"
                onClick={() => setShowNewChat(false)}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body">
              <div className="chat-tabs">
                <button
                  className={`chat-tab ${
                    newChatTab === "users" ? "active" : ""
                  }`}
                  onClick={() => {
                    setNewChatTab("users");
                    setNewChatSearch("");
                  }}
                  type="button"
                >
                  <Users size={15} />
                  People
                </button>

                <button
                  className={`chat-tab ${
                    newChatTab === "departments" ? "active" : ""
                  }`}
                  onClick={() => {
                    setNewChatTab("departments");
                    setNewChatSearch("");
                  }}
                  type="button"
                >
                  <Building2 size={15} />
                  Departments ({departments.length})
                </button>

                {canCreateGroup && (
                  <button
                    className={`chat-tab ${newChatTab === "group" ? "active" : ""}`}
                    onClick={() => setNewChatTab("group")}
                    type="button"
                  >
                    <UserPlus size={15} />
                    New group
                  </button>
                )}
              </div>

              {newChatTab === "group" && (
                <GroupCreator users={users} currentUserId={currentUserId} onCreate={createGroup} busy={creatingGroup} />
              )}

              {newChatTab !== "group" && (
              <div className="modal-search">
                <Search size={16} />
                <input
                  placeholder={
                    newChatTab === "users"
                      ? "Search team members..."
                      : "Search existing departments..."
                  }
                  value={newChatSearch}
                  onChange={(event) => setNewChatSearch(event.target.value)}
                  autoFocus
                />
              </div>
              )}

              {startingChat && (
                <div className="loading-state">
                  Opening conversation...
                </div>
              )}

              {!startingChat && newChatTab === "users" && (
                <>
                  {filteredUsers.length === 0 ? (
                    <div className="loading-state">
                      <Users size={25} />
                      <p>No available users found.</p>
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <button
                        key={getId(user)}
                        className="contact-option"
                        disabled={startingChat}
                        onClick={() => startPrivateChat(user)}
                      >
                        <div className="avatar">
                          {getInitial(getName(user))}
                        </div>
                        <div className="contact-option-info">
                          <strong>{getName(user)}</strong>
                          <span>
                            {[
                              getRoleName(user),
                              getDepartmentName(user),
                              user.email,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <Plus size={16} />
                      </button>
                    ))
                  )}
                </>
              )}

              {!startingChat && newChatTab === "departments" && (
                <>
                  {filteredDepartments.length === 0 ? (
                    <div className="loading-state">
                      <Building2 size={27} />
                      <p>No departments found. Try reloading the department list.</p>
                      <button
                        className="start-button"
                        type="button"
                        onClick={() => loadChats()}
                      >
                        <RefreshCw size={14} />
                        Reload departments
                      </button>
                    </div>
                  ) : (
                    filteredDepartments.map((department) => (
                      <button
                        key={getId(department)}
                        className="contact-option"
                        disabled={startingChat}
                        onClick={() => startDepartmentChat(department)}
                      >
                        <div className="avatar department-icon">
                          <Building2 size={19} />
                        </div>
                        <div className="contact-option-info">
                          <strong>
                            {department.name ||
                              department.departmentName ||
                              department.title ||
                              "Unnamed department"}
                          </strong>
                          <span>
                            {department.description ||
                              "Message members of this department"}
                          </span>
                        </div>
                        <MessageSquare size={16} />
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}