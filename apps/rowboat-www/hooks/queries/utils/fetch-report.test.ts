import { describe, expect, it, vi } from "vitest";

import { AUDIT_HISTORY_PAGE, auditHistoryHasMore, loadReportScans } from "./fetch-report";

describe("loadReportScans", () => {
  it("asks for the next page by offset", async () => {
    const request = vi.fn().mockResolvedValue({ scans: [] });
    await loadReportScans(request, undefined, AUDIT_HISTORY_PAGE);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/revenue-leak-scans?limit=10&offset=10" }),
    );
  });

  it("keeps the first page at the history size", async () => {
    const request = vi.fn().mockResolvedValue({ scans: [] });
    await loadReportScans(request);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/revenue-leak-scans?limit=10" }),
    );
  });
});

describe("auditHistoryHasMore", () => {
  it("treats a full page as unfinished history", () => {
    expect(auditHistoryHasMore(10, 0, false)).toBe(true);
    expect(auditHistoryHasMore(10, 10, false)).toBe(true);
  });

  it("stops when the last page is short or the list was exhausted", () => {
    expect(auditHistoryHasMore(7, 0, false)).toBe(false);
    expect(auditHistoryHasMore(10, 3, false)).toBe(false);
    expect(auditHistoryHasMore(10, 0, true)).toBe(false);
    expect(auditHistoryHasMore(0, 0, false)).toBe(false);
  });
});
