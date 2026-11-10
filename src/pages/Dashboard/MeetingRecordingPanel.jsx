import React, { useEffect, useState } from "react";
import { Download, Loader2, Play, Trash2, Video } from "lucide-react";
import API from "../../api/config";

const formatSize = (bytes = 0) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const MeetingRecordingPanel = ({ meeting, canEdit, onChanged, notify }) => {
  const meetingId = meeting._id || meeting.id;
  const recording = meeting.recordingFile;
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const loadRecording = async (download) => {
    setBusy(download ? "download" : "play");
    try {
      const response = await API.get(`/api/meetings/${meetingId}/recording`, { responseType: "blob" });
      const nextUrl = URL.createObjectURL(response.data);
      if (download) {
        const link = document.createElement("a");
        link.href = nextUrl;
        link.download = recording?.name || "meeting-recording";
        link.click();
        URL.revokeObjectURL(nextUrl);
      } else {
        setUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return nextUrl;
        });
      }
    } catch (error) {
      notify(error.response?.data?.message || "Could not load the meeting recording.");
    } finally {
      setBusy("");
    }
  };

  const deleteRecording = async () => {
    setBusy("delete");
    try {
      await API.delete(`/api/meetings/${meetingId}/recording`);
      setUrl("");
      onChanged({ recording: false, recordingFile: null });
      notify("Recording deleted.");
    } catch (error) {
      notify(error.response?.data?.message || "Could not delete the meeting recording.");
    } finally {
      setBusy("");
    }
  };

  if (!recording) return null;

  return (
    <section className="meeting-recording-panel">
      <div className="meeting-recording-heading"><Video size={14} /> Meeting recording</div>
      <div className="meeting-recording-row">
        <span>{recording.name} · {formatSize(recording.size)}</span>
        <button type="button" onClick={() => loadRecording(false)} disabled={Boolean(busy)}>
          {busy === "play" ? <Loader2 size={12} className="loading-spinner" /> : <Play size={12} />} Play
        </button>
        <button type="button" onClick={() => loadRecording(true)} disabled={Boolean(busy)}>
          {busy === "download" ? <Loader2 size={12} className="loading-spinner" /> : <Download size={12} />} Download
        </button>
        {canEdit && (
          <button type="button" onClick={deleteRecording} disabled={Boolean(busy)} aria-label="Delete recording">
            {busy === "delete" ? <Loader2 size={12} className="loading-spinner" /> : <Trash2 size={12} />}
          </button>
        )}
      </div>
      {url && <video className="meeting-recording-video" src={url} controls />}
    </section>
  );
};

export default MeetingRecordingPanel;
