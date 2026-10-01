import { describe, expect, it, vi } from "vitest";

import type { RevenueLeakScan } from "@/lib/revenue/types";

import {
  AUDIT_HISTORY_PAGE,
  type AuditHistoryPage,
  auditPageHasMore,
  auditRows,
  loadReportScans,
} from "./fetch-report";

describe("loadReportScans", () => {
  it("asks for the next page by offset", async () => {
    const request = vi.fn().mockResolvedValue({ scans: [], hasMore: true });
    await expect(loadReportScans(request, undefined, AUDIT_HISTORY_PAGE)).resolves.toEqual({
      scans: [],
      hasMore: true,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/revenue-leak-scans?limit=10&offset=10" }),
    );
  });

  it("keeps the first page at the history size", async () => {
    const request = vi.fn().mockResolvedValue({ scans: [] });
    await expect(loadReportScans(request)).resolves.toEqual({ scans: [], hasMore: false });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/revenue-leak-scans?limit=10" }),
    );
  });
});

describe("auditPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const scans = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    })) as RevenueLeakScan[];
    const full = { scans, hasMore: false } as AuditHistoryPage;
    expect(auditPageHasMore(full)).toBe(false);
    expect(auditPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(auditRows(full)).toHaveLength(10);
  });

  it("treats a bare list as having no further page", () => {
    const scan = { id: "scan-1" } as RevenueLeakScan;
    expect(auditPageHasMore([])).toBe(false);
    expect(auditPageHasMore(undefined)).toBe(false);
    expect(auditRows([scan])).toEqual([scan]);
  });
});
