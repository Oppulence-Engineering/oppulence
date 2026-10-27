"use client";

import { lazy, Suspense } from "react";

// React.lazy keeps the toolkit (MSW, axe, web-vitals) out of the production
// bundle: the chunk loads only when dev tools are enabled and render.
const DevToolkit = lazy(() =>
  import("@/components/dev/dev-toolkit").then((module) => ({ default: module.DevToolkit })),
);
const RouteDevBadge = lazy(() =>
  import("@/components/dev/route-dev-badge").then((module) => ({ default: module.RouteDevBadge })),
);

/**
 * Global dev-only overlays.
 *
 * These components are SSR-safe: browser APIs are isolated behind effects and
 * external stores provide server snapshots. Keeping them as ordinary client
 * components lets Next validate instant navigation without the synthetic
 * server-render error produced by `next/dynamic({ ssr: false })`.
 */
export function DevProviders({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <>
      <Suspense fallback={null}>
        <RouteDevBadge />
      </Suspense>
      <Suspense fallback={null}>
        <DevToolkit />
      </Suspense>
    </>
  );
}
