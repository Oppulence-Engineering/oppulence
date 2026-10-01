import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  attentionWithCompanyTitles,
  isWorkspaceTask,
  personCompanyTitle,
  localCalendarDay,
  mapSettledWithConcurrency,
  mergeWorkspaceNotes,
  promiseDirectionLabel,
  promiseDueLabel,
  atRiskPulseCount,
  attentionWithoutTasks,
  detectorsWithoutTasks,
  digestWithoutTasks,
  exposureReasons,
  exposureRiskScore,
  recoveryPulseCount,
  recoveryQueueActions,
  taskIsDueToday,
  taskIsOverdue,
} from "@/lib/revenue/revenue-records";

describe("workspace notes from later timeline pages", () => {
  it("keeps the newer copy when an earlier page repeats a note", () => {
    const current = {
      externalId: "note-1",
      title: "Newer",
      body: "",
      relationshipId: "company-1",
      relationshipName: "Queue Page Co",
      occurredAt: "2026-10-02T00:00:00Z",
      eventType: "note",
    };
    const older = { ...current, title: "Older", occurredAt: "2026-09-01T00:00:00Z" };
    const added = { ...current, externalId: "note-2", title: "Earlier desk note" };
    expect(mergeWorkspaceNotes([current], [older, added]).map((note) => note.title)).toEqual([
      "Newer",
      "Earlier desk note",
    ]);
  });
});

describe("company titles shared with people and attention", () => {
  it("titles a domain-stored company and keeps a typed name", () => {
    expect(
      personCompanyTitle({
        orgName: "dogfood-label.example",
        orgDomain: "dogfood-label.example",
      }),
    ).toBe("Dogfood Label");
    expect(personCompanyTitle({ orgName: "Dogfood Order Co", orgDomain: "dogfood-order.example" })).toBe(
      "Dogfood Order Co",
    );
    expect(personCompanyTitle({ orgName: "", orgDomain: "northwind.example" })).toBe("");
    expect(
      attentionWithCompanyTitles(
        [{ relationshipId: "company-1", relationshipName: "northwind.example" }],
        [
          {
            id: "company-1",
            kind: "company",
            displayName: "northwind.example",
            accountDomain: "northwind.example",
          },
        ],
      ),
    ).toEqual([{ relationshipId: "company-1", relationshipName: "Northwind" }]);
  });
});

describe("mapSettledWithConcurrency", () => {
  it("bounds fan-out, preserves order, and retains partial failures", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const work = mapSettledWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      if (value === 3) throw new Error("timeline unavailable");
      return value * 10;
    });

    while (releases.length < 2) await Promise.resolve();
    releases.shift()?.();
    while (releases.length < 2) await Promise.resolve();
    releases.shift()?.();
    while (releases.length < 2) await Promise.resolve();
    releases.shift()?.();
    while (releases.length < 2) await Promise.resolve();
    releases.shift()?.();
    while (releases.length < 1) await Promise.resolve();
    releases.shift()?.();

    const results = await work;
    expect(maxActive).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(results[4]).toEqual({ status: "fulfilled", value: 50 });
  });

  it("rejects an invalid concurrency limit before starting work", async () => {
    await expect(
      mapSettledWithConcurrency([1], 0, (value) => Promise.resolve(value)),
    ).rejects.toThrow("positive integer");
  });
});

describe("local due dates", () => {
  it("keeps a task saved for 5pm local on that calendar day", () => {
    const picked = "2026-10-01";
    const stored = new Date(`${picked}T17:00:00`).toISOString();
    expect(isWorkspaceTask({ actionType: "follow_up_task", channel: "task" })).toBe(true);
    expect(isWorkspaceTask({ actionType: "warm_follow_up", channel: "email" })).toBe(false);
    expect(isWorkspaceTask({ actionType: "follow_up_task", channel: "email" })).toBe(false);
    const task = { actionType: "follow_up_task", channel: "task", reason: "Call the harbor" };
    const draft = { actionType: "warm_follow_up", channel: "email", reason: "Send the note" };
    expect(recoveryQueueActions([task, draft])).toEqual([draft]);
    expect(recoveryPulseCount(undefined, [])).toBeNull();
    expect(recoveryPulseCount(0, undefined)).toBe(0);
    expect(recoveryPulseCount(1, undefined)).toBeNull();
    expect(recoveryPulseCount(1, [task])).toBe(0);
    expect(recoveryPulseCount(2, [task, draft])).toBe(1);
    expect(recoveryPulseCount(1, undefined, true)).toBe(1);
    const taskAttention = {
      relationshipId: "company-1",
      recommendationId: "task-1",
      reasonCode: "recommendation",
    };
    const overdueAttention = {
      relationshipId: "company-2",
      reasonCode: "overdue_commitment",
    };
    expect(
      attentionWithoutTasks([taskAttention, overdueAttention], new Set(["task-1"])),
    ).toEqual([overdueAttention]);
    expect(atRiskPulseCount(1, [taskAttention], [{ id: "task-1", actionType: "follow_up_task", channel: "task" }])).toBe(0);
    expect(
      atRiskPulseCount(2, [taskAttention, overdueAttention], [
        { id: "task-1", actionType: "follow_up_task", channel: "task" },
      ]),
    ).toBe(1);
    expect(atRiskPulseCount(1, undefined, [])).toBeNull();
    expect(
      digestWithoutTasks(
        [{ detector: "Manual", reason: "Call the harbor" }, { detector: "Waiting on you", reason: "Send the note" }],
        [{ actionType: "follow_up_task", channel: "task", reason: "Call the harbor" }],
      ),
    ).toEqual([{ detector: "Waiting on you", reason: "Send the note" }]);
    expect(
      detectorsWithoutTasks(
        [{ detector: "manual", surfaced: 1, handled: 0 }],
        1,
      ),
    ).toEqual([]);
    expect(exposureRiskScore(30, 0)).toBe(0);
    expect(exposureRiskScore(30, 2)).toBe(30);
    expect(
      exposureReasons(
        [{ reason: "recommendation", relationships: 1 }],
        [taskAttention],
        [{ id: "task-1", actionType: "follow_up_task", channel: "task" }],
      ),
    ).toEqual([]);
    expect(taskIsDueToday(stored, picked)).toBe(true);
    const evening = new Date(`${picked}T18:30:00`).getTime();
    expect(taskIsOverdue(stored, evening)).toBe(false);
    expect(taskIsOverdue(stored, new Date(`${picked}T10:00:00`).getTime())).toBe(false);
    expect(taskIsOverdue(stored, new Date("2026-10-02T09:00:00").getTime())).toBe(true);
    expect(taskIsOverdue(undefined, evening)).toBe(false);
    expect(taskIsOverdue("not-a-date", evening)).toBe(false);
    expect(taskIsDueToday(undefined, picked)).toBe(false);
    expect(taskIsDueToday("not-a-date", picked)).toBe(false);
    expect(localCalendarDay(stored)).toBe(picked);
    const shown = new Date(stored).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    expect(promiseDirectionLabel("promised_by_me")).toBe("we owe them");
    expect(promiseDirectionLabel("promised_by_them")).toBe("they owe us");
    expect(promiseDirectionLabel("mutual")).toBe("we both owe");
    expect(promiseDirectionLabel(undefined)).toBe("we owe them");
    expect(promiseDueLabel(stored)).toBe(`due ${shown}`);
    expect(promiseDueLabel(undefined)).toBe("due unspecified");
    expect(promiseDueLabel("not-a-date")).toBe("due unspecified");
  });

  it("still matches that day after 5pm Pacific rolls the UTC date", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
        const picked = "2026-10-01";
        const stored = new Date(picked + "T17:00:00").toISOString();
        const date = new Date(stored);
        const pad = (value) => String(value).padStart(2, "0");
        const local = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (zone !== "America/Los_Angeles") {
          console.error("zone " + zone);
          process.exit(2);
        }
        if (stored.slice(0, 10) !== "2026-10-02") {
          console.error("prefix " + stored);
          process.exit(3);
        }
        if (local !== picked) {
          console.error("local " + local);
          process.exit(4);
        }
        const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        if (label !== "Oct 1, 2026") {
          console.error("label " + label);
          process.exit(5);
        }
        process.exit(0);
      `,
      ],
      { env: { ...process.env, TZ: "America/Los_Angeles" }, encoding: "utf8" },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
