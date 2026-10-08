import { randomBytes, randomInt, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 24;
const PASSWORD_HARD_MAX = 1024;
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_LEN = 5;
const WEAK_PASSWORDS = new Set([
  "password1!", "password123", "passw0rd!", "qwerty123!", "qwerty1234",
  "abcd1234!", "admin123!", "12345678a!", "1qaz2wsx!", "letmein123!",
]);

export function createCaptchaStore({ ttlMs = CAPTCHA_TTL_MS } = {}) {
  const store = new Map();
  return {
    create() {
      const id = randomBytes(16).toString("hex");
      let code = "";
      for (let i = 0; i < CAPTCHA_LEN; i++) code += CAPTCHA_CHARS[randomInt(0, CAPTCHA_CHARS.length)];
      store.set(id, { code, expires: Date.now() + ttlMs });
      return { id, code };
    },
    verify(id, input) {
      const c = store.get(id);
      if (!c) return false;
      store.delete(id);
      if (Date.now() > c.expires) return false;
      const got = Buffer.from(String(input || "").trim().toUpperCase());
      const want = Buffer.from(c.code);
      return got.length === want.length && timingSafeEqual(got, want);
    },
  };
}

export function captchaSvg(code) {
  const w = 20 + code.length * 20, h = 38;
  let noise = "";
  for (let i = 0; i < 6; i++) {
    noise += `<line x1="${randomInt(0, w)}" y1="${randomInt(0, h)}" x2="${randomInt(0, w)}" y2="${randomInt(0, h)}" stroke="#${(randomInt(0, 0xffffff)).toString(16).padStart(6, "0")}" stroke-width="1"/>`;
  }
  let text = "";
  for (let i = 0; i < code.length; i++) {
    const x = 12 + i * 20;
    const y = 26 + randomInt(-4, 5);
    const rot = randomInt(-18, 19);
    const fill = `#${(randomInt(0, 0xffffff)).toString(16).padStart(6, "0")}`;
    text += `<text x="${x}" y="${y}" fill="${fill}" font-size="20" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${noise}${text}</svg>`;
}

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export async function hashPasswordAsync(password, salt = randomBytes(16).toString("hex")) {
  const hash = (await scryptAsync(password, salt, 64)).toString("hex");
  return { salt, hash };
}

function derive(password, salt) {
  if (typeof password !== "string" || password.length > PASSWORD_HARD_MAX) return null;
  return scryptSync(password, salt, 64);
}

export function verifyPassword(password, { salt, hash } = {}) {
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== 64) return false;
  const candidate = derive(password, salt);
  return candidate !== null && timingSafeEqual(candidate, expected);
}

export async function verifyPasswordAsync(password, { salt, hash } = {}) {
  if (!salt || !hash || typeof password !== "string" || password.length > PASSWORD_HARD_MAX) return false;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== 64) return false;
  const candidate = await scryptAsync(password, salt, 64);
  return timingSafeEqual(candidate, expected);
}

export function isStrongPassword(password) {
  return typeof password === "string"
    && password.length >= PASSWORD_MIN_LEN && password.length <= PASSWORD_MAX_LEN
    && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password)
    && !WEAK_PASSWORDS.has(password.toLowerCase());
}

export function createSessionStore({ ttlMs = SESSION_TTL_MS } = {}) {
  const sessions = new Map();
  return {
    create() {
      const token = randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + ttlMs);
      return token;
    },
    valid(token) {
      const expires = sessions.get(token);
      if (!expires) return false;
      if (Date.now() > expires) { sessions.delete(token); return false; }
      return true;
    },
    revoke(token) { sessions.delete(token); },
    revokeAll() { sessions.clear(); },
  };
}

export function parseCookie(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
