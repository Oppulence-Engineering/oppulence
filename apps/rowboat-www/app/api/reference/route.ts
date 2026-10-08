import { NextResponse } from "next/server";

import {
  presentApiReferenceDocument,
  renderApiReferencePage,
} from "@/lib/api/api-reference-document";
import { publicRowboatApiURL } from "@/lib/api/rowboat-public-api";

/** A slow API renders the page without a spec instead of hanging it. */
const SPEC_TIMEOUT_MS = 10_000;

async function loadApiReferenceDocument(): Promise<unknown> {
  try {
    const response = await fetch(publicRowboatApiURL("/openapi.json"), {
      cache: "no-store",
      signal: AbortSignal.timeout(SPEC_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return presentApiReferenceDocument(await response.json());
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const spec = await loadApiReferenceDocument();
  return new NextResponse(renderApiReferencePage(spec), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
