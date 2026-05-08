import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "MISSING" | "MALFORMED" | "EXPIRED" | "INVALID" };

interface SocketAuthPayload {
  token?: unknown;
  user_id?: unknown;
  exp?: unknown;
}

/**
 * Verify a socket auth payload signed by Laravel.
 *
 * Token formula (must match tnp-backend SocketTokenController):
 *   HMAC_SHA256(`${user_id}:${exp}`, SOCKET_TOKEN_SECRET)
 * encoded as lowercase hex.
 *
 * `exp` is a Unix timestamp in seconds (UTC).
 */
export const verifySocketAuth = (
  payload: SocketAuthPayload | undefined,
  secret: string
): VerifyResult => {
  if (!payload) return { ok: false, reason: "MISSING" };

  const { token, user_id, exp } = payload;

  if (
    typeof token !== "string" ||
    typeof user_id !== "string" ||
    typeof exp !== "number" ||
    !Number.isFinite(exp)
  ) {
    return { ok: false, reason: "MALFORMED" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp <= nowSec) return { ok: false, reason: "EXPIRED" };

  const expected = createHmac("sha256", secret)
    .update(`${user_id}:${exp}`)
    .digest("hex");

  // timingSafeEqual requires equal-length buffers — bail early on mismatch.
  if (token.length !== expected.length) {
    return { ok: false, reason: "INVALID" };
  }

  const a = Buffer.from(token, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "INVALID" };
  }

  return { ok: true, userId: user_id };
};
