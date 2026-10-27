import { z } from "zod";

import {
  dashboardRequest,
  redirectBrowserIfUnauthorized,
  toDashboardAPIPath,
} from "@/lib/auth/dashboard-fetch";
import { RowboatAPIErrorSchema } from "@/lib/auth/schemas";

export class DashboardRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "DashboardRequestError";
    this.status = status;
    this.code = code;
  }
}

export type RequestJsonInput<T> = {
  /** Path under `/v1`, for example `/relationship-sources/status`. */
  path: string;
  schema: z.ZodType<T>;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export type RequestJsonFn = <T>(input: RequestJsonInput<T>) => Promise<T>;

/**
 * A contract mismatch is a deployment fact. The path stays in the console,
 * because printing it named an internal route on the page.
 */
export function schemaMismatchCopy(): string {
  return "This page could not read the latest data. Refresh and try again.";
}

/** A missing route is optional. A gateway timeout or an unavailable API is a failed load. */
export function isOptionalRequestFailure(error: unknown): boolean {
  return error instanceof DashboardRequestError && error.status === 404;
}

/**
 * Stored problem details are handler phrases. The page says what happened.
 * An unknown sentence stays, so a specific failure is not replaced by a fallback.
 */
export function signedInProblemCopy(detail: string): string | null {
  switch (detail) {
    case "invalid relationshipId":
      return "This company could not be found.";
    case "invalid personId":
      return "This person could not be found.";
    case "invalid commitmentId":
      return "This promise could not be found.";
    case "invalid actionId":
      return "This action could not be found.";
    case "invalid attentionId":
      return "This item could not be found.";
    case "invalid recommendationId":
      return "This recommendation could not be found.";
    case "invalid scanId":
      return "This audit could not be found.";
    case "invalid candidateId":
      return "This suggestion could not be found.";
    case "not found":
    case "invalid userId":
    case "invalid membershipId":
    case "invalid attributeId":
    case "invalid evidenceId":
    case "invalid assertionId":
    case "invalid interactionId":
    case "invalid attachmentId":
    case "invalid ruleId":
    case "invalid grantId":
      return "This could not be found.";
    case "workspace role forbids this operation":
      return "You do not have access to this.";
    case "tenant evidence encryption is unavailable":
      return "Saved details cannot be read right now. Try again later.";
    case "tenant evidence key has been destroyed":
      return "Saved details for this workspace can no longer be read.";
    case "cloud research requires the intelligence plan":
      return "Public research is part of the Intelligence plan. This workspace does not include it.";
    case "cloud research consent has not been granted for this workspace":
      return "Public research stays off until you allow it.";
    case "cloud research is not configured":
      return "Public research is not available in this workspace.";
    case "an identical research request is already in flight":
      return "That research is already running.";
    case "revenue: workspace capability is disabled":
      return "Cloud research is disabled for this workspace.";
    case "action destination depends on unresolved identity":
      return "This action needs a known recipient before it can run.";
    case "required source evidence is incomplete or stale":
      return "The source for this action is incomplete or out of date.";
    case "action is blocked by policy":
      return "This action is blocked.";
    case "no policy decision for the current revision; evaluate first":
      return "Check this action before it can run.";
    case "policy decision expired; re-evaluate":
      return "The check expired. Check this action again.";
    case "decision requires explicit human risk acceptance":
      return "This action needs a person to accept the risk.";
    case "action is not approved for its current revision":
      return "Approve this action before it can run.";
    case "execution already started; the action is immutable":
      return "This action already started, so it cannot be changed.";
    case "workspace is not linked; sends are disabled":
      return "Link this workspace before anything can be sent.";
    case "an active subscription is required to act on actions":
      return "An active subscription is required before this action can run.";
    case "conflicting concurrent transition; reload and retry":
      return "This changed while it was saving. Reload and try again.";
    case "policy preflight unavailable; the action stays pending":
      return "The sending check is unavailable. This action stays waiting.";
    case "q is required":
      return "Enter a search.";
    case "no original email available for this action":
      return "The original email is not available for this action.";
    case "closed-loop actions are not enabled":
      return "Agent approvals are not switched on for this workspace yet.";
    case "approval token is required":
      return "Approve this action again before it can run.";
    case "invalid proposal id":
      return "This action could not be found.";
    case "proposal is not pending":
      return "This action is no longer waiting for approval.";
    case "proposal is not approved":
      return "Approve this action before it can run.";
    case "proposal already executed":
      return "This action already ran.";
    case "approval token expired; re-approve":
      return "That approval expired. Approve the action again.";
    case "approval token already used":
      return "That approval was already used. Approve the action again.";
    case "approval token is invalid":
      return "That approval is no longer valid. Approve the action again.";
    case "execution backend is not configured; the action stays approved":
      return "Approved, but this action cannot run yet. The approval is saved — try again once execution is available.";
    case "execution outcome is ambiguous; reconcile by product state before retrying":
      return "This action may already have run. Check it before trying again.";
    case "step-up authentication required for financial approval":
      return "This financial action needs recent re-authentication. Sign in again, then approve.";
    default:
      if (detail.startsWith("revenue: ") || detail.startsWith("actions: ")) {
        return "This could not be saved. Try again.";
      }
      return null;
  }
}

function shownProblem(raw: string, status: number): string {
  const known = signedInProblemCopy(raw);
  if (known) return known;
  if (raw === "internal error" || raw === "authentication required") {
    return `Request failed (${String(status)})`;
  }
  return raw;
}

function errorMessage(body: unknown, status: number): { message: string; code?: string } {
  const parsed = RowboatAPIErrorSchema.safeParse(body);
  if (parsed.success) {
    const raw =
      parsed.data.message ||
      parsed.data.error ||
      parsed.data.detail ||
      parsed.data.title ||
      parsed.data.code ||
      `Request failed (${String(status)})`;
    return {
      message: shownProblem(raw, status),
      code: parsed.data.code,
    };
  }
  if (body && typeof body === "object") {
    const record = body as { detail?: unknown; title?: unknown; code?: unknown };
    const detail = typeof record.detail === "string" ? record.detail : undefined;
    const title = typeof record.title === "string" ? record.title : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    const raw = detail || title || `Request failed (${String(status)})`;
    return { message: shownProblem(raw, status), code };
  }
  return { message: `Request failed (${String(status)})` };
}

async function readJsonBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new DashboardRequestError(schemaMismatchCopy(), response.status);
  }
}

/**
 * Same-origin BFF JSON call with Orval Zod validation.
 * Browser 401s bounce through WorkOS; the server no-ops that redirect.
 */
export async function requestJson<T>(input: RequestJsonInput<T>): Promise<T> {
  const response = await dashboardRequest(toDashboardAPIPath(input.path), {
    method: input.method,
    signal: input.signal,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: {
      Accept: "application/json",
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
  });
  redirectBrowserIfUnauthorized(response.status);
  const body = await readJsonBody(response);
  if (!response.ok) {
    const { message, code } = errorMessage(body, response.status);
    throw new DashboardRequestError(message, response.status, code);
  }
  try {
    return input.schema.parse(body);
  } catch (error) {
    console.error(`Unexpected ${input.path} response`, error);
    throw new DashboardRequestError(schemaMismatchCopy(), 0, "schema_mismatch");
  }
}
