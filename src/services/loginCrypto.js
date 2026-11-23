// Encrypts { email, password } before the login request, so the request body
// (and DevTools → Network → Payload) shows only ciphertext.
// RSA-OAEP (SHA-256) wraps a one-time AES-256-GCM key; the backend holds the private key.
// Works on top of HTTPS. If the browser has no Web Crypto, the plain body is sent (as before).
import API from "../api/config";

let cachedKey = null; // { kid, cryptoKey }

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const canEncryptLogin = () => Boolean(window.crypto?.subtle && window.isSecureContext !== false);

const loadKey = async (fresh = false) => {
  if (cachedKey && !fresh) return cachedKey;
  const { data } = await API.get("/api/auth/login-key");
  const { kid, publicKey } = data.data;
  const cryptoKey = await window.crypto.subtle.importKey(
    "spki",
    fromB64(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  cachedKey = { kid, cryptoKey };
  return cachedKey;
};

export const encryptLogin = async (email, password, { freshKey = false } = {}) => {
  const { kid, cryptoKey } = await loadKey(freshKey);
  const subtle = window.crypto.subtle;
  const nonceBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const body = JSON.stringify({
    email,
    password,
    ts: Date.now(),
    nonce: Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  });

  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(body));
  const rawAes = await subtle.exportKey("raw", aesKey);
  const wrapped = await subtle.encrypt({ name: "RSA-OAEP" }, cryptoKey, rawAes);

  return { encrypted: { kid, key: toB64(wrapped), iv: toB64(iv), data: toB64(data) } };
};

// POST /api/auth/login with the encrypted body; if the server's key changed, fetch it once more
export const postLogin = async (email, password) => {
  if (!canEncryptLogin()) return API.post("/api/auth/login", { email, password });
  try {
    return await API.post("/api/auth/login", await encryptLogin(email, password));
  } catch (err) {
    if (err?.response?.data?.code === "login_key_changed") {
      return API.post("/api/auth/login", await encryptLogin(email, password, { freshKey: true }));
    }
    throw err;
  }
};
