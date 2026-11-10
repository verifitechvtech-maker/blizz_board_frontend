/* =========================================================
   In-call recording (organizer / Admin), made in this browser
   • video: every tile of the call grid drawn onto one canvas (grid layout, names)
   • audio: this person's mic + every other participant, mixed with Web Audio
   • people who join later are picked up automatically
   • stop() → one .webm Blob, uploaded to the MoM by the caller
========================================================= */

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 15;

const pickMimeType = () =>
  ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
    (type) => window.MediaRecorder?.isTypeSupported?.(type)
  ) || "";

export const canRecordCalls = () =>
  typeof window !== "undefined" &&
  Boolean(window.MediaRecorder && window.AudioContext && HTMLCanvasElement.prototype.captureStream);

/**
 * @param {() => Element | null} getGrid      the call grid element (its .mr-tile children are drawn)
 * @param {() => MediaStream[]}  getStreams   every stream whose audio belongs in the recording
 */
export const startCallRecording = ({ getGrid, getStreams }) => {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  const audioCtx = new AudioContext();
  const mix = audioCtx.createMediaStreamDestination();
  const connected = new Map(); // track id → source node

  const connectAudio = () => {
    for (const stream of getStreams()) {
      for (const track of stream?.getAudioTracks() || []) {
        if (connected.has(track.id) || track.readyState !== "live") continue;
        const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
        source.connect(mix);
        connected.set(track.id, source);
      }
    }
  };

  const drawTile = (tile, x, y, w, h) => {
    ctx.fillStyle = "#12304a";
    ctx.fillRect(x, y, w, h);
    const video = tile.querySelector("video");
    const name = tile.querySelector(".mr-name")?.textContent?.trim() || "";
    if (video && video.style.display !== "none" && video.videoWidth) {
      // keep the aspect ratio (letterbox)
      const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
      const vw = video.videoWidth * scale;
      const vh = video.videoHeight * scale;
      ctx.drawImage(video, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh);
    } else {
      const r = Math.min(w, h) * 0.14;
      ctx.fillStyle = "#16a6b8";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.round(r)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((name || "?").charAt(0).toUpperCase(), x + w / 2, y + h / 2);
    }
    if (name) {
      ctx.font = "600 16px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = name.length > 40 ? `${name.slice(0, 39)}…` : name;
      const lw = ctx.measureText(label).width + 16;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(x + 8, y + h - 34, lw, 26);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 16, y + h - 21);
    }
  };

  const draw = () => {
    ctx.fillStyle = "#0b1f2e";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const tiles = [...(getGrid()?.querySelectorAll(".mr-tile") || [])];
    if (!tiles.length) return;
    const columns = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3;
    const rows = Math.ceil(tiles.length / columns);
    const gap = 8;
    const w = (WIDTH - gap * (columns + 1)) / columns;
    const h = (HEIGHT - gap * (rows + 1)) / rows;
    tiles.forEach((tile, i) => {
      drawTile(tile, gap + (i % columns) * (w + gap), gap + Math.floor(i / columns) * (h + gap), w, h);
    });
  };

  connectAudio();
  draw();
  // setInterval (not requestAnimationFrame) so the recording keeps going in a background tab
  let ticks = 0;
  const timer = setInterval(() => {
    draw();
    if (++ticks % FPS === 0) connectAudio(); // once a second: anyone new to hear?
  }, 1000 / FPS);

  const videoTrack = canvas.captureStream(FPS).getVideoTracks()[0];
  const stream = new MediaStream([videoTrack, ...mix.stream.getAudioTracks()]);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 1_500_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  const startedAt = Date.now();
  recorder.start(1000);
  audioCtx.resume?.();

  const cleanup = () => {
    clearInterval(timer);
    videoTrack.stop();
    connected.forEach((source) => source.disconnect());
    audioCtx.close().catch(() => {});
  };

  return {
    startedAt,
    /** Stops and resolves with { blob, durationSec } */
    stop: () =>
      new Promise((resolve) => {
        const finish = () => {
          cleanup();
          resolve({
            blob: new Blob(chunks, { type: (recorder.mimeType || "video/webm").split(";")[0] }),
            durationSec: Math.round((Date.now() - startedAt) / 1000),
          });
        };
        if (recorder.state === "inactive") return finish();
        recorder.onstop = finish;
        recorder.stop();
      }),
  };
};
