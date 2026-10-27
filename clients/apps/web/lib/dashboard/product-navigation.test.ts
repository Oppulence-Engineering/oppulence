import { describe, expect, it } from "vitest";

import {
  PRODUCT_VIEW_PATHS,
  REVENUE_TAB_LABELS,
  companyRecordSearch,
  productViewForPathname,
  revenueSelection,
  revenueTabFromParam,
  settingsSectionFromParam,
  workflowFocusFromParam,
} from "@/lib/dashboard/product-navigation";

describe("product navigation", () => {
  it("round-trips every dashboard route", () => {
    for (const [view, path] of Object.entries(PRODUCT_VIEW_PATHS)) {
      expect(productViewForPathname(path)).toBe(view);
    }
  });

  it("validates browser-controlled route parameters", () => {
    expect(productViewForPathname("/app/revenue-imposter")).toBe("chat");
    expect(revenueTabFromParam("people")).toBe("people");
    expect(revenueTabFromParam("not-a-tab")).toBe("commitments");
    expect(settingsSectionFromParam("security")).toBe("security");
    expect(settingsSectionFromParam("extensions")).toBe("connections");
    expect(settingsSectionFromParam("models")).toBe("overview");
    expect(settingsSectionFromParam("environment")).toBe("overview");
    expect(settingsSectionFromParam("not-a-section")).toBe("overview");
    expect(workflowFocusFromParam("runs")).toBe("runs");
    expect(workflowFocusFromParam("not-a-focus")).toBe("scheduled");
  });

  it("keeps a chosen company on the companies tab", () => {
    expect(companyRecordSearch("company-1")).toBe("?tab=relationships&company=company-1");
    expect(companyRecordSearch("acme harbor")).toBe("?tab=relationships&company=acme%20harbor");
    expect(revenueSelection("tasks")).toEqual({ tab: "tasks", company: null });
    expect(revenueSelection("relationships", "  company-1  ")).toEqual({
      tab: "relationships",
      company: "company-1",
    });
    expect(revenueSelection("relationships", "   ")).toEqual({
      tab: "relationships",
      company: null,
    });
  });

  it("distinguishes governed agent approvals from the recovery queue", () => {
    expect(REVENUE_TAB_LABELS.commitments).toBe("Promises");
    expect(REVENUE_TAB_LABELS.queue).toBe("Recovery");
    expect(REVENUE_TAB_LABELS.actions).toBe("Agent approvals");
  });
});
