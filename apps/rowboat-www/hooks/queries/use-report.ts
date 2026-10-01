"use client";

import "client-only";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AUDIT_HISTORY_PAGE,
  auditHistoryHasMore,
  fetchOpenPromisesReport,
  fetchReportScan,
  fetchReportScans,
} from "@/hooks/queries/utils/fetch-report";
import {
  REPORT_DOCUMENT_STALE_TIME,
  REPORT_SCAN_DETAIL_STALE_TIME,
  REPORT_SCAN_LIST_STALE_TIME,
  reportKeys,
} from "@/hooks/queries/utils/report-keys";
import type { RevenueLeakScan } from "@/lib/revenue/types";

export function useReportScanList() {
  const query = useQuery({
    queryKey: reportKeys.scanList(),
    queryFn: ({ signal }) => fetchReportScans(signal),
    staleTime: REPORT_SCAN_LIST_STALE_TIME,
  });
  const [earlier, setEarlier] = useState<RevenueLeakScan[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingEarlierAudits, setLoadingEarlierAudits] = useState(false);
  const [earlierAuditsError, setEarlierAuditsError] = useState<string | null>(null);
  useEffect(() => {
    setEarlier([]);
    setExhausted(false);
    setEarlierAuditsError(null);
  }, [query.dataUpdatedAt]);

  const data = useMemo(() => {
    if (!query.data) return query.data;
    if (earlier.length === 0) return query.data;
    const seen = new Set(query.data.map((scan) => scan.id));
    return [...query.data, ...earlier.filter((scan) => !seen.has(scan.id))];
  }, [earlier, query.data]);

  const hasMoreAudits = auditHistoryHasMore(query.data?.length ?? 0, earlier.length, exhausted);
  const loadEarlierAudits = useCallback(async () => {
    const loaded = (query.data?.length ?? 0) + earlier.length;
    if (loadingEarlierAudits || loaded === 0) return;
    setLoadingEarlierAudits(true);
    setEarlierAuditsError(null);
    try {
      const next = await fetchReportScans(undefined, loaded);
      setEarlier((current) => {
        const seen = new Set(current.map((scan) => scan.id));
        return [...current, ...next.filter((scan) => !seen.has(scan.id))];
      });
      if (next.length < AUDIT_HISTORY_PAGE) setExhausted(true);
    } catch {
      setEarlierAuditsError("Could not load earlier audits.");
    } finally {
      setLoadingEarlierAudits(false);
    }
  }, [earlier.length, loadingEarlierAudits, query.data?.length]);

  return {
    ...query,
    data,
    earlierAuditsError,
    hasMoreAudits,
    loadEarlierAudits,
    loadingEarlierAudits,
  };
}

export function useReportScan(
  scanId: string | null,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: {
          state: { data?: Awaited<ReturnType<typeof fetchReportScan>> };
        }) => number | false);
  },
) {
  return useQuery({
    queryKey: reportKeys.scan(scanId ?? undefined),
    queryFn: ({ signal }) => fetchReportScan(scanId as string, signal),
    enabled: Boolean(scanId),
    staleTime: REPORT_SCAN_DETAIL_STALE_TIME,
    refetchInterval: options?.refetchInterval,
  });
}

export function useOpenPromisesReport(scanId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.document(scanId ?? undefined),
    queryFn: ({ signal }) => fetchOpenPromisesReport(scanId as string, signal),
    enabled: Boolean(scanId) && enabled,
    staleTime: REPORT_DOCUMENT_STALE_TIME,
  });
}
