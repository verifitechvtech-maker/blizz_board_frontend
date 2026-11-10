import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, LogIn, Send, PlayCircle } from "lucide-react";
import API from "../../api/config";

/* =========================================================
   TASK PAGE FROM THE ASSIGNMENT EMAIL — /task-action/:token
   • public: the signed link in the email is the permission (no login)
   • opening it marks the task "viewed" for the person who assigned it
   • the status only changes when the button here is clicked
     (?status=… from the email just preselects it)
   • every change shows in the application right away
========================================================= */

const STATUS_COLORS = {
  "To Do": ["#EEF4F7", "#4F6F7A"],
  "In Progress": ["#E6F7FA", "#087C9E"],
  Review: ["#FFF6E5", "#B54708"],
  Completed: ["#E8F7F0", "#0F8A5F"],
};

const ACTION_LABELS = {
  "In Progress": { label: "Start working", hint: "Move the task to In Progress", Icon: PlayCircle },
  Review: { label: "Send for review", hint: "Done — ask the assigner to check it", Icon: Send },
};

const formatDate = (value, time) => {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not set";
  const day = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  return time ? `${day}, ${time}` : day;
};

const TaskEmailAction = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const wanted = params.get("status") || "";

  const [state, setState] = useState("loading"); // loading · ready · error
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const viewed = useRef(false);

  useEffect(() => {
    API.get(`/api/task-email/${encodeURIComponent(token)}`)
      .then((res) => {
        const data = res.data?.data;
        setTask(data);
        setChoice(data?.options?.includes(wanted) ? wanted : "");
        setState("ready");
        // "viewed" comes from this page's script, so link scanners don't count
        if (!viewed.current) {
          viewed.current = true;
          API.post(`/api/task-email/${encodeURIComponent(token)}/view`).catch(() => {});
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || "This task link is not valid.");
        setState("error");
      });
  }, [token, wanted]);

  const submit = async () => {
    if (!choice || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await API.post(`/api/task-email/${encodeURIComponent(token)}/status`, { status: choice, note });
      setTask(res.data?.data || task);
      setMessage(res.data?.message || "Status updated.");
      setChoice("");
      setNote("");
    } catch (err) {
      if (err.response?.data?.data) setTask(err.response.data.data);
      setMessage(err.response?.data?.message || "Could not update the task.");
    } finally {
      setBusy(false);
    }
  };

  const [statusBg, statusFg] = STATUS_COLORS[task?.status] || STATUS_COLORS["To Do"];

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.brand}>Task Management Blizz board</div>
          <div style={styles.headerTitle}><ClipboardCheck size={20} /> Your task</div>
        </div>

        <div style={styles.body}>
          {state === "loading" && (
            <div style={styles.center}><Loader2 size={22} className="tea-spin" /> Loading the task…</div>
          )}

          {state === "error" && (
            <div style={styles.center}>
              <AlertTriangle size={28} color="#B54708" />
              <p style={{ margin: 0 }}>{error}</p>
              <Link to="/login" style={styles.secondary}><LogIn size={14} /> Open the application</Link>
            </div>
          )}

          {state === "ready" && task && (
            <>
              <div style={styles.titleRow}>
                <h1 style={styles.h1}>{task.name}</h1>
                {task.referenceId && <span style={styles.ref}>#{task.referenceId}</span>}
              </div>
              <span style={{ ...styles.status, background: statusBg, color: statusFg }}>{task.status}</span>

              <table style={styles.table}>
                <tbody>
                  <tr><td style={styles.k}>Assigned to</td><td>{task.assignee}</td></tr>
                  {task.assignedBy && <tr><td style={styles.k}>Assigned by</td><td>{task.assignedBy}</td></tr>}
                  {task.department && <tr><td style={styles.k}>Department</td><td>{task.department}</td></tr>}
                  <tr><td style={styles.k}>Priority</td><td>{task.priority}</td></tr>
                  {task.startDate && <tr><td style={styles.k}>Start</td><td>{formatDate(task.startDate)}</td></tr>}
                  <tr><td style={styles.k}>Deadline</td><td>{formatDate(task.dueDate, task.dueTime)}</td></tr>
                </tbody>
              </table>
              {task.description && <p style={styles.desc}>{task.description}</p>}

              {message && (
                <div style={styles.notice} role="status"><CheckCircle2 size={15} /> {message}</div>
              )}

              {task.options.length > 0 ? (
                <div style={styles.update}>
                  <div style={styles.updateTitle}>Update the status</div>
                  <div style={styles.choices}>
                    {task.options.map((status) => {
                      const { label, hint, Icon } = ACTION_LABELS[status] || { label: status, hint: "", Icon: Send };
                      const active = choice === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setChoice(status)}
                          aria-pressed={active}
                          style={{ ...styles.choice, ...(active ? styles.choiceActive : null) }}
                        >
                          <Icon size={16} />
                          <span>
                            <strong style={{ display: "block" }}>{label}</strong>
                            <small style={{ color: active ? "#d9f6f9" : "#6E8799" }}>{hint}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note for the person who assigned it (optional)"
                    maxLength={1000}
                    rows={3}
                    style={styles.note}
                  />
                  <button type="button" onClick={submit} disabled={!choice || busy} style={{ ...styles.primary, opacity: !choice || busy ? 0.55 : 1 }}>
                    {busy ? <Loader2 size={15} className="tea-spin" /> : <CheckCircle2 size={15} />}
                    {choice ? `Confirm: ${ACTION_LABELS[choice]?.label || choice}` : "Choose an update above"}
                  </button>
                </div>
              ) : (
                <p style={styles.muted}>
                  {task.status === "Review"
                    ? "This task is waiting for review by the person who assigned it."
                    : task.status === "Completed"
                    ? "This task is completed."
                    : "There is nothing to update from here."}
                </p>
              )}

              {task.history.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={styles.updateTitle}>Recent updates</div>
                  {task.history.map((h, i) => (
                    <div key={i} style={styles.history}>
                      <strong>{h.from || "New"} → {h.to}</strong>
                      <span>{h.by ? ` · ${h.by}` : ""}{h.at ? ` · ${new Date(h.at).toLocaleString()}` : ""}</span>
                      {h.note && <div style={{ color: "#6E8799" }}>{h.note}</div>}
                    </div>
                  ))}
                </div>
              )}

              <Link to="/dashboard/tasks" style={{ ...styles.secondary, marginTop: 18 }}><LogIn size={14} /> Open in the application</Link>
            </>
          )}
        </div>
      </div>
      <style>{`.tea-spin{animation:teaSpin 1s linear infinite}@keyframes teaSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const styles = {
  page: { minHeight: "100vh", background: "#F2F8FA", padding: "32px 12px", fontFamily: "Segoe UI, Arial, sans-serif", color: "#123B5D", boxSizing: "border-box" },
  card: { maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #D5E7EE", boxShadow: "0 10px 30px rgba(18,59,93,.08)" },
  header: { background: "linear-gradient(135deg,#063b46,#0b8f87)", padding: "20px 24px", color: "#fff" },
  brand: { fontSize: 11, letterSpacing: 2, opacity: 0.8, textTransform: "uppercase" },
  headerTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 700, marginTop: 4 },
  body: { padding: "22px 24px", fontSize: 14, lineHeight: 1.55 },
  center: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0", textAlign: "center", color: "#4F6F7A" },
  titleRow: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  h1: { margin: 0, fontSize: 20, color: "#123B5D" },
  ref: { fontSize: 12, fontWeight: 800, color: "#087C9E", background: "#E6F7FA", borderRadius: 999, padding: "2px 8px" },
  status: { display: "inline-block", marginTop: 8, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 800 },
  table: { width: "100%", borderCollapse: "collapse", margin: "14px 0", fontSize: 13 },
  k: { padding: "5px 0", color: "#6E8799", width: 120 },
  desc: { color: "#4F6F7A", whiteSpace: "pre-wrap", margin: "0 0 12px" },
  notice: { display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderRadius: 10, background: "#E8F7F0", color: "#0F6A4A", fontWeight: 600, fontSize: 13, margin: "10px 0" },
  update: { marginTop: 10, padding: 14, border: "1px solid #D5E7EE", borderRadius: 12, background: "#F7FBFC" },
  updateTitle: { fontSize: 12, fontWeight: 800, color: "#264B64", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  choices: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 },
  choice: { display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid #D5E7EE", background: "#fff", color: "#123B5D", cursor: "pointer", fontSize: 13 },
  choiceActive: { background: "#16A6B8", borderColor: "#16A6B8", color: "#fff" },
  note: { width: "100%", boxSizing: "border-box", marginTop: 10, padding: 10, borderRadius: 9, border: "1px solid #D5E7EE", font: "inherit", fontSize: 13, resize: "vertical" },
  primary: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 10, padding: "11px 16px", border: 0, borderRadius: 10, background: "#16A6B8", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondary: { display: "inline-flex", alignItems: "center", gap: 6, color: "#087C9E", fontWeight: 700, fontSize: 13, textDecoration: "none" },
  muted: { color: "#6E8799", fontSize: 13, marginTop: 12 },
  history: { fontSize: 12.5, padding: "7px 0", borderTop: "1px solid #EEF4F7" },
};

export default TaskEmailAction;
