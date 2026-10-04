"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@oppulence/ui/components/button";
import { Input } from "@oppulence/ui/components/input";

import {
  planResponseToken,
  sharedPlanOwnerLabel,
  sharedPlanVersionLabel,
} from "@/lib/revenue/revenue";

type PublicPlan = {
  planId: string;
  status: string;
  currentRevision: {
    version: number;
    revisionHash: string;
    items: Array<{
      itemId: string;
      title: string;
      ownerParticipantRef: string;
      dueAt?: string;
      status: string;
    }>;
  };
};

async function planCall(token: string, response?: Record<string, unknown>) {
  const result = await fetch("/api/plan-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...(response ? { response } : {}) }),
    cache: "no-store",
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(body.detail || "The plan link is unavailable.");
  return body;
}

export default function PlanResponsePage() {
  const [token, setToken] = useState("");
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rememberedToken = useRef("");

  useEffect(() => {
    const nextToken = planResponseToken(window.location.hash, rememberedToken.current);
    window.history.replaceState(null, "", window.location.pathname);
    if (!nextToken) {
      setError("This plan link is missing its private response token.");
      return;
    }
    rememberedToken.current = nextToken;
    setToken(nextToken);
    setError("");
    let cancelled = false;
    void planCall(nextToken)
      .then((body) => {
        if (!cancelled) setPlan(body.plan as PublicPlan);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The plan is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const respond = async (kind: "confirm" | "blocked" | "completed" | "comment") => {
    if (!token || !plan) return;
    setBusy(true);
    setError("");
    try {
      await planCall(token, {
        responseId: crypto.randomUUID(),
        kind,
        comment: comment.trim(),
      });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record your response.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Shared plan
      </p>
      <h1 className="mt-3 text-3xl font-semibold">Review the shared plan</h1>
      {error ? (
        <p className="mt-6 border border-destructive/40 p-4 text-sm text-destructive">{error}</p>
      ) : null}
      {!plan && !error ? (
        <p className="mt-6 text-sm text-muted-foreground">Opening the plan…</p>
      ) : null}
      {plan ? (
        <section className="mt-8 space-y-5">
          <p className="text-sm text-muted-foreground">
            {sharedPlanVersionLabel(plan.currentRevision.version)}
          </p>
          <ul className="space-y-3">
            {plan.currentRevision.items.map((item) => {
              const owner = sharedPlanOwnerLabel(item.ownerParticipantRef);
              const due = item.dueAt ? `Due ${new Date(item.dueAt).toLocaleDateString()}` : "";
              const detail = [owner ? `Owner: ${owner}` : "", due].filter(Boolean).join(" · ");
              return (
                <li key={item.itemId} className="border border-border p-4">
                  <p className="font-medium">{item.title}</p>
                  {detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {sent ? (
            <p className="border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
              Your response was recorded for the plan owner to review. It did not silently change
              their records.
            </p>
          ) : (
            <>
              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Optional correction, blocker, or context"
                maxLength={4000}
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void respond("confirm")}>
                  Confirm plan
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => void respond("blocked")}>
                  Mark blocked
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => void respond("completed")}>
                  Report completed
                </Button>
                <Button
                  disabled={busy || !comment.trim()}
                  variant="outline"
                  onClick={() => void respond("comment")}
                >
                  Send a comment
                </Button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            This link shows only this plan.
          </p>
        </section>
      ) : null}
    </main>
  );
}
