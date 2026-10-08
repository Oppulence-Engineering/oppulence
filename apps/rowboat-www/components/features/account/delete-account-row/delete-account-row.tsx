"use client";

import "client-only";
import * as React from "react";
import { z } from "zod";

import { Button } from "@oppulence/ui/components/button";
import { Input } from "@oppulence/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@oppulence/ui/components/sheet";

import { dashboardFetch } from "@/lib/auth/client";
import { planLabel } from "@/lib/product/plan-label";

const ACCOUNT_DELETION_ERRORS: Record<string, string> = {
  workspace_successor_required:
    "Your workspace has other members and none of them can take ownership. Remove the other members first, then delete your account.",
  billing_cancellation_failed:
    "We could not cancel your subscription, so your account was not deleted. Try again, or contact support.",
  step_up_required: "Sign in again before deleting this account.",
  reauth_required: "Sign in again before deleting this account.",
  mfa_required: "Confirm this deletion with your second factor.",
  step_up_expired: "That confirmation expired. Start again.",
  step_up_unavailable: "We could not confirm your identity. Try again, or contact support.",
  invalid_code: "That code is wrong.",
  too_many_attempts: "Too many attempts. Start again.",
  step_up_not_found: "That confirmation expired. Start again.",
};
const ACCOUNT_DELETION_FALLBACK =
  "We could not delete your account. Try again, or contact support.";

/**
 * The challenge id is not a secret. The step-up token stays in memory so a
 * later page, or another tab reading storage, cannot replay the deletion.
 */
const CHALLENGE_STORAGE_KEY = "oppulence.account-deletion-challenge";
const REAUTH_RETURN_TO = "/app/settings?settings=account";

const ReceiptSchema = z.object({
  receiptId: z.string().min(1),
  completedAt: z.string().min(1),
});
type Receipt = z.infer<typeof ReceiptSchema>;

const ChallengeSchema = z.object({
  challengeId: z.string().min(1),
  method: z.enum(["oauth_reauth", "email_otp"]),
  expiresAt: z.string().min(1),
  mfaRequired: z.boolean(),
});

const StepUpSchema = z.object({
  stepUpToken: z.string().min(1),
  expiresAt: z.string().min(1),
});

const StoredChallengeSchema = z.object({
  challengeId: z.string().min(1),
});

type Phase = "intent" | "email" | "deleting";

function signOut() {
  window.location.assign("/api/auth/logout");
}

function problemCode(body: unknown): string {
  if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
    return body.code;
  }
  return "";
}

function deletionError(code: string): string {
  return ACCOUNT_DELETION_ERRORS[code] ?? ACCOUNT_DELETION_FALLBACK;
}

const WORKSPACE_MEMBERS_PATH = "/api/rowboat/v1/revenue-workspaces/current/members";

const MembersSchema = z.object({
  members: z
    .array(
      z.object({
        status: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * "loading" is still asking. "unknown" means the member list could not be
 * read. A number is how many other active members share a workspace this
 * account owns. Removed members do not count: deletion only transfers a
 * workspace that still has someone else active.
 */
export type WorkspaceShareFact = "loading" | "unknown" | number;

/**
 * A free plan with no trial and no past-due balance has nothing for Stripe
 * to cancel. A named paid plan, a trial, or a past-due balance does.
 */
export function deletionChargesASubscription(
  plan?: string | null,
  status?: string | null,
): boolean {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  if (normalizedStatus === "trialing" || normalizedStatus === "past_due") return true;
  const normalizedPlan = plan?.trim().toLowerCase() ?? "";
  return normalizedPlan !== "" && normalizedPlan !== "free";
}

export function deletionSubscriptionCopy(plan?: string | null, status?: string | null): string {
  if (deletionChargesASubscription(plan, status)) {
    return "We cancel your subscription immediately. You are not charged again.";
  }
  const name = planLabel(plan) || "Free";
  return `This account is on the ${name} plan. Nothing is billed, so there is no subscription to cancel.`;
}

export function deletionRowDescription(plan?: string | null, status?: string | null): string {
  if (deletionChargesASubscription(plan, status)) {
    return "Permanently delete your account, your data, and your subscription.";
  }
  return "Permanently delete your account and your data.";
}

export function deletionWorkspaceCopy(share: WorkspaceShareFact): string {
  if (share === "loading") return "Checking whether anyone else shares this workspace.";
  if (share === "unknown") return "We could not check whether anyone else shares this workspace.";
  if (share > 0) return "A shared workspace goes to another member. Their data stays.";
  return "This workspace is only yours. Deleting the account deletes it.";
}

/**
 * Active members other than the signed-in account. Without that account id
 * the list cannot tell a teammate from the owner, so the answer stays unknown.
 */
export function workspaceShareFromMembers(
  members: { status?: string; userId?: string }[] | null | undefined,
  currentUserId: string | undefined,
): WorkspaceShareFact {
  const self = currentUserId?.trim() ?? "";
  if (!members || !self) return "unknown";
  return members.filter((member) => {
    if ((member.status ?? "").trim().toLowerCase() !== "active") return false;
    const id = member.userId?.trim() ?? "";
    return id !== "" && id !== self;
  }).length;
}

/**
 * Self-serve account deletion (DELETE /v1/me). Typing DELETE records intent.
 * One button then proves identity and finishes the deletion: a fresh
 * sign-in, or a one-time email code when no second factor is enrolled.
 * The API still requires that proof. It is single-use, stays in memory,
 * and is never written to storage. Coming back from that sign-in deletes
 * the account only because this button stored the challenge first.
 */
export function DeleteAccountRow({
  plan = null,
  billingStatus = null,
  userId,
  watchMembers = false,
  workspaceShare: workspaceShareProp,
}: {
  plan?: string | null;
  billingStatus?: string | null;
  userId?: string;
  watchMembers?: boolean;
  workspaceShare?: WorkspaceShareFact;
} = {}) {
  const [open, setOpen] = React.useState(false);
  const [loadedShare, setLoadedShare] = React.useState<WorkspaceShareFact>(
    workspaceShareProp ?? (watchMembers ? "loading" : 0),
  );
  const workspaceShare = workspaceShareProp ?? loadedShare;
  const [confirmation, setConfirmation] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("intent");
  const [code, setCode] = React.useState("");
  const [challengeId, setChallengeId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const resumeStarted = React.useRef(false);

  function resetIntent() {
    setPhase("intent");
    setCode("");
    setChallengeId(null);
  }

  const deleteAccount = React.useCallback(async (token: string) => {
    if (!token) {
      setPhase("intent");
      setError(ACCOUNT_DELETION_ERRORS.step_up_required);
      return;
    }
    setPending(true);
    setError(null);
    setPhase("deleting");
    try {
      const response = await dashboardFetch("/api/rowboat/v1/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE", stepUpToken: token }),
      });
      if (response.ok) {
        const parsed = ReceiptSchema.safeParse(await response.json().catch(() => null));
        if (parsed.success) {
          setReceipt(parsed.data);
        } else {
          signOut();
        }
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      // The proof is burned on the first attempt, including a billing failure,
      // so the next try has to be a new factor.
      setPhase("intent");
      setError(deletionError(problemCode(body)));
    } catch {
      setPhase("intent");
      setError(ACCOUNT_DELETION_FALLBACK);
    } finally {
      setPending(false);
    }
  }, []);

  const verifyStoredChallenge = React.useCallback(async (id: string) => {
    setPending(true);
    setError(null);
    setOpen(true);
    setConfirmation("DELETE");
    setPhase("deleting");
    try {
      const response = await dashboardFetch(
        `/api/rowboat/v1/me/deletion-challenges/${encodeURIComponent(id)}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      const parsed = StepUpSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        resetIntent();
        setError(deletionError(problemCode(body)));
        return;
      }
      await deleteAccount(parsed.data.stepUpToken);
    } catch {
      resetIntent();
      setError(ACCOUNT_DELETION_FALLBACK);
    } finally {
      setPending(false);
    }
  }, [deleteAccount]);

  React.useEffect(() => {
    if (workspaceShareProp !== undefined || !watchMembers) return;
    let cancelled = false;
    setLoadedShare("loading");
    void (async () => {
      try {
        const response = await dashboardFetch(WORKSPACE_MEMBERS_PATH);
        const body: unknown = await response.json().catch(() => null);
        const parsed = MembersSchema.safeParse(body);
        if (cancelled) return;
        if (!response.ok || !parsed.success) {
          setLoadedShare("unknown");
          return;
        }
        setLoadedShare(workspaceShareFromMembers(parsed.data.members, userId));
      } catch {
        if (!cancelled) setLoadedShare("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [watchMembers, userId, workspaceShareProp]);

  React.useEffect(() => {
    if (resumeStarted.current) return;
    const raw = window.sessionStorage.getItem(CHALLENGE_STORAGE_KEY);
    if (!raw) return;
    resumeStarted.current = true;
    window.sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const stored = StoredChallengeSchema.safeParse(parsed);
    if (!stored.success) return;
    void verifyStoredChallenge(stored.data.challengeId);
  }, [verifyStoredChallenge]);

  async function startChallenge(method: "oauth_reauth" | "email_otp") {
    setPending(true);
    setError(null);
    try {
      const response = await dashboardFetch("/api/rowboat/v1/me/deletion-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = ChallengeSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        setError(deletionError(problemCode(body)));
        return null;
      }
      return parsed.data.challengeId;
    } catch {
      setError(ACCOUNT_DELETION_FALLBACK);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function continueWithSignIn() {
    const id = await startChallenge("oauth_reauth");
    if (!id) return;
    // The id lets the settings page finish verification after AuthKit returns.
    // max_age=0 forces a real sign-in through AuthKit, including an enrolled
    // second factor. It must not jump straight to Google.
    window.sessionStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify({ challengeId: id }));
    const params = new URLSearchParams({
      return_to: REAUTH_RETURN_TO,
      max_age: "0",
    });
    window.location.assign(`/api/auth/workos/login?${params.toString()}`);
  }

  async function emailCode() {
    const id = await startChallenge("email_otp");
    if (!id) return;
    setChallengeId(id);
    setPhase("email");
    setCode("");
  }

  async function verifyCode() {
    if (!challengeId) return;
    setPending(true);
    setError(null);
    try {
      const response = await dashboardFetch(
        `/api/rowboat/v1/me/deletion-challenges/${encodeURIComponent(challengeId)}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      const parsed = StepUpSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const codeName = problemCode(body);
        if (codeName === "too_many_attempts" || codeName === "step_up_not_found" || codeName === "step_up_expired") {
          resetIntent();
        }
        setError(deletionError(codeName));
        return;
      }
      await deleteAccount(parsed.data.stepUpToken);
    } catch {
      setError(ACCOUNT_DELETION_FALLBACK);
    } finally {
      setPending(false);
    }
  }

  const intentReady = confirmation === "DELETE";

  return (
    <div className="settings-row" data-slot="delete-account-row">
      <div className="settings-row-copy">
        <p className="settings-row-label">Delete account</p>
        <p className="settings-row-description">{deletionRowDescription(plan, billingStatus)}</p>
      </div>
      <Button onClick={() => setOpen(true)} size="sm" variant="destructive">
        Delete account
      </Button>
      <Sheet
        onOpenChange={(next) => {
          if (!next && receipt) {
            signOut();
            return;
          }
          setOpen(next);
          if (!next) {
            setConfirmation("");
            setError(null);
            resetIntent();
          }
        }}
        open={open}
      >
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
          {receipt ? (
            <>
              <SheetHeader>
                <SheetTitle>Your account is deleted</SheetTitle>
                <SheetDescription>
                  Keep this receipt. Support can use it to confirm the deletion.
                </SheetDescription>
              </SheetHeader>
              <dl className="flex flex-col gap-3 px-4 text-sm">
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Receipt ID</dt>
                  <dd className="break-all font-mono">{receipt.receiptId}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Deleted at</dt>
                  <dd className="font-mono">{receipt.completedAt}</dd>
                </div>
              </dl>
              <SheetFooter>
                <Button onClick={signOut}>Sign out</Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Delete your account</SheetTitle>
                <SheetDescription>You cannot undo this.</SheetDescription>
              </SheetHeader>
              <ul className="list-disc space-y-1.5 px-8 text-sm text-muted-foreground">
                <li>{deletionSubscriptionCopy(plan, billingStatus)}</li>
                <li>We disconnect your connected accounts and delete your synced data.</li>
                <li>{deletionWorkspaceCopy(workspaceShare)}</li>
                <li>You are signed out, and you cannot sign in to this account again.</li>
              </ul>
              <div className="flex flex-col gap-2 px-4">
                <label
                  className="flex flex-col gap-2 text-sm font-medium"
                  htmlFor="delete-account-confirmation"
                >
                  Type DELETE to confirm
                  <Input
                    autoComplete="off"
                    id="delete-account-confirmation"
                    onChange={(event) => {
                      const next = event.target.value;
                      setConfirmation(next);
                      if (next !== "DELETE") {
                        resetIntent();
                      }
                    }}
                    value={confirmation}
                  />
                </label>
                {phase === "email" ? (
                  <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="delete-account-code">
                    Verification code
                    <Input
                      autoComplete="one-time-code"
                      id="delete-account-code"
                      inputMode="numeric"
                      onChange={(event) => setCode(event.target.value)}
                      value={code}
                    />
                  </label>
                ) : phase === "intent" ? (
                  <p className="text-sm text-muted-foreground">
                    Sign in again to confirm it is you. We delete the account when you come back.
                  </p>
                ) : null}
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <SheetFooter>
                {phase === "deleting" ? (
                  <Button disabled variant="destructive">
                    Deleting…
                  </Button>
                ) : phase === "email" ? (
                  <Button disabled={code.trim().length < 6 || pending} onClick={() => void verifyCode()}>
                    {pending ? "Checking…" : "Verify and delete"}
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={!intentReady || pending}
                      onClick={() => void continueWithSignIn()}
                      variant="destructive"
                    >
                      {pending ? "Continuing…" : "Permanently delete account"}
                    </Button>
                    <Button
                      disabled={!intentReady || pending}
                      onClick={() => void emailCode()}
                      variant="outline"
                    >
                      Email me a code instead
                    </Button>
                  </>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
