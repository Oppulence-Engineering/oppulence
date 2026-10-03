"use client";

import "client-only";

import { Badge } from "@sim/emcn";
import { Building } from "@sim/emcn/icons";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@oppulence/ui/lib/utils";
import { SimProductPanel } from "@/components/features/sim-product/sim-product-frame/sim-product-frame";
import { promiseDirectionLabel } from "@/lib/revenue/revenue-records";
import type { RelationshipCommitment } from "@/lib/revenue/types";

export type AccountTimelineItem = {
  id: string;
  label: string;
  detail: string;
  due?: string;
  statusLabel: string;
  statusVariant: "green" | "amber" | "red";
};

export type AccountMissionControlSurfaceProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children"
> & {
  accountName: string;
  attentionLabel?: string;
  attentionVariant?: "green" | "amber" | "red";
  items: AccountTimelineItem[];
  emptyMessage?: string;
  showHeader?: boolean;
};

/** The overview card uses the same direction words as the promise record. */
export function commitmentTimelineLabel(direction: string) {
  const label = promiseDirectionLabel(direction);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Same window the register uses. At risk is a fact about the clock, not a stored status. */
const AT_RISK_WINDOW_MS = 72 * 60 * 60 * 1000;

export function commitmentTimelineStatus(
  commitment: RelationshipCommitment,
  now = Date.now(),
): {
  label: string;
  variant: AccountTimelineItem["statusVariant"];
} {
  // The register already separates these. A waived promise was released, and a
  // missed one was missed. Neither is a promise that was kept or is merely at risk.
  switch (commitment.status) {
    case "met":
    case "fulfilled":
      return { label: "Kept", variant: "green" };
    case "waived":
      return { label: "Waived", variant: "amber" };
    case "missed":
      return { label: "Missed", variant: "red" };
    case "cancelled":
      return { label: "Cancelled", variant: "amber" };
    case "superseded":
      return { label: "Superseded", variant: "amber" };
    default:
      break;
  }
  // "at_risk" is never stored. A disputed promise keeps status "open" and
  // records the dispute on acceptance, so both have to be read here.
  if (commitment.status === "disputed" || commitment.acceptance === "disputed") {
    return { label: "Disputed", variant: "red" };
  }
  if (commitment.acceptance === "candidate") {
    return { label: "Review", variant: "amber" };
  }
  const due = commitment.dueAt ? Date.parse(commitment.dueAt) : Number.NaN;
  if (commitment.status === "at_risk" || (Number.isFinite(due) && due < now + AT_RISK_WINDOW_MS)) {
    return { label: "At risk", variant: "red" };
  }
  return { label: "Open", variant: "amber" };
}

/**
 * The company highlight is the same set the commitments list calls open:
 * still outstanding, and already confirmed. An extraction waiting for review
 * and a dispute are not that number.
 */
export function openCommitmentCount(
  commitments: readonly { status: string; acceptance?: string | null }[],
): number {
  return commitments.filter(
    (item) =>
      item.status === "open" && item.acceptance !== "candidate" && item.acceptance !== "disputed",
  ).length;
}

/** The follow-up list uses the same clock as the promise badge. */
export function atRiskPromiseCount(
  commitments: readonly RelationshipCommitment[],
  now = Date.now(),
): number {
  return commitments.filter((item) => commitmentTimelineStatus(item, now).label === "At risk").length;
}

/** Past due is already late. Due soon is still inside the 72-hour window. */
export function overduePromiseCount(
  commitments: readonly RelationshipCommitment[],
  now = Date.now(),
): number {
  return commitments.filter((item) => {
    if (commitmentTimelineStatus(item, now).label !== "At risk") return false;
    const due = item.dueAt ? Date.parse(item.dueAt) : Number.NaN;
    return Number.isFinite(due) && due < now;
  }).length;
}

/**
 * Checked follow-ups win. Before that check, a promise already marked at risk
 * is still a follow-up, so the heading must not say zero.
 */
export function promiseFollowUpTitle(evaluationCount: number, atRiskCount: number): string {
  const checked = Number.isFinite(evaluationCount) ? Math.max(0, Math.round(evaluationCount)) : 0;
  const waiting = Number.isFinite(atRiskCount) ? Math.max(0, Math.round(atRiskCount)) : 0;
  const count = checked > 0 ? checked : waiting;
  return `Promises to follow up (${count})`;
}

/** An empty check is not the same as a promise that is already due. */
export function promiseFollowUpEmptyCopy(atRiskCount: number, overdueCount = 0): string {
  const waiting = Number.isFinite(atRiskCount) ? Math.max(0, Math.round(atRiskCount)) : 0;
  const overdue = Math.min(
    waiting,
    Number.isFinite(overdueCount) ? Math.max(0, Math.round(overdueCount)) : 0,
  );
  const dueSoon = waiting - overdue;
  if (waiting === 0) return "No promises are due for a follow-up.";
  const parts: string[] = [];
  if (overdue === 1) parts.push("A promise is past due");
  else if (overdue > 1) parts.push(`${overdue} promises are past due`);
  if (dueSoon === 1) parts.push(overdue > 0 ? "1 is due soon" : "A promise is due soon");
  else if (dueSoon > 1) {
    parts.push(overdue > 0 ? `${dueSoon} are due soon` : `${dueSoon} promises are due soon`);
  }
  return `${parts.join(" and ")}. Reconcile to check the follow-up.`;
}

/** Promises past the overview preview, in the same words as the company record. */
export function commitmentPreviewRemainder(hidden: number): string {
  return hidden === 1 ? "Show the other 1 promise" : `Show the other ${hidden} promises`;
}

/**
 * The activity names the day in UTC. The company card uses that same day so a
 * promise due late on the 20th does not read as the 19th.
 */
export function commitmentTimelineDue(dueAt?: string | null): string | undefined {
  if (!dueAt?.trim()) return undefined;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Due: ${day}`;
}

/** Maps live register rows into the Sim account timeline rows. */
export function mapCommitmentsToAccountTimeline(
  commitments: RelationshipCommitment[],
  limit = 5,
  now = Date.now(),
): AccountTimelineItem[] {
  return commitments.slice(0, limit).map((commitment) => {
    const status = commitmentTimelineStatus(commitment, now);
    return {
      id: commitment.id,
      label: commitmentTimelineLabel(commitment.direction),
      detail: commitment.text.trim(),
      due: commitmentTimelineDue(commitment.dueAt),
      statusLabel: status.label,
      statusVariant: status.variant,
    };
  });
}

export function accountAttentionFromHealth(health?: string) {
  if (health === "critical" || health === "needs_attention") {
    return { label: "Needs you", variant: "amber" as const };
  }
  if (health === "healthy") {
    return { label: "Stable", variant: "green" as const };
  }
  return undefined;
}

/** Single-account mission control in the Sim AccountMenuPreview shape. */
export function AccountMissionControlSurface({
  accountName,
  attentionLabel,
  attentionVariant = "amber",
  className,
  emptyMessage = "No commitments recorded for this company yet.",
  items,
  showHeader = true,
  ...props
}: AccountMissionControlSurfaceProps) {
  return (
    <section
      aria-labelledby={showHeader ? "account-mission-control-heading" : undefined}
      className={cn("min-w-0", className)}
      data-capability="mission-control"
      data-slot="account-mission-control-surface"
      {...props}
    >
      <SimProductPanel className="max-w-[480px]">
        {showHeader ? (
          <div className="flex h-11 items-center gap-2 border-[var(--border)] border-b px-4">
            <Building className="size-[14px] text-[var(--text-icon)]" />
            <h2
              className="truncate text-[var(--text-primary)]"
              id="account-mission-control-heading"
            >
              {accountName}
            </h2>
            {attentionLabel ? (
              <Badge className="ml-auto shrink-0" variant={attentionVariant}>
                {attentionLabel}
              </Badge>
            ) : null}
          </div>
        ) : null}
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li
                className="flex flex-col gap-0.5 border-[var(--border)] border-b px-4 py-3 last:border-b-0"
                key={item.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)] text-xs uppercase tracking-[0.06em]">
                    {item.label}
                  </span>
                  <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
                </div>
                <span className="text-[var(--text-primary)]">{item.detail}</span>
                {item.due ? (
                  <span className="text-[var(--text-muted)] text-xs">{item.due}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SimProductPanel>
    </section>
  );
}
