import {
  GetOpenPromisesReport200Response,
  GetRevenueLeakScan200Response,
  ListRevenueLeakScans200Response,
} from "@/lib/api/generated/zod/revenue/revenue";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { OpenPromisesReport, RevenueLeakScan } from "@/lib/revenue/types";

/** One page of audit history. The next page uses the same size as an offset. */
export const AUDIT_HISTORY_PAGE = 10;

function auditHistoryPath(offset: number): string {
  const params = new URLSearchParams({ limit: String(AUDIT_HISTORY_PAGE) });
  if (offset > 0) params.set("offset", String(offset));
  return `/revenue-leak-scans?${params.toString()}`;
}

/** A full page may have another page behind it. A short page is the end. */
export function auditHistoryHasMore(
  pageLength: number,
  earlierLength: number,
  exhausted: boolean,
): boolean {
  const loaded = pageLength + earlierLength;
  return !exhausted && pageLength > 0 && loaded > 0 && loaded % AUDIT_HISTORY_PAGE === 0;
}

function reportScanPath(scanId: string): string {
  return `/revenue-leak-scans/${encodeURIComponent(scanId)}`;
}

function reportDocumentPath(scanId: string): string {
  return `/revenue-leak-scans/${encodeURIComponent(scanId)}/report`;
}

export async function loadReportScans(
  request: RequestJsonFn,
  signal?: AbortSignal,
  offset = 0,
): Promise<RevenueLeakScan[]> {
  const body = await request({
    path: auditHistoryPath(offset),
    schema: ListRevenueLeakScans200Response,
    signal,
  });
  return body.scans as RevenueLeakScan[];
}

export async function loadReportScan(
  request: RequestJsonFn,
  scanId: string,
  signal?: AbortSignal,
): Promise<RevenueLeakScan> {
  return (await request({
    path: reportScanPath(scanId),
    schema: GetRevenueLeakScan200Response,
    signal,
  })) as RevenueLeakScan;
}

export async function loadOpenPromisesReport(
  request: RequestJsonFn,
  scanId: string,
  signal?: AbortSignal,
): Promise<OpenPromisesReport> {
  const report = await request({
    path: reportDocumentPath(scanId),
    schema: GetOpenPromisesReport200Response,
    signal,
  });
  return {
    ...report,
    items: report.items.map((item) => ({ ...item, dueAt: item.dueAt ?? undefined })),
  } as OpenPromisesReport;
}

export function fetchReportScans(
  signal?: AbortSignal,
  offset = 0,
): Promise<RevenueLeakScan[]> {
  return loadReportScans(requestJson, signal, offset);
}

export function fetchReportScan(scanId: string, signal?: AbortSignal): Promise<RevenueLeakScan> {
  return loadReportScan(requestJson, scanId, signal);
}

export function fetchOpenPromisesReport(
  scanId: string,
  signal?: AbortSignal,
): Promise<OpenPromisesReport> {
  return loadOpenPromisesReport(requestJson, scanId, signal);
}
