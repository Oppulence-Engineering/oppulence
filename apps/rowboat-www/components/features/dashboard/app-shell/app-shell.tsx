"use client";

import "client-only";

import * as React from "react";
import { useTheme } from "next-themes";
import { useConsolePreferences } from "@/hooks/queries/use-console";
import { sidebarShortcutTitle } from "@/lib/a11y/sidebar-shortcut";
import { friendlyAgentError } from "@/lib/agents/agent-history";
import { friendlyRevenueError } from "@/lib/revenue/revenue";
import { useRelationshipSourceStatuses } from "@/hooks/queries/use-relationship-sources";
import {
  useSidebarAgents,
  useSidebarRuns,
  useSidebarTasks,
} from "@/hooks/queries/use-sidebar-catalog";
import Link from "next/link";
import {
  ArrowLeft,
  AddressBook,
  Bell,
  Brain,
  CaretRight,
  CaretUpDown,
  CheckCircle,
  Clock,
  Folder,
  GearSix,
  Monitor,
  Moon,
  Palette,
  Plugs,
  Plus,
  Question,
  Rocket,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  Stack,
  Sun,
  Wallet,
  WarningCircle,
  X,
  type Icon as PhosphorIcon,
} from "@/lib/icons";

import { Avatar, AvatarFallback, AvatarImage } from "@oppulence/ui/components/avatar";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Label } from "@oppulence/ui/components/label";
import { Progress } from "@oppulence/ui/components/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@oppulence/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@oppulence/ui/components/dropdown-menu";
import {
  sidebarRunCountLabel,
  sidebarRunLabel,
  type SidebarRunPreview,
} from "@/hooks/queries/utils/fetch-sidebar";
import { getPref, setPref, usePref } from "@/lib/console/console-prefs";
import { connectedSourceCount, googleNeedsReconnect } from "@/lib/revenue/revenue";
import { loadChangelog, type ChangelogEntry } from "@/lib/api/changelog/changelog";
import type { ResourceKind } from "@/lib/dashboard/dashboard-resource";
import {
  REVENUE_TAB_LABELS,
  revenueTabFromParam,
  revenueTabSearch,
  type ProductView,
  type RevenueTab,
  type SettingsSection,
} from "@/lib/dashboard/product-navigation";
import type { RelationshipSourceStatus } from "@/lib/revenue/types";
import { cn } from "@/lib/utils";

export {
  REVENUE_TAB_LABELS,
  revenueTabFromParam,
  revenueTabSearch,
  type RevenueTab,
  type SettingsSection,
};
export type { ResourceKind } from "@/lib/dashboard/dashboard-resource";

export type SettingsGroup = "workspace" | "global" | "cloud" | "support";

export const SETTINGS_SECTIONS: {
  key: SettingsSection;
  label: string;
  icon: PhosphorIcon;
  group?: SettingsGroup;
  description: string;
  beta?: boolean;
}[] = [
  {
    key: "overview",
    label: "Settings",
    icon: GearSix,
    description: "Everything that shapes your workspace and account.",
  },
  {
    key: "preferences",
    label: "Preferences",
    icon: Clock,
    group: "workspace",
    description: "Default agent and anonymous usage data.",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    group: "workspace",
    description: "This workspace does not send browser or email notifications.",
  },
  {
    key: "permissions",
    label: "Permissions",
    icon: AddressBook,
    group: "workspace",
    description: "Who you are and what this session can do.",
  },
  {
    key: "security",
    label: "Security",
    icon: ShieldCheck,
    group: "workspace",
    description: "Review this session and what it can open.",
  },
  {
    key: "connections",
    label: "Connections",
    icon: Plugs,
    group: "workspace",
    description: "Manage connected accounts and available tools.",
  },
  {
    key: "advanced",
    label: "Advanced",
    icon: Rocket,
    group: "workspace",
    description: "Check this browser and whether Oppulence Cloud is reachable.",
  },
  {
    key: "customization",
    label: "Customization",
    icon: Folder,
    group: "global",
    description:
      "Branding and layout are not separate settings. Theme and language are in Appearance.",
  },
  {
    key: "appearance",
    label: "Appearance",
    icon: Palette,
    group: "global",
    description: "Set the theme and the interface language.",
  },
  {
    key: "account",
    label: "Account",
    icon: Wallet,
    group: "cloud",
    description: "Manage your identity, organization, plan, and active session.",
  },
  {
    key: "connect",
    label: "Oppulence Connect",
    icon: Plus,
    group: "cloud",
    description: "Shared organization connections are not a separate list yet.",
    beta: true,
  },
  {
    key: "help",
    label: "Help",
    icon: Question,
    group: "support",
    description: "Get help, report a problem, or review the API reference.",
  },
];

const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  workspace: "Workspace",
  global: "Global",
  cloud: "Cloud",
  support: "Support",
};

export type ThemePreference = "light" | "dark" | "system";

/**
 * The sidebar, command palette, and Appearance settings all change the theme.
 * next-themes (AppProviders) is the only writer of the `light` / `dark` class
 * on `<html>`. A second writer that only toggled `dark` left both classes on
 * the document, so light tokens kept winning after the user chose Dark.
 */
export function useThemePreference() {
  const { theme, setTheme } = useTheme();
  const preference: ThemePreference =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  const selectTheme = React.useCallback(
    (value: ThemePreference) => {
      setTheme(value);
    },
    [setTheme],
  );
  return { theme: preference, setTheme: selectTheme };
}

type SidebarSelect = (item: { kind: ResourceKind; name: string }) => void;

type ShellUser = {
  name: string;
  email: string;
};

/** The billing facts the shell renders: the plan badge and the trial banner. */
export type ShellBilling = {
  plan?: string | null;
  status?: string | null;
  trialExpiresAt?: string | null;
};

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Label for the account menu. Settings saves a cross-device display name and
 * tells the user it replaces the email in the sidebar. That value lives on
 * the console preferences document. The device-local `display-name` pref is
 * only a fallback: the profile form no longer writes it, so reading it first
 * would hide the name that was just saved.
 */
export function workspaceLabel(input: {
  preferenceName?: string | null;
  deviceName?: string | null;
  userName: string;
}) {
  const displayName = input.preferenceName?.trim() || input.deviceName?.trim() || input.userName;
  const label = looksLikeEmail(displayName) ? displayName.split("@")[0] : displayName;
  return label || "Workspace";
}

export function useWorkspaceLabel(user: { name: string; email: string }) {
  const preferences = useConsolePreferences();
  const deviceName = usePref("display-name");
  return workspaceLabel({
    preferenceName: preferences.data?.displayName,
    deviceName,
    userName: user.name,
  });
}

/** Whole days left on a trial, or null when the account is not trialing. */
export function trialDaysRemaining(billing?: ShellBilling) {
  if (billing?.status !== "trialing" || !billing.trialExpiresAt) return null;
  const remaining = new Date(billing.trialExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return null;
  return Math.max(0, Math.ceil(remaining / 86_400_000));
}

/* ------------------------------- view boundary ----------------------------- */

/**
 * Keeps one view's crash inside the content pane.
 *
 * Without this the nearest boundary is the route's, so a single undefined
 * field in any tab replaced the whole workspace — sidebar included — with
 * "The workspace could not be loaded", leaving no way to navigate off the
 * broken view.
 */
export class ViewBoundary extends React.Component<
  { children: React.ReactNode; viewKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: { viewKey: string }) {
    // Moving to another view clears the failure; the next one deserves a try.
    if (previous.viewKey !== this.props.viewKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.error("View crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 items-center justify-center p-8" role="alert">
        <div className="max-w-sm text-center">
          <WarningCircle className="mx-auto size-6 text-destructive" />
          <p className="mt-3 text-sm font-medium text-primary">This view could not be shown</p>
          <p className="mt-1 text-[13px] text-primary/55">
            The rest of the workspace still works. Open another view, or try this one again.
          </p>
          <Button
            className="mt-4 h-8 px-3 text-[13px]"
            onClick={() => this.setState({ failed: false })}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
}

/* --------------------------------- top bar --------------------------------- */

const CHANGELOG_SEEN_PREF = "sidebar-changelog-seen";

/**
 * The newest release as one line next to the logo. It carries a version the
 * user can check against the release notes, so it is hidden entirely when the
 * feed is empty or unreachable — an announcement we cannot source is worse
 * than none.
 */
function ShellReleasePill() {
  const [entry, setEntry] = React.useState<ChangelogEntry | null>(null);
  // The shell only ever renders on the client (AuthGate holds the tree until
  // the session resolves), so reading the pref during render cannot desync
  // hydration and a dismissed note never flashes.
  const [seen, setSeen] = React.useState(() => getPref(CHANGELOG_SEEN_PREF));

  React.useEffect(() => {
    let cancelled = false;
    loadChangelog()
      .then((loaded) => {
        if (!cancelled) setEntry(loaded[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Dismissal is per release: the note returns on its own when the next one
  // ships, so nobody has to remember to re-enable it.
  if (!entry || seen === entry.version) return null;
  return (
    <div className="hidden min-w-0 items-center gap-1.5 md:flex">
      <a
        className="flex min-w-0 items-center gap-2 text-primary/75 transition-colors hover:text-primary"
        href={entry.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Badge
          className="shrink-0 bg-background-200 font-mono text-[11px] font-medium text-primary/80"
          variant="secondary"
        >
          {entry.version}
        </Badge>
        <Label className="truncate font-mono text-[13px] font-normal">{entry.title}</Label>
      </a>
      <Button
        aria-label="Dismiss release note"
        className="size-6 shrink-0 text-primary/40 hover:text-primary"
        onClick={() => {
          setPref(CHANGELOG_SEEN_PREF, entry.version);
          setSeen(entry.version);
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/** Opens the support chat when it booted; otherwise the link still sends an email. */
function FeedbackLink({ className }: { className?: string }) {
  return (
    <a
      className={className}
      href="mailto:hello@oppulence.io"
      onClick={(event) => {
        const plain = window.Plain;
        if (plain?.isInitialized?.() && plain.open) {
          event.preventDefault();
          plain.open();
        }
      }}
    >
      Feedback?
    </a>
  );
}

const TOP_BAR_LINK =
  "text-[var(--text-small,13px)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]";

/** The full-width bar above the framed workspace: brand, latest release, shortcuts. */
export function AppTopBar({
  onAsk,
  onOpenPeople,
}: {
  onAsk: () => void;
  onOpenPeople: () => void;
}) {
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-4 border-[var(--border)] bg-[var(--bg)] px-4 md:px-6"
      data-slot="app-top-bar"
    >
      <Avatar aria-hidden="true" className="size-6 rounded-none" size="sm">
        <AvatarImage
          alt=""
          className="scale-[1.85] object-contain dark:invert"
          src="/marketing/oppulence-icon.png"
        />
        <AvatarFallback className="rounded-none" />
      </Avatar>
      <ShellReleasePill />
      <nav aria-label="Shortcuts" className="ml-auto flex shrink-0 items-center gap-6">
        <Button
          className={TOP_BAR_LINK}
          onClick={onAsk}
          title="Command palette"
          type="button"
          variant="ghost"
        >
          Ask Oppulence
        </Button>
        <Button
          className={cn(TOP_BAR_LINK, "hidden h-auto px-0 py-0 sm:inline")}
          onClick={onOpenPeople}
          type="button"
          variant="ghost"
        >
          People
        </Button>
        <FeedbackLink className={cn(TOP_BAR_LINK, "hidden sm:inline")} />
      </nav>
    </header>
  );
}

/* ------------------------------ sidebar footer ----------------------------- */

export type SourceHealth = { tone: "ok" | "syncing" | "attention" | "idle"; label: string };

/**
 * One line for the state of the evidence sources. A source that stopped
 * reporting is the difference between "no risk" and "we cannot see the risk",
 * so a stalled or disconnected source outranks anything else here.
 */
export function sourceHealth(sources: RelationshipSourceStatus[]): SourceHealth {
  if (sources.length === 0) return { tone: "idle", label: "No sources connected" };
  const stopped = sources.filter(
    (source) => source.status === "reconnect_required" || source.status === "disconnected",
  ).length;
  if (stopped > 0) {
    return {
      tone: "attention",
      label: stopped === 1 ? "1 source needs reconnecting" : `${stopped} sources need reconnecting`,
    };
  }
  const behind = sources.filter(
    (source) => source.status === "stale" || source.completeness !== "complete",
  ).length;
  if (behind > 0) {
    return {
      tone: "attention",
      label: behind === 1 ? "1 source is behind" : `${behind} sources are behind`,
    };
  }
  if (sources.some((source) => source.status === "backfilling" || source.status === "rebuilding")) {
    return { tone: "syncing", label: "Syncing sources" };
  }
  return { tone: "ok", label: "Sources are current" };
}

const SOURCE_TONE_CARD: Record<SourceHealth["tone"], string> = {
  ok: "border-border text-primary",
  syncing: "border-oppulence-blue/60 text-oppulence-blue",
  attention: "border-oppulence-orange/60 text-oppulence-orange",
  // An empty workspace has not failed. Orange is reserved for a source that
  // was connected and then stopped, so a new account does not look broken.
  idle: "border-border text-muted-foreground",
};

// Preserve the public helper seam while source-health policy lives with the
// revenue data contract and is shared by report, sidebar, and audit surfaces.
export { connectedSourceCount, googleNeedsReconnect };

/**
 * A sidebar query failure is not the same as an empty list. Rate limits and
 * a down API already have sentences; anything else stays the short fallback
 * so a raw status code does not land in the rail.
 */
export function sidebarQueryError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  const agent = friendlyAgentError(message);
  if (agent !== message) return agent;
  const revenue = friendlyRevenueError(message);
  if (revenue !== message) return revenue;
  return fallback;
}

/**
 * The meter is a ratio of sources that are still delivering. An empty workspace
 * is not a ratio: "0 / 0" under "No sources connected" reads as a broken meter.
 */
export function sourceMeterVisible(
  total: number | undefined,
  connected: number | undefined,
): boolean {
  return typeof total === "number" && typeof connected === "number" && total > 0;
}

/** A row of ticks, filled up to `ratio`. */
function TickMeter({ ratio }: { ratio: number }) {
  return (
    <Progress
      aria-hidden
      className="h-2 rounded-none bg-primary/15 [&>div]:rounded-none [&>div]:bg-primary/60"
      value={Math.round(ratio * 100)}
    />
  );
}

/**
 * The state of the evidence sources, and the trial countdown when there is one.
 * It stays visible when all is well: a source that stopped reporting is the
 * difference between "no risk" and "we cannot see the risk".
 */
function SidebarStatusCard({ billing, onOpen }: { billing?: ShellBilling; onOpen?: () => void }) {
  // A shared query, not a one-time load: this card used to keep saying "No
  // sources connected" after an audit had just marked Google for reconnecting.
  const sources = useRelationshipSourceStatuses();

  const trialDaysLeft = trialDaysRemaining(billing);
  if (sources.isPending) return null;
  const health: SourceHealth = sources.isError
    ? { tone: "idle", label: sidebarQueryError(sources.error, "Source status unavailable") }
    : sourceHealth(sources.data);
  const connected = sources.isError ? undefined : connectedSourceCount(sources.data);
  const total = sources.isError ? undefined : sources.data.length;
  return (
    <Button
      className={cn(
        "mb-2 h-auto w-full flex-col items-start gap-2.5 border border-dashed bg-transparent px-4 py-3 text-left hover:bg-background-100 dark:hover:bg-background-200",
        SOURCE_TONE_CARD[health.tone],
      )}
      onClick={onOpen}
      type="button"
      variant="ghost"
    >
      <Label className="text-[15px] font-normal">{health.label}</Label>
      {sourceMeterVisible(total, connected) &&
      typeof total === "number" &&
      typeof connected === "number" ? (
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <Label className="font-normal text-primary">Sources connected</Label>
            <Badge className="font-normal text-primary/60" variant="secondary">
              {connected} / {total}
            </Badge>
          </div>
          <TickMeter ratio={total > 0 ? connected / total : 0} />
        </div>
      ) : null}
      {trialDaysLeft === null ? null : (
        <div className="flex items-center justify-between text-[13px]">
          <Label className="font-normal text-primary">Trial</Label>
          <Badge className="font-normal text-primary/60" variant="secondary">
            {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
          </Badge>
        </div>
      )}
    </Button>
  );
}

/* --------------------------------- sidebar --------------------------------- */

/** A zero count is omitted. A string such as "8+" is a capped preview, not a total. */
function sidebarCountLabel(count: number | string | undefined): string {
  if (typeof count === "number") return count > 0 ? String(count) : "";
  return count?.trim() ?? "";
}

function SidebarNavItem({
  label,
  count,
  active,
  chevron,
  chevronOpen,
  href,
  className,
  onClick,
  disabled,
}: {
  label: string;
  count?: number | string;
  active?: boolean;
  chevron?: boolean;
  chevronOpen?: boolean;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
}) {
  const countLabel = sidebarCountLabel(count);
  const classes = cn(
    "group/item flex h-[var(--shell-nav-row-height,30px)] w-full shrink-0 items-center justify-start gap-1.5 rounded-lg px-2 text-left text-[var(--text-small,13px)] text-[var(--text-body)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--border)]",
    active && "bg-[var(--surface-active)] text-[var(--text-primary)]",
    className,
  );
  const content = (
    <>
      <Label className="truncate font-normal">{label}</Label>
      {countLabel ? (
        <Badge className="ml-auto font-normal text-primary/40" variant="secondary">
          {countLabel}
        </Badge>
      ) : null}
      {chevron ? (
        <CaretRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-primary/40 transition-transform",
            countLabel ? "" : "ml-auto",
            chevronOpen && "rotate-90",
          )}
        />
      ) : null}
    </>
  );
  if (href) {
    return (
      <Button
        asChild
        className={classes}
        data-active={active ? "true" : undefined}
        data-sidebar-row
        variant="ghost"
      >
        <Link aria-current={active ? "page" : undefined} href={href}>
          {content}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      className={classes}
      data-active={active ? "true" : undefined}
      data-sidebar-row
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      {content}
    </Button>
  );
}

function SidebarSubItem({
  label,
  active,
  muted,
  onClick,
}: {
  label: string;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      className={cn(
        "h-[var(--shell-nav-row-height,30px)] w-full justify-start gap-1.5 rounded-lg py-1 pr-3 pl-4 text-left text-[var(--text-small,13px)] font-normal text-[var(--text-body)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
        active && "bg-[var(--surface-active)] text-[var(--text-primary)]",
        muted && "text-[var(--text-muted)]",
      )}
      data-active={active ? "true" : undefined}
      data-sidebar-row
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      <Badge
        className={cn(
          "size-1 shrink-0 rounded-full border-0 p-0 bg-[var(--text-muted)]",
          active && "bg-[var(--text-primary)]",
        )}
        variant="outline"
      />
      <Label className="truncate font-normal">{label}</Label>
    </Button>
  );
}

function SidebarEmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-1.5 text-[13px] text-muted-foreground">{children}</div>;
}

const SIDEBAR_FOOTER_LINK =
  "flex h-[var(--shell-nav-row-height,30px)] w-full shrink-0 items-center justify-start rounded-lg px-2 text-[var(--text-small,13px)] text-[var(--text-body)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--border)]";

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label
      className="block px-2 pb-1 pt-3 text-[var(--text-caption,12px)] font-normal text-[var(--text-secondary)]"
      data-sidebar-section
    >
      {children}
    </Label>
  );
}

export type SidebarSessionMeta = {
  runId: string;
  title: string;
};

export function AppShellSidebar({
  open,
  onToggle,
  user,
  billing,
  selected,
  onSelectResource,
  onNavigateChat,
  onNavigateReport,
  onNavigateRevenue,
  onNavigateAgents,
  onNavigateScheduled,
  onNavigateRuns,
  activeRevenueTab = "commitments",
  activeResourceGroup,
  view = "chat",
  settingsSection = "overview",
  onOpenSettings,
  onCloseSettings,
  sessions = [],
  activeRunId = null,
  onOpenSession,
  onNewChat,
  overlayContainer = null,
}: {
  open: boolean;
  onToggle: () => void;
  user: ShellUser;
  billing?: ShellBilling;
  selected: { kind: ResourceKind; name: string } | null;
  onSelectResource?: SidebarSelect;
  onNavigateChat?: () => void;
  onNavigateReport?: () => void;
  onNavigateRevenue?: (tab: RevenueTab) => void;
  onNavigateAgents?: () => void;
  onNavigateScheduled?: () => void;
  onNavigateRuns?: () => void;
  activeRevenueTab?: RevenueTab;
  activeResourceGroup?: "agents" | "scheduled" | "runs";
  view?: ProductView;
  settingsSection?: SettingsSection;
  onOpenSettings?: (section: SettingsSection) => void;
  onCloseSettings?: () => void;
  sessions?: SidebarSessionMeta[];
  activeRunId?: string | null;
  onOpenSession?: (runId: string) => void;
  onNewChat?: () => void;
  overlayContainer?: HTMLElement | null;
}) {
  const agentsQuery = useSidebarAgents();
  const tasksQuery = useSidebarTasks();
  const runsQuery = useSidebarRuns();
  const agents = agentsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const runPreview: SidebarRunPreview = runsQuery.data ?? { items: [], truncated: false };
  const taskRuns = runPreview.items;
  const loadingGroups = {
    agents: agentsQuery.isPending,
    scheduled: tasksQuery.isPending,
    runs: runsQuery.isPending,
  };
  const groupErrors: Partial<Record<string, string>> = {
    ...(agentsQuery.isError
      ? { agents: sidebarQueryError(agentsQuery.error, "Could not load agents") }
      : {}),
    ...(tasksQuery.isError
      ? { scheduled: sidebarQueryError(tasksQuery.error, "Could not load schedules") }
      : {}),
    ...(runsQuery.isError
      ? { runs: sidebarQueryError(runsQuery.error, "Could not load runs") }
      : {}),
  };
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const { theme, setTheme: handleTheme } = useThemePreference();

  const workspace = useWorkspaceLabel(user);
  const planLabel = billing?.plan ? billing.plan[0].toUpperCase() + billing.plan.slice(1) : null;

  const groups: {
    key: string;
    label: string;
    kind?: ResourceKind;
    items: { label: string; value: string }[];
    countLabel?: string;
    empty: string;
    loading?: boolean;
    error?: string;
    onNavigate?: () => void;
  }[] = [
    {
      key: "agents",
      label: "Agents",
      kind: "agent",
      items: agents,
      empty: "No agents found",
      loading: loadingGroups.agents,
      error: groupErrors.agents,
      onNavigate: onNavigateAgents,
    },
    {
      key: "scheduled",
      label: "Workflows",
      kind: "task",
      items: tasks,
      empty: "Nothing scheduled",
      loading: loadingGroups.scheduled,
      error: groupErrors.scheduled,
      onNavigate: onNavigateScheduled,
    },
    {
      key: "runs",
      label: "Runs",
      kind: "taskrun",
      items: taskRuns.map((run) => ({ ...run, label: sidebarRunLabel(run, tasks) })),
      countLabel: sidebarRunCountLabel(runPreview),
      empty: "No runs yet",
      loading: loadingGroups.runs,
      error: groupErrors.runs,
      onNavigate: onNavigateRuns,
    },
  ];

  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex h-full min-h-0 shrink-0 overflow-hidden border-[var(--border)] border-r shadow-xl transition-all duration-200 ease-in-out md:relative md:shadow-none",
        open ? "w-[var(--shell-sidebar-width,252px)]" : "w-0 border-r-0",
        view === "settings" && "settings-rail",
      )}
      data-slot="app-sidebar"
    >
      <div
        className={cn(
          "flex h-full min-h-0 w-[var(--shell-sidebar-width,252px)] shrink-0 flex-col bg-[var(--surface-1)]",
          view === "settings" && "settings-rail",
        )}
      >
        {/* Phones get the sidebar as an overlay, so it needs its own way out. */}
        <div className="flex h-10 shrink-0 items-center justify-end px-2.5 md:hidden">
          <Button
            aria-label="Close sidebar"
            className="size-8 shrink-0 rounded-none text-primary/50 hover:bg-background-100 hover:text-primary"
            onClick={onToggle}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <SidebarSimple className="size-4" />
          </Button>
        </div>
        {view === "settings" ? (
          <nav className="settings-rail-scroll flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto px-2 pb-3 pt-2">
            <Button
              className="settings-back justify-start"
              onClick={onCloseSettings}
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="size-3.5" />
              Back to app
            </Button>
            <Button
              className="settings-nav-item mt-1 justify-start"
              data-active={settingsSection === "overview"}
              onClick={() => onOpenSettings?.("overview")}
              type="button"
              variant="ghost"
            >
              <GearSix />
              Settings
            </Button>
            {(["workspace", "global", "cloud", "support"] as SettingsGroup[]).map((group) => (
              <div key={group}>
                <div className="settings-rail-heading">{SETTINGS_GROUP_LABELS[group]}</div>
                <div className="space-y-0.5">
                  {SETTINGS_SECTIONS.filter((section) => section.group === group).map((section) => (
                    <Button
                      className="settings-nav-item justify-start"
                      data-active={settingsSection === section.key}
                      key={section.key}
                      onClick={() => onOpenSettings?.(section.key)}
                      type="button"
                      variant="ghost"
                    >
                      <section.icon />
                      <Label className="truncate font-normal">{section.label}</Label>
                      {section.beta ? (
                        <Badge className="settings-beta font-normal" variant="secondary">
                          Beta
                        </Badge>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        ) : (
          <nav
            className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2 pt-3"
            data-sidebar-nav
          >
            <SidebarNavItem
              active={view === "chat" && !selected}
              label="Home"
              onClick={onNavigateChat}
            />
            {/* The wedge, first in the list: the report is what a new account
                reads before anything else. */}
            <SidebarNavItem
              active={view === "report"}
              label="Open promises"
              onClick={onNavigateReport}
            />
            {(
              ["tasks", "notes", "commitments", "queue", "scans", "impact", "actions"] as const
            ).map((tab) => (
              <SidebarNavItem
                active={view === "revenue" && activeRevenueTab === tab}
                key={tab}
                label={REVENUE_TAB_LABELS[tab]}
                onClick={() => onNavigateRevenue?.(tab)}
              />
            ))}
            <SidebarSectionLabel>Records</SidebarSectionLabel>
            <SidebarNavItem
              active={view === "revenue" && activeRevenueTab === "relationships"}
              label={REVENUE_TAB_LABELS.relationships}
              onClick={() => onNavigateRevenue?.("relationships")}
            />
            <SidebarNavItem
              active={view === "revenue" && activeRevenueTab === "people"}
              label={REVENUE_TAB_LABELS.people}
              onClick={() => onNavigateRevenue?.("people")}
            />
            <SidebarSectionLabel>Workspace</SidebarSectionLabel>
            {groups.map((group) => (
              <Collapsible
                key={group.key}
                onOpenChange={(nextOpen) =>
                  setOpenGroups((current) => ({ ...current, [group.key]: nextOpen }))
                }
                open={Boolean(openGroups[group.key])}
              >
                <CollapsibleTrigger asChild>
                  <SidebarNavItem
                    active={activeResourceGroup === group.key}
                    chevron
                    chevronOpen={Boolean(openGroups[group.key])}
                    count={group.countLabel ?? group.items.length}
                    label={group.label}
                    onClick={group.onNavigate}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-0.5 pb-1">
                    {group.loading ? (
                      <SidebarEmptyHint>Loading…</SidebarEmptyHint>
                    ) : group.error ? (
                      <SidebarEmptyHint>{group.error}</SidebarEmptyHint>
                    ) : group.items.length === 0 ? (
                      <SidebarEmptyHint>{group.empty}</SidebarEmptyHint>
                    ) : (
                      group.items.map((item) => (
                        <SidebarSubItem
                          active={selected?.kind === group.kind && selected?.name === item.value}
                          key={item.value}
                          label={item.label}
                          onClick={
                            group.kind
                              ? () => onSelectResource?.({ kind: group.kind!, name: item.value })
                              : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}

            <div className="flex items-center justify-between pl-3.5 pr-2 pb-1 pt-4">
              <Label className="text-[12px] font-normal text-primary/40">History</Label>
              <Button
                aria-label="New chat"
                className="size-6 rounded-none text-primary/50 hover:bg-background-100 hover:text-primary dark:hover:bg-background-300"
                onClick={onNewChat}
                size="icon-xs"
                title="New chat"
                type="button"
                variant="ghost"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            {sessions.length === 0 ? (
              <SidebarEmptyHint>No conversations yet</SidebarEmptyHint>
            ) : (
              sessions.map((session) => (
                <SidebarSubItem
                  active={session.runId === activeRunId}
                  key={session.runId}
                  label={session.title}
                  onClick={() => onOpenSession?.(session.runId)}
                />
              ))
            )}
          </nav>
        )}

        <div
          className={cn(
            "mt-auto flex shrink-0 flex-col",
            view === "settings" && "settings-rail-footer",
          )}
        >
          <div
            className="flex flex-col gap-0.5 border-[var(--border)] border-t px-2 pt-2"
            data-sidebar-footer
          >
            <SidebarStatusCard billing={billing} onOpen={() => onNavigateRevenue?.("workspace")} />
            {/* Help stays in the product. The marketing blog is not where a
                signed-in person reports a problem. */}
            <button
              className={SIDEBAR_FOOTER_LINK}
              onClick={() => onOpenSettings?.("help")}
              type="button"
            >
              Need help?
            </button>
            {/* Plain anchor so the shell does not prefetch the reference
                document. The page is the OpenAPI spec rendered by this app. */}
            <a
              className={SIDEBAR_FOOTER_LINK}
              href="/api/reference"
              rel="noopener noreferrer"
              target="_blank"
            >
              API reference
            </a>
            <SidebarNavItem
              active={view === "settings"}
              label="Settings"
              onClick={() => onOpenSettings?.("overview")}
            />
          </div>

          <div
            className="relative z-10 mx-2 flex h-14 shrink-0 items-center border-[var(--border)] border-t"
            data-sidebar-account
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-none px-2 text-left hover:bg-background-100 data-[state=open]:bg-background-100 dark:hover:bg-background-200 dark:data-[state=open]:bg-background-200"
                  type="button"
                  variant="ghost"
                >
                  <Avatar aria-hidden="true" className="size-6 rounded-none" size="sm">
                    <AvatarFallback className="rounded-none border border-border bg-background-100 font-mono text-[11px] uppercase text-primary/60">
                      {workspace.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <Label className="truncate text-[15px] font-normal text-primary">
                    {workspace}
                  </Label>
                  {planLabel ? (
                    <Badge
                      className="shrink-0 bg-background-200 text-[12px] font-normal text-primary/55"
                      variant="secondary"
                    >
                      {planLabel}
                    </Badge>
                  ) : null}
                  <CaretUpDown className="ml-auto size-3.5 shrink-0 text-primary/40" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="app-shell w-[254px] rounded-lg"
                container={overlayContainer}
                side="top"
                sideOffset={8}
              >
                <DropdownMenuItem onSelect={() => onOpenSettings?.("overview")}>
                  <GearSix />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="px-2 py-1.5">
                    <div className="truncate text-sm font-medium text-primary">{workspace}</div>
                    <div className="truncate font-mono text-[11px] text-primary/50">
                      {user.email}
                    </div>
                  </div>
                </DropdownMenuLabel>
                {/* Security reviews this signed-in session. It does not list or
                    revoke other sessions, so the menu uses that page's name. */}
                <DropdownMenuItem onSelect={() => onOpenSettings?.("security")}>
                  <Stack />
                  Security
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    window.location.assign("/api/auth/logout");
                  }}
                >
                  <SignOut />
                  Sign out
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-primary/50">
                    Theme
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    className={theme === "light" ? "bg-muted" : ""}
                    onClick={() => handleTheme("light")}
                  >
                    <Sun />
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={theme === "dark" ? "bg-muted" : ""}
                    onClick={() => handleTheme("dark")}
                  >
                    <Moon />
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={theme === "system" ? "bg-muted" : ""}
                    onClick={() => handleTheme("system")}
                  >
                    <Monitor />
                    System
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-primary/50">
                  Workspaces
                </DropdownMenuLabel>
                {/* This session has one workspace. A menu item here accepted the
                    click and left the menu open. */}
                <div
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-primary"
                  data-current-workspace
                >
                  <Avatar aria-hidden="true" className="size-4 rounded-none" size="sm">
                    <AvatarImage
                      alt=""
                      className="scale-[1.85] object-contain dark:invert"
                      src="/marketing/oppulence-icon.png"
                    />
                    <AvatarFallback className="rounded-none" />
                  </Avatar>
                  <Label className="truncate font-normal">{workspace}</Label>
                  <CheckCircle
                    className="ml-auto size-4 shrink-0 text-oppulence-orange"
                    weight="fill"
                  />
                  {planLabel ? (
                    <Badge
                      className="shrink-0 text-[10px] font-normal text-primary/60"
                      variant="outline"
                    >
                      {planLabel}
                    </Badge>
                  ) : null}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {open ? (
        <Button
          aria-label="Collapse sidebar"
          className="absolute top-0 right-0 z-10 h-full w-[2px] min-w-0 cursor-w-resize rounded-none p-0 hover:bg-border"
          onClick={onToggle}
          title={sidebarShortcutTitle("Collapse sidebar")}
          type="button"
          variant="ghost"
        />
      ) : null}
    </div>
  );
}
