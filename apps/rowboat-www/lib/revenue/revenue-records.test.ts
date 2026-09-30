import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  localCalendarDay,
  mapSettledWithConcurrency,
  promiseDueLabel,
  taskIsDueToday,
} from "@/lib/revenue/revenue-records";

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
    expect(taskIsDueToday(stored, picked)).toBe(true);
    expect(taskIsDueToday(undefined, picked)).toBe(false);
    expect(taskIsDueToday("not-a-date", picked)).toBe(false);
    expect(localCalendarDay(stored)).toBe(picked);
    const shown = new Date(stored).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
