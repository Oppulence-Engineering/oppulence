"use client";

import "client-only";

import { Badge } from "@sim/emcn";
import { Building } from "@sim/emcn/icons";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@oppulence/ui/lib/utils";
import { SimProductPanel } from "@/components/features/sim-product/sim-product-frame/sim-product-frame";
import type { RelationshipCommitment } from "@/lib/revenue/types";

export type AccountTimelineItem = {
  id: string;
  label: string;
  detail: string;
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

export function commitmentTimelineLabel(direction: string) {
  if (direction === "promised_by_me") return "Outbound promise";
  if (direction === "promised_by_them") return "Inbound promise";
  if (direction === "mutual") return "Mutual promise";
  return "Commitment";
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

/** Promises past the overview preview, in the same words as the company record. */
export function commitmentPreviewRemainder(hidden: number): string {
  return hidden === 1 ? "Show the other 1 commitment" : `Show the other ${hidden} commitments`;
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
              </li>
            ))}
          </ul>
        )}
      </SimProductPanel>
    </section>
  );
}
