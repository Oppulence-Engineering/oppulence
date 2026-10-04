"use client";

import "client-only";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  auditPageHasMore,
  auditRows,
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
  const [laterHasMore, setLaterHasMore] = useState<boolean | null>(null);
  const [loadingEarlierAudits, setLoadingEarlierAudits] = useState(false);
  const [earlierAuditsError, setEarlierAuditsError] = useState<string | null>(null);
  useEffect(() => {
    setEarlier([]);
    setLaterHasMore(null);
    setEarlierAuditsError(null);
  }, [query.dataUpdatedAt]);

  const data = useMemo((): RevenueLeakScan[] | undefined => {
    if (query.data == null) return undefined;
    const rows = auditRows(query.data);
    if (earlier.length === 0) return rows;
    const seen = new Set(rows.map((scan) => scan.id));
    return [...rows, ...earlier.filter((scan) => !seen.has(scan.id))];
  }, [earlier, query.data]);

  const hasMoreAudits =
    laterHasMore ?? (auditRows(query.data).length > 0 && auditPageHasMore(query.data));
  const loadEarlierAudits = useCallback(async () => {
    const loaded = auditRows(query.data).length + earlier.length;
    if (loadingEarlierAudits || loaded === 0) return;
    setLoadingEarlierAudits(true);
    setEarlierAuditsError(null);
    try {
      const next = await fetchReportScans(undefined, loaded);
      const rows = auditRows(next);
      setEarlier((current) => {
        const seen = new Set(current.map((scan) => scan.id));
        return [...current, ...rows.filter((scan) => !seen.has(scan.id))];
      });
      setLaterHasMore(auditPageHasMore(next));
    } catch {
      setEarlierAuditsError("Could not load earlier audits.");
    } finally {
      setLoadingEarlierAudits(false);
    }
  }, [earlier.length, loadingEarlierAudits, query.data]);

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
