/**
 * Same-origin API reference viewer.
 *
 * The reference page cannot load this script from unpkg: script-src would have
 * to allow every file on that host. It also cannot use Scalar's default fonts,
 * which come from fonts.scalar.com and are blocked by the page policy. The
 * page sets withDefaultFonts to false and loads this pinned build instead.
 * The hash rejects a substituted file before the browser executes it.
 */
import { createHash } from "node:crypto";

import { connection } from "next/server";

const VIEWER_URL = "https://unpkg.com/@scalar/api-reference@1.72.2/dist/browser/standalone.js";

const VIEWER_SHA256 = "b6564fd22226b587bbb7b02cfa6910b1e0f52b2e4b9e2cdaa950145ca574f5e7";

/** A slow CDN fails the request instead of holding the route open. */
const VIEWER_TIMEOUT_MS = 10_000;

let cached: Promise<Uint8Array<ArrayBuffer>> | undefined;

function loadViewer(): Promise<Uint8Array<ArrayBuffer>> {
  cached ??= fetch(VIEWER_URL, { signal: AbortSignal.timeout(VIEWER_TIMEOUT_MS) })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`API reference viewer responded ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== VIEWER_SHA256) {
        throw new Error("API reference viewer hash did not match");
      }
      return bytes;
    })
    .catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
  return cached;
}

export async function GET() {
  // Request time, so a build does not have to reach the viewer host.
  await connection();
  try {
    const body = await loadViewer();
    return new Response(body, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("API reference viewer unavailable.", { status: 502 });
  }
}
