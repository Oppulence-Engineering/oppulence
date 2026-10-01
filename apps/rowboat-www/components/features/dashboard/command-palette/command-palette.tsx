"use client";

import "client-only";

import * as React from "react";
import {
  ChatCircle,
  ChatsCircle,
  EnvelopeSimple,
  FilePlus,
  Buildings,
  Folder,
  Monitor,
  Moon,
  SidebarSimple,
  SignOut,
  Sun,
} from "@/lib/icons";

import {
  SETTINGS_SECTIONS,
  useThemePreference,
  type SettingsSection,
} from "@/components/features/dashboard/app-shell/app-shell";
import { SIDEBAR_TOGGLE_KEY } from "@/lib/a11y/sidebar-shortcut";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@oppulence/ui/components/command";
import { Button } from "@oppulence/ui/components/button";
import { Label } from "@oppulence/ui/components/label";
import { Spinner } from "@oppulence/ui/components/spinner";
import { useRelationships, useSemanticSearch } from "@/hooks/queries/use-relationships";
import { explainedRevenueError } from "@/lib/revenue/revenue";
import type { SessionMeta } from "@/lib/agents/chat-sessions";
import type { SemanticMatch } from "@/lib/revenue/revenue";
import { companyName } from "@/lib/revenue/revenue-records";

/** Mail search is about messages, not an evidence store. */
export function mailSearchPlaceholder(mode: "accounts" | "mail"): string {
  return mode === "mail" ? "Describe the mail to find…" : "Search companies, or type a command…";
}

/**
 * The search API sets `available` to false when mail search is not configured.
 * That is a setup gap, not a plan that leaves the feature out.
 */
export function mailSearchUnavailableCopy(): string {
  return "Mail search is not set up for this workspace yet.";
}

/**
 * Search results arrive as signal classes. A promise used to be stored as
 * "commitment"; the row should use the same word as the rest of the product.
 */
export function mailMatchKind(classification: string | undefined): string {
  switch (classification) {
    case "deal":
      return "Deal";
    case "invoice":
      return "Invoice";
    case "client":
      return "Customer";
    case "referral":
      return "Referral";
    case "other":
      return "Other";
    case "commitment":
      return "Promise";
    default: {
      const words = classification?.replaceAll("_", " ").trim() ?? "";
      if (!words) return "";
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

export function mailMatchMeta(match: Pick<SemanticMatch, "counterparty" | "classification" | "score">): string {
  const score = typeof match.score === "number" ? `${Math.round(match.score * 100)}%` : "";
  return [match.counterparty, mailMatchKind(match.classification), score].filter(Boolean).join(" · ");
}

/** The overview section is already named Settings. Prefixing it reads "Settings · Settings". */
export function settingsCommandLabel(section: { key: string; label: string }): string {
  if (section.key === "overview") return "Settings";
  return `Settings · ${section.label}`;
}

export function CommandPalette({
  open,
  onOpenChange,
  agents,
  sessions,
  onNewChat,
  onNavigateChat,
  onNavigateRelationship,
  onNavigateMailMatch,
  onOpenSettings,
  onOpenAgent,
  onOpenSession,
  onToggleSidebar,
  querySeed = "",
  seedNonce = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: readonly { slug: string; name: string }[];
  sessions: SessionMeta[];
  onNewChat: () => void;
  onNavigateChat: () => void;
  /** Opens one company record. Optional so the palette still renders in
   *  contexts that have no relationship surface to jump to. */
  onNavigateRelationship?: (relationshipId: string) => void;
  /** Opens the source thread when the host has a mail/thread route available. */
  onNavigateMailMatch?: (threadId: string) => void;
  onOpenSettings: (section: SettingsSection) => void;
  onOpenAgent: (name: string) => void;
  onOpenSession: (runId: string) => void;
  onToggleSidebar: () => void;
  /** Text to place in the search box when a surface asks about something specific. */
  querySeed?: string;
  /** Bumps whenever a surface asks, including when the palette is already open. */
  seedNonce?: number;
}) {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<"accounts" | "mail">("accounts");
  const { setTheme } = useThemePreference();
  const term = debouncedQuery.trim();
  const searchEnabled = open && term.length >= 2;
  const accountsQuery = useRelationships({ q: term }, searchEnabled && searchMode === "accounts");
  const mailQuery = useSemanticSearch(term, searchEnabled && searchMode === "mail");
  const accounts = (accountsQuery.data ?? [])
    .filter((account) => account.kind !== "person")
    .slice(0, 6);
  const mailMatches: SemanticMatch[] = (mailQuery.data?.matches ?? []).slice(0, 6);
  const semanticAvailable = mailQuery.data?.available ?? null;
  const searchError = accountsQuery.isError || mailQuery.isError;
  const searching = accountsQuery.isFetching || mailQuery.isFetching;

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const runAnd = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  const appliedSeed = React.useRef(0);
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setSearchMode("accounts");
      return;
    }
    if (seedNonce === appliedSeed.current) return;
    appliedSeed.current = seedNonce;
    setQuery(querySeed);
  }, [open, querySeed, seedNonce]);

  return (
    <CommandDialog
      className="app-shell rounded-[2px]"
      data-slot="command-palette"
      description="Search actions, agents, and conversations"
      onOpenChange={onOpenChange}
      open={open}
      title="Command palette"
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder={mailSearchPlaceholder(searchMode)}
        value={query}
      />
      <div className="flex gap-1 border-b border-border px-3 py-2" aria-label="Search mode">
        <Button
          aria-pressed={searchMode === "accounts"}
          onClick={() => setSearchMode("accounts")}
          size="sm"
          type="button"
          variant={searchMode === "accounts" ? "secondary" : "ghost"}
        >
          Companies
        </Button>
        <Button
          aria-pressed={searchMode === "mail"}
          onClick={() => setSearchMode("mail")}
          size="sm"
          type="button"
          variant={searchMode === "mail" ? "secondary" : "ghost"}
        >
          <EnvelopeSimple />
          Search mail
        </Button>
      </div>
      <CommandList>
        <CommandEmpty className="flex items-center justify-center gap-2">
          {searching ? (
            <>
              <Spinner className="size-4" />
              Searching…
            </>
          ) : searchError ? (
            explainedRevenueError(
              searchMode === "mail" ? mailQuery.error : accountsQuery.error,
              "Search is temporarily unavailable.",
            )
          ) : searchMode === "mail" && semanticAvailable === false ? (
            mailSearchUnavailableCopy()
          ) : (
            "No results found."
          )}
        </CommandEmpty>
        {mailMatches.length > 0 ? (
          <>
            <CommandGroup heading="Mail">
              {mailMatches.map((match) => (
                <CommandItem
                  key={match.threadId}
                  onSelect={() => {
                    if (onNavigateMailMatch) {
                      runAnd(() => onNavigateMailMatch(match.threadId))();
                    }
                  }}
                  value={`${query} ${match.subject} ${match.counterparty}`}
                >
                  <EnvelopeSimple />
                  <span className="min-w-0">
                    <span className="block truncate">{match.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {mailMatchMeta(match)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {match.summary}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        {accounts.length > 0 ? (
          <>
            <CommandGroup heading="Companies">
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  // cmdk filters on value; the server already matched, so keep
                  // the typed query as the value to stop it filtering results
                  // the API deliberately returned.
                  value={`${query} ${companyName(account)} ${account.displayName}`}
                  onSelect={runAnd(() => onNavigateRelationship?.(account.id))}
                >
                  <Buildings />
                  {companyName(account)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={runAnd(onNewChat)}>
            <FilePlus />
            New chat
          </CommandItem>
          <CommandItem onSelect={runAnd(onToggleSidebar)}>
            <SidebarSimple />
            Toggle sidebar
            <CommandShortcut>{SIDEBAR_TOGGLE_KEY}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={runAnd(() => setTheme("light"))}>
            <Sun />
            Use light theme
          </CommandItem>
          <CommandItem onSelect={runAnd(() => setTheme("dark"))}>
            <Moon />
            Use dark theme
          </CommandItem>
          <CommandItem onSelect={runAnd(() => setTheme("system"))}>
            <Monitor />
            Use system theme
          </CommandItem>
          <CommandItem onSelect={runAnd(() => window.location.assign("/api/auth/logout"))}>
            <SignOut />
            Sign out
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={runAnd(onNavigateChat)}>
            <ChatsCircle />
            Chat
          </CommandItem>
          {SETTINGS_SECTIONS.map((section) => (
            <CommandItem key={section.key} onSelect={runAnd(() => onOpenSettings(section.key))}>
              <section.icon />
              {settingsCommandLabel(section)}
            </CommandItem>
          ))}
        </CommandGroup>
        {agents.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {agents.map((agent) => (
                <CommandItem key={agent.slug} onSelect={runAnd(() => onOpenAgent(agent.slug))}>
                  <Folder />
                  {agent.name.trim() || agent.slug}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        {sessions.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Conversations">
              {sessions.map((session) => (
                <CommandItem
                  key={session.runId}
                  onSelect={runAnd(() => onOpenSession(session.runId))}
                  value={`${session.title} ${session.runId}`}
                >
                  <ChatCircle />
                  <Label className="truncate font-normal">{session.title}</Label>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
