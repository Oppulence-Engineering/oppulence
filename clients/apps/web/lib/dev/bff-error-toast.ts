"use client";

import { toast } from "sonner";

const SHOWN = new Set<string>();

/**
 * A structured error code means rowboat-api answered. Only a bare 502/503
 * (the proxy never got a body) should say to check that the API is running.
 * `provider_unconfigured` is a missing Composio or Stripe setup, not a down API.
 */
export function bffErrorHint(status: number, errorCode?: string): string {
  if (status === 401 || errorCode === "session_unavailable") {
    return "Try Dev toolkit → Session → Refresh, or sign in again.";
  }
  if (errorCode === "provider_unconfigured") {
    return "That provider is not configured on the server. rowboat-api is running.";
  }
  if ((status === 502 || status === 503) && !errorCode) {
    return "Check rowboat-api is running (npm run dev:stack prints health).";
  }
  return "See Dev toolkit → API tab for request-id and latency.";
}

/** Dev-only actionable toast when a BFF response returns a structured error. */
export function maybeToastBffError(url: string, status: number, errorCode?: string) {
  if (typeof window === "undefined") return;
  if (status < 400) return;

  const key = `${status}:${errorCode ?? url}`;
  if (SHOWN.has(key)) return;
  SHOWN.add(key);

  toast.error(`BFF ${status}${errorCode ? ` (${errorCode})` : ""}`, {
    description: `${url}\n${bffErrorHint(status, errorCode)}`,
    duration: 8_000,
  });
}
