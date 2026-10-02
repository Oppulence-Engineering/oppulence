"use client";

import "client-only";

import * as React from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  ClockCounterClockwise,
  EnvelopeSimple,
  WarningCircle,
  PaperPlaneTilt,
  PencilSimple,
  Prohibit,
  XCircle,
} from "@/lib/icons";

import { Alert, AlertDescription, AlertTitle } from "@oppulence/ui/components/alert";
import { Badge } from "@oppulence/ui/components/badge";
import { CardTitle } from "@oppulence/ui/components/card";
import { Button } from "@oppulence/ui/components/button";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { Input } from "@oppulence/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@oppulence/ui/components/sheet";
import { Textarea } from "@oppulence/ui/components/textarea";
import {
  ACTION_TYPE_LABELS,
  approveAction,
  DETECTOR_LABELS,
  dismissAction,
  dismissReasonLabel,
  editAction,
  evaluateAction,
  executeAction,
  friendlyRevenueError,
  getAction,
  getSourceBody,
  rejectAction,
  RevenueAPIError,
  snoozeWakeCopy,
  startCheckout,
} from "@/lib/revenue/revenue";
import {
  errMessage,
  Field,
  ModeChip,
  PolicyBadge,
  PriorityBreakdown,
} from "@/components/features/revenue/shared/shared";
import {
  GovernedActionPrimaryButton,
  GovernedActionSecondaryButton,
  GovernedActionSurface,
} from "@/components/features/revenue/governed-action-surface/governed-action-surface";
import { capture, RevenueEvents } from "@/lib/analytics/analytics";
import type { RevenueAction, RevenueWorkspace } from "@/lib/revenue/types";

/** An uncertain send stores a reconciliation token. The review says where that check stands. */
export function reconciliationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "found":
      return "The provider confirmed this send.";
    case "not_found":
      return "The provider has no record of this send.";
    case "error":
      return "The provider check failed.";
    case "manual_review":
      return "This needs a person to check it.";
    default:
      return "Still checking with the provider.";
  }
}

/**
 * A definite send failure is stored, then the action returns to pending so it
 * can be retried. The review sheet has to say why the last attempt stopped.
 */
export function executionFailureCopy(error: string | null | undefined): string {
  const raw = (error ?? "").trim();
  if (!raw) return "";
  if (/no execution backend configured/i.test(raw)) {
    return "Sending is not set up for this workspace yet.";
  }
  if (/no execution backend for channel/i.test(raw)) {
    return "This channel cannot send yet.";
  }
  if (/execution backend for channel .+ is not configured/i.test(raw)) {
    return "This channel is not set up to send yet.";
  }
  if (/has no recipient email/i.test(raw)) return "Add a recipient before sending.";
  if (/has no proposed message/i.test(raw)) return "Write the message before sending.";
  if (/Slack has no provider draft/i.test(raw)) {
    return "Slack cannot save a draft. Switch this to send after you review it.";
  }
  if (/Google Calendar has no provider draft/i.test(raw)) {
    return "Calendar cannot save a draft. Switch this to send after you review it.";
  }
  if (/HubSpot has no provider draft/i.test(raw)) {
    return "HubSpot cannot save a draft. Switch this to send after you review it.";
  }
  if (/needs dueAt/i.test(raw)) return "Add a start time before creating the event.";
  if (/Google Calendar executor is not configured/i.test(raw)) {
    return "Calendar sending is not set up yet.";
  }
  if (/google is not connected/i.test(raw)) {
    return "Connect Google for the person who will send this, then try again.";
  }
  if (/missing the .+ scope|reconnect Google/i.test(raw)) {
    return "Google is missing permission for this send. Reconnect, then try again.";
  }
  if (/refresh token is invalid/i.test(raw)) {
    return "Google stopped accepting the authorization. Reconnect, then try again.";
  }
  if (/could not obtain a google access token/i.test(raw)) {
    return "Google could not authorize this send. Reconnect, then try again.";
  }
  if (/gmail returned 403|returned 403/i.test(raw)) {
    return "Google refused this send. Reconnect Gmail, then try again.";
  }
  if (/Slack action needs target/i.test(raw)) return "Choose the Slack channel before sending.";
  if (/HubSpot action needs a relationship resource ref/i.test(raw)) {
    return "Link the HubSpot record before sending.";
  }
  const friendly = friendlyRevenueError(raw);
  if (friendly !== raw) return friendly;
  if (/^revenue:/i.test(raw)) {
    return "The last attempt did not send. Fix the draft, then try again.";
  }
  return raw;
}

/** The bounded-retry sentence is the same fact as "needs a person". Hide that duplicate. */
export function reconciliationErrorCopy(error: string | null | undefined): string {
  const raw = (error ?? "").trim();
  if (
    !raw ||
    raw === "provider marker was not found after bounded reconciliation attempts" ||
    raw === "The provider could not confirm this send."
  ) {
    return "";
  }
  if (raw === "execution idempotency key is missing" || raw === "This send has no receipt to check.") {
    return "This send has no receipt to check.";
  }
  return raw;
}

function governedSourceLine(action: RevenueAction) {
  const evidence = action.evidence[0];
  if (!evidence) {
    return action.reason ? `Source: ${action.reason}` : undefined;
  }
  const date = new Date(evidence.occurredAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const account = action.recipientEmail ? ` · ${action.recipientEmail}` : "";
  return `Source: thread from ${date}${account}`;
}

export function ReviewSheet({
  action,
  workspace,
  onClose,
  onPatched,
  onRemoved,
  onError,
  onNotice,
  onOpenAudit,
}: {
  action: RevenueAction | null;
  workspace: RevenueWorkspace | null;
  onClose: () => void;
  onPatched: (a: RevenueAction) => void;
  onRemoved: (id: string) => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
  onOpenAudit: (a: RevenueAction) => void;
}) {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [acceptRisk, setAcceptRisk] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [upsell, setUpsell] = React.useState(false);
  const [original, setOriginal] = React.useState<string | null>(null);
  const [loadingOriginal, setLoadingOriginal] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (action) {
      setSubject(action.proposedSubject ?? "");
      setMessage(action.proposedMessage ?? "");
      setAcceptRisk(false);
      setRejecting(false);
      setRejectReason("");
      setUpsell(false);
      setOriginal(null);
      setActionError(null);
    }
  }, [action]);

  if (!action) return null;

  const isSend = action.executionMode === "send";
  const isEmail = action.channel === "email";
  const uncertain =
    action.executionStatus === "ambiguous" || action.reconciliationStatus === "manual_review";
  const sendFailure =
    action.executionStatus === "pending" || action.executionStatus === "failed"
      ? executionFailureCopy(action.executionError)
      : "";
  const dismissal =
    action.queueStatus === "dismissed" ? dismissReasonLabel(action.dismissReason) : "";
  const snooze = action.queueStatus === "snoozed" ? snoozeWakeCopy(action.snoozedUntil) : "";
  const linked = workspace?.mode === "linked" && workspace.status === "active";
  const dirty =
    subject !== (action.proposedSubject ?? "") || message !== (action.proposedMessage ?? "");
  const approved =
    action.approvalStatus === "approved" && action.approvedRevision === action.revision;
  const needsRisk = isSend && action.policyStatus === "review_required";
  const blocked = action.policyStatus === "blocked";
  const rejected = action.approvalStatus === "rejected";
  const executeLabel = isSend
    ? action.channel === "slack"
      ? "Post approved Slack message"
      : action.channel === "crm" || action.channel === "crm_task" || action.channel === "task"
        ? "Apply approved HubSpot update"
        : action.channel === "calendar"
          ? "Create approved calendar event"
          : "Send approved email"
    : "Create provider draft";

  const wrap = async (
    key: string,
    fn: () => Promise<RevenueAction>,
    opts?: { removeOnDone?: boolean; note?: string },
  ) => {
    setBusy(key);
    onError("");
    setActionError(null);
    try {
      const updated = await fn();
      onPatched(updated);
      if (opts?.note) onNotice(opts.note);
      if (opts?.removeOnDone) onRemoved(action.id);
    } catch (e) {
      if (e instanceof RevenueAPIError && e.code === "subscription_required") {
        setUpsell(true); // acting is a paid step; show the upgrade prompt inline
        return;
      }
      const message =
        e instanceof RevenueAPIError
          ? e.message
          : errMessage(e, "The action could not be completed.");
      setActionError(message);
      onError(message);
    } finally {
      setBusy(null);
    }
  };

  const viewOriginal = async () => {
    if (!action) return;
    setLoadingOriginal(true);
    onError("");
    setActionError(null);
    try {
      setOriginal(await getSourceBody(action.id));
    } catch (e) {
      if (e instanceof RevenueAPIError && e.status === 404) {
        setOriginal("(The original email body is not available.)");
      } else {
        const message = errMessage(e, "Could not load the original email.");
        setActionError(message);
        onError(message);
      }
    } finally {
      setLoadingOriginal(false);
    }
  };

  const upgrade = async () => {
    setBusy("upgrade");
    onError("");
    setActionError(null);
    capture(RevenueEvents.UpgradeClicked, { from: "review_sheet" });
    try {
      const url = await startCheckout("pro");
      window.location.assign(url);
    } catch (e) {
      const message = errMessage(e, "Could not start checkout.");
      setActionError(message);
      onError(message);
      setBusy(null);
    }
  };

  const saveEdit = () =>
    wrap(
      "save",
      () => editAction(action.id, { proposedSubject: subject, proposedMessage: message }),
      {
        note: "Saved — this created a new revision, so re-check and approve before sending.",
      },
    );

  const evaluate = () =>
    wrap("evaluate", async () => {
      await evaluateAction(action.id);
      return await getAction(action.id);
    });

  const approve = () =>
    wrap("approve", async () => {
      const r = await approveAction(action.id, acceptRisk);
      capture(RevenueEvents.ActionApproved, {
        detector: action.detector,
        mode: action.executionMode,
      });
      return r;
    });

  const doReject = () =>
    wrap("reject", () => rejectAction(action.id, rejectReason || "not_appropriate"), {
      removeOnDone: true,
      note: "Rejected.",
    });

  const execute = () =>
    wrap(
      "execute",
      async () => {
        const r = await executeAction(action.id);
        capture(RevenueEvents.ActionExecuted, {
          detector: action.detector,
          mode: action.executionMode,
        });
        return r;
      },
      {
        note: isSend ? "Sent." : "Draft created in your Gmail — open Gmail to review and send.",
        removeOnDone: true,
      },
    );

  return (
    <Sheet data-slot="review-sheet" open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {DETECTOR_LABELS[action.detector] ?? action.detector}
            </Badge>
            <ModeChip mode={action.executionMode} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenAudit(action)}
              className="ml-auto text-primary/55 hover:text-primary"
            >
              <ClockCounterClockwise /> History
            </Button>
          </div>
          <SheetTitle>{ACTION_TYPE_LABELS[action.actionType] ?? action.actionType}</SheetTitle>
          <SheetDescription>{action.reason}</SheetDescription>
        </SheetHeader>
        {actionError ? (
          <p
            className="border-b border-destructive/30 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-1 flex-col gap-5 px-4 py-5">
          {upsell ? (
            <div className="flex flex-col gap-2 rounded-[2px] border border-oppulence-orange/40 bg-oppulence-orange/5 p-4">
              <div className="text-sm font-medium text-primary">
                Acting on actions is a paid step
              </div>
              <p className="text-sm text-primary/65">
                Scanning, the queue, drafts, and your impact stay free. Approving and sending need a
                subscription — upgrade to act on this one.
              </p>
              <div>
                <Button size="sm" onClick={upgrade} disabled={busy !== null}>
                  {busy === "upgrade" ? <CircleNotch className="animate-spin" /> : null} Upgrade to
                  act
                </Button>
              </div>
            </div>
          ) : null}
          {blocked ? (
            <Alert variant="destructive">
              <Prohibit weight="fill" />
              <AlertTitle>Policy blocked this contact</AlertTitle>
              <AlertDescription>
                Preflight flagged this recipient (suppressed, invalid, or excluded). It can&apos;t
                be sent.
              </AlertDescription>
            </Alert>
          ) : null}
          {rejected ? (
            <Alert>
              <XCircle weight="fill" />
              <AlertDescription>This action was rejected.</AlertDescription>
            </Alert>
          ) : null}

          {dismissal ? (
            <Alert>
              <AlertTitle>Dismissed</AlertTitle>
              <AlertDescription>{dismissal}</AlertDescription>
            </Alert>
          ) : null}
          {snooze ? (
            <Alert>
              <AlertDescription>{snooze}</AlertDescription>
            </Alert>
          ) : null}

          {sendFailure && !uncertain ? (
            <Alert>
              <WarningCircle weight="fill" />
              <AlertTitle>The last attempt did not send</AlertTitle>
              <AlertDescription>{sendFailure}</AlertDescription>
            </Alert>
          ) : null}

          {uncertain ? (
            <Alert>
              <ClockCounterClockwise weight="fill" />
              <AlertTitle>Provider result uncertain — do not retry</AlertTitle>
              <AlertDescription>
                {reconciliationStatusLabel(action.reconciliationStatus)}
                {action.reconciliationAttempts
                  ? ` Checked ${action.reconciliationAttempts} time${action.reconciliationAttempts === 1 ? "" : "s"}.`
                  : ""}
                {reconciliationErrorCopy(action.reconciliationError)
                  ? ` ${reconciliationErrorCopy(action.reconciliationError)}`
                  : ""}
              </AlertDescription>
            </Alert>
          ) : null}

          {action.recipientEmail ? (
            <Field label={isEmail ? "To" : "Destination"}>
              <Input value={action.recipientEmail} readOnly className="bg-background-100/50" />
            </Field>
          ) : null}
          {isEmail || action.proposedSubject ? (
            <Field label={action.channel === "calendar" ? "Event title" : "Subject"}>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={action.channel === "calendar" ? "Event title" : "Subject line"}
              />
            </Field>
          ) : null}
          {isEmail && isSend ? (
            <GovernedActionSurface
              heldLabel={
                approved ? "Approved" : rejected ? "Rejected" : blocked ? "Blocked" : "Held"
              }
              message={message}
              onMessageChange={setMessage}
              readOnly={rejected || blocked}
              sourceLine={governedSourceLine(action)}
              title="Follow-up draft"
              primaryAction={
                !approved ? (
                  <GovernedActionPrimaryButton
                    disabled={
                      busy !== null || blocked || rejected || dirty || (needsRisk && !acceptRisk)
                    }
                    onClick={approve}
                    title={dirty ? "Save your edits first" : undefined}
                  >
                    {busy === "approve" ? <CircleNotch className="animate-spin" /> : null}
                    Approve send
                  </GovernedActionPrimaryButton>
                ) : (
                  <GovernedActionPrimaryButton
                    disabled={busy !== null || blocked || uncertain || !linked}
                    onClick={execute}
                  >
                    {busy === "execute" ? (
                      <CircleNotch className="animate-spin" />
                    ) : (
                      <PaperPlaneTilt />
                    )}
                    {executeLabel}
                  </GovernedActionPrimaryButton>
                )
              }
              secondaryAction={
                dirty ? (
                  <GovernedActionSecondaryButton disabled={busy !== null} onClick={saveEdit}>
                    {busy === "save" ? <CircleNotch className="animate-spin" /> : <PencilSimple />}
                    Edit draft
                  </GovernedActionSecondaryButton>
                ) : null
              }
            />
          ) : (
            <Field
              label={
                action.channel === "crm" || action.channel === "crm_task"
                  ? "HubSpot note or task"
                  : "Message"
              }
            >
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                className="resize-y font-normal"
                placeholder="Exact approved content"
              />
              <p className="mt-1 text-xs text-primary/45">
                Editing the draft creates a new revision and clears any prior approval — you&apos;ll
                re-approve below.
              </p>
            </Field>
          )}

          <PriorityBreakdown action={action} />

          {/* The original email, fetched on demand (RFC 031 Layer 3). */}
          {isEmail ? (
            <div className="rounded-[2px] border border-border p-3">
              {original === null ? (
                <Button variant="ghost" size="sm" onClick={viewOriginal} disabled={loadingOriginal}>
                  {loadingOriginal ? <CircleNotch className="animate-spin" /> : <EnvelopeSimple />}
                  View original email
                </Button>
              ) : (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-normal text-xs text-primary/70">
                  {original}
                </pre>
              )}
            </div>
          ) : null}

          {isSend ? (
            <div className="flex flex-col gap-2 rounded-[2px] border border-border p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-primary">Sending check</CardTitle>
                <PolicyBadge status={action.policyStatus} />
              </div>
              {!linked ? (
                <p className="text-xs text-primary/55">
                  This workspace is in local mode. Sending stays off until it is linked. You can
                  still create a Gmail draft.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={evaluate} disabled={busy !== null}>
                    {busy === "evaluate" ? (
                      <CircleNotch className="animate-spin" />
                    ) : (
                      <ArrowClockwise />
                    )}
                    Re-check policy
                  </Button>
                  {needsRisk ? (
                    <label className="flex items-center gap-1.5 text-xs text-primary/70">
                      <Checkbox
                        checked={acceptRisk}
                        onCheckedChange={(checked) => setAcceptRisk(checked === true)}
                      />
                      Accept the review-required risk
                    </label>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {rejecting ? (
            <div className="flex items-center gap-2 rounded-[2px] border border-border p-3">
              <Input
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (optional)"
              />
              <Button variant="destructive" size="sm" onClick={doReject} disabled={busy !== null}>
                {busy === "reject" ? <CircleNotch className="animate-spin" /> : <XCircle />} Confirm
                reject
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  wrap("dismiss", () => dismissAction(action.id, "reviewed_not_relevant"), {
                    removeOnDone: true,
                  })
                }
                disabled={busy !== null}
              >
                {busy === "dismiss" ? <CircleNotch className="animate-spin" /> : <Prohibit />}{" "}
                Dismiss
              </Button>
              {isSend && !rejected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRejecting(true)}
                  disabled={busy !== null}
                >
                  <XCircle /> Reject
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {!(isEmail && isSend) && dirty ? (
                <Button variant="outline" size="sm" onClick={saveEdit} disabled={busy !== null}>
                  {busy === "save" ? <CircleNotch className="animate-spin" /> : <PencilSimple />}{" "}
                  Save draft
                </Button>
              ) : null}
              {!(isEmail && isSend) && !approved ? (
                <Button
                  size="sm"
                  onClick={approve}
                  disabled={
                    busy !== null || blocked || rejected || dirty || (needsRisk && !acceptRisk)
                  }
                  title={dirty ? "Save your edits first" : undefined}
                >
                  {busy === "approve" ? <CircleNotch className="animate-spin" /> : <CheckCircle />}{" "}
                  Approve
                </Button>
              ) : !(isEmail && isSend) ? (
                <Button
                  size="sm"
                  onClick={execute}
                  disabled={busy !== null || blocked || uncertain || (isSend && !linked)}
                >
                  {busy === "execute" ? (
                    <CircleNotch className="animate-spin" />
                  ) : isSend ? (
                    <PaperPlaneTilt />
                  ) : (
                    <EnvelopeSimple />
                  )}
                  {executeLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
