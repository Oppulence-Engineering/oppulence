import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const LOCAL_UPLOAD_URL_TTL_SECONDS = 15 * 60;
const FILE_ID_PATTERN = /^[a-f\d]{24}$/i;

function signingSecret(): string | undefined {
  return process.env.RAG_UPLOADS_URL_SECRET || process.env.AUTH0_SECRET;
}

function signature(fileId: string, method: "GET" | "PUT", expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${method}:${fileId}:${expiresAt}`).digest("base64url");
}

export function createLocalUploadUrl(fileId: string, method: "GET" | "PUT"): string {
  const secret = signingSecret();
  if (!FILE_ID_PATTERN.test(fileId) || !secret) throw new Error("Local upload signing is unavailable");
  const expiresAt = Math.floor(Date.now() / 1000) + LOCAL_UPLOAD_URL_TTL_SECONDS;
  const token = signature(fileId, method, expiresAt, secret);
  return `/api/uploads/${fileId}?expires=${expiresAt}&signature=${token}`;
}

export function isValidLocalUploadUrl(
  fileId: string,
  method: "GET" | "PUT",
  expires: string | null,
  token: string | null,
): boolean {
  const secret = signingSecret();
  const expiresAt = Number(expires);
  if (
    !secret ||
    !FILE_ID_PATTERN.test(fileId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    expiresAt > Math.floor(Date.now() / 1000) + LOCAL_UPLOAD_URL_TTL_SECONDS ||
    !token
  ) {
    return false;
  }
  const encoder = new TextEncoder();
  const expected = encoder.encode(signature(fileId, method, expiresAt, secret));
  const actual = encoder.encode(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function localUploadIdFromPath(storedPath: string): string | null {
  try {
    const parsed = new URL(storedPath, "https://rowboat.invalid");
    if (parsed.origin !== "https://rowboat.invalid") return null;
    return /^\/api\/uploads\/([a-f\d]{24})$/i.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
