import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createLocalUploadUrl, isValidLocalUploadUrl, localUploadIdFromPath } from "./local-upload-url";

const fileId = "507f1f77bcf86cd799439011";
const testKey = "test";

function withSigningSecret(run: () => void): void {
  const previousUrlSecret = process.env.RAG_UPLOADS_URL_SECRET;
  const previousAuthSecret = process.env.AUTH0_SECRET;
  process.env.RAG_UPLOADS_URL_SECRET = testKey;
  delete process.env.AUTH0_SECRET;
  try {
    run();
  } finally {
    if (previousUrlSecret === undefined) delete process.env.RAG_UPLOADS_URL_SECRET;
    else process.env.RAG_UPLOADS_URL_SECRET = previousUrlSecret;
    if (previousAuthSecret === undefined) delete process.env.AUTH0_SECRET;
    else process.env.AUTH0_SECRET = previousAuthSecret;
  }
}

test("local upload URLs bind method, file ID, and expiry", () => {
  withSigningSecret(() => {
    const url = new URL(createLocalUploadUrl(fileId, "PUT"), "https://rowboat.invalid");
    const expires = url.searchParams.get("expires");
    const signature = url.searchParams.get("signature");

    assert.equal(isValidLocalUploadUrl(fileId, "PUT", expires, signature), true);
    assert.equal(isValidLocalUploadUrl(fileId, "GET", expires, signature), false);
    assert.equal(isValidLocalUploadUrl("507f1f77bcf86cd799439012", "PUT", expires, signature), false);

    const expired = String(Math.floor(Date.now() / 1000) - 1);
    const expiredSignature = createHmac("sha256", testKey)
      .update(`PUT:${fileId}:${expired}`)
      .digest("base64url");
    assert.equal(isValidLocalUploadUrl(fileId, "PUT", expired, expiredSignature), false);
  });
});

test("local upload paths cannot select a different file or host", () => {
  assert.equal(localUploadIdFromPath(`/api/uploads/${fileId}`), fileId);
  assert.equal(localUploadIdFromPath(`https://evil.example/api/uploads/${fileId}`), null);
  assert.equal(localUploadIdFromPath(`/api/uploads/../${fileId}`), null);
});
