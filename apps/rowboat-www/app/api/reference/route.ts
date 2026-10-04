import { NextResponse } from "next/server";

import {
  presentApiReferenceDocument,
  renderApiReferencePage,
} from "@/lib/api/api-reference-document";
import { publicRowboatApiURL } from "@/lib/api/rowboat-public-api";

async function loadApiReferenceDocument(): Promise<unknown> {
  try {
    const response = await fetch(publicRowboatApiURL("/openapi.json"), { cache: "no-store" });
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
