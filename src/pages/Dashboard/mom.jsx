import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Download,
  FileText,
  CheckCircle2,
  CalendarDays,
  Users,
  Clock3,
  X,
  Trash2,
  Edit3,
  Mic,
  MicOff,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ClipboardList,
  Building2,
  Save,
  Target,
  ChevronLeft,
  ChevronRight,
  Video,
  Copy,
  Calendar,
  List,
  ExternalLink,
  PlusCircle,
  Loader2,
  Zap,
  AlertCircle,
  RefreshCw,
  Paperclip,
} from "lucide-react";
import MeetingRecordingPanel from "./MeetingRecordingPanel";
import { Pagination, usePagination } from "../../components/Pagination";
import { useNavigate } from "react-router-dom";
import { appLinks, canOpen, linkProps, pageParams, APP_LINK_CSS } from "../../utils/appLinks";
import { API_URL as ENV_API_URL } from "../../config/env";

// The meeting's join link: the built-in video call, or an older meeting's Google Meet link
const meetLinkOf = (m) => m.videoLink || m.googleMeetLink || "";
const openCall = (m) => {
  if (m.videoRoomId) window.open(`/meet/${m.videoRoomId}`, "_blank", "noopener");
  else if (m.googleMeetLink) window.open(m.googleMeetLink, "_blank", "noopener");
};

/* ===================== API CONFIG ===================== */
const API_BASE_URL = ENV_API_URL;
const API_URL = API_BASE_URL + "/meetings";
const DEPARTMENTS_URL = API_BASE_URL + "/departments";
// Everyone in my organization (works for every role, not only admins)
const USERS_URL = API_URL + "/participants";
const MAX_MEETING_FILE_SIZE = 8 * 1024 * 1024;
const MEETING_FILE_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip";

const downloadMeetingFile = async (file) => {
  const response = await fetch(`${API_URL}/attachments/${encodeURIComponent(file.filename)}`, {
    credentials: "include",
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Could not download this meeting file.");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = file.name || "meeting-file";
  link.click();
  URL.revokeObjectURL(blobUrl);
};

const getSessionUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const canDo = (user, moduleId, action) =>
  user?.role === "SuperAdmin" || Boolean(user?.permissions?.[moduleId]?.includes(action));

/* ===================== AUTH HELPER ===================== */
const getAuthHeaders = () => {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("userToken") ||
    sessionStorage.getItem("token");

  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/* Centralized request handler — preserves backend validation messages. */
const apiRequest = async (url, options = {}) => {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...getAuthHeaders(),
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    console.error("Meeting API connection error:", error);
    throw new Error("Cannot connect to the backend. Check that the server is running.");
  }

  const raw = await response.text();
  let result = {};
  if (raw.trim()) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw };
    }
  }

  if (!response.ok || result.success === false) {
    console.error("Meeting API error:", {
      url,
      status: response.status,
      response: result,
    });
    const validationErrors = result.errors
      ? Object.values(result.errors)
          .map((item) => typeof item === "string" ? item : item?.message)
          .filter(Boolean)
          .join(", ")
      : "";

    throw new Error(
      result.message ||
      result.error ||
      validationErrors ||
      `Server error: ${response.status}`
    );
  }

  return result;
};

const extractMeetingList = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.meetings)) return result.meetings;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.meetings)) return result.data.meetings;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  return [];
};

const extractSavedMeeting = (result) => {
  const candidate =
    result?.meeting ||
    result?.data?.meeting ||
    result?.data?.data ||
    result?.data;

  if (candidate && !Array.isArray(candidate) && typeof candidate === "object" &&
      (candidate._id || candidate.id)) {
    return normalizeMeeting(candidate);
  }
  return null;
};

/* ===================== MASTER-DATA HELPERS ===================== */
const extractArray = (result, keys = []) => {
  if (Array.isArray(result)) return result;
  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data?.[key])) return result.data[key];
  }
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  return [];
};

const normalizeDepartment = (department) => {
  if (typeof department === "string") return department.trim();
  return String(department?.name || department?.departmentName || department?.title || department?.label || "").trim();
};

const normalizeUser = (user, index) => {
  const departmentValue = user?.department;
  const department = typeof departmentValue === "object"
    ? normalizeDepartment(departmentValue)
    : String(departmentValue || user?.departmentName || "").trim();
  return {
    id: user?._id || user?.id || user?.userId || `user-${index}`,
    name: String(user?.name || user?.fullName || user?.username || user?.displayName || user?.email || "").trim(),
    email: String(user?.email || "").trim(),
    department,
    status: user?.status || "Active",
  };
};

const emptyMeeting = {
  date: new Date().toISOString().split("T")[0],
  startTime: "10:00",
  endTime: "11:00",
  name: "",
  departments: [],
  members: [],
  recording: false,
  notes: "",
  wantsMeet: true, // a REAL Google Meet link is created by the server on save
  googleMeetLink: "",
  points: [{ id: Date.now(), title: "", completed: false }],
  actions: [],
};

const formatDate = (dateString) => {
  if (!dateString) return "No date";
  const date = new Date(dateString + "T00:00:00");
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const isThisWeek = (dateString) => {
  if (!dateString) return false;
  const date = new Date(dateString + "T00:00:00");
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return date >= start && date <= end;
};

const CALENDAR_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "14:30" → "2:30 PM"
const formatTime = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

/* ============ NORMALIZER (backend → frontend shape) ============ */
// The UI stores selected members as names, while the API may return attendee
// subdocuments. Always convert both shapes to display names before rendering.
const getPersonName = (person) => {
  if (typeof person === "string") return person.trim();
  return String(
    person?.name || person?.fullName || person?.username ||
    person?.displayName || person?.email || person?.userName || ""
  ).trim();
};

// Same person / department listed twice (e.g. "ranjith" + "Ranjith") → keep one
const uniqueNames = (list) => {
  const seen = new Set();
  return list.filter((name) => {
    const key = String(name).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeMeeting = (m) => {
  const sourceMembers = Array.isArray(m.members) && m.members.length
    ? m.members
    : Array.isArray(m.attendees) ? m.attendees : [];

  return {
    _id: m._id || m.id || String(Date.now() + Math.random()),
    id: m.id || m._id || String(Date.now() + Math.random()),
    date: (m.meetingDate || m.date)
      ? String(m.meetingDate || m.date).split("T")[0]
      : new Date().toISOString().split("T")[0],
    name: m.meetingTitle || m.name || m.title || "Untitled Meeting",
    startTime: m.startTime || "",
    endTime: m.endTime || "",
    departments: Array.isArray(m.departments)
      ? uniqueNames(m.departments.map(normalizeDepartment).filter(Boolean))
      : [],
    members: uniqueNames(sourceMembers.map(getPersonName).filter(Boolean)),
    recording: !!(m.recording ?? m.isRecorded),
    recordingFile: m.recordingFile || null,
    googleRecordingUrl: m.googleRecordingUrl || "",
    notes: m.notes || "",
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    attendees: Array.isArray(m.attendees) ? m.attendees.filter((a) => a && typeof a === "object" && a.name) : [],
    wantsMeet: m.meetingType ? m.meetingType !== "Offline" : true,
    status: m.status || "Scheduled",
    googleMeetLink: m.googleMeetLink || m.googleMeet || m.meetLink || m.meetingLink || "",
    // built-in video call (WebRTC): link emailed to attendees + room id for the in-app join page
    videoLink: m.videoLink || "",
    videoRoomId: m.videoRoomId || "",
    points: Array.isArray(m.points)
      ? m.points.map((point) =>
          typeof point === "string"
            ? { id: Date.now() + Math.random(), title: point, completed: false }
            : {
                id: point.id || point._id || Date.now() + Math.random(),
                title: point.title || point.text || point.point || "",
                completed: !!point.completed,
              }
        )
      : [],
    actions: Array.isArray(m.actions)
      ? m.actions.map((action) =>
          typeof action === "string"
            ? { id: Date.now() + Math.random(), title: action, owner: "Unassigned", dueDate: "", completed: false }
            : {
                id: action.id || action._id || Date.now() + Math.random(),
                title: action.title || action.text || action.task || "",
                // one or more owners (older records only have the text field)
                owners: Array.isArray(action.owners) && action.owners.length
                  ? action.owners.map((o) => ({ userId: o.userId || null, name: o.name || "", email: o.email || "" })).filter((o) => o.name)
                  : [],
                owner: (Array.isArray(action.owners) && action.owners.length
                  ? action.owners.map((o) => o.name).filter(Boolean).join(", ")
                  : "") || action.owner || action.assignedTo || "Unassigned",
                dueDate: action.dueDate
                  ? String(action.dueDate).split("T")[0]
                  : action.due_date ? String(action.due_date).split("T")[0] : "",
                completed: !!action.completed,
              }
        )
      : [],
  };
};

const getMeetingId = (m) => m._id || m.id;

/* ===================== PAYLOAD MAPPER (frontend → backend) =====================
 * FIX: Your backend returned "Meeting title and meeting date are required"
 * → it reads meetingTitle / meetingDate. We send ALL common variants —
 * Mongoose strict mode silently ignores fields not in the schema, so this is SAFE.
 * ========================================================================== */
const pad2 = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const roomIdFromLink = (link) => String(link || "").match(/\/meet\/([^/?#]+)/)?.[1] || "";

const mapToBackend = (form, users = []) => {
  const meetingTitle = String(form.name || "").trim();
  const meetingDate = String(form.date || "").trim();
  const memberNames = uniqueNames(
    (Array.isArray(form.members) ? form.members : [])
      .map(getPersonName)
      .filter(Boolean)
  );

  // Mongoose expects attendee subdocuments, not strings such as "shiva".
  // Keep `members` as names for compatibility with the existing UI/API, and
  // send object-shaped values in `attendees` for the embedded schema.
  const attendeeObjects = memberNames.map((memberName) => {
    const matchedUser = users.find((user) =>
      String(user.name || "").trim().toLowerCase() === memberName.toLowerCase()
    );
    return {
      name: matchedUser?.name || memberName,
      email: matchedUser?.email || "",
      userId: /^[a-f0-9]{24}$/i.test(String(matchedUser?.id || "")) ? matchedUser.id : null,
      department: matchedUser?.department || "",
    };
  });

  return {
    meetingTitle,
    meetingDate,
    name: meetingTitle,
    title: meetingTitle,
    date: meetingDate,
    startTime: form.startTime || "",
    endTime: form.endTime || "",
    departments: Array.isArray(form.departments) ? uniqueNames(form.departments) : [],
    members: memberNames,
    attendees: attendeeObjects,
    recording: Boolean(form.recording),
    isRecorded: Boolean(form.recording),
    notes: String(form.notes || "").trim(),
    status: "Scheduled",
    // The server creates the private video call link for Online meetings
    meetingType: form.googleMeetLink || form.wantsMeet !== false ? "Online" : "Offline",
    points: (form.points || [])
      .filter((point) => point?.title && String(point.title).trim())
      .map((point) => ({
        title: String(point.title).trim(),
        completed: Boolean(point.completed),
      })),
    actions: (form.actions || [])
      .filter((action) => action?.title && String(action.title).trim())
      .map((action) => ({
        title: String(action.title).trim(),
        owners: (action.owners || []).map((o) => ({
          userId: /^[a-f0-9]{24}$/i.test(String(o.userId || "")) ? o.userId : null,
          name: o.name,
          email: o.email || "",
        })),
        owner: (action.owners || []).map((o) => o.name).join(", ") || action.owner || "Unassigned",
        dueDate: action.dueDate || null,
        completed: Boolean(action.completed),
      })),
  };
};

const MinutesOfMeeting = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [masterDataLoading, setMasterDataLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const [search, setSearch] = useState("");

  // Header search → open this page filtered (?search=… or the live "workspace-search" event)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("search");
    if (fromUrl) setSearch(fromUrl);
    const onSearch = (event) => {
      if (event.detail?.path === window.location.pathname) setSearch(event.detail.query || "");
    };
    window.addEventListener("workspace-search", onSearch);
    return () => window.removeEventListener("workspace-search", onSearch);
  }, []);
  const [dateFilter, setDateFilter] = useState("All Time");
  // ?date=2026-11-15 (from the Task Calendar) → only meetings on that day
  const [dayFilter, setDayFilter] = useState(() => {
    const d = pageParams().get("date");
    return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : "";
  });
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState("list");
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [instantMode, setInstantMode] = useState(false); // "Instant Meeting": save, then open the call
  const [form, setForm] = useState(emptyMeeting);
  const [meetingFiles, setMeetingFiles] = useState([]);
  const [expandedMeeting, setExpandedMeeting] = useState(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ title: "", owners: [], dueDate: "" });
  const [sessionUser] = useState(getSessionUser);
  const canEditMedia = canDo(sessionUser, "communication", "edit");
  const canInvite = canDo(sessionUser, "communication", "create");
  const [toast, setToast] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [draggedMeeting, setDraggedMeeting] = useState(null);

  const showToast = (message, ms = 4000) => {
    setToast(message);
    setTimeout(() => setToast(""), ms);
  };

  /* ===== Google Meet / invitation email health (shown as a banner) ===== */
  const [integration, setIntegration] = useState(null);
  const [inviting, setInviting] = useState(null);

  const loadIntegration = useCallback(async () => {
    try {
      const result = await apiRequest(`${API_URL}/integration-status`);
      setIntegration(result.data || null);
    } catch {
      setIntegration(null);
    }
  }, []);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  // Result of the Google sign-in (?google=connected | error&reason=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google");
    if (!status) return;
    if (status === "connected") {
      showToast("Google reconnected — Meet links and invitations work again. Use “Resend invite” on older meetings.", 9000);
    } else {
      showToast(`Google reconnect failed: ${params.get("reason") || "unknown error"}`, 12000);
    }
    window.history.replaceState({}, "", window.location.pathname);
    loadIntegration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh meeting and recording details after returning from the call.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMeetings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create the video call link (if missing) and email the invitation to members
  const sendInvitation = async (meeting) => {
    const id = getMeetingId(meeting);
    setInviting(id);
    try {
      const result = await apiRequest(`${API_URL}/${id}/send-invitation`, { method: "POST" });
      const saved = result.data?.meeting ? normalizeMeeting(result.data.meeting) : null;
      if (saved) {
        setMeetings((prev) => prev.map((m) => (getMeetingId(m) === id ? { ...m, ...saved, recordingFile: m.recordingFile } : m)));
      }
      showToast(result.message || "Invitation sent", 6000);
    } catch (error) {
      showToast(error.message, 9000);
    } finally {
      setInviting(null);
      loadIntegration();
    }
  };

  /* ===================== API DATA MANAGEMENT (WITH AUTH) ===================== */

  // GET — Fetch meetings from the database.
  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest(API_URL);
      const normalized = extractMeetingList(result).map(normalizeMeeting);
      setMeetings(normalized);
      return normalized;
    } catch (error) {
      console.error("Error fetching meetings:", error);
      showToast("Failed to load meetings: " + error.message);
      setMeetings([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Load the same departments and users already managed by the app's API.
  // The create form no longer depends on hard-coded sample people/departments.
  const fetchMeetingMasterData = useCallback(async () => {
    setMasterDataLoading(true);
    const [departmentResult, userResult] = await Promise.allSettled([
      apiRequest(DEPARTMENTS_URL),
      apiRequest(USERS_URL),
    ]);

    if (departmentResult.status === "fulfilled") {
      const departmentRows = extractArray(departmentResult.value, ["departments", "results"]);
      const names = departmentRows.map(normalizeDepartment).filter(Boolean);
      setDepartments([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    } else {
      console.error("Failed to load MoM departments:", departmentResult.reason);
      setDepartments([]);
    }

    if (userResult.status === "fulfilled") {
      const userRows = extractArray(userResult.value, ["users", "results"]);
      const normalized = userRows.map(normalizeUser).filter((user) => user.name);
      setUsers(normalized.filter((user) => String(user.status).toLowerCase() !== "inactive"));
    } else {
      console.error("Failed to load MoM users:", userResult.reason);
      setUsers([]);
    }

    if (departmentResult.status === "rejected" || userResult.status === "rejected") {
      const failed = [
        departmentResult.status === "rejected" ? "departments" : "",
        userResult.status === "rejected" ? "users" : "",
      ].filter(Boolean).join(" and ");
      showToast(`Could not load ${failed}. Check the API and try again.`);
    }
    setMasterDataLoading(false);
  }, []);

  useEffect(() => {
    fetchMeetingMasterData();
  }, [fetchMeetingMasterData]);

  // POST — Create meeting. Reload GET after POST so the UI reflects the
  // actual document saved by MongoDB, regardless of response envelope shape.
  const createMeeting = async (meetingData) => {
    if (saving) return;

    const payload = mapToBackend(meetingData, users);
    if (!payload.meetingTitle) {
      showToast("Please enter a meeting name");
      return;
    }
    if (!payload.meetingDate) {
      showToast("Please select meeting date");
      return;
    }

    const existingIds = new Set(meetings.map(getMeetingId));
    setSaving(true);
    try {
      console.log("POST /meetings payload:", payload);
      const result = await apiRequest(API_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("POST /meetings response:", result);

      const savedMeeting = extractSavedMeeting(result);
      if (savedMeeting) {
        if (meetingFiles.length) {
          savedMeeting.attachments = await uploadMeetingFiles(savedMeeting.id);
        }
        setMeetings((previous) => [
          savedMeeting,
          ...previous.filter((item) => getMeetingId(item) !== getMeetingId(savedMeeting)),
        ]);
      } else {
        // Handles APIs that return only { success: true, message: "..." }.
        const refreshedMeetings = await fetchMeetings();
        if (meetingFiles.length) {
          const createdMeeting = refreshedMeetings.find((item) =>
            !existingIds.has(getMeetingId(item)) &&
            item.name === meetingData.name &&
            item.date === meetingData.date &&
            item.startTime === meetingData.startTime
          );
          if (!createdMeeting) throw new Error("Meeting saved, but the meeting could not be found to upload its attachments.");
          const attachments = await uploadMeetingFiles(getMeetingId(createdMeeting));
          setMeetings((previous) => previous.map((item) =>
            getMeetingId(item) === getMeetingId(createdMeeting)
              ? { ...item, attachments: [...(item.attachments || []), ...attachments] }
              : item
          ));
        }
      }

      // Tell the truth about the video link + invitation email
      const info = result.integration || {};
      if (info.warning && !info.videoLink) {
        showToast(`Meeting saved, but no video link: ${info.warning}`, 10000);
      } else if (info.videoLink && !info.invitationSent && info.warning) {
        showToast(`Meeting saved with a video link, but the invitation was not emailed: ${info.warning}`, 10000);
      } else if (info.videoLink) {
        showToast("Meeting saved — video call link created and invitation emailed", 6000);
      } else {
        showToast("Meeting saved successfully");
      }
      loadIntegration();
      closeModal();
      return savedMeeting?.videoRoomId || roomIdFromLink(info.videoLink);
    } catch (error) {
      console.error("Error creating meeting:", error);
      showToast("Save failed: " + error.message);
      return "";
    } finally {
      setSaving(false);
    }
  };

  // PUT — Update existing meeting
  const updateMeeting = async (id, meetingData) => {
    setSaving(true);
    try {
      const payload = mapToBackend(meetingData, users);
      console.log("🟡 PUT payload being sent:", payload);

      const data = await apiRequest(`${API_URL}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const updatedMeeting = extractSavedMeeting(data);
      if (updatedMeeting) {
        if (meetingFiles.length) {
          updatedMeeting.attachments = [
            ...(updatedMeeting.attachments || []),
            ...await uploadMeetingFiles(id),
          ];
        }
        setMeetings((prev) =>
          prev.map((m) => (getMeetingId(m) === id ? updatedMeeting : m))
        );
      } else {
        await fetchMeetings();
        if (meetingFiles.length) {
          await uploadMeetingFiles(id);
          await fetchMeetings();
        }
      }
      // New attendees (or everyone, if the time changed) get the invitation — same video link
      const info = data.integration || {};
      if (info.warning) {
        showToast(`Meeting updated, but the invitation was not emailed: ${info.warning}`, 10000);
      } else if (info.invited?.length) {
        showToast(`Meeting updated — invitation emailed to ${info.invited.join(", ")} (same video link)`, 7000);
      } else {
        showToast("Meeting updated successfully");
      }
      closeModal();
    } catch (error) {
      console.error("Error updating meeting:", error);
      showToast("Update failed: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadMeetingFiles = async (meetingId) => {
    if (!meetingId) throw new Error("Meeting saved, but its files could not be uploaded because the meeting ID is missing.");
    const uploaded = [];
    for (const file of meetingFiles) {
      const body = new FormData();
      body.append("file", file);
      const result = await apiRequest(`${API_URL}/${meetingId}/attachments`, { method: "POST", body });
      uploaded.push(result.data);
    }
    setMeetingFiles([]);
    return uploaded;
  };

  // DELETE — Remove meeting
  const deleteMeetingApi = async (id) => {
    if (!window.confirm("Are you sure you want to delete this meeting?")) return;
    setDeleting(id);
    try {
      const result = await apiRequest(`${API_URL}/${id}`, { method: "DELETE" });
      setMeetings((prev) => prev.filter((m) => getMeetingId(m) !== id));
      setExpandedMeeting(null);
      showToast(result?.warning ? `Meeting deleted, but ${result.warning}` : "Meeting deleted", result?.warning ? 10000 : undefined);
    } catch (error) {
      console.error("Error deleting meeting:", error);
      showToast("Failed to delete meeting: " + error.message);
    } finally {
      setDeleting(null);
    }
  };

  // Calendar drag — move meeting date (optimistic + sync to backend)
  const moveMeetingToDate = async (meetingId, newDate) => {
    const meeting = meetings.find((m) => getMeetingId(m) === meetingId);
    if (!meeting) return;

    // Optimistic UI update
    setMeetings((prev) =>
      prev.map((m) => (getMeetingId(m) === meetingId ? { ...m, date: newDate } : m))
    );
    showToast("Meeting moved to " + formatDate(newDate));

    try {
      await apiRequest(`${API_URL}/${meetingId}`, {
        method: "PUT",
        body: JSON.stringify(mapToBackend({ ...meeting, date: newDate }, users)),
      });
    } catch (error) {
      console.error("Error moving meeting:", error);
      showToast("Failed to sync meeting date");
      fetchMeetings(); // revert on failure
    }
  };

  /* ===================== FORM HELPERS ===================== */

  // Instant Meeting — a MoM that starts now (1 hour); its call opens as soon as it is saved
  const openInstantMeeting = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEditingId(null);
    setInstantMode(true);
    setMeetingFiles([]);
    setForm({
      ...emptyMeeting,
      name: `Instant meeting · ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
      date: localDate(start),
      startTime: localTime(start),
      // a meeting can't run past midnight — stop at 23:59 instead
      endTime: localDate(end) === localDate(start) ? localTime(end) : "23:59",
      wantsMeet: true,
      googleMeetLink: "",
      points: [{ id: Date.now(), title: "", completed: false }],
      actions: [],
    });
    setShowModal(true);
  };

  const openNewMeeting = (prefillDate) => {
    setEditingId(null);
    setInstantMode(false);
    setMeetingFiles([]);
    setForm({
      ...emptyMeeting,
      date: prefillDate || new Date().toISOString().split("T")[0],
      googleMeetLink: "",
      points: [{ id: Date.now(), title: "", completed: false }],
    });
    setShowModal(true);
  };

  const openEditMeeting = (meeting) => {
    const mid = getMeetingId(meeting);
    setEditingId(mid);
    setInstantMode(false);
    setMeetingFiles([]);
    setForm({
      ...meeting,
      departments: [...meeting.departments],
      members: [...meeting.members],
      points: meeting.points.map((p) => ({ ...p })),
      actions: meeting.actions.map((a) => ({ ...a })),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setInstantMode(false);
    setShowActionForm(false);
    setMeetingFiles([]);
  };

  const selectMeetingFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const invalid = files.find((file) => file.size > MAX_MEETING_FILE_SIZE);
    if (invalid) {
      showToast(`${invalid.name} is larger than the 8 MB limit.`);
      event.target.value = "";
      return;
    }
    setMeetingFiles((current) => [...current, ...files]);
    event.target.value = "";
  };

  const handleInputChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDepartment = (department) => {
    setForm((prev) => {
      const nextDepartments = prev.departments.includes(department)
        ? prev.departments.filter((d) => d !== department)
        : [...prev.departments, department];
      const availableNames = users
        .filter((user) => nextDepartments.length === 0 || nextDepartments.includes(user.department))
        .map((user) => user.name);
      return {
        ...prev,
        departments: nextDepartments,
        members: prev.members.filter((member) => availableNames.includes(member)),
      };
    });
  };

  const toggleMember = (memberName) => {
    setForm((prev) => ({
      ...prev,
      members: prev.members.includes(memberName)
        ? prev.members.filter((m) => m !== memberName)
        : [...prev.members, memberName],
    }));
  };

  const updatePoint = (id, value) => {
    setForm((prev) => ({
      ...prev,
      points: prev.points.map((p) => (p.id === id ? { ...p, title: value } : p)),
    }));
  };

  const togglePointComplete = (id) => {
    setForm((prev) => ({
      ...prev,
      points: prev.points.map((p) => (p.id === id ? { ...p, completed: !p.completed } : p)),
    }));
  };

  const addPoint = () => {
    setForm((prev) => ({
      ...prev,
      points: [...prev.points, { id: Date.now(), title: "", completed: false }],
    }));
  };

  const deletePoint = (id) => {
    setForm((prev) => ({ ...prev, points: prev.points.filter((p) => p.id !== id) }));
  };

  const addActionPlan = () => {
    if (!actionForm.title.trim()) { showToast("Enter an action plan"); return; }
    setForm((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          id: Date.now(),
          title: actionForm.title,
          owners: actionForm.owners,
          owner: actionForm.owners.map((o) => o.name).join(", ") || "Unassigned",
          dueDate: actionForm.dueDate || "",
          completed: false,
        },
      ],
    }));
    setActionForm({ title: "", owners: [], dueDate: "" });
    setShowActionForm(false);
  };

  const deleteAction = (id) => {
    setForm((prev) => ({ ...prev, actions: prev.actions.filter((a) => a.id !== id) }));
  };

  const toggleActionComplete = (id) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.map((a) => (a.id === id ? { ...a, completed: !a.completed } : a)),
    }));
  };

  // The link is made by the server when the meeting is saved (never typed in)
  const addGoogleMeet = () => {
    setForm((prev) => ({ ...prev, wantsMeet: true }));
    showToast("A video call link will be created and emailed when you save");
  };

  const removeGoogleMeet = () => {
    setForm((prev) => ({ ...prev, wantsMeet: false }));
  };

  // Recording changes from the MoM card panel.
  const patchMeeting = (id, changes) =>
    setMeetings((prev) => prev.map((m) => (getMeetingId(m) === id ? { ...m, ...changes } : m)));

  const copyMeetLink = (link) => {
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    setCopiedLink(true);
    showToast("Link copied to clipboard");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const saveMeeting = () => {
    if (saving) return;
    if (!form.name || !form.name.trim()) { showToast("Please enter a meeting name"); return; }
    if (!form.date) { showToast("Please select meeting date"); return; }
    if (!form.startTime) { showToast("Please select the meeting start time"); return; }
    if (form.endTime && form.endTime <= form.startTime) {
      showToast("End time must be after the start time");
      return;
    }
    const cleanedPoints = (form.points || []).filter((p) => p.title && p.title.trim() !== "");
    const meetingToSave = {
      ...form,
      name: form.name.trim(),
      points: cleanedPoints,
      status: "Scheduled",
    };
    if (editingId) {
      updateMeeting(editingId, meetingToSave);
    } else if (instantMode) {
      // open the tab now (inside the click) so the browser doesn't block it as a pop-up
      const callTab = window.open("", "_blank");
      createMeeting({ ...meetingToSave, wantsMeet: true }).then((roomId) => {
        if (roomId && callTab) callTab.location.href = `/meet/${roomId}`;
        else if (roomId) window.location.href = `/meet/${roomId}`;
        else callTab?.close();
      });
    } else {
      createMeeting(meetingToSave);
    }
  };

  const clearFilters = () => { setSearch(""); setDateFilter("All Time"); setDayFilter(""); };

  const exportMeetings = () => {
    if (!meetings.length) { showToast("No meetings to export"); return; }
    const headers = ["Meeting Name", "Date", "Departments", "Members", "Status", "Meeting Link", "Points", "Action Plans"];
    const rows = meetings.map((m) => [
      m.name, m.date,
      m.departments.join(" | "),
      m.members.join(" | "),
      m.status,
      meetLinkOf(m) || "N/A",
      m.points.length,
      m.actions.length,
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "minutes-of-meetings.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Exported successfully");
  };

  /* ===================== DERIVED STATE ===================== */

  const availableMembers = useMemo(() => {
    const matching = users.filter((user) =>
      form.departments.length === 0 || form.departments.includes(user.department)
    );
    return matching;
  }, [users, form.departments]);

  const filteredMeetings = useMemo(() => {
    let result = [...meetings];
    if (search.trim()) {
      const value = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(value) ||
          m.departments.some((d) => d.toLowerCase().includes(value)) ||
          m.members.some((mem) => mem.toLowerCase().includes(value))
      );
    }
    if (dayFilter) result = result.filter((m) => m.date === dayFilter);
    if (dateFilter === "This Week") result = result.filter((m) => isThisWeek(m.date));
    if (dateFilter === "This Month") {
      const now = new Date();
      result = result.filter((m) => {
        const d = new Date(m.date + "T00:00:00");
        return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    return result;
  }, [meetings, search, dateFilter, dayFilter]);

  const meetingPage = usePagination(filteredMeetings, { id: "mom", resetKey: `${search}|${dateFilter}|${dayFilter}` });

  const totalMeetings = meetings.length;
  const totalActions = meetings.reduce((t, m) => t + m.actions.length, 0);
  const pendingActions = meetings.reduce((t, m) => t + m.actions.filter((a) => !a.completed).length, 0);
  const thisWeekCount = meetings.filter((m) => isThisWeek(m.date)).length;

  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const calendarPrevDays = new Date(calendarYear, calendarMonth, 0).getDate();

  const calendarMeetingsMap = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      if (!m.date) return;
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    });
    return map;
  }, [meetings]);

  const calendarPrev = () => {
    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
    else setCalendarMonth(calendarMonth - 1);
  };
  const calendarNext = () => {
    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
    else setCalendarMonth(calendarMonth + 1);
  };
  const calendarToday = () => {
    const now = new Date();
    setCalendarMonth(now.getMonth());
    setCalendarYear(now.getFullYear());
  };

  /* ===================== RENDER ===================== */

  return (
    <div className="mom-page">
      <style>{APP_LINK_CSS + `
        * { box-sizing: border-box; }
        .mom-page {
          min-height: 100vh; padding: 28px;
          background: radial-gradient(circle at 8% 5%, rgba(34,211,238,0.15), transparent 28%),
                      radial-gradient(circle at 95% 10%, rgba(20,184,166,0.10), transparent 28%),
                      linear-gradient(145deg, #eefbfd 0%, #f7fbfc 48%, #f3f8fb 100%);
          color: #17324d; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        .mom-container { max-width: 1550px; margin: 0 auto; }
        .mom-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
        .mom-heading { display: flex; align-items: center; gap: 16px; }
        .mom-heading-icon {
          width: 54px; height: 54px; border-radius: 17px; display: flex; align-items: center; justify-content: center;
          color: white; background: linear-gradient(135deg, #075985, #0891b2); box-shadow: 0 12px 25px rgba(8,145,178,0.22);
        }
        .mom-heading h1 { margin: 0; color: #12304c; font-size: 29px; font-weight: 800; letter-spacing: -0.7px; }
        .mom-heading p { margin: 5px 0 0; color: #64809a; font-size: 14px; }
        .mom-top-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .mom-button {
          border: 1px solid #d7e5ed; background: white; color: #23445e; border-radius: 11px; padding: 11px 16px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s;
        }
        .mom-button:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(26,73,99,0.08); }
        .mom-button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .mom-button.primary { border: none; color: white; background: linear-gradient(135deg, #075985, #0e7490); box-shadow: 0 9px 20px rgba(7,89,133,0.22); }
        .mom-button.teal { border: none; color: white; background: linear-gradient(135deg, #0f766e, #0d9488); }
        .mom-button.ghost { border: none; background: transparent; color: #5f7c90; padding: 8px 10px; }
        .mom-button.ghost:hover { color: #087c9e; background: #f0fbfd; }
        .view-toggle { display: flex; border: 1px solid #d7e5ed; border-radius: 11px; overflow: hidden; background: white; }
        .view-toggle-btn {
          padding: 10px 18px; border: none; background: white; color: #5f7c90; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; gap: 7px; cursor: pointer; transition: 0.2s;
        }
        .view-toggle-btn:first-child { border-right: 1px solid #d7e5ed; }
        .view-toggle-btn.active { background: linear-gradient(135deg, #075985, #0e7490); color: white; }
        .mom-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 18px; }
        .mom-stat {
          position: relative; overflow: hidden; min-height: 126px; padding: 20px;
          border: 1px solid #d6e5ed; border-radius: 16px; background: rgba(255,255,255,0.90); box-shadow: 0 8px 22px rgba(39,87,111,0.06);
        }
        .mom-stat::after { content: ""; position: absolute; width: 100px; height: 100px; right: -35px; bottom: -55px; border-radius: 50%; background: rgba(14,165,183,0.06); }
        .mom-stat-label { color: #66839b; font-size: 12px; font-weight: 700; letter-spacing: 0.3px; }
        .mom-stat-value { margin-top: 8px; color: #15334e; font-size: 30px; line-height: 1; font-weight: 800; }
        .mom-stat-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 15px; }
        .mom-stat-note { color: #88a0b2; font-size: 11px; }
        .stat-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
        .stat-icon.blue { color: #087ea4; background: #e5f6fb; }
        .stat-icon.green { color: #059669; background: #e4f8f1; }
        .stat-icon.orange { color: #d97706; background: #fff5dd; }
        .stat-icon.purple { color: #1677a8; background: #f0eaff; }
        .mom-filter-card {
          border: 1px solid #d6e5ed; border-radius: 17px; background: rgba(255,255,255,0.92);
          padding: 20px; margin-bottom: 20px; box-shadow: 0 8px 22px rgba(39,87,111,0.05);
        }
        .mom-filter-title { display: flex; align-items: center; gap: 9px; color: #163852; font-size: 17px; font-weight: 800; margin-bottom: 17px; }
        .mom-filter-title-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: #e5f7fb; color: #087c9e; }
        .mom-filter-grid { display: grid; grid-template-columns: 1.2fr 0.8fr 0.45fr; gap: 14px; }
        .mom-field-label { display: block; margin-bottom: 8px; color: #44647d; font-size: 12px; font-weight: 700; }
        .mom-input-wrap { position: relative; }
        .mom-input-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #7b95a8; }
        .mom-input, .mom-select { width: 100%; height: 43px; border: 1px solid #d9e6ed; border-radius: 10px; background: #f8fbfc; color: #24445c; padding: 0 13px; outline: none; font-size: 13px; }
        .mom-input { padding-left: 39px; }
        .mom-input:focus, .mom-select:focus { border-color: #48b9cf; box-shadow: 0 0 0 3px rgba(72,185,207,0.10); }
        .clear-button { width: 100%; height: 43px; }
        .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; }
        .loading-spinner { animation: spin 1s linear infinite; color: #0891b2; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { margin-top: 12px; color: #607e93; font-size: 13px; font-weight: 700; }
        .calendar-card {
          border: 1px solid #d6e5ed; border-radius: 17px; background: rgba(255,255,255,0.94);
          padding: 20px; box-shadow: 0 8px 22px rgba(39,87,111,0.05);
        }
        .calendar-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .calendar-nav h2 { margin: 0; color: #173a55; font-size: 18px; font-weight: 800; }
        .calendar-nav-actions { display: flex; align-items: center; gap: 8px; }
        .cal-nav-btn { width: 34px; height: 34px; border: 1px solid #d7e5ed; border-radius: 9px; background: white; color: #5f7c90; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.15s; }
        .cal-nav-btn:hover { background: #f0fbfd; color: #087c9e; border-color: #8fd4e0; }
        .cal-today-btn { padding: 7px 14px; border: 1px solid #d7e5ed; border-radius: 9px; background: white; color: #23445e; font-size: 11px; font-weight: 700; cursor: pointer; }
        .cal-today-btn:hover { background: #f0fbfd; }
        .calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 6px; }
        .calendar-weekday { text-align: center; color: #7a93a5; font-size: 10px; font-weight: 800; padding: 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .calendar-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .calendar-day { min-height: 95px; border: 1px solid #e4edf2; border-radius: 11px; background: white; padding: 7px; cursor: default; transition: 0.15s; position: relative; }
        .calendar-day:hover { border-color: #a9dce7; background: #f8fcfd; }
        .calendar-day.other-month { opacity: 0.35; }
        .calendar-day.today { border-color: #0891b2; background: #f0fbfd; }
        .calendar-day.today .day-number { background: linear-gradient(135deg, #075985, #0e7490); color: white; border-radius: 7px; }
        .calendar-day.drag-over { border: 2px dashed #0891b2; background: #e8faff; }
        .day-number { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; color: #3b5e75; font-size: 12px; font-weight: 800; }
        .day-add-btn { position: absolute; top: 7px; right: 7px; width: 22px; height: 22px; border: 1px dashed #9fd4df; border-radius: 6px; background: #f5fcfd; color: #087c99; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: 0.15s; }
        .calendar-day:hover .day-add-btn { opacity: 1; }
        .day-add-btn:hover { background: #d9f4fa; border-style: solid; }
        .day-meetings { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
        .day-meeting-pill { padding: 3px 6px; border-radius: 5px; font-size: 9px; font-weight: 700; cursor: pointer; transition: 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
        .day-meeting-pill:active { cursor: grabbing; }
        .day-meeting-pill.cyan { background: #e8faff; color: #075985; border-left: 2px solid #0891b2; }
        .day-meeting-pill.teal { background: #e4f8f1; color: #0f766e; border-left: 2px solid #0d9488; }
        .day-meeting-pill.violet { background: #f0eaff; color: #1677a8; border-left: 2px solid #16a6b8; }
        .calendar-legend { display: flex; gap: 16px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #e4edf2; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; color: #607e93; font-size: 10px; font-weight: 700; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .legend-dot.cyan { background: #0891b2; }
        .legend-dot.teal { background: #0d9488; }
        .legend-dot.violet { background: #16a6b8; }
        .meeting-list-card { border: 1px solid #d6e5ed; border-radius: 17px; background: rgba(255,255,255,0.94); padding: 20px; box-shadow: 0 8px 22px rgba(39,87,111,0.05); }
        .meeting-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 17px; }
        .meeting-list-header h2 { margin: 0; color: #173a55; font-size: 18px; }
        .meeting-count { color: #7791a3; font-size: 12px; }
        .meeting-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .meeting-card { position: relative; overflow: hidden; border: 1px solid #dce8ee; border-radius: 15px; background: white; transition: 0.2s; }
        .meeting-card:hover { transform: translateY(-2px); box-shadow: 0 13px 28px rgba(32,83,108,0.09); border-color: #a9dce7; }
        .meeting-card-top { height: 5px; background: linear-gradient(90deg, #075985, #06b6d4, #14b8a6); }
        .meeting-card-content { padding: 17px; }
        .meeting-card-head { display: flex; justify-content: space-between; gap: 12px; }
        .meeting-title-row { display: flex; gap: 11px; min-width: 0; flex: 1; }
        .meeting-icon { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #087c9e; background: linear-gradient(135deg, #e8faff, #e1f5f3); }
        .meeting-name { margin: 0; color: #183b56; font-size: 15px; font-weight: 800; }
        .meeting-date { margin-top: 5px; color: #7a93a5; font-size: 11px; display: flex; align-items: center; gap: 5px; }
        .meeting-status { height: fit-content; padding: 5px 8px; border-radius: 20px; font-size: 10px; font-weight: 800; white-space: nowrap; }
        .meeting-status.completed { background: #e7f8f2; color: #07866d; }
        .meeting-status.draft { background: #fff5dd; color: #b45309; }
        .meeting-status.scheduled { background: #e8faff; color: #075985; }
        .meeting-meta { display: flex; flex-wrap: wrap; gap: 7px; margin: 15px 0; }
        .meta-pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 8px; padding: 6px 8px; background: #f4f9fb; color: #607e93; font-size: 10px; font-weight: 700; }
        .meet-link-pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 8px; padding: 6px 8px; background: #f7f0ff; color: #1677a8; font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.15s; }
        .meet-link-pill:hover { background: #ede5ff; }
        .meeting-divider { height: 1px; background: #edf3f6; margin: 13px 0; }
        .meeting-notes-preview { margin: 0 0 12px; color: #607e93; font-size: 11px; line-height: 1.5; white-space: pre-wrap; }
        .meeting-notes { margin: 0; color: #607e93; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
        .meeting-file-list { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; color: #607e93; font-size: 11px; }
        .meeting-file-link { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 2px 0; color: #087c9e; font: inherit; text-align: left; cursor: pointer; }
        .meeting-file-link:hover { text-decoration: underline; }
        .meeting-recording-panel { margin-top: 12px; padding: 12px; border: 1px solid #dce8ee; border-radius: 11px; background: white; }
        .meeting-recording-heading { display: flex; align-items: center; gap: 6px; color: #264b64; font-size: 11px; font-weight: 800; }
        .meeting-recording-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: #607e93; font-size: 10px; }
        .meeting-recording-row span { flex: 1; min-width: 180px; }
        .meeting-recording-row button { display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border: 1px solid #dce8ee; border-radius: 7px; background: white; color: #087c9e; cursor: pointer; }
        .meeting-recording-row button:disabled { opacity: .5; cursor: wait; }
        .meeting-recording-video { width: 100%; max-height: 340px; margin-top: 10px; border-radius: 8px; background: #0b1f2e; }
        .meeting-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .summary-box { padding: 9px; border-radius: 9px; background: #f7fafb; }
        .summary-label { color: #8ba0af; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-value { margin-top: 3px; color: #23465f; font-size: 13px; font-weight: 800; }
        .meeting-actions-row { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
        .meeting-action-buttons { display: flex; gap: 6px; }
        .icon-button { width: 32px; height: 32px; border: 1px solid #dce8ee; border-radius: 8px; background: white; color: #5f7c90; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-button:hover { color: #087c9e; border-color: #8fd4e0; background: #f0fbfd; }
        .icon-button.danger:hover { color: #dc2626; border-color: #fecaca; background: #fff5f5; }
        .icon-button:disabled { opacity: 0.4; cursor: not-allowed; }
        .view-details { border: none; background: transparent; color: #087c9e; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .empty-state { padding: 65px 20px; text-align: center; border: 1px dashed #cddfe7; border-radius: 14px; background: linear-gradient(180deg, #fbfdfe, #f7fbfc); }
        .empty-icon { width: 62px; height: 62px; margin: 0 auto 13px; border-radius: 17px; display: flex; align-items: center; justify-content: center; color: #83a1b3; background: #edf6f8; }
        .empty-state h3 { margin: 0; color: #3e5f75; font-size: 16px; }
        .empty-state p { margin: 7px 0 0; color: #8aa0ae; font-size: 12px; }
        .expanded-panel { border-top: 1px solid #e6eef2; padding: 16px; background: #fbfdfe; }
        .expanded-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .detail-section { padding: 13px; border: 1px solid #e1ebef; border-radius: 12px; background: white; }
        .detail-title { display: flex; align-items: center; gap: 7px; margin-bottom: 11px; color: #264b64; font-size: 12px; font-weight: 800; }
        .detail-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid #edf2f5; color: #5c778b; font-size: 11px; }
        .detail-item:last-child { border-bottom: none; }
        .detail-item svg { flex: 0 0 auto; margin-top: 1px; }
        .meet-link-section { margin-top: 12px; padding: 12px; border: 1px solid #e1d9ff; border-radius: 11px; background: #fbf8ff; }
        .meet-link-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .meet-link-text { color: #123f67; font-size: 11px; font-weight: 700; word-break: break-all; flex: 1; min-width: 120px; }
        .meet-link-copy { padding: 5px 10px; border: 1px solid #d9b4ff; border-radius: 7px; background: white; color: #1677a8; font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .meet-link-copy:hover { background: #f3e8ff; }
        .meet-link-open { padding: 5px 10px; border: none; border-radius: 7px; background: linear-gradient(135deg, #1677a8, #123f67); color: white; font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
        .modal-overlay { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 25px; background: rgba(9,28,42,0.58); backdrop-filter: blur(5px); }
        .modal { width: min(980px, 100%); max-height: 92vh; overflow: hidden; border: 1px solid rgba(255,255,255,0.65); border-radius: 20px; background: #f9fcfd; box-shadow: 0 30px 80px rgba(3,31,48,0.30); display: flex; flex-direction: column; }
        .modal-header { padding: 19px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e1ebef; background: white; }
        .modal-header h2 { margin: 0; color: #152f46; font-size: 18px; }
        .modal-header p { margin: 4px 0 0; color: #7891a1; font-size: 11px; }
        .modal-close { width: 35px; height: 35px; border: 1px solid #dce8ed; border-radius: 9px; background: white; color: #607a8c; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .modal-body { overflow-y: auto; padding: 22px; }
        .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .modal-section { margin-top: 22px; }
        .modal-section:first-child { margin-top: 0; }
        .section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
        .section-heading h3 { margin: 0; color: #23445c; font-size: 13px; }
        .section-heading span { color: #8aa0ae; font-size: 10px; }
        .modal-label { display: block; margin-bottom: 7px; color: #36566d; font-size: 11px; font-weight: 800; }
        .modal-input { width: 100%; height: 42px; border: 1px solid #d9e6ec; border-radius: 10px; outline: none; background: white; color: #24455d; font-size: 12px; padding: 11px 12px; }
        .modal-input:focus { border-color: #45b9cd; box-shadow: 0 0 0 3px rgba(69,185,205,0.09); }
        .selection-grid { display: flex; flex-wrap: wrap; gap: 7px; }
        .selection-pill { border: 1px solid #d8e6ec; background: white; color: #5d7789; padding: 8px 10px; border-radius: 9px; font-size: 10px; font-weight: 700; cursor: pointer; }
        .selection-pill.active { color: #087a91; border-color: #82d1df; background: #e9fafd; }
        .member-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
        .member-option { display: flex; align-items: center; gap: 8px; padding: 9px; border: 1px solid #e0ebef; border-radius: 9px; background: white; cursor: pointer; }
        .member-option.active { border-color: #8ed5df; background: #effbfc; }
        .member-check { width: 16px; height: 16px; border: 1px solid #b9cdd7; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
        .member-option.active .member-check { color: white; background: #0f9d8b; border-color: #0f9d8b; }
        .member-info { min-width: 0; }
        .member-name { color: #34566d; font-size: 11px; font-weight: 800; }
        .member-dept { margin-top: 2px; color: #94a8b5; font-size: 9px; }
        .gmeet-section { margin-top: 14px; }
        .gmeet-card { border: 1px solid #e1d9ff; border-radius: 12px; background: #fbf8ff; padding: 14px; }
        .gmeet-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .gmeet-info { display: flex; align-items: center; gap: 10px; }
        .gmeet-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1677a8, #123f67); color: white; }
        .gmeet-info strong { display: block; color: #4c1d95; font-size: 12px; }
        .gmeet-info span { display: block; margin-top: 2px; color: #16a6b8; font-size: 9px; }
        .gmeet-generate { padding: 9px 16px; border: none; border-radius: 9px; background: linear-gradient(135deg, #1677a8, #123f67); color: white; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: 0.15s; }
        .gmeet-generate:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(109,40,217,0.25); }
        .gmeet-link-box { margin-top: 12px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #d9b4ff; border-radius: 9px; background: white; flex-wrap: wrap; }
        .gmeet-link-text { flex: 1; color: #123f67; font-size: 11px; font-weight: 700; word-break: break-all; min-width: 120px; }
        .gmeet-copy { padding: 6px 10px; border: 1px solid #d9b4ff; border-radius: 7px; background: white; color: #1677a8; font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .gmeet-copy:hover { background: #f3e8ff; }
        .gmeet-open { padding: 6px 10px; border: none; border-radius: 7px; background: linear-gradient(135deg, #1677a8, #123f67); color: white; font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
        .gmeet-remove { padding: 6px 10px; border: 1px solid #fecaca; border-radius: 7px; background: white; color: #dc2626; font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .gmeet-remove:hover { background: #fff5f5; }
        .gmeet-no-link { margin-top: 8px; color: #5fd3dd; font-size: 10px; font-style: italic; }
        .recording-row { display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid #dce8ed; border-radius: 11px; background: white; }
        .recording-info { display: flex; align-items: center; gap: 9px; }
        .recording-icon { width: 33px; height: 33px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #1677a8; background: #e8f4fa; }
        .recording-info strong { display: block; color: #38566b; font-size: 11px; }
        .recording-info span { display: block; margin-top: 2px; color: #91a5b1; font-size: 9px; }
        .toggle { width: 42px; height: 23px; padding: 3px; border: none; border-radius: 20px; background: #d9e4e9; cursor: pointer; }
        .toggle span { display: block; width: 17px; height: 17px; border-radius: 50%; background: white; transition: 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.12); }
        .toggle.active { background: #0d9488; }
        .toggle.active span { transform: translateX(19px); }
        .point-row { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 9px; padding: 8px; border: 1px solid #dce8ed; border-radius: 11px; background: white; margin-bottom: 8px; }
        .point-number { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #087b98; background: #e8f8fb; font-size: 11px; font-weight: 800; }
        .point-input { width: 100%; border: none; outline: none; color: #38586e; background: transparent; font-size: 12px; }
        .point-buttons { display: flex; gap: 4px; }
        .mini-icon { width: 29px; height: 29px; border: 1px solid #e1eaee; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: white; color: #78909f; cursor: pointer; }
        .mini-icon.complete { color: #0b9a84; background: #effaf7; }
        .mini-icon.delete:hover { color: #dc2626; background: #fff5f5; }
        .add-point { border: 1px dashed #9fd4df; background: #f5fcfd; color: #087c99; border-radius: 9px; padding: 8px 11px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
        .action-row { display: grid; grid-template-columns: 1fr 0.65fr 0.65fr auto; gap: 7px; padding: 9px; margin-bottom: 7px; border: 1px solid #dce8ed; border-radius: 10px; background: white; align-items: center; }
        .action-main { display: flex; align-items: center; gap: 7px; }
        .action-main span { color: #47667b; font-size: 10px; }
        .action-value { color: #6f8899; font-size: 10px; }
        .action-add-box { padding: 12px; margin-bottom: 9px; border: 1px solid #dbe9ee; border-radius: 11px; background: #f9fcfd; }
        .action-add-grid { display: grid; grid-template-columns: 1.2fr 0.6fr 0.6fr; gap: 8px; margin-bottom: 8px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 9px; padding: 15px 22px; border-top: 1px solid #e1ebef; background: white; }
        .toast { position: fixed; right: 25px; bottom: 25px; z-index: 10000; padding: 12px 16px; border-radius: 11px; color: white; background: #123f58; box-shadow: 0 12px 30px rgba(10,45,63,0.25); font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; max-width: 420px; }
        @media (max-width: 1050px) { .mom-stats { grid-template-columns: repeat(2, 1fr); } .meeting-grid { grid-template-columns: 1fr; } .mom-filter-grid { grid-template-columns: 1fr 1fr; } .clear-button { grid-column: span 2; } }
        @media (max-width: 700px) { .mom-page { padding: 15px; } .mom-top { align-items: flex-start; flex-direction: column; } .mom-top-actions { width: 100%; } .mom-stats { grid-template-columns: 1fr; } .mom-filter-grid { grid-template-columns: 1fr; } .clear-button { grid-column: auto; } .modal-grid, .expanded-grid, .member-list, .action-add-grid { grid-template-columns: 1fr; } .action-row { grid-template-columns: 1fr; } .modal-overlay { padding: 10px; } .modal { max-height: 96vh; } .calendar-days { gap: 2px; } .calendar-day { min-height: 70px; } .day-meeting-pill { font-size: 8px; } }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .mom-page .meeting-list-header h2 { font-weight: 800; }
        .mom-page .mom-top {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
          align-items: center;
          padding: 28px 30px;
          border-radius: 24px;
        }
        .mom-page .mom-heading h1 { color: var(--ts-on-hero); }
        .mom-page .mom-heading p { color: var(--ts-on-hero-muted); }
        .mom-page .mom-heading-icon { background: var(--ts-glass); border: 1px solid var(--ts-glass-border); box-shadow: none; color: #fff; }
        .mom-page .mom-top .mom-button { background: var(--ts-glass); color: #fff; border-color: var(--ts-glass-border); }
        .mom-page .mom-top .mom-button.ghost { background: transparent; color: #e6fbfd; }
        .mom-page .mom-top .mom-button.primary { background: var(--ts-primary); box-shadow: var(--ts-primary-shadow); }
        .mom-page .mom-button.primary { background: var(--ts-primary); }

      `}</style>

      <div className="mom-container">
        {/* HEADER */}
        <div className="mom-top">
          <div className="mom-heading">
            <div className="mom-heading-icon"><ClipboardList size={27} /></div>
            <div>
              <h1>Minutes of Meetings</h1>
              <p>Record, manage &amp; track meetings with discussion points, action plans &amp; built-in video calls</p>
            </div>
          </div>
          <div className="mom-top-actions">
            <div className="view-toggle">
              <button className={"view-toggle-btn" + (viewMode === "list" ? " active" : "")} onClick={() => setViewMode("list")}>
                <List size={14} /> List
              </button>
              <button className={"view-toggle-btn" + (viewMode === "calendar" ? " active" : "")} onClick={() => setViewMode("calendar")}>
                <Calendar size={14} /> Calendar
              </button>
            </div>
            <button className="mom-button ghost" onClick={fetchMeetings} title="Refresh"><RefreshCw size={15} /></button>
            <button className="mom-button" onClick={exportMeetings} disabled={loading}><Download size={15} /> Export</button>
            <button className="mom-button" onClick={openInstantMeeting} title="Start a video call now and keep its MoM"><Zap size={15} /> Instant Meeting</button>
            <button className="mom-button primary" onClick={() => openNewMeeting()}><Plus size={16} /> New MoM</button>
          </div>
        </div>

        {integration && integration.email && !integration.email.ok && (
          <div
            role="alert"
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 16px", padding: "12px 14px",
              borderRadius: 14, background: "#FFF7E6", border: "1px solid #F3DDA9", color: "#8a5a00", fontSize: 12, lineHeight: 1.5,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div><strong>Invitations can't be emailed.</strong> {integration.email.message}</div>
              <div style={{ marginTop: 4, color: "#a07a2c" }}>
                Meetings and their video links are still created. Once email works, use “Resend invite” on each meeting.
              </div>
            </div>
            <button className="mom-button ghost" onClick={loadIntegration} title="Check again"><RefreshCw size={13} /></button>
          </div>
        )}

        {/* STATS */}
        <div className="mom-stats">
          <div className="mom-stat app-link-card" {...linkProps(clearFilters, "Show all meetings")}>
            <div className="mom-stat-label">TOTAL MEETINGS</div>
            <div className="mom-stat-value">{loading ? "—" : totalMeetings}</div>
            <div className="mom-stat-bottom"><span className="mom-stat-note">Recorded meetings</span><div className="stat-icon blue"><FileText size={20} /></div></div>
          </div>
          <div className="mom-stat">
            <div className="mom-stat-label">ACTION PLANS</div>
            <div className="mom-stat-value">{loading ? "—" : totalActions}</div>
            <div className="mom-stat-bottom"><span className="mom-stat-note">Actions created</span><div className="stat-icon green"><CheckCircle2 size={20} /></div></div>
          </div>
          <div className="mom-stat">
            <div className="mom-stat-label">PENDING ACTIONS</div>
            <div className="mom-stat-value">{loading ? "—" : pendingActions}</div>
            <div className="mom-stat-bottom"><span className="mom-stat-note">Need attention</span><div className="stat-icon orange"><Target size={20} /></div></div>
          </div>
          <div
            className="mom-stat app-link-card"
            {...linkProps(() => { clearFilters(); setDateFilter("This Week"); }, "Show this week's meetings")}
          >
            <div className="mom-stat-label">THIS WEEK</div>
            <div className="mom-stat-value">{loading ? "—" : thisWeekCount}</div>
            <div className="mom-stat-bottom"><span className="mom-stat-note">Meetings scheduled</span><div className="stat-icon purple"><Users size={20} /></div></div>
          </div>
        </div>

        {/* FILTER */}
        <div className="mom-filter-card">
          <div className="mom-filter-title">
            <div className="mom-filter-title-icon"><Search size={16} /></div>
            Search &amp; Filter Meetings
          </div>
          <div className="mom-filter-grid">
            <div>
              <label className="mom-field-label">Search</label>
              <div className="mom-input-wrap">
                <Search size={15} className="mom-input-icon" />
                <input className="mom-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search meetings..." />
              </div>
            </div>
            <div>
              <label className="mom-field-label">Date Range</label>
              <select className="mom-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option>All Time</option><option>This Week</option><option>This Month</option>
              </select>
            </div>
            <div>
              <label className="mom-field-label">Actions</label>
              <button className="mom-button clear-button" onClick={clearFilters}>Clear Filters</button>
            </div>
          </div>
        </div>

        {dayFilter && (
          <div className="app-filter-chips">
            <span>Showing only:</span>
            <button type="button" className="app-filter-chip" onClick={() => setDayFilter("")} title="Show all meetings">
              Meetings on {formatDate(dayFilter)} <X size={12} />
            </button>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="loading-container">
            <Loader2 size={40} className="loading-spinner" />
            <div className="loading-text">Loading meetings...</div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {!loading && viewMode === "calendar" && (
          <div className="calendar-card">
            <div className="calendar-nav">
              <h2>{new Date(calendarYear, calendarMonth).toLocaleString("en-US", { month: "long", year: "numeric" })}</h2>
              <div className="calendar-nav-actions">
                <button className="cal-today-btn" onClick={calendarToday}>Today</button>
                <button className="cal-nav-btn" onClick={calendarPrev}><ChevronLeft size={16} /></button>
                <button className="cal-nav-btn" onClick={calendarNext}><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="calendar-weekdays">
              {CALENDAR_DAYS.map((d) => (<div className="calendar-weekday" key={d}>{d}</div>))}
            </div>
            <div className="calendar-days">
              {Array.from({ length: 42 }).map((_, i) => {
                const dayNum = i - calendarFirstDay + 1;
                let date; let isOther = false; let displayDay;
                if (dayNum < 1) {
                  isOther = true;
                  const prevM = calendarMonth === 0 ? 11 : calendarMonth - 1;
                  const prevY = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
                  displayDay = calendarPrevDays + dayNum;
                  date = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(displayDay).padStart(2, "0")}`;
                } else if (dayNum > calendarDaysInMonth) {
                  isOther = true;
                  const nextM = calendarMonth === 11 ? 0 : calendarMonth + 1;
                  const nextY = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
                  displayDay = dayNum - calendarDaysInMonth;
                  date = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(displayDay).padStart(2, "0")}`;
                } else {
                  displayDay = dayNum;
                  date = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(displayDay).padStart(2, "0")}`;
                }
                const todayStr = new Date().toISOString().split("T")[0];
                const isToday = date === todayStr;
                const dayMeetings = calendarMeetingsMap[date] || [];

                return (
                  <div
                    key={i}
                    className={`calendar-day${isOther ? " other-month" : ""}${isToday ? " today" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                    onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove("drag-over");
                      if (draggedMeeting) moveMeetingToDate(draggedMeeting, date);
                      setDraggedMeeting(null);
                    }}
                  >
                    <span className="day-number">{displayDay}</span>
                    {!isOther && (
                      <button className="day-add-btn" onClick={() => openNewMeeting(date)}>
                        <Plus size={12} />
                      </button>
                    )}
                    <div className="day-meetings">
                      {dayMeetings.slice(0, 2).map((m) => (
                        <div
                          key={getMeetingId(m)}
                          className={`day-meeting-pill ${m.status === "Completed" ? "teal" : "cyan"}`}
                          draggable
                          onDragStart={() => setDraggedMeeting(getMeetingId(m))}
                          onClick={() => setExpandedMeeting(expandedMeeting === getMeetingId(m) ? null : getMeetingId(m))}
                        >
                          {m.name}
                        </div>
                      ))}
                      {dayMeetings.length > 2 && (
                        <div className="day-meeting-pill violet">+{dayMeetings.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="calendar-legend">
              <div className="legend-item"><div className="legend-dot cyan" /> Scheduled</div>
              <div className="legend-item"><div className="legend-dot teal" /> Completed</div>
              <div className="legend-item"><div className="legend-dot violet" /> Overflow</div>
            </div>
          </div>
        )}

        {/* LIST VIEW */}
        {!loading && viewMode === "list" && (
          <div className="meeting-list-card">
            <div className="meeting-list-header">
              <h2>Meetings</h2>
              <span className="meeting-count">{filteredMeetings.length} of {meetings.length} meetings</span>
            </div>
            {filteredMeetings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><FileText size={28} /></div>
                <h3>No meetings found</h3>
                <p>Create a new Meeting or adjust your filters</p>
              </div>
            ) : (
              <>
              <div className="meeting-grid">
                {meetingPage.items.map((m) => {
                  const mid = getMeetingId(m);
                  const isExpanded = expandedMeeting === mid;
                  return (
                    <div className="meeting-card" key={mid}>
                      <div className="meeting-card-top" />
                      <div className="meeting-card-content">
                        <div className="meeting-card-head">
                          <div className="meeting-title-row">
                            <div className="meeting-icon"><FileText size={20} /></div>
                            <div>
                              <h3 className="meeting-name">{m.name}</h3>
                              <div className="meeting-date">
                                <CalendarDays size={12} />{" "}
                                <span
                                  className={canOpen.calendar() ? "app-link" : undefined}
                                  {...(canOpen.calendar() ? linkProps(() => navigate(appLinks.calendar({ date: m.date })), `Tasks on ${formatDate(m.date)} in the Task Calendar`) : {})}
                                >
                                  {formatDate(m.date)}
                                </span>
                                {m.startTime && <> · <Clock3 size={12} /> {formatTime(m.startTime)}{m.endTime ? ` – ${formatTime(m.endTime)}` : ""}</>}
                              </div>
                            </div>
                          </div>
                          <div className={`meeting-status ${m.status.toLowerCase()}`}>{m.status}</div>
                        </div>

                        <div className="meeting-meta">
                          {m.departments.map((d, i) => (
                            <span
                              className={`meta-pill${canOpen.tasks() ? " app-link" : ""}`}
                              key={`dept-${i}-${d}`}
                              {...(canOpen.tasks() ? linkProps(() => navigate(appLinks.tasks({ department: d })), `Open ${d} tasks`) : {})}
                            >
                              <Building2 size={11} /> {d}
                            </span>
                          ))}
                          {m.members.map((mem, i) => (
                            <span
                              className={`meta-pill${canOpen.users() ? " app-link" : ""}`}
                              key={`member-${i}-${mem}`}
                              {...(canOpen.users() ? linkProps(() => navigate(appLinks.users({ search: mem })), `Open ${mem} in Users`) : {})}
                            >
                              <Users size={11} /> {mem}
                            </span>
                          ))}
                          {m.recording && (
                            <span className="meta-pill"><Mic size={11} /> {m.recordingFile ? "Recorded" : "Recording on"}</span>
                          )}
                          {meetLinkOf(m) && (
                            <span className="meet-link-pill" onClick={() => copyMeetLink(meetLinkOf(m))} title="Copy the meeting link">
                              <Video size={11} /> {copiedLink ? "Copied!" : m.videoLink ? "Video link" : "Meet Link"}
                            </span>
                          )}
                        </div>

                        <div className="meeting-divider" />
                        {m.notes && <p className="meeting-notes-preview">{m.notes}</p>}
                        <div className="meeting-summary">
                          <div className="summary-box">
                            <div className="summary-label">Discussion Points</div>
                            <div className="summary-value">{m.points.length}</div>
                          </div>
                          <div className="summary-box">
                            <div className="summary-label">Action Plans</div>
                            <div className="summary-value">{m.actions.length}</div>
                          </div>
                        </div>

                        <div className="meeting-actions-row">
                          <button className="view-details" onClick={() => setExpandedMeeting(isExpanded ? null : mid)}>
                            {isExpanded ? <><ChevronUp size={13} /> Hide Details</> : <><ChevronDown size={13} /> View Details</>}
                          </button>
                          <div className="meeting-action-buttons">
                            {(m.videoRoomId || m.googleMeetLink) && m.status !== "Cancelled" && m.status !== "Completed" && (
                              <button
                                className="mom-button primary"
                                style={{ padding: "6px 10px", fontSize: 10 }}
                                onClick={() => openCall(m)}
                                title="Open the video call (it opens shortly before the start time)"
                              >
                                <Video size={12} /> Join call
                              </button>
                            )}
                            {m.wantsMeet && canInvite && (
                              <button
                                className="mom-button"
                                style={{ padding: "6px 10px", fontSize: 10 }}
                                onClick={() => sendInvitation(m)}
                                disabled={inviting === mid}
                                title={meetLinkOf(m) ? "Email the invitation again" : "Create the video call link and email the invitation"}
                              >
                                {inviting === mid ? <Loader2 size={12} className="loading-spinner" /> : <Video size={12} />}
                                {meetLinkOf(m) ? " Resend invite" : " Create video link & send invite"}
                              </button>
                            )}
                            <button className="icon-button" onClick={() => openEditMeeting(m)} title="Edit"><Edit3 size={14} /></button>
                            <button className="icon-button danger" onClick={() => deleteMeetingApi(mid)} disabled={deleting === mid} title="Delete">
                              {deleting === mid ? <Loader2 size={14} className="loading-spinner" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="expanded-panel">
                          <div className="expanded-grid">
                            <div className="detail-section">
                              <div className="detail-title"><ClipboardList size={14} /> Discussion Points</div>
                              {m.points.length === 0 && <div style={{ color: "#8ba0af", fontSize: 11 }}>No points recorded</div>}
                              {m.points.map((p) => (
                                <div className="detail-item" key={p.id}>
                                  {p.completed ? <CheckCircle2 size={13} color="#0d9488" /> : <CircleCheck size={13} />}
                                  <span style={{ textDecoration: p.completed ? "line-through" : "none" }}>{p.title}</span>
                                </div>
                              ))}
                            </div>
                            <div className="detail-section">
                              <div className="detail-title"><Target size={14} /> Action Plans</div>
                              {m.actions.length === 0 && <div style={{ color: "#8ba0af", fontSize: 11 }}>No action plans</div>}
                              {m.actions.map((a) => (
                                <div className="detail-item" key={a.id}>
                                  {a.completed ? <CheckCircle2 size={13} color="#0d9488" /> : <Clock3 size={13} />}
                                  <div style={{ flex: 1 }}>
                                    <div style={{ textDecoration: a.completed ? "line-through" : "none" }}>{a.title}</div>
                                    <div style={{ fontSize: 9, color: "#8ba0af", marginTop: 2 }}>
                                      {a.owner} {a.dueDate && "· Due " + formatDate(a.dueDate)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {m.recordingFile && (
                            <MeetingRecordingPanel
                              meeting={m}
                              canEdit={canEditMedia}
                              currentUserName={sessionUser?.name}
                              notify={showToast}
                              onChanged={(changes) => patchMeeting(mid, changes)}
                            />
                          )}
                          {m.notes && (
                            <div className="meet-link-section">
                              <div className="detail-title"><FileText size={14} /> Meeting notes</div>
                              <p className="meeting-notes">{m.notes}</p>
                            </div>
                          )}
                          {m.attachments?.length > 0 && (
                            <div className="meet-link-section">
                              <div className="detail-title"><Paperclip size={14} /> Shared files</div>
                              <div className="meeting-file-list">
                                {m.attachments.map((file) => (
                                  <button key={file.filename} className="meeting-file-link" type="button" onClick={() => downloadMeetingFile(file).catch((error) => showToast(error.message))}>
                                    <Paperclip size={12} /> {file.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {meetLinkOf(m) && (
                            <div className="meet-link-section">
                              <div className="meet-link-row">
                                <Video size={14} color="#1677a8" />
                                <span className="meet-link-text">{meetLinkOf(m)}</span>
                                <button className="meet-link-copy" onClick={() => copyMeetLink(meetLinkOf(m))}><Copy size={10} /> Copy</button>
                                <button className="meet-link-open" type="button" onClick={() => openCall(m)}><ExternalLink size={10} /> Join</button>
                              </div>
                              {m.videoLink && (
                                <div style={{ fontSize: 10.5, color: "#6E8799", marginTop: 6 }}>
                                  Built-in video call · opens 15 minutes before the start and closes 30 minutes after the end · only invited members can join
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination {...meetingPage} label="meetings" />
              </>
            )}
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2>{editingId ? "Edit Meeting" : instantMode ? "Instant Meeting" : "New Meeting"}</h2>
                  <p>{instantMode
                    ? "Starts now — pick who should join. The call opens as soon as you start it; record it from inside the call."
                    : "Fill in the meeting details, points, and action plans"}</p>
                </div>
                <button className="modal-close" onClick={closeModal}><X size={16} /></button>
              </div>
              <div className="modal-body">
                <div className="modal-grid">
                  <div>
                    <label className="modal-label">Meeting Name *</label>
                    <input className="modal-input" value={form.name} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="e.g., Weekly Sync" />
                  </div>
                  <div>
                    <label className="modal-label">Date *</label>
                    <input className="modal-input" type="date" value={form.date} onChange={(e) => handleInputChange("date", e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-label">Start Time *</label>
                    <input className="modal-input" type="time" value={form.startTime || ""} onChange={(e) => handleInputChange("startTime", e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-label">End Time</label>
                    <input className="modal-input" type="time" value={form.endTime || ""} onChange={(e) => handleInputChange("endTime", e.target.value)} />
                  </div>
                </div>

                <div className="modal-section">
                  <div className="section-heading"><h3>Departments</h3><span>{form.departments.length} selected</span></div>
                  <div className="selection-grid">
                    {masterDataLoading && departments.length === 0 ? (
                      <span className="member-dept">Loading departments...</span>
                    ) : departments.length ? departments.map((department) => (
                      <button type="button" key={department} className={`selection-pill${form.departments.includes(department) ? " active" : ""}`} onClick={() => toggleDepartment(department)}>{department}</button>
                    )) : (
                      <span className="member-dept">No departments found. Add departments in User Management first.</span>
                    )}
                  </div>
                </div>

                <div className="modal-section">
                  <div className="section-heading">
                    <h3>Users / Members</h3>
                    <span>{form.members.length} selected</span>
                  </div>
                  {form.departments.length > 0 && (
                    <p className="member-dept" style={{ margin: "-6px 0 12px" }}>
                      Showing users from: {form.departments.join(", ")}
                    </p>
                  )}
                  <div className="member-list">
                    {masterDataLoading && users.length === 0 ? (
                      <div className="member-dept">Loading users...</div>
                    ) : availableMembers.length ? availableMembers.map((member) => (
                      <div key={member.id} className={`member-option${form.members.includes(member.name) ? " active" : ""}`} onClick={() => toggleMember(member.name)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleMember(member.name); }}>
                        <div className="member-check">{form.members.includes(member.name) && <CheckCircle2 size={11} />}</div>
                        <div className="member-info">
                          <div className="member-name">{member.name}</div>
                          <div className="member-dept">{[member.department, member.email].filter(Boolean).join(" · ") || "No department assigned"}</div>
                        </div>
                      </div>
                    )) : (
                      <div className="member-dept" style={{ padding: 12 }}>
                        {users.length === 0 ? "No users found. Create users in User Management first." : "No users belong to the selected department(s)."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-section gmeet-section">
                  <div className="section-heading">
                    <h3>Video call</h3>
                    {!meetLinkOf(form) && !form.wantsMeet && (
                      <button className="gmeet-generate" onClick={addGoogleMeet}><Video size={13} /> Add video call</button>
                    )}
                  </div>
                  <div className="gmeet-card">
                    <div className="gmeet-header">
                      <div className="gmeet-info">
                        <div className="gmeet-icon"><Video size={18} /></div>
                        <div>
                          <strong>Built-in video call</strong>
                          <span>A private link for the scheduled date &amp; time, emailed to members</span>
                        </div>
                      </div>

                    </div>
                    {meetLinkOf(form) ? (
                      <div className="gmeet-link-box">
                        <span className="gmeet-link-text">{meetLinkOf(form)}</span>
                        <button className="gmeet-copy" onClick={() => copyMeetLink(meetLinkOf(form))}>
                          <Copy size={10} /> {copiedLink ? "Copied!" : "Copy"}
                        </button>
                        <button className="gmeet-open" type="button" onClick={() => openCall(form)}>
                          <ExternalLink size={10} /> Join
                        </button>
                      </div>
                    ) : form.wantsMeet ? (
                      <div className="gmeet-link-box">
                        <span className="gmeet-link-text">A private video call link for the chosen date &amp; time is created and emailed to members when you save.</span>
                        {!editingId && (
                          <button className="gmeet-remove" onClick={removeGoogleMeet}>
                            <Trash2 size={10} /> No video call (in-person)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="gmeet-no-link">In-person meeting — no video call</div>
                    )}
                  </div>
                </div>

                <div className="modal-section">
                  <div className="section-heading"><h3>Recording</h3></div>
                  <div className="recording-row">
                    <div className="recording-info">
                      <div className="recording-icon">{form.recording ? <Mic size={16} /> : <MicOff size={16} />}</div>
                      <div>
                        <strong>Record Whole Meeting</strong>
                        <span>Adds a “Start recording” button on this MoM card — records the Google Meet tab (all voices + screen) from your browser</span>
                      </div>
                    </div>
                    <button
                      className={"toggle" + (form.recording ? " active" : "")}
                      onClick={() => handleInputChange("recording", !form.recording)}
                    >
                      <span />
                    </button>
                  </div>
                </div>

                <div className="modal-section">
                  <div className="section-heading"><h3>Notes &amp; files</h3><span>Files up to 8 MB</span></div>
                  <label className="modal-label" htmlFor="meeting-notes">Meeting notes</label>
                  <textarea
                    id="meeting-notes"
                    className="modal-input"
                    rows={4}
                    value={form.notes || ""}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder="Add notes for this meeting..."
                  />
                  {form.attachments?.length > 0 && (
                    <div className="meeting-file-list" style={{ margin: "8px 0" }}>
                      <strong>Existing files</strong>
                      {form.attachments.map((file) => (
                        <button key={file.filename} className="meeting-file-link" type="button" onClick={() => downloadMeetingFile(file).catch((error) => showToast(error.message))}>
                          <Paperclip size={12} /> {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="modal-label" htmlFor="meeting-files" style={{ marginTop: 10 }}>Add attachments</label>
                  <input id="meeting-files" className="modal-input" type="file" accept={MEETING_FILE_TYPES} multiple onChange={selectMeetingFiles} />
                  {meetingFiles.length > 0 && (
                    <div className="meeting-file-list" style={{ marginTop: 8 }}>
                      {meetingFiles.map((file, index) => (
                        <span className="meeting-file-link" key={`${file.name}-${index}`}><Paperclip size={12} /> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="modal-section">
                  <div className="section-heading"><h3>Discussion Points</h3><span>{form.points.length} points</span></div>
                  {form.points.map((p, idx) => (
                    <div className="point-row" key={p.id}>
                      <div className="point-number">{idx + 1}</div>
                      <input
                        className="point-input"
                        value={p.title}
                        onChange={(e) => updatePoint(p.id, e.target.value)}
                        placeholder="Enter discussion point..."
                      />
                      <div className="point-buttons">
                        <button
                          className={"mini-icon" + (p.completed ? " complete" : "")}
                          onClick={() => togglePointComplete(p.id)}
                          title="Toggle complete"
                        >
                          {p.completed ? <CheckCircle2 size={13} /> : <CircleCheck size={13} />}
                        </button>
                        <button className="mini-icon delete" onClick={() => deletePoint(p.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="add-point" onClick={addPoint}><PlusCircle size={12} /> Add Point</button>
                </div>

                <div className="modal-section">
                  <div className="section-heading"><h3>Action Plans</h3><span>{form.actions.length} actions</span></div>

                  {showActionForm && (
                    <div className="action-add-box">
                      <div className="action-add-grid">
                        <div>
                          <label className="modal-label">Action Title *</label>
                          <input
                            className="modal-input"
                            value={actionForm.title}
                            onChange={(e) => setActionForm((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g., Prepare report"
                          />
                        </div>
                        <div>
                          <label className="modal-label">Owners (select one or more)</label>
                          <div className="selection-grid" style={{ maxHeight: 120, overflowY: "auto" }}>
                            {(form.members.length
                              ? users.filter((u) => form.members.includes(u.name))
                              : users
                            ).map((u) => {
                              const active = actionForm.owners.some((o) => o.name === u.name);
                              return (
                                <button
                                  type="button"
                                  key={u.id}
                                  className={`selection-pill${active ? " active" : ""}`}
                                  onClick={() =>
                                    setActionForm((prev) => ({
                                      ...prev,
                                      owners: active
                                        ? prev.owners.filter((o) => o.name !== u.name)
                                        : [...prev.owners, { userId: u.id, name: u.name, email: u.email }],
                                    }))
                                  }
                                >
                                  {u.name}
                                </button>
                              );
                            })}
                            {users.length === 0 && <span className="member-dept">No users available</span>}
                          </div>
                          {form.members.length > 0 && (
                            <span className="member-dept">Showing this meeting's members</span>
                          )}
                        </div>
                        <div>
                          <label className="modal-label">Due Date</label>
                          <input
                            className="modal-input"
                            type="date"
                            value={actionForm.dueDate}
                            onChange={(e) => setActionForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="mom-button primary" onClick={addActionPlan}><Save size={13} /> Add Action</button>
                        <button className="mom-button" onClick={() => setShowActionForm(false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {form.actions.map((a) => (
                    <div className="action-row" key={a.id}>
                      <div className="action-main">
                        <button
                          className={"mini-icon" + (a.completed ? " complete" : "")}
                          onClick={() => toggleActionComplete(a.id)}
                        >
                          {a.completed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                        </button>
                        <span style={{ textDecoration: a.completed ? "line-through" : "none" }}>{a.title}</span>
                      </div>
                      <span className="action-value"><Users size={11} /> {a.owner}</span>
                      <span className="action-value">{a.dueDate ? "Due " + formatDate(a.dueDate) : "No due date"}</span>
                      <button className="mini-icon delete" onClick={() => deleteAction(a.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {!showActionForm && (
                    <button className="add-point" onClick={() => setShowActionForm(true)}>
                      <PlusCircle size={12} /> Add Action Plan
                    </button>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button className="mom-button" onClick={closeModal}>Cancel</button>
                <button className="mom-button primary" onClick={saveMeeting} disabled={saving}>
                  {saving ? <Loader2 size={14} className="loading-spinner" /> : instantMode ? <Zap size={14} /> : <CalendarDays size={14} />}
                  {editingId ? "Update Scheduled Meeting" : instantMode ? "Start Meeting Now" : "Schedule Meeting"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div className="toast"><AlertCircle size={15} /> {toast}</div>
        )}
      </div>
    </div>
  );
};

export default MinutesOfMeeting;