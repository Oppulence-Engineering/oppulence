"use client";

import "client-only";

import { relationshipLabel } from "@oppulence/relationship-contract";
import { Badge } from "@sim/emcn";
import { Layout, TagIcon, TypeNumber, TypeText } from "@sim/emcn/icons";
import * as React from "react";
import { Check } from "@/lib/icons";

import { Button } from "@oppulence/ui/components/button";
import { Input } from "@oppulence/ui/components/input";
import { Spinner } from "@oppulence/ui/components/spinner";
import { cn } from "@oppulence/ui/lib/utils";
import {
  SimProductHeader,
  SimProductPanel,
  SimProductToolbar,
} from "@/components/features/sim-product/sim-product-frame/sim-product-frame";
import { decideRelationshipAttention } from "@/lib/revenue/revenue";
import type { RelationshipAttentionItem } from "@/lib/revenue/types";

const COLUMNS = [
  { name: "Company", icon: TypeText },
  { name: "Health", icon: TagIcon },
  { name: "Score", icon: TypeNumber },
  { name: "Why now", icon: TypeText },
] as const;

function healthBadge(item: RelationshipAttentionItem) {
  const band = attentionBand(item);
  if (band === "at_risk") return { label: "At risk", variant: "red" as const };
  if (band === "watch") return { label: "Watch", variant: "amber" as const };
  return { label: "Stable", variant: "green" as const };
}

export type AttentionBand = "all" | "at_risk" | "watch" | "stable";

/** The health badge and the band filter share one reading of urgency. */
export function attentionBand(item: RelationshipAttentionItem): Exclude<AttentionBand, "all"> {
  if (item.urgencyBand === "critical" || item.urgencyBand === "high") return "at_risk";
  if (item.urgencyBand === "normal") return "watch";
  return "stable";
}

/** The queue counts companies. One row is one company, not a user account. */
export function companyCountLabel(count: number): string {
  return count === 1 ? "1 company" : `${count} companies`;
}

export function filterAttentionItems(
  items: readonly RelationshipAttentionItem[],
  band: AttentionBand,
): RelationshipAttentionItem[] {
  if (band === "all") return [...items];
  return items.filter((item) => attentionBand(item) === band);
}

export type AttentionQueueSurfaceProps = Omit<
  React.ComponentPropsWithoutRef<"section">,
  "children"
> & {
  items: RelationshipAttentionItem[];
  loading?: boolean;
  onOpenRelationship: (relationshipId: string) => void;
  onChanged: () => void;
  onActionError: (message: string) => void;
};

/** Portfolio attention queue in the Sim ruled-table shape from marketing WebMenuPreview. */
export function AttentionQueueSurface({
  className,
  items,
  loading = false,
  onOpenRelationship,
  onChanged,
  onActionError,
  ...props
}: AttentionQueueSurfaceProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [band, setBand] = React.useState<AttentionBand>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dismissing, setDismissing] = React.useState(false);
  const [dismissReason, setDismissReason] = React.useState("Not relevant right now");
  const visible = filterAttentionItems(items, band);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  React.useEffect(() => {
    const shown = filterAttentionItems(items, band);
    if (shown.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !shown.some((item) => item.id === selectedId)) {
      setSelectedId(shown[0]?.id ?? null);
    }
  }, [band, items, selectedId]);

  React.useEffect(() => {
    setDismissing(false);
  }, [selected?.id]);

  const decide = async (
    item: RelationshipAttentionItem,
    decision: "acknowledge" | "snooze" | "dismiss",
  ) => {
    const reason =
      decision === "dismiss"
        ? dismissReason.trim()
        : decision === "acknowledge"
          ? "Reviewed from the portfolio attention queue."
          : "Snoozed from the portfolio attention queue.";
    if (decision === "dismiss" && !reason) return;
    setBusy(`${item.id}:${decision}`);
    try {
      await decideRelationshipAttention(item.id, {
        decision,
        reason,
        expectedVersion: item.version,
        snoozedUntil:
          decision === "snooze"
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : undefined,
      });
      onChanged();
      setDismissing(false);
    } catch (error) {
      onActionError(
        error instanceof Error ? error.message : "Could not update the attention item.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!loading && items.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-queue-heading"
      className={cn("min-w-0", className)}
      data-capability="attention-queue"
      data-slot="attention-queue-surface"
      id="attention-queue"
      {...props}
    >
      <SimProductPanel>
        <SimProductHeader
          icon={Layout}
          title={
            <h2 className="text-base font-normal" id="attention-queue-heading">
              Attention queue
            </h2>
          }
          actions={loading ? "Loading…" : companyCountLabel(visible.length)}
        />
        <SimProductToolbar>
          <select
            aria-label="Attention band"
            className="h-8 border border-[var(--border)] bg-transparent px-2 text-[13px] text-[var(--text-primary)]"
            onChange={(event) => setBand(event.target.value as AttentionBand)}
            value={band}
          >
            <option value="all">All open items</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="stable">Stable</option>
          </select>
        </SimProductToolbar>

        <div className="overflow-x-auto">
          <table
            aria-label="Attention queue"
            className="w-full min-w-[620px] table-fixed border-collapse text-left"
          >
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[100px]" />
              <col className="w-[90px]" />
              <col className="w-[250px]" />
            </colgroup>
            <thead>
              <tr className="h-[34px] border-[var(--border)] border-b">
                {COLUMNS.map(({ name, icon: Icon }) => (
                  <th
                    className="border-[var(--border)] border-r px-2.5 font-normal last:border-r-0"
                    key={name}
                    scope="col"
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-[14px] text-[var(--text-icon)]" />
                      {name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="h-[37px] border-[var(--border)] border-b">
                  <td className="px-2.5 text-[var(--text-secondary)]" colSpan={4}>
                    Loading attention queue…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr className="h-[37px] border-[var(--border)] border-b">
                  <td className="px-2.5 text-[var(--text-secondary)]" colSpan={4}>
                    No companies in this band.
                  </td>
                </tr>
              ) : (
                visible.slice(0, 10).map((item) => {
                  const health = healthBadge(item);
                  const isSelected = selected?.id === item.id;
                  return (
                    <tr
                      className={cn(
                        "h-[37px] cursor-pointer border-[var(--border)] border-b transition-colors hover:bg-[var(--surface-hover)]",
                        isSelected && "bg-[var(--surface-3)]",
                      )}
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="border-[var(--border)] border-r px-2.5 font-medium text-[var(--text-primary)]">
                        <Button
                          className="h-auto justify-start px-0 text-left font-medium text-[var(--text-primary)] hover:bg-transparent hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(item.id);
                            onOpenRelationship(item.relationshipId);
                          }}
                          type="button"
                          variant="ghost"
                        >
                          {item.relationshipName}
                        </Button>
                      </td>
                      <td className="border-[var(--border)] border-r px-2.5">
                        <Badge variant={health.variant}>{health.label}</Badge>
                      </td>
                      <td className="border-[var(--border)] border-r px-2.5 tabular-nums">
                        {item.rankScore}
                      </td>
                      <td className="truncate px-2.5 text-[var(--text-secondary)]">
                        {item.explanation || relationshipLabel(item.reasonCode)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selected && !loading ? (
          <div className="border-[var(--border)] border-t px-3 py-2">
            <p className="text-sm text-[var(--text-primary)]" data-slot="attention-reason">
              {selected.explanation || relationshipLabel(selected.reasonCode)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-[var(--text-secondary)]">
                {selected.relationshipName}
              </span>
              <Button
                disabled={busy !== null}
                onClick={() => void decide(selected, "acknowledge")}
                size="sm"
                type="button"
                variant="outline"
              >
                {busy === `${selected.id}:acknowledge` ? <Spinner className="size-4" /> : <Check />}{" "}
                Review
              </Button>
              <Button
                disabled={busy !== null}
                onClick={() => void decide(selected, "snooze")}
                size="sm"
                type="button"
                variant="ghost"
              >
                Snooze 1d
              </Button>
              {dismissing ? (
                <>
                  <Input
                    aria-label="Why this should be dismissed"
                    className="h-8 max-w-xs rounded-none"
                    value={dismissReason}
                    onChange={(event) => setDismissReason(event.target.value)}
                  />
                  <Button
                    disabled={busy !== null || !dismissReason.trim()}
                    onClick={() => void decide(selected, "dismiss")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {busy === `${selected.id}:dismiss` ? <Spinner className="size-4" /> : null}{" "}
                    Confirm dismiss
                  </Button>
                  <Button
                    disabled={busy !== null}
                    onClick={() => setDismissing(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  disabled={busy !== null}
                  onClick={() => setDismissing(true)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </SimProductPanel>
    </section>
  );
}
