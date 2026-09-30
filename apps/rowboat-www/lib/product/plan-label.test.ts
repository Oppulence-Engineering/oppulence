import { describe, expect, it } from "vitest";

import { planLabel } from "./plan-label";

describe("plan labels", () => {
  it("names stored plan slugs", () => {
    expect(planLabel("intelligence")).toBe("Intelligence");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("enterprise_plus")).toBe("Enterprise Plus");
    expect(planLabel("")).toBe("");
    expect(planLabel(null)).toBe("");
  });
});
