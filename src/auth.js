import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

export function createCaptchaStore({ ttlMs = CAPTCHA_TTL_MS } = {}) {
  const store = new Map();
  return {
    create() {
      const id = randomBytes(16).toString("hex");
      const code = String(randomInt(0, 10000)).padStart(4, "0");
      store.set(id, { code, expires: Date.now() + ttlMs });
      return { id, code };
    },
    verify(id, input) {
      const c = store.get(id);
      if (!c) return false;
      store.delete(id);
      if (Date.now() > c.expires) return false;
      return timingSafeEqual(Buffer.from(c.code), Buffer.from(String(input || "")));
    },
  };
}

export function captchaSvg(code) {
  const w = 110, h = 38;
  let noise = "";
  for (let i = 0; i < 6; i++) {
    noise += `<line x1="${randomInt(0, w)}" y1="${randomInt(0, h)}" x2="${randomInt(0, w)}" y2="${randomInt(0, h)}" stroke="#${(randomInt(0, 0xffffff)).toString(16).padStart(6, "0")}" stroke-width="1"/>`;
  }
  let text = "";
  for (let i = 0; i < code.length; i++) {
    const x = 14 + i * 22;
    const y = 26 + randomInt(-4, 5);
    const rot = randomInt(-18, 19);
    const fill = `#${(randomInt(0, 0xffffff)).toString(16).padStart(6, "0")}`;
    text += `<text x="${x}" y="${y}" fill="${fill}" font-size="22" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${noise}${text}</svg>`;
}

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, { salt, hash }) {
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
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