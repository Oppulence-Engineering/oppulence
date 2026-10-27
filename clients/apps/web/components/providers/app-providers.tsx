"use client";

import { Toaster } from "@oppulence/ui/components/sonner";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense, type ReactNode } from "react";

import { DevProviders } from "@/components/providers/dev-providers";

/**
 * Root client boundary for the whole app. Mirrors the Better Auth docs shell:
 * theme class on `<html>` and global toasts.
 */
export function AppProviders({
  children,
  devToolsEnabled,
}: {
  children: ReactNode;
  devToolsEnabled: boolean;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/*
        Nuqs reads searchParams. Next.js Cache Components requires that
        request-time API behind a Suspense boundary so the root layout can
        still emit a static shell (see Request-time APIs in the production
        checklist).
      */}
      <Suspense fallback={null}>
        <NuqsAdapter>
          {children}
          <DevProviders enabled={devToolsEnabled} />
          <Toaster richColors closeButton position="bottom-right" />
        </NuqsAdapter>
      </Suspense>
    </ThemeProvider>
  );
}
