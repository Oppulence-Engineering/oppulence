"use client";

import "client-only";

import * as React from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  Clipboard,
  Monitor,
  Moon,
  Plugs,
  ShieldCheck,
  Sun,
  type Icon as PhosphorIcon,
} from "@/lib/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAgentSummaries } from "@/hooks/queries/use-agents";
import { shownDefaultAgent } from "@/hooks/dashboard/use-agent-catalog";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { visibleAgentLabel } from "@/lib/agents/agent-schemas";
import { useConsolePreferences as useConsolePreferencesQuery } from "@/hooks/queries/use-console";
import { consoleKeys } from "@/hooks/queries/utils/console-keys";

import {
  SETTINGS_SECTIONS,
  useThemePreference,
  type SettingsSection,
  type ThemePreference,
} from "@/components/features/dashboard/app-shell/app-shell";
import { DeleteAccountRow } from "@/components/features/account/delete-account-row/delete-account-row";
import { CommunicationPrivacySettings } from "@/components/features/connectors/communication-privacy-settings/communication-privacy-settings";
import { ConnectorSettings } from "@/components/features/connectors/connector-settings/connector-settings";
import { capture, RevenueEvents, setAnalyticsConsent } from "@/lib/analytics/analytics";
import {
  patchConsolePreferences,
  type ConsolePreferences,
  type ConsolePreferencesPatch,
} from "@/lib/console/console";
import { startCheckout } from "@/lib/revenue/revenue";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { CardDescription, CardTitle } from "@oppulence/ui/components/card";
import { ItemMedia } from "@oppulence/ui/components/item";
import { Label } from "@oppulence/ui/components/label";
import { Skeleton } from "@oppulence/ui/components/skeleton";
import { Input } from "@oppulence/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { Switch } from "@oppulence/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@oppulence/ui/components/toggle-group";
import { cn } from "@/lib/utils";

function useConsolePreferences() {
  const queryClient = useQueryClient();
  const query = useConsolePreferencesQuery();
  const mutation = useMutation({
    mutationFn: (patch: ConsolePreferencesPatch) => patchConsolePreferences(patch),
    onSuccess: (preferences) => {
      queryClient.setQueryData<ConsolePreferences>(consoleKeys.preferences(), preferences);
      void queryClient.invalidateQueries({ queryKey: consoleKeys.preferences() });
    },
  });
  return { query, mutation };
}

function PreferenceLoadState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4" role="alert">
      <p className="text-xs text-destructive">{message}</p>
      <Button onClick={retry} size="sm" type="button" variant="outline">
        Retry
      </Button>
    </div>
  );
}

type SessionShape = {
  user: {
    id?: string;
    workosUserId?: string;
    email?: string;
    organizationId?: string;
    role?: string;
    permissions: string[];
  };
  billing?: {
    plan?: string | null;
    status?: string | null;
    trialExpiresAt?: string | null;
    usage?: unknown;
  };
};

/* ------------------------------ layout pieces ------------------------------ */

function SettingsRow({
  title,
  description,
  danger,
  footer,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section-block">
      <div className="settings-section-heading">
        <div>
          <h2 className={cn("settings-section-title", danger && "!text-[var(--settings-danger)]")}>
            {title}
          </h2>
          {description ? <p className="settings-section-description">{description}</p> : null}
        </div>
      </div>
      <div
        className={cn(
          "settings-panel flex flex-col",
          danger && "!border-destructive/30 bg-destructive/5",
        )}
      >
        {children}
        {footer ? (
          <div className="flex items-center justify-end border-t border-[var(--settings-line)] py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ValueRow({
  label,
  value,
  copy,
  empty = "—",
}: {
  label: string;
  value?: string | null;
  copy?: boolean;
  /** Shown when there is no id to copy. A missing organization is an explanation, not a blank badge. */
  empty?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const shown = value?.trim() ?? "";

  const handleCopy = () => {
    if (!shown) return;
    navigator.clipboard.writeText(shown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="group/row flex min-h-[34px] items-center justify-between gap-4 rounded-none px-4 py-1 transition-colors hover:bg-background-100 dark:hover:bg-background-200">
      <Label className="text-xs font-normal capitalize text-primary/60">{label}</Label>
      <div className="flex min-w-0 items-center gap-1.5">
        {shown ? (
          <Badge className="truncate font-mono font-normal text-primary" variant="secondary">
            {shown}
          </Badge>
        ) : (
          <span className="text-right text-xs font-normal text-primary/55">{empty}</span>
        )}
        {copy && shown ? (
          <Button
            aria-label={`Copy ${label}`}
            className="size-7 text-primary/50 opacity-0 transition-opacity hover:text-primary group-hover/row:opacity-100"
            onClick={handleCopy}
            size="icon"
            type="button"
            variant="ghost"
          >
            {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyCardState({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

/**
 * Card footer with a dirty-gated save button and a transient "Saved" hint —
 * the explicit-save pattern used across the settings cards.
 */
function SaveFooter({
  dirty,
  saving,
  saved,
  label,
  onSave,
}: {
  dirty: boolean;
  saving?: boolean;
  saved: boolean;
  label: string;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-[var(--settings-line)] py-3">
      {saved ? (
        <Badge className="font-mono text-xs text-oppulence-orange" variant="outline">
          saved
        </Badge>
      ) : null}
      <Button disabled={!dirty || saving} onClick={onSave} size="sm">
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = React.useState(false);
  const flash = React.useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, []);
  return [saved, flash];
}

function subscribeBrowserOrigin(): () => void {
  return () => {};
}

/** Reading `window` during render stays blank after hydration, so the address is a client snapshot. */
export function readBrowserOrigin(): string {
  return window.location.origin;
}

export function useBrowserOrigin(): string {
  return React.useSyncExternalStore(subscribeBrowserOrigin, readBrowserOrigin, () => "");
}

function WorkspaceConnection({ organizationId }: { organizationId?: string }) {
  const copy = sessionWorkspaceCopy(organizationId);
  const [state, setState] = React.useState<"checking" | "ready" | "unavailable">("checking");

  const check = React.useCallback(async () => {
    setState("checking");
    try {
      const response = await fetch("/readyz", { cache: "no-store" });
      setState(response.ok ? "ready" : "unavailable");
    } catch {
      setState("unavailable");
    }
  }, []);

  React.useEffect(() => {
    void check();
  }, [check]);

  const label = state === "ready" ? "Ready" : state === "checking" ? "Checking" : "Unavailable";

  return (
    <SettingsRow description={copy.cloud} title="Workspace connection">
      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Oppulence Cloud</p>
          <p className="settings-row-description">
            {state === "unavailable"
              ? "The workspace could not be reached. Check again in a moment."
              : copy.cloudDetail}
          </p>
        </div>
        {state === "unavailable" ? (
          <Badge className="rounded-none font-normal text-destructive" variant="outline">
            {label}
          </Badge>
        ) : (
          <SettingsStatus>{label}</SettingsStatus>
        )}
        <Button
          className="settings-button"
          disabled={state === "checking"}
          onClick={() => void check()}
          type="button"
          variant="outline"
        >
          Check again
        </Button>
      </div>
    </SettingsRow>
  );
}

function SignedInAddress() {
  const origin = useBrowserOrigin();
  return (
    <SettingsRow
      description="Where this Oppulence tab is open. The cloud connection is checked separately below."
      title="This browser"
    >
      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Browser address</p>
          <p className="settings-row-description font-mono">{origin}</p>
        </div>
      </div>
    </SettingsRow>
  );
}

function SettingsStatus({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      className="settings-status settings-status--ok rounded-none border-0 bg-transparent px-0 font-normal shadow-none hover:bg-transparent"
      variant="outline"
    >
      {children}
    </Badge>
  );
}

/**
 * A signed-in session can have no organization. Sentences that say an
 * organization controls the workspace are only true once an id is attached.
 */
export function sessionWorkspaceCopy(organizationId: string | undefined): {
  security: string;
  permissions: string;
  cloud: string;
  cloudDetail: string;
  connect: string;
} {
  if (organizationId?.trim()) {
    return {
      security: "Workspace access is controlled by the signed-in Oppulence organization.",
      permissions:
        "The signed-in organization controls access to shared companies, people, and their details.",
      cloud: "Oppulence Cloud serves companies, people, and promises for this organization.",
      cloudDetail: "Companies, people, and promises for the signed-in organization.",
      connect: "Use organization-approved connections across this workspace.",
    };
  }
  return {
    security: "This session has no organization. Access stays with the signed-in account.",
    permissions:
      "This session has no organization. Companies, people, and their details stay with the signed-in account.",
    cloud: "Oppulence Cloud serves companies, people, and promises for this signed-in account.",
    cloudDetail: "Companies, people, and promises for this signed-in account.",
    connect: "Connections you add here stay with this signed-in account.",
  };
}

/**
 * The success badge means an organization is attached. An empty organization
 * is not a granted workspace, so the badge stays off until an id exists.
 */
function OrganizationSignInStatus({ organizationId }: { organizationId?: string }) {
  if (!organizationId) return null;
  return <SettingsStatus>Signed in</SettingsStatus>;
}

function ThemePreviewSkeleton({ dark }: { dark: boolean }) {
  const line = dark ? "bg-zinc-400/35" : "bg-zinc-400/35";
  const accent = dark ? "bg-zinc-400/60" : "bg-zinc-400/60";
  return (
    <div
      className={cn(
        "flex h-20 overflow-hidden rounded-none border",
        dark ? "border-zinc-700 bg-zinc-900" : "bg-white",
      )}
    >
      <div
        className={cn(
          "w-1/3 border-r p-2",
          dark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-100",
        )}
      >
        <Skeleton className={cn("mb-2 h-1.5 w-2/3 rounded-none", accent)} />
        <Skeleton className={cn("mb-1.5 h-1 w-full rounded-none", line)} />
        <Skeleton className={cn("h-1 w-4/5 rounded-none", line)} />
      </div>
      <div className="flex-1 p-2">
        <Skeleton className={cn("mb-2 h-1.5 w-1/2 rounded-none", accent)} />
        <Skeleton className={cn("mb-1.5 h-1 w-full rounded-none", line)} />
        <Skeleton className={cn("h-1 w-4/5 rounded-none", line)} />
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  hint,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="mb-1.5">
      <Label className="block text-sm text-primary" htmlFor={htmlFor}>
        {children}
      </Label>
      {hint ? (
        <CardDescription className="block text-xs text-muted-foreground">{hint}</CardDescription>
      ) : null}
    </div>
  );
}

/* -------------------------------- sections --------------------------------- */

function ProfileCard() {
  const { query, mutation } = useConsolePreferences();
  const [name, setName] = React.useState("");
  const [initial, setInitial] = React.useState("");
  const [saved, flash] = useSavedFlash();

  React.useEffect(() => {
    if (!query.data) return;
    setName(query.data.displayName);
    setInitial(query.data.displayName);
  }, [query.data]);

  const dirty = name !== initial;

  const save = async () => {
    const next = name.trim();
    try {
      await mutation.mutateAsync({ displayName: next });
      setInitial(next);
      setName(next);
      flash();
    } catch {
      // The mutation state renders an inline retryable error.
    }
  };

  return (
    <SettingsRow
      description="How you appear in Oppulence across signed-in devices."
      footer={
        <SaveFooter
          dirty={dirty}
          label="Save profile"
          onSave={() => void save()}
          saved={saved}
          saving={mutation.isPending}
        />
      }
      title="Profile"
    >
      {query.isError ? (
        <PreferenceLoadState
          message="Could not load your profile preference."
          retry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-6 py-2">
          <div>
            <FieldLabel
              hint="Shown in the sidebar and the home greeting instead of your email."
              htmlFor="settings-display-name"
            >
              Display name
            </FieldLabel>
            <Input
              disabled={query.isLoading}
              id="settings-display-name"
              onChange={(event) => setName(event.target.value)}
              placeholder={query.isLoading ? "Loading…" : "Ada Lovelace"}
              value={name}
            />
            {mutation.isError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                Could not save your display name. Please retry.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </SettingsRow>
  );
}

function DefaultsCard() {
  const { query, mutation } = useConsolePreferences();
  const agentsQuery = useAgentSummaries();
  const state = agentsQuery.isPending ? "loading" : agentsQuery.isError ? "error" : "ready";
  // Runs are keyed by slug. The menu shows the name and still saves the slug.
  const agents = (agentsQuery.data ?? []).filter((agent) => agent.slug);

  const [agent, setAgent] = React.useState("");
  const [initial, setInitial] = React.useState("");
  const [saved, flash] = useSavedFlash();

  React.useEffect(() => {
    if (!query.data) return;
    // Empty means Assistant, which is also what a new chat starts with.
    const effective = shownDefaultAgent(query.data.defaultAgentSlug);
    setAgent(effective);
    setInitial(effective);
  }, [query.data]);

  const dirty = agent !== initial;

  const save = async () => {
    try {
      await mutation.mutateAsync({ defaultAgentSlug: agent });
      setInitial(agent);
      flash();
    } catch {
      // The mutation state renders an inline retryable error.
    }
  };

  return (
    <SettingsRow
      description="The agent a new chat starts with. It applies the next time you start a chat."
      footer={
        <SaveFooter
          dirty={dirty}
          label="Save defaults"
          onSave={() => void save()}
          saved={saved}
          saving={mutation.isPending}
        />
      }
      title="Chat defaults"
    >
      {query.isError ? (
        <PreferenceLoadState
          message="Could not load your default agent."
          retry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-6 px-4 py-6">
          <div>
            <FieldLabel
              hint="The agent preselected for new conversations."
              htmlFor="settings-default-agent"
            >
              Default agent
            </FieldLabel>
            <Select
              disabled={query.isLoading || state === "loading"}
              onValueChange={setAgent}
              value={agent || undefined}
            >
              <SelectTrigger
                aria-label={comboboxFilterName(
                  "Default agent",
                  agent ? visibleAgentLabel(agents, agent) : "Choose an agent",
                )}
                className="w-full max-w-xs"
                id="settings-default-agent"
              >
                {/* Same reason as the composer: the closed trigger does not
                    keep the item label, so a saved default would look unset. */}
                <SelectValue
                  placeholder={state === "loading" ? "Loading agents…" : "Choose an agent"}
                >
                  {agent ? visibleAgentLabel(agents, agent) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="app-shell rounded-[2px]">
                {agents.map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name.trim() || item.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mutation.isError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                Could not save your default agent. Please retry.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </SettingsRow>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useThemePreference();

  const options: {
    value: ThemePreference;
    label: string;
    description: string;
    icon: PhosphorIcon;
  }[] = [
    { value: "light", label: "Light", description: "Always use the light theme.", icon: Sun },
    { value: "dark", label: "Dark", description: "Always use the dark theme.", icon: Moon },
    {
      value: "system",
      label: "System",
      description: "Follow your operating system preference.",
      icon: Monitor,
    },
  ];

  return (
    <>
      <PageIntro
        description="Choose how Oppulence looks in this browser and how it follows your system."
        title="Appearance"
      />
      <SettingsRow
        description="How Oppulence looks on this device. Applies immediately."
        title="Theme"
      >
        <ToggleGroup
          aria-label="Theme"
          className="settings-choice-grid p-3"
          onValueChange={(value) => value && setTheme(value as ThemePreference)}
          type="single"
          value={theme}
        >
          {options.map((option) => (
            <ToggleGroupItem
              aria-label={option.label}
              className="settings-choice h-auto flex-col data-[state=on]:shadow-none"
              data-selected={theme === option.value}
              key={option.value}
              value={option.value}
            >
              <ThemePreviewSkeleton dark={option.value === "dark"} />
              <div className="flex w-full items-center justify-between">
                <Label className="settings-choice-label font-normal">{option.label}</Label>
                {theme === option.value ? (
                  <Check className="size-3.5 text-[var(--settings-accent)]" />
                ) : null}
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsRow>
      <SettingsRow description="Language used throughout the product." title="Language">
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Interface language</p>
            <p className="settings-row-description">English is currently available.</p>
          </div>
          <Select defaultValue="en" disabled>
            <SelectTrigger
              aria-label={comboboxFilterName("Interface language", "English")}
              className="settings-select w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsRow>
    </>
  );
}

/**
 * Billing usage arrives as API field names. The row style capitalizes the
 * first letter only, so sanctionedCredits renders as SanctionedCredits.
 */
const USAGE_METER_LABELS: Record<string, string> = {
  sanctionedCredits: "Included credits",
  usedCredits: "Credits used",
  availableCredits: "Credits remaining",
  usageDay: "Usage day",
};

export function usageMeterLabel(key: string): string {
  const known = USAGE_METER_LABELS[key];
  if (known) return known;
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const GROUPED_USAGE_KEYS = new Set(["sanctionedCredits", "usedCredits", "availableCredits"]);

/** Credit totals are counts a person scans. Group them; leave dates and day indexes alone. */
export function usageMeterValue(key: string, value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value) && GROUPED_USAGE_KEYS.has(key)) {
    return value.toLocaleString("en-US");
  }
  return String(value);
}

export function PlanSection({ session }: { session: SessionShape }) {
  const billing = session.billing;
  const [upgrading, setUpgrading] = React.useState(false);
  const [upgradeError, setUpgradeError] = React.useState<string | null>(null);
  const canUpgrade = billing?.plan !== "pro";
  const usage =
    billing?.usage && typeof billing.usage === "object" && !Array.isArray(billing.usage)
      ? Object.entries(billing.usage as Record<string, unknown>).filter(
          ([, value]) => typeof value === "string" || typeof value === "number",
        )
      : [];

  const upgrade = async () => {
    if (upgrading) return;
    setUpgrading(true);
    setUpgradeError(null);
    capture(RevenueEvents.UpgradeClicked, { from: "settings" });
    try {
      const url = await startCheckout("pro");
      window.location.assign(url);
    } catch {
      setUpgradeError("Checkout is temporarily unavailable. Please try again.");
      setUpgrading(false);
    }
  };

  return (
    <>
      <SettingsRow description="The plan this workspace is currently on." title="Current plan">
        <div className="flex items-center justify-between gap-6 p-4">
          <div>
            <p className="text-lg font-medium capitalize text-primary">{billing?.plan || "Free"}</p>
            {billing?.trialExpiresAt ? (
              <p className="text-xs font-medium text-oppulence-orange">
                Trial ends {new Date(billing.trialExpiresAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {billing?.status ? (
              <Badge className="rounded-[2px] capitalize" variant="outline">
                {billing.status}
              </Badge>
            ) : null}
            {canUpgrade ? (
              <Button disabled={upgrading} onClick={() => void upgrade()} size="sm" type="button">
                {upgrading ? "Opening checkout…" : "Upgrade to Pro"}
                <ArrowRight />
              </Button>
            ) : null}
          </div>
        </div>
        {upgradeError ? (
          <p className="px-4 pb-4 text-xs text-destructive" role="alert">
            {upgradeError}
          </p>
        ) : null}
      </SettingsRow>
      <SettingsRow description="Activity counted in the current billing period." title="Usage">
        {usage.length === 0 ? (
          <EmptyCardState>No usage recorded yet.</EmptyCardState>
        ) : (
          <div className="flex flex-col gap-0.5 py-2">
            {usage.map(([key, value]) => (
              <ValueRow key={key} label={usageMeterLabel(key)} value={usageMeterValue(key, value)} />
            ))}
          </div>
        )}
      </SettingsRow>
    </>
  );
}

function UsageDataCard() {
  const { query, mutation } = useConsolePreferences();
  const update = (shareUsageData: boolean) => {
    mutation.mutate(
      { shareUsageData },
      {
        onSuccess: () => setAnalyticsConsent(shareUsageData),
      },
    );
  };

  return (
    <SettingsRow
      description="This choice follows your account across signed-in devices."
      title="Privacy"
    >
      {query.isError ? (
        <PreferenceLoadState
          message="Could not load your analytics preference."
          retry={() => void query.refetch()}
        />
      ) : (
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Share anonymous usage data</p>
            <p className="settings-row-description">
              Allow product events without notes, companies, prompts, or identity data.
            </p>
            {mutation.isError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                Could not save this preference. Please retry.
              </p>
            ) : null}
          </div>
          <Switch
            aria-label="Share anonymous usage data"
            checked={query.data?.shareUsageData ?? false}
            className="settings-switch shrink-0"
            disabled={query.isLoading || mutation.isPending}
            onCheckedChange={update}
          />
        </div>
      )}
    </SettingsRow>
  );
}

function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <header className="settings-page-intro">
      <h1 className="settings-page-title">{title}</h1>
      {description ? <p className="settings-page-description">{description}</p> : null}
    </header>
  );
}

const OVERVIEW_KEYS: SettingsSection[] = [
  "preferences",
  "connections",
  "appearance",
  "account",
  "help",
];

function OverviewSection({ onNavigate }: { onNavigate: (section: SettingsSection) => void }) {
  return (
    <>
      <PageIntro
        description="Workspace, connections, and how Oppulence behaves."
        title="Settings"
      />
      <nav aria-label="Settings sections" className="settings-link-list">
        {OVERVIEW_KEYS.map((key) => {
          const section = SETTINGS_SECTIONS.find((item) => item.key === key);
          if (!section) return null;
          return (
            <Button
              className="settings-link-row h-auto justify-start"
              key={section.key}
              onClick={() => onNavigate(section.key)}
              type="button"
              variant="ghost"
            >
              <ItemMedia className="settings-link-row-icon" variant="icon">
                <section.icon />
              </ItemMedia>
              <div className="settings-link-row-copy min-w-0 flex-1">
                <CardTitle className="settings-link-row-title text-sm">{section.label}</CardTitle>
                <CardDescription className="settings-link-row-description">
                  {section.description}
                </CardDescription>
              </div>
              <ArrowRight className="ml-2 size-3.5 shrink-0 text-primary/25" />
            </Button>
          );
        })}
      </nav>
    </>
  );
}

function PreferencesSection() {
  return (
    <>
      <PageIntro
        description="The default agent for a new chat, and whether anonymous product events may be captured."
        title="Preferences"
      />
      <DefaultsCard />
      <UsageDataCard />
    </>
  );
}

function NotificationsSection() {
  return <PreferencesSection />;
}

function SecuritySection({ session }: { session: SessionShape }) {
  const copy = sessionWorkspaceCopy(session.user.organizationId);
  return (
    <>
      <PageIntro
        description="Review who is signed in and what this session can open."
        title="Security"
      />
      <SettingsRow description={copy.security} title="Session access">
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Organization</p>
            <p className="settings-row-description">
              {session.user.organizationId || "No organization is attached to this session."}
            </p>
          </div>
          <OrganizationSignInStatus organizationId={session.user.organizationId} />
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">What you can do</p>
            <p className="settings-row-description">
              {session.user.permissions.length > 0
                ? session.user.permissions.join(", ")
                : "Standard workspace access"}
            </p>
          </div>
          <ShieldCheck className="size-4 text-[var(--settings-success)]" />
        </div>
      </SettingsRow>
    </>
  );
}

function HelpSection() {
  const items = [
    {
      title: "Send feedback",
      description: "Tell us what is missing or where the product should go next.",
      icon: Bell,
      href: "mailto:hello@oppulence.io?subject=Oppulence%20feedback",
    },
    {
      title: "API reference",
      description: "Review the Oppulence API reference.",
      icon: BookOpen,
      href: "/api/reference",
    },
  ];

  return (
    <>
      <PageIntro
        description="Get help, report a problem, or review the API reference."
        title="Help"
      />
      <div className="settings-card-grid">
        {items.map((item) => (
          <Button
            className="settings-card h-auto"
            key={item.title}
            onClick={() => window.open(item.href, "_blank")}
            type="button"
            variant="ghost"
          >
            <ItemMedia className="settings-card-icon" variant="icon">
              <item.icon />
            </ItemMedia>
            <div className="settings-card-copy">
              <CardTitle className="settings-card-title text-sm">{item.title}</CardTitle>
              <CardDescription className="settings-card-description">
                {item.description}
              </CardDescription>
            </div>
            <ArrowRight className="ml-auto size-3.5 shrink-0 text-primary/30" />
          </Button>
        ))}
      </div>
    </>
  );
}

function PermissionsSection({ session }: { session: SessionShape }) {
  const copy = sessionWorkspaceCopy(session.user.organizationId);
  return (
    <>
      <PageIntro
        description="Review who you are and what this session can do."
        title="Permissions"
      />
      <SettingsRow description={copy.permissions} title="Workspace">
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Current organization</p>
            <p className="settings-row-description">
              {session.user.organizationId || "No organization is attached to this session."}
            </p>
          </div>
          <OrganizationSignInStatus organizationId={session.user.organizationId} />
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Workspace role</p>
            <p className="settings-row-description">
              {session.user.role || "Member"} ·{" "}
              {session.user.permissions.length
                ? session.user.permissions.join(", ")
                : "Standard workspace access"}
            </p>
          </div>
          <ShieldCheck className="size-4 text-[var(--settings-success)]" />
        </div>
      </SettingsRow>
      <SettingsRow
        description="Oppulence only uses what connected services return."
        title="Service access"
      >
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Connected services</p>
            <p className="settings-row-description">
              Manage service-level access from Connections. Removing a connection stops new mail and
              calendar updates from entering this workspace.
            </p>
          </div>
          <Plugs className="size-4 text-primary/40" />
        </div>
      </SettingsRow>
    </>
  );
}

function AccountSection({ session }: { session: SessionShape }) {
  return (
    <>
      <PageIntro
        description="Manage your identity, organization, plan, and current browser session."
        title="Account"
      />
      <ProfileCard />
      <SettingsRow
        description="Your identity for this workspace. IDs are safe to share with support."
        title="Oppulence Cloud"
      >
        <div className="flex flex-col gap-0.5 py-2">
          <ValueRow label="Email" value={session.user.email} />
          <ValueRow copy label="User ID" value={session.user.workosUserId || session.user.id} />
          <ValueRow
            copy
            empty="No organization is attached to this session."
            label="Organization"
            value={session.user.organizationId}
          />
          <ValueRow empty="Member" label="Role" value={session.user.role} />
        </div>
      </SettingsRow>
      <PlanSection session={session} />
      <SettingsRow danger title="Session and account">
        <div className="settings-row">
          <div className="settings-row-copy">
            <p className="settings-row-label">Sign out</p>
            <p className="settings-row-description">
              End this browser session. You can sign back in at any time.
            </p>
          </div>
          <Button
            onClick={() => window.location.assign("/api/auth/logout")}
            size="sm"
            variant="destructive"
          >
            Sign out
          </Button>
        </div>
        <DeleteAccountRow />
      </SettingsRow>
    </>
  );
}

/* ------------------------------- main view --------------------------------- */

export function SettingsView({
  section,
  session,
  onNavigate,
}: {
  section: SettingsSection;
  session: SessionShape;
  onNavigate: (section: SettingsSection) => void;
}) {
  const current = SETTINGS_SECTIONS.find((item) => item.key === section) ?? SETTINGS_SECTIONS[0];

  return (
    <div className="settings-page-scroll flex-1" data-slot="app-settings">
      <div className={cn("settings-page", section === "overview" && "settings-page--wide")}>
        {section === "overview" ? <OverviewSection onNavigate={onNavigate} /> : null}
        {section === "preferences" ? <PreferencesSection /> : null}
        {section === "notifications" ? <NotificationsSection /> : null}
        {section === "permissions" ? <PermissionsSection session={session} /> : null}
        {section === "security" ? <SecuritySection session={session} /> : null}
        {section === "connections" ? (
          <>
            <PageIntro description={current.description} title={current.label} />
            <ConnectorSettings />
            <SettingsRow
              description="Choose what from mail and calendar can be shared, and which addresses stay private."
              title="Email & Calendar privacy"
            >
              <CommunicationPrivacySettings />
            </SettingsRow>
          </>
        ) : null}
        {section === "advanced" ? (
          <>
            <PageIntro description={current.description} title={current.label} />
            <SignedInAddress />
            <WorkspaceConnection organizationId={session.user.organizationId} />
          </>
        ) : null}
        {section === "customization" ? <AppearanceSection /> : null}
        {section === "appearance" ? <AppearanceSection /> : null}
        {section === "account" ? <AccountSection session={session} /> : null}
        {section === "connect" ? (
          <>
            <PageIntro
              description={sessionWorkspaceCopy(session.user.organizationId).connect}
              title="Oppulence Connect"
            />
            <div className="settings-inline-notice">
              {session.user.organizationId
                ? `Connected to ${session.user.organizationId}.`
                : "No organization is attached to this session."}
            </div>
            <ConnectorSettings />
          </>
        ) : null}
        {section === "help" ? <HelpSection /> : null}
      </div>
    </div>
  );
}
