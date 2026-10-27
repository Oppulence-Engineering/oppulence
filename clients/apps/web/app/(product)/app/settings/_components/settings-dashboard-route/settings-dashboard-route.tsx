"use client";

import "client-only";

import dynamic from "next/dynamic";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@oppulence/ui/lib/utils";
import { useAuthSession } from "@/components/auth/auth-gate";
import { useProductRouteState } from "@/hooks/dashboard/use-product-route-state";
import type { SettingsSection } from "@/lib/dashboard/product-navigation";

const SettingsView = dynamic(() =>
  import("@/components/features/settings/app-settings/app-settings").then(
    (module) => module.SettingsView,
  ),
);

export type SettingsDashboardRouteProps = ComponentPropsWithoutRef<"section"> & {
  section: SettingsSection;
};

export function SettingsDashboardRoute({
  className,
  section: _serverSection,
  ...props
}: SettingsDashboardRouteProps) {
  const session = useAuthSession();
  const { openSettings, settingsSection } = useProductRouteState();
  // nuqs writes `?settings=` with history.replace and an optimistic search
  // param. Cache Components does not refetch this route on that update, so the
  // server `section` prop stays on the first paint. The hook is the live
  // section; it matches the prop on the initial document load.
  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
      data-slot="settings-dashboard-route"
      {...props}
    >
      <SettingsView onNavigate={openSettings} section={settingsSection} session={session} />
    </section>
  );
}
