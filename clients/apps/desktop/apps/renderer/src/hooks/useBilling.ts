import { useState, useEffect, useCallback } from "react";
import type { BillingInfo } from "@x/shared/billing";

export type BillingLoadError = {
  reason: "auth_unavailable" | "unknown";
  message: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAuthUnavailableMessage(message: string) {
  return /AuthUnavailableError|session expired|token expired|not signed into/i.test(message);
}

export function useBilling(isOppulenceConnected: boolean) {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<BillingLoadError | null>(null);

  const fetchBilling = useCallback(async () => {
    if (!isOppulenceConnected) {
      setBilling(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const result = await window.ipc.invoke("billing:getInfo", null);
      setBilling(result);
      setError(null);
    } catch (error) {
      const message = getErrorMessage(error);
      const authUnavailable = isAuthUnavailableMessage(message);
      if (!authUnavailable) {
        console.error("Failed to fetch billing info:", error);
      }
      setBilling(null);
      setError({
        reason: authUnavailable ? "auth_unavailable" : "unknown",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isOppulenceConnected]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  useEffect(() => {
    if (!isOppulenceConnected) return;
    const handleFocus = () => {
      void fetchBilling();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchBilling, isOppulenceConnected]);

  return { billing, isLoading, error, refresh: fetchBilling };
}
