import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  Copy,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  AlertCircle,
  MessageCircle,
  Send,
  Paperclip,
  WifiOff,
  NotebookPen,
  Save,
  Circle,
  Square,
} from "lucide-react";
import API from "../../api/config";
import { getSocket } from "../../services/socket";
import { canRecordCalls, startCallRecording } from "./callRecorder";

/* =========================================================
   MoM video call (WebRTC) — /meet/:roomId
   • GET /api/meetings/room/:roomId → meeting, join window, ICE servers (invited people only)
   • Socket.IO "meet:*" events set up the connections; audio/video go browser ↔ browser
   • the newcomer calls everyone already in the room (no offer collisions)
   • meeting chat and shared files are saved to the meeting's MoM
   • call notes are kept as a local draft and added to the MoM's "Meeting notes" on save
   • the organizer / an Admin can record the call; the file is saved to the MoM when stopped
========================================================= */

const fmt = (d) =>
  new Date(d).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

const countdown = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
};

const mediaError = (err) => {
  if (!window.isSecureContext) return "Camera and microphone need a secure (https) connection.";
  if (err?.name === "NotAllowedError") return "Camera / microphone permission was blocked. Allow it from the address bar to be seen and heard.";
  if (err?.name === "NotFoundError") return "No camera or microphone was found. You can still join and listen.";
  if (err?.name === "NotReadableError") return "Your camera or microphone is being used by another app.";
  return "Camera / microphone could not be started. You can still join and listen.";
};

/* ---------- one video tile ---------- */
const Tile = ({ stream, name, muted, audioOff, videoOff, isSelf, screen }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live")) && !videoOff;
  return (
    <div className="mr-tile">
      <video ref={ref} autoPlay playsInline muted={muted} style={{ display: hasVideo ? "block" : "none", transform: isSelf && !screen ? "scaleX(-1)" : "none" }} />
      {!hasVideo && <div className="mr-avatar">{(name || "?").trim().charAt(0).toUpperCase()}</div>}
      <div className="mr-name">
        {audioOff && <MicOff size={12} />}
        {name}
        {isSelf ? " (you)" : ""}
        {screen ? " · sharing screen" : ""}
      </div>
    </div>
  );
};

const MeetingRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading · error · early · ended · lobby · joining · call · left
  const [error, setError] = useState("");
  const [mediaWarning, setMediaWarning] = useState("");
  const [now, setNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0); // server time − this computer's time

  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState({}); // socketId → { name, stream, audio, video, screen }
  const [copied, setCopied] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [panel, setPanel] = useState(() => (typeof window !== "undefined" && window.innerWidth > 900 ? "chat" : null)); // chat · notes · null
  const showChat = panel === "chat";
  const togglePanel = (name) => setPanel((current) => (current === name ? null : name));
  const chatEndRef = useRef(null);
  const [networkLost, setNetworkLost] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [socketConnected, setSocketConnected] = useState(true);

  // in-call notes (draft kept in this browser until saved to the MoM)
  const notesKey = `meet-notes:${roomId}`;
  const [notesText, setNotesText] = useState(() => {
    try {
      return localStorage.getItem(`meet-notes:${roomId}`) || "";
    } catch {
      return "";
    }
  });
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesNotice, setNotesNotice] = useState("");

  // call recording — made in the recorder's browser, uploaded to the MoM when it stops
  const [canRecord, setCanRecord] = useState(false);
  const [recordingInfo, setRecordingInfo] = useState(null); // { by, startedAt } while anyone records
  const [recBusy, setRecBusy] = useState(""); // starting · saving
  const [recNotice, setRecNotice] = useState("");
  const recorderRef = useRef(null);
  const gridRef = useRef(null);
  const saveRecordingRef = useRef(null);

  const pcs = useRef(new Map()); // socketId → RTCPeerConnection
  const pendingIce = useRef(new Map()); // socketId → candidates received before the offer/answer
  const remoteStreams = useRef(new Map()); // socketId → MediaStream
  const localRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stateRef = useRef({ micOn, camOn, sharing });
  stateRef.current = { micOn, camOn, sharing };

  /* ---------- load the meeting ---------- */
  const load = useCallback(async () => {
    try {
      const res = await API.get(`/api/meetings/room/${encodeURIComponent(roomId)}`);
      const data = res.data.data;
      setInfo(data);
      setClockOffset(new Date(data.serverTime).getTime() - Date.now());
      setPhase((p) => (["call", "joining"].includes(p) ? p : data.state === "open" ? "lobby" : data.state));
    } catch (err) {
      setError(err.response?.data?.message || "This meeting could not be loaded.");
      setPhase("error");
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  // clock for the countdown / call timer; opens the lobby when the join window starts
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const serverNow = now + clockOffset;
  useEffect(() => {
    if (phase === "early" && info && serverNow >= new Date(info.opensAt).getTime()) load();
  }, [phase, info, serverNow, load]);

  /* ---------- camera + microphone ---------- */
  useEffect(() => {
    if (phase !== "lobby" || localRef.current) return;
    let cancelled = false;
    (async () => {
      let stream = new MediaStream();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch (err) {
        // try audio only, then nothing
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setMediaWarning("No camera available — you'll join with audio only.");
        } catch {
          setMediaWarning(mediaError(err));
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setMicOn(stream.getAudioTracks().length > 0);
      setCamOn(stream.getVideoTracks().length > 0);
      setLocalStream(stream);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  /* ---------- peer connections ---------- */
  const socket = useMemo(() => getSocket(), []);

  const updatePeer = useCallback((id, patch) => {
    setPeers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }, []);

  const closePeer = useCallback((id) => {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    pendingIce.current.delete(id);
    remoteStreams.current.delete(id);
    setPeers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const localTrackOf = (kind) => {
    if (kind === "video") return screenTrackRef.current || cameraTrackRef.current;
    return localRef.current?.getAudioTracks()[0] || null;
  };

  const createPeer = useCallback(
    (id, initiator) => {
      const pc = new RTCPeerConnection({
        // Google STUN + the organization's TURN relay (from the server; TURN passwords expire)
        iceServers: info?.iceServers?.length ? info.iceServers : [{ urls: "stun:stun.l.google.com:19302" }],
        iceTransportPolicy: info?.iceTransportPolicy === "relay" ? "relay" : "all",
        iceCandidatePoolSize: 4, // gather addresses early → faster connect
      });
      pcs.current.set(id, pc);

      if (initiator) {
        // one audio + one video slot each way, even without a camera (screen share can use it later)
        for (const kind of ["audio", "video"]) {
          const track = localTrackOf(kind);
          pc.addTransceiver(track || kind, { direction: "sendrecv", streams: localRef.current ? [localRef.current] : [] });
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) socket?.emit("meet:signal", { to: id, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        let stream = remoteStreams.current.get(id);
        if (!stream) {
          stream = new MediaStream();
          remoteStreams.current.set(id, stream);
        }
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        updatePeer(id, { stream: new MediaStream(stream.getTracks()) });
        e.track.onunmute = () => updatePeer(id, { stream: new MediaStream(stream.getTracks()) });
      };
      pc.onconnectionstatechange = () => {
        updatePeer(id, { connection: pc.connectionState });
        if (pc.connectionState === "failed" && initiator) pc.restartIce?.();
      };
      pc.onnegotiationneeded = async () => {
        if (!initiator) return; // only the caller sends offers
        try {
          await pc.setLocalDescription(await pc.createOffer());
          socket?.emit("meet:signal", { to: id, description: pc.localDescription.toJSON() });
        } catch (err) {
          console.error("offer failed", err);
        }
      };
      return pc;
    },
    [info, socket, updatePeer]
  );

  const flushIce = async (id, pc) => {
    for (const c of pendingIce.current.get(id) || []) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
    pendingIce.current.delete(id);
  };

  /* ---------- socket events ---------- */
  useEffect(() => {
    if (!socket) return undefined;

    const onSignal = async ({ from, description, candidate }) => {
      try {
        let pc = pcs.current.get(from);
        if (description) {
          if (!pc) pc = createPeer(from, false);
          await pc.setRemoteDescription(description);
          if (description.type === "offer") {
            // answer with our microphone / camera in the caller's slots
            for (const t of pc.getTransceivers()) {
              const kind = t.receiver.track?.kind;
              if (!kind) continue;
              t.direction = "sendrecv";
              const track = localTrackOf(kind);
              if (track && t.sender.track !== track) await t.sender.replaceTrack(track);
              if (localRef.current && t.sender.setStreams) t.sender.setStreams(localRef.current);
            }
            await pc.setLocalDescription(await pc.createAnswer());
            socket.emit("meet:signal", { to: from, description: pc.localDescription.toJSON() });
          }
          await flushIce(from, pc);
        } else if (candidate) {
          if (pc?.remoteDescription) await pc.addIceCandidate(candidate);
          else pendingIce.current.set(from, [...(pendingIce.current.get(from) || []), candidate]);
        }
      } catch (err) {
        console.error("signal failed", err);
      }
    };
    const onJoined = (p) => updatePeer(p.socketId, { name: p.name, audio: p.audio, video: p.video, screen: p.screen });
    const onLeft = ({ socketId }) => closePeer(socketId);
    const onMedia = ({ socketId, audio, video, screen }) => updatePeer(socketId, { audio, video, screen });
    const onEnded = ({ reason }) => {
      if (recorderRef.current) saveRecordingRef.current?.();
      teardown();
      setError(reason || "The meeting has ended.");
      setPhase("ended");
    };
    // connection dropped and came back → the server forgot us; join again
    const onReconnect = () => {
      if (phaseRef.current === "call") joinCall(true);
    };

    socket.on("meet:signal", onSignal);
    socket.on("meet:peer-joined", onJoined);
    socket.on("meet:peer-left", onLeft);
    socket.on("meet:media", onMedia);
    socket.on("meet:ended", onEnded);
    const onChatMessage = (message) => setChatMessages((previous) =>
      previous.some((item) => item.id === message.id) ? previous : [...previous.slice(-99), message]
    );
    const onDisconnect = () => setSocketConnected(false);
    const onConnect = () => {
      setSocketConnected(true);
      onReconnect();
    };
    const onRecording = ({ on, by, startedAt }) => setRecordingInfo(on ? { by, startedAt } : null);
    socket.on("meet:chat-message", onChatMessage);
    socket.on("meet:recording", onRecording);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    return () => {
      socket.off("meet:signal", onSignal);
      socket.off("meet:peer-joined", onJoined);
      socket.off("meet:peer-left", onLeft);
      socket.off("meet:media", onMedia);
      socket.off("meet:ended", onEnded);
      socket.off("meet:chat-message", onChatMessage);
      socket.off("meet:recording", onRecording);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, createPeer, closePeer, updatePeer]);

  /* ---------- join / leave ---------- */
  const joinCall = useCallback(
    (rejoin = false) => {
      if (!socket) {
        setError("You are signed out. Please sign in again.");
        setPhase("error");
        return;
      }
      if (rejoin) [...pcs.current.keys()].forEach(closePeer);
      setPhase("joining");
      const { micOn: audio, camOn: video, sharing: screen } = stateRef.current;
      socket.emit("meet:join", { roomId, audio, video }, (res) => {
        if (!res?.ok) {
          setError(res?.message || "Could not join the meeting.");
          setPhase(res?.code === "TOO_EARLY" ? "early" : res?.code === "ENDED" || res?.code === "CANCELLED" ? "ended" : "error");
          return;
        }
        setPhase("call");
        setChatMessages(Array.isArray(res.chatMessages) ? res.chatMessages : []);
        setCanRecord(Boolean(res.canRecord));
        setRecordingInfo(res.recording || null);
        // rejoined while still recording here → tell the room again
        if (recorderRef.current && res.canRecord) socket.emit("meet:recording", { on: true });
        socket.emit("meet:media", { audio, video, screen });
        // call everyone who is already here
        for (const p of res.peers) {
          updatePeer(p.socketId, { name: p.name, audio: p.audio, video: p.video, screen: p.screen });
          createPeer(p.socketId, true);
        }
      });
    },
    [socket, roomId, createPeer, closePeer, updatePeer]
  );

  // turn the camera, microphone and screen share off (the camera light goes out)
  const releaseMedia = useCallback(() => {
    localRef.current?.getTracks().forEach((t) => t.stop());
    cameraTrackRef.current?.stop();
    screenTrackRef.current?.stop();
    localRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    setLocalStream(null);
    setSharing(false);
  }, []);

  const teardown = useCallback(() => {
    socket?.emit("meet:leave");
    [...pcs.current.keys()].forEach(closePeer);
    releaseMedia();
  }, [socket, closePeer, releaseMedia]);

  // leaving the page (or closing the tab) leaves the call
  useEffect(() => () => teardown(), [teardown]);
  // the call ended, was left, or could not be joined → never keep the camera on
  useEffect(() => {
    if (!["lobby", "joining", "call"].includes(phase)) releaseMedia();
  }, [phase, releaseMedia]);
  useEffect(() => {
    const onUnload = () => socket?.emit("meet:leave");
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [socket]);

  /* ---------- recording ---------- */
  const saveRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setRecBusy("saving");
    setRecNotice("Saving the recording to the MoM…");
    socket?.emit("meet:recording", { on: false });
    try {
      const { blob, durationSec } = await recorder.stop();
      if (!blob.size) throw new Error("The recording is empty.");
      const body = new FormData();
      body.append("recording", blob, "call-recording.webm");
      body.append("fromCall", "1");
      body.append("durationSec", String(durationSec));
      await API.post(`/api/meetings/${info.meetingId}/recording`, body);
      setRecNotice("Recording saved to the MoM.");
    } catch (err) {
      setRecNotice(err?.response?.data?.message || err.message || "Could not save the recording.");
    } finally {
      setRecBusy("");
    }
  };
  saveRecordingRef.current = saveRecording;

  const toggleRecording = () => {
    if (recBusy) return;
    if (recorderRef.current) {
      saveRecording();
      return;
    }
    if (!socket?.connected) {
      setRecNotice("You are offline — the recording can't start right now.");
      return;
    }
    setRecBusy("starting");
    setRecNotice("");
    let recorder;
    try {
      recorder = startCallRecording({
        getGrid: () => gridRef.current,
        getStreams: () => [localRef.current, ...remoteStreams.current.values()].filter(Boolean),
      });
    } catch (err) {
      setRecBusy("");
      setRecNotice(`This browser can't record the call (${err.message}).`);
      return;
    }
    socket.emit("meet:recording", { on: true }, (res) => {
      setRecBusy("");
      if (!res?.ok) {
        recorder.stop(); // discard
        setRecNotice(res?.message || "Could not start the recording.");
        return;
      }
      recorderRef.current = recorder;
      setRecNotice("Recording — everyone in the call can see this.");
    });
  };

  // closing the tab mid-recording would lose it → ask first
  useEffect(() => {
    const warn = (e) => {
      if (!recorderRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // leaving the page another way (in-app navigation) → still save what was recorded
  useEffect(() => () => {
    if (recorderRef.current) saveRecordingRef.current?.();
  }, []);

  const leave = () => {
    if (recorderRef.current) saveRecording();
    teardown();
    setPhase("left");
  };

  useEffect(() => {
    setSocketConnected(Boolean(socket?.connected));
  }, [socket]);

  useEffect(() => {
    const updateNetwork = () => setNetworkLost(!navigator.onLine);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, showChat]);

  const sendChat = async (attachmentFilename = "") => {
    const text = chatText.trim();
    if (!text && !attachmentFilename) return;
    if (!socket?.connected) {
      setChatNotice("Chat is unavailable while disconnected. Please check your network connection.");
      return;
    }
    setChatBusy(true);
    socket.timeout(8000).emit("meet:chat", { text, attachmentFilename }, (error, result) => {
      setChatBusy(false);
      if (error || !result?.ok) {
        setChatNotice(result?.message || "Your message could not be sent. Check your network connection and try again.");
        return;
      }
      setChatText("");
      setChatNotice("");
    });
  };

  const shareChatFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setChatNotice("Files must be 8 MB or smaller.");
      return;
    }
    if (!info?.meetingId) {
      setChatNotice("The meeting details are unavailable. Please rejoin and try again.");
      return;
    }
    setChatBusy(true);
    setChatNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await API.post(`/api/meetings/${info.meetingId}/attachments`, body);
      await new Promise((resolve, reject) => {
        if (!socket?.connected) return reject(new Error("File uploaded, but chat is disconnected. Retry after reconnecting."));
        socket.timeout(8000).emit("meet:chat", {
          text: "",
          attachmentFilename: response.data?.data?.filename,
        }, (error, result) => error || !result?.ok
          ? reject(new Error(result?.message || "File uploaded, but the chat message could not be sent."))
          : resolve());
      });
    } catch (err) {
      setChatNotice(err.response?.data?.message || err.message || "Could not share this file.");
    } finally {
      setChatBusy(false);
    }
  };

  const downloadChatFile = async (attachment) => {
    try {
      const response = await API.get(`/api/meetings/attachments/${encodeURIComponent(attachment.filename)}`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name || "meeting-file";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setChatNotice(err.response?.data?.message || "Could not download this file.");
    }
  };

  const renderChatText = (text) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return String(text || "").split(urlPattern).map((part, index) =>
      /^https?:\/\//i.test(part)
        ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
        : part
    );
  };

  /* ---------- notes ---------- */
  useEffect(() => {
    try {
      if (notesText) localStorage.setItem(notesKey, notesText);
      else localStorage.removeItem(notesKey);
    } catch {
      /* storage full or blocked — the draft stays in memory */
    }
  }, [notesKey, notesText]);

  // adds this draft to the MoM's "Meeting notes" (keeps what is already there)
  const saveNotes = async () => {
    const text = notesText.trim();
    if (!text) return;
    if (!info?.meetingId) {
      setNotesNotice("The meeting details are unavailable. Please rejoin and try again.");
      return;
    }
    setNotesBusy(true);
    setNotesNotice("");
    try {
      const current = await API.get(`/api/meetings/${info.meetingId}`);
      const existing = String(current.data?.data?.notes || "").trim();
      const stamp = `${info.me?.name || "Participant"} · ${new Date().toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}`;
      const notes = [existing, `[${stamp}]\n${text}`].filter(Boolean).join("\n\n");
      if (notes.length > 10000) {
        setNotesNotice("The MoM notes are limited to 10,000 characters. Shorten your notes and try again.");
        return;
      }
      await API.put(`/api/meetings/${info.meetingId}`, { notes });
      setNotesText("");
      setNotesNotice("Notes saved to the MoM.");
    } catch (err) {
      setNotesNotice(err.response?.data?.message || "Your notes could not be saved. They are kept here, try again.");
    } finally {
      setNotesBusy(false);
    }
  };

  /* ---------- controls ---------- */
  const broadcastMedia = (patch) => {
    const next = { ...stateRef.current, ...patch };
    socket?.emit("meet:media", { audio: next.micOn, video: next.camOn, screen: next.sharing });
  };

  const toggleMic = () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !micOn;
    setMicOn(!micOn);
    broadcastMedia({ micOn: !micOn });
  };

  const toggleCam = () => {
    const track = cameraTrackRef.current;
    if (!track) return;
    track.enabled = !camOn;
    setCamOn(!camOn);
    broadcastMedia({ camOn: !camOn });
  };

  const sendVideoTrack = async (track) => {
    for (const pc of pcs.current.values()) {
      const t = pc.getTransceivers().find((x) => x.receiver.track?.kind === "video");
      if (t) await t.sender.replaceTrack(track);
    }
  };

  const stopShare = async () => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    await sendVideoTrack(cameraTrackRef.current);
    const stream = new MediaStream([...(localRef.current?.getAudioTracks() || []), ...(cameraTrackRef.current ? [cameraTrackRef.current] : [])]);
    setLocalStream(stream);
    setSharing(false);
    broadcastMedia({ sharing: false });
  };

  const toggleShare = async () => {
    if (sharing) return stopShare();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      screenTrackRef.current = track;
      track.onended = () => stopShare();
      await sendVideoTrack(track);
      setLocalStream(new MediaStream([...(localRef.current?.getAudioTracks() || []), track]));
      setSharing(true);
      broadcastMedia({ sharing: true });
    } catch {
      /* the user closed the share picker */
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /* ---------- render ---------- */
  const peerList = Object.entries(peers);
  const tiles = 1 + peerList.length;
  const columns = tiles <= 1 ? 1 : tiles <= 4 ? 2 : 3;
  const rows = Math.ceil(tiles / columns);
  const startMs = info ? new Date(info.start).getTime() : 0;
  const endMs = info ? new Date(info.end).getTime() : 0;

  return (
    <div className="mr-page">
      <style>{css}</style>

      <header className="mr-top">
        <div className="mr-title">
          <Video size={18} />
          <div>
            <strong>{info?.title || "Meeting"}</strong>
            {info && <span>{fmt(info.start)} – {new Date(info.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}{info.organizer ? ` · by ${info.organizer}` : ""}</span>}
          </div>
        </div>
        {phase === "call" && (
          <div className="mr-meta">
            {recordingInfo && (
              <span className="mr-rec-pill" title={`Recording started by ${recordingInfo.by}`}>
                <Circle size={9} fill="currentColor" /> REC{recordingInfo.by ? ` · ${recordingInfo.by}` : ""}
              </span>
            )}
            <span><Users size={14} /> {tiles}</span>
            <span>{serverNow < startMs ? `starts in ${countdown(startMs - serverNow)}` : serverNow < endMs ? `${countdown(endMs - serverNow)} left` : "running over time"}</span>
            <button type="button" onClick={copyLink} className="mr-chip"><Copy size={13} /> {copied ? "Copied" : "Copy link"}</button>
          </div>
        )}
      </header>

      {phase === "loading" && (
        <div className="mr-center"><Loader2 size={26} className="mr-spin" /> Loading meeting…</div>
      )}

      {(phase === "error" || phase === "ended" || phase === "left") && (
        <div className="mr-center">
          <div className="mr-card">
            {phase === "left" ? <PhoneOff size={30} /> : <AlertCircle size={30} />}
            <h2>{phase === "left" ? "You left the meeting" : phase === "ended" ? "This meeting has ended" : "Can't open this meeting"}</h2>
            {phase !== "left" && <p>{error || (info ? `It was scheduled for ${fmt(info.start)}.` : "")}</p>}
            {info && phase === "ended" && !error && <p>The link worked until {fmt(info.closesAt)}.</p>}
            <div className="mr-row">
              {phase === "left" && info?.state === "open" && (
                <button type="button" className="mr-btn primary" onClick={() => setPhase("lobby")}>Rejoin</button>
              )}
              <button type="button" className="mr-btn" onClick={() => navigate("/dashboard/mom")}>Back to MoM</button>
            </div>
          </div>
        </div>
      )}

      {phase === "early" && info && (
        <div className="mr-center">
          <div className="mr-card">
            <CalendarClock size={30} />
            <h2>The meeting hasn't started yet</h2>
            <p>Scheduled for <b>{fmt(info.start)}</b>. The link opens {info.joinEarlyMinutes} minutes before the start.</p>
            <div className="mr-count">Opens in {countdown(new Date(info.opensAt).getTime() - serverNow)}</div>
            <button type="button" className="mr-btn" onClick={() => navigate("/dashboard/mom")}>Back to MoM</button>
          </div>
        </div>
      )}

      {(phase === "lobby" || phase === "joining") && info && (
        <div className="mr-center">
          <div className="mr-lobby">
            <div className="mr-preview">
              <Tile stream={localStream} name={info.me.name} muted isSelf audioOff={!micOn} videoOff={!camOn} />
            </div>
            <div className="mr-lobby-side">
              <h2>Ready to join?</h2>
              <p>{info.title}</p>
              {info.attendees.length > 0 && <p className="mr-small">Invited: {info.attendees.join(", ")}</p>}
              {mediaWarning && <p className="mr-warn"><AlertCircle size={14} /> {mediaWarning}</p>}
              <div className="mr-row">
                <button type="button" className={`mr-round ${micOn ? "" : "off"}`} onClick={toggleMic} disabled={!localStream?.getAudioTracks().length} aria-label={micOn ? "Mute" : "Unmute"}>
                  {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <button type="button" className={`mr-round ${camOn ? "" : "off"}`} onClick={toggleCam} disabled={!cameraTrackRef.current} aria-label={camOn ? "Turn camera off" : "Turn camera on"}>
                  {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              </div>
              <button type="button" className="mr-btn primary big" onClick={() => joinCall()} disabled={phase === "joining" || !localStream}>
                {phase === "joining" ? <><Loader2 size={16} className="mr-spin" /> Joining…</> : "Join now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "call" && (
        <>
          {(networkLost || !socketConnected) && (
            <div className="mr-network-alert" role="alert">
              <WifiOff size={17} />
              <span>Network connection lost. Please check your connectivity.</span>
            </div>
          )}
          <div className={`mr-stage ${panel ? "with-panel" : ""}`}>
          <div className="mr-stage-main">
          <main ref={gridRef} className="mr-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            <Tile stream={localStream} name={info?.me?.name} muted isSelf audioOff={!micOn} videoOff={!camOn && !sharing} screen={sharing} />
            {peerList.map(([id, p]) => (
              <Tile key={id} stream={p.stream} name={p.name} audioOff={p.audio === false} videoOff={p.video === false && !p.screen} screen={p.screen} />
            ))}
          </main>
          </div>
          {showChat && (
            <aside className="mr-panel mr-chat-panel" aria-label="Meeting chat">
              <div className="mr-panel-head">
                <div className="mr-panel-top">
                  <strong><MessageCircle size={15} /> In-call chat</strong>
                  <span>{chatMessages.length}</span>
                </div>
              </div>
              <div className="mr-panel-body mr-chat-body" aria-live="polite">
                {!chatMessages.length && <p className="mr-small">No messages yet. Send a message, share a link, or attach a file.</p>}
                {chatMessages.map((message) => (
                  <div key={message.id} className="mr-chat-message">
                    <strong>{message.senderName || "Participant"}</strong>
                    <time>{new Date(message.sentAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>
                    {message.text && <div className="mr-chat-text">{renderChatText(message.text)}</div>}
                    {message.attachment && (
                      <button type="button" className="mr-chat-file" onClick={() => downloadChatFile(message.attachment)}>
                        <Paperclip size={13} /> {message.attachment.name}
                      </button>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="mr-chat-compose" onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
                <textarea
                  aria-label="Chat message"
                  placeholder="Message or paste a URL..."
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  rows={2}
                  maxLength={4000}
                />
                <div className="mr-chat-compose-actions">
                  <label className="mr-chat-filepick" title="Attach a file (maximum 8 MB)">
                    <Paperclip size={17} />
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip" onChange={shareChatFile} disabled={chatBusy} />
                  </label>
                  <button type="submit" className="mr-chat-send" disabled={chatBusy || !chatText.trim()}>
                    {chatBusy ? <Loader2 size={15} className="mr-spin" /> : <Send size={15} />} Send
                  </button>
                </div>
                {chatNotice && <div className="mr-chat-notice" role="status">{chatNotice}</div>}
              </form>
            </aside>
          )}
          {panel === "notes" && (
            <aside className="mr-panel mr-notes-panel" aria-label="Meeting notes">
              <div className="mr-panel-head">
                <div className="mr-panel-top">
                  <strong><NotebookPen size={15} /> My notes</strong>
                  <span>{notesText.length}/4000</span>
                </div>
              </div>
              <div className="mr-panel-body">
                <textarea
                  className="mr-notes-input"
                  aria-label="Meeting notes"
                  placeholder="Write notes during the call… They are kept on this device until you save them to the MoM."
                  value={notesText}
                  onChange={(event) => { setNotesText(event.target.value); setNotesNotice(""); }}
                  maxLength={4000}
                />
              </div>
              <div className="mr-chat-compose">
                <div className="mr-chat-compose-actions">
                  <span className="mr-small">Draft saved on this device</span>
                  <button type="button" className="mr-chat-send" onClick={saveNotes} disabled={notesBusy || !notesText.trim()}>
                    {notesBusy ? <Loader2 size={15} className="mr-spin" /> : <Save size={15} />} Save to MoM
                  </button>
                </div>
                {notesNotice && <div className="mr-chat-notice" role="status">{notesNotice}</div>}
              </div>
            </aside>
          )}
          </div>
          {peerList.length === 0 && <div className="mr-alone">Waiting for others to join… share the link from the invitation email.</div>}
          {recNotice && <div className="mr-rec-notice" role="status">{recNotice}</div>}
          <footer className="mr-bar">
            <button
              type="button"
              className={`mr-round ${showChat ? "on" : ""}`}
              onClick={() => togglePanel("chat")}
              aria-pressed={showChat}
              title={showChat ? "Hide chat" : "Show chat"}
            >
              <MessageCircle size={20} />
            </button>
            <button
              type="button"
              className={`mr-round ${panel === "notes" ? "on" : ""}`}
              onClick={() => togglePanel("notes")}
              aria-pressed={panel === "notes"}
              title={panel === "notes" ? "Hide notes" : "Take notes"}
            >
              <NotebookPen size={20} />
            </button>
            <button type="button" className={`mr-round ${micOn ? "" : "off"}`} onClick={toggleMic} disabled={!localRef.current?.getAudioTracks().length} title={micOn ? "Mute" : "Unmute"}>
              {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button type="button" className={`mr-round ${camOn ? "" : "off"}`} onClick={toggleCam} disabled={!cameraTrackRef.current} title={camOn ? "Turn camera off" : "Turn camera on"}>
              {camOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            {navigator.mediaDevices?.getDisplayMedia && (
              <button type="button" className={`mr-round ${sharing ? "on" : ""}`} onClick={toggleShare} title={sharing ? "Stop sharing" : "Share your screen"}>
                <MonitorUp size={20} />
              </button>
            )}
            {canRecord && canRecordCalls() && (
              <button
                type="button"
                className={`mr-round rec ${recorderRef.current ? "recording" : ""}`}
                onClick={toggleRecording}
                disabled={Boolean(recBusy) || (!recorderRef.current && Boolean(recordingInfo))}
                aria-pressed={Boolean(recorderRef.current)}
                title={
                  recorderRef.current
                    ? "Stop recording and save it to the MoM"
                    : recordingInfo
                      ? `${recordingInfo.by || "Someone"} is already recording`
                      : "Record this meeting"
                }
              >
                {recBusy ? <Loader2 size={20} className="mr-spin" /> : recorderRef.current ? <Square size={18} fill="currentColor" /> : <Circle size={20} fill="currentColor" />}
              </button>
            )}
            <button type="button" className="mr-round leave" onClick={leave} title="Leave the meeting">
              <PhoneOff size={20} />
            </button>
          </footer>
        </>
      )}
    </div>
  );
};

const css = `
  .mr-page{height:100vh;height:100dvh;overflow:hidden;display:flex;flex-direction:column;background:#0b1f2e;color:#e8f3f7;font-family:inherit}
  .mr-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
  .mr-title{display:flex;align-items:center;gap:10px;min-width:0;color:#7fe3ee}
  .mr-title strong{display:block;color:#fff;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mr-title span{display:block;font-size:12px;color:#9fb9c6}
  .mr-meta{display:flex;align-items:center;gap:12px;font-size:12px;color:#c3d7e0}
  .mr-meta span{display:inline-flex;align-items:center;gap:5px}
  .mr-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#e8f3f7;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}
  .mr-center{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;padding:20px;color:#c3d7e0}
  .mr-card{max-width:560px;width:100%;text-align:center;padding:28px 24px;border-radius:18px;background:#12304a;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;gap:8px}
  .mr-card h2{margin:6px 0 0;font-size:19px;color:#fff}
  .mr-card p{margin:0;font-size:13px;color:#b5cbd6;line-height:1.5}
  .mr-count{margin:8px 0;font-size:26px;font-weight:800;color:#7fe3ee}
  .mr-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px}
  .mr-btn{border:1px solid rgba(255,255,255,.2);background:transparent;color:#e8f3f7;border-radius:10px;padding:9px 16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;justify-content:center}
  .mr-btn.primary{background:#16a6b8;border-color:#16a6b8;color:#fff}
  .mr-btn.big{width:100%;margin-top:14px;padding:12px;font-size:15px}
  .mr-btn:disabled{opacity:.6;cursor:not-allowed}
  .mr-lobby{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:24px;width:min(980px,100%);align-items:center}
  .mr-preview .mr-tile{aspect-ratio:16/9}
  .mr-lobby-side h2{margin:0;font-size:22px;color:#fff}
  .mr-lobby-side p{margin:6px 0 0;color:#c3d7e0}
  .mr-small{font-size:12px!important;color:#9fb9c6!important}
  .mr-warn{display:flex;gap:6px;align-items:flex-start;font-size:12.5px!important;color:#ffd08a!important}
  .mr-center{overflow-y:auto}
  .mr-grid{flex:1;display:grid;gap:10px;padding:12px;align-content:center}
  .mr-stage-main .mr-grid{min-height:0;align-content:stretch}
  .mr-stage-main .mr-tile{aspect-ratio:auto}
  .mr-tile{position:relative;background:#12304a;border-radius:14px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;min-height:0}
  .mr-tile video{width:100%;height:100%;object-fit:cover;background:#000}
  .mr-avatar{width:72px;height:72px;border-radius:50%;background:#16a6b8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800}
  .mr-name{position:absolute;left:10px;bottom:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:rgba(0,0,0,.55);font-size:12px;color:#fff;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mr-alone{flex-shrink:0;text-align:center;font-size:13px;color:#9fb9c6;padding:6px 16px}
  .mr-bar{flex-shrink:0;display:flex;justify-content:center;flex-wrap:wrap;gap:14px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}
  .mr-top,.mr-network-alert{flex-shrink:0}
  .mr-round{width:50px;height:50px;border-radius:50%;border:0;background:#24465f;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
  .mr-round.off{background:#e5484d}
  .mr-round.on{background:#16a6b8}
  .mr-stage{flex:1;display:flex;min-height:0}
  .mr-stage-main{position:relative;flex:1;display:flex;flex-direction:column;min-width:0}
  .mr-stage-main .mr-grid{flex:1}
  .mr-panel-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .mr-panel{width:340px;flex-shrink:0;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,.08);background:#0f2a3f}
  .mr-panel-head{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
  .mr-panel-head strong{display:flex;align-items:center;gap:7px;color:#fff}
  .mr-panel-head span{font-size:11.5px;color:#9fb9c6}
  .mr-panel-body{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:10px}
  .mr-chat-panel,.mr-notes-panel{min-height:0}
  .mr-notes-input{flex:1;box-sizing:border-box;width:100%;min-height:120px;resize:none;padding:10px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:#12304a;color:#fff;font:inherit;font-size:13px;line-height:1.5}
  .mr-notes-input:focus-visible{outline:2px solid #7fe3ee;outline-offset:1px}
  .mr-chat-body{gap:12px}
  .mr-chat-message{padding:9px;border-radius:10px;background:rgba(255,255,255,.05);overflow-wrap:anywhere}
  .mr-chat-message strong{display:inline;color:#7fe3ee;font-size:11px}
  .mr-chat-message time{float:right;color:#9fb9c6;font-size:10px}
  .mr-chat-text{margin-top:5px;color:#e8f3f7;font-size:12px;line-height:1.45;white-space:pre-wrap}
  .mr-chat-text a{color:#7fe3ee;text-decoration:underline}
  .mr-chat-file{display:inline-flex;align-items:center;gap:6px;margin-top:7px;padding:5px 7px;border:1px solid rgba(127,227,238,.3);border-radius:7px;background:rgba(22,166,184,.12);color:#7fe3ee;font-size:11px;cursor:pointer}
  .mr-chat-compose{padding:10px;border-top:1px solid rgba(255,255,255,.08)}
  .mr-chat-compose textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:48px;padding:8px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:#12304a;color:#fff;font:inherit;font-size:12px}
  .mr-chat-compose-actions{display:flex;justify-content:space-between;align-items:center;margin-top:7px}
  .mr-chat-filepick,.mr-chat-send{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:8px;background:#24465f;color:#fff;padding:7px 10px;cursor:pointer}
  .mr-chat-filepick input{position:absolute;width:1px;height:1px;opacity:0}
  .mr-chat-send{background:#16a6b8;font-weight:700}
  .mr-chat-send:disabled{opacity:.55;cursor:not-allowed}
  .mr-chat-notice{margin-top:7px;color:#ffd08a;font-size:11px;line-height:1.4}
  .mr-network-alert{display:flex;align-items:center;justify-content:center;gap:9px;padding:10px 14px;background:#7f1d1d;color:#fff;font-size:13px;font-weight:700}
  .mr-network-alert svg{flex-shrink:0}
  .mr-round.leave{background:#e5484d;width:64px;border-radius:999px}
  .mr-round.rec{color:#ff6b6f}
  .mr-round.rec.recording{background:#e5484d;color:#fff;animation:mrRecPulse 1.6s ease-in-out infinite}
  @keyframes mrRecPulse{50%{box-shadow:0 0 0 6px rgba(229,72,77,.35)}}
  .mr-rec-pill{padding:3px 9px;border-radius:999px;background:#e5484d;color:#fff!important;font-weight:800;letter-spacing:.3px}
  .mr-rec-notice{flex-shrink:0;text-align:center;font-size:12.5px;color:#ffd08a;padding:4px 16px}
  .mr-round:disabled{opacity:.45;cursor:not-allowed}
  .mr-round:focus-visible,.mr-btn:focus-visible,.mr-chip:focus-visible,.mr-chat-file:focus-visible,.mr-chat-send:focus-visible{outline:3px solid #7fe3ee;outline-offset:2px}
  .mr-spin{animation:mrSpin 1s linear infinite}
  @keyframes mrSpin{to{transform:rotate(360deg)}}
  @media (max-width:900px){
    .mr-stage.with-panel{flex-direction:column}
    .mr-panel{width:auto;max-height:40vh;border-left:0;border-top:1px solid rgba(255,255,255,.08)}
  }
  @media (max-width:760px){
    .mr-lobby{grid-template-columns:1fr}
    .mr-grid{grid-template-columns:1fr!important;align-content:start}
    .mr-stage-main .mr-grid{grid-template-rows:none!important;grid-auto-rows:minmax(160px,1fr);overflow-y:auto}
    .mr-meta{width:100%;justify-content:space-between}
  }
`;

export default MeetingRoom;
