/**
 * Password hashing + JWT issuing/verification.
 *
 * Access tokens are short-lived and stateless; refresh tokens are opaque,
 * stored hashed, and can be revoked (rotation keeps the stolen-token window
 * small). No plaintext credentials are ever persisted or logged.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db } from '../db/client.js';

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

/** Parse "15m"/"30d"/"3600" into seconds. */
function ttlSeconds(ttl) {
  const m = /^(\d+)([smhd])?$/.exec(String(ttl).trim());
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return n;
  }
}

export function issueAccessToken(user) {
  const expiresIn = ttlSeconds(config.JWT_ACCESS_TTL);
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn }
  );
  return { token, expiresIn };
}

export function issueRefreshToken(userId) {
  const raw = nanoid(48);
  const hash = sha256(raw);
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds(config.JWT_REFRESH_TTL);
  db().transaction(() => {
    db()
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(), userId, hash, expiresAt);
  });
  return { token: raw, expiresAt };
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Validate a refresh token: must exist, be unrevoked, and not be expired.
 * With rotation enabled the presented token is revoked immediately, so a
 * replay attempt fails loudly (and the token family looks stolen).
 */
export function consumeRefreshToken(rawToken) {
  const hash = sha256(rawToken);
  const row = db()
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hash);
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;

  db().transaction(() => {
    db()
      .prepare('UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE id = ?')
      .run(row.id);
  });
  return row;
}

export function revokeAllUserTokens(userId) {
  db()
    .prepare('UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL')
    .run(userId);
}

export function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
