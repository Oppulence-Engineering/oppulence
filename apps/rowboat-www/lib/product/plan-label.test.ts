import { describe, expect, it } from "vitest";

import { planLabel, billingStatusLabel } from "./plan-label";

describe("plan labels", () => {
  it("names stored plan slugs", () => {
    expect(planLabel("intelligence")).toBe("Intelligence");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("enterprise_plus")).toBe("Enterprise Plus");
    expect(planLabel("")).toBe("");
    expect(planLabel(null)).toBe("");
  });

  it("names a subscription status", () => {
    expect(billingStatusLabel("past_due")).toBe("Past due");
    expect(billingStatusLabel("trialing")).toBe("Trial");
    expect(billingStatusLabel("active")).toBe("Active");
    expect(billingStatusLabel("canceled")).toBe("Canceled");
    expect(billingStatusLabel("incomplete_expired")).toBe("Incomplete Expired");
    expect(billingStatusLabel("")).toBe("");
    expect(billingStatusLabel("past_due")).not.toContain("_");
  });
});
