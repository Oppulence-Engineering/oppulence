// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchers = vi.hoisted(() => ({
  fetchRelationships: vi.fn(),
  relationshipRows: (page: { relationships?: unknown[] } | unknown[] | undefined) =>
    Array.isArray(page) ? page : (page?.relationships ?? []),
  relationshipPageHasMore: (page: { hasMore?: boolean } | unknown[] | undefined) =>
    Boolean(page && !Array.isArray(page) && page.hasMore),
  fetchSemanticSearch: vi.fn(),
  fetchIdentityCandidates: vi.fn(),
  fetchRelationshipAttention: vi.fn(),
  fetchRelationshipGraph: vi.fn(),
  fetchPersons: vi.fn(),
}));

vi.mock("@/hooks/queries/utils/fetch-relationships", () => fetchers);
vi.mock("@oppulence/ui/components/spinner", () => ({
  Spinner: () => <span>Searching…</span>,
}));
vi.mock("@/components/features/dashboard/app-shell/app-shell", () => ({
  SETTINGS_SECTIONS: [
    { key: "overview", label: "Settings", icon: () => null },
    { key: "preferences", label: "Preferences", icon: () => null },
  ],
  useThemePreference: () => ({ setTheme: vi.fn() }),
}));
vi.mock("@oppulence/ui/components/command", () => ({
  CommandDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: { children: React.ReactNode; heading: string }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandInput: ({
    onValueChange,
    placeholder,
    value,
  }: {
    onValueChange: (value: string) => void;
    placeholder: string;
    value: string;
  }) => (
    <input
      aria-label="Command search"
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
      placeholder={placeholder}
      value={value}
    />
  ),
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
  CommandShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import {
  CommandPalette,
  paletteEarlierConversationsLabel,
  paletteMoreCompaniesLabel,
} from "@/components/features/dashboard/command-palette/command-palette";

function renderPalette(props: ComponentProps<typeof CommandPalette>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette {...props} />
    </QueryClientProvider>,
  );
}

const requiredProps = {
  agents: [],
  onNavigateChat: vi.fn(),
  onNewChat: vi.fn(),
  onOpenAgent: vi.fn(),
  onOpenChange: vi.fn(),
  onOpenSession: vi.fn(),
  onOpenSettings: vi.fn(),
  onToggleSidebar: vi.fn(),
  open: true,
  sessions: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommandPalette semantic mail search", () => {
  it("shows an agent by name and opens it by slug", async () => {
    const user = userEvent.setup();
    const onOpenAgent = vi.fn();
    renderPalette({
      ...requiredProps,
      agents: [{ slug: "concierge-slack", name: "Slack Concierge" }],
      onOpenAgent,
    });

    await user.click(screen.getByRole("button", { name: "Slack Concierge" }));

    expect(onOpenAgent).toHaveBeenCalledWith("concierge-slack");
    expect(screen.queryByRole("button", { name: "concierge-slack" })).toBeNull();
  });

  it("uses an explicit mail mode and renders evidence metadata", async () => {
    const user = userEvent.setup();
    fetchers.fetchSemanticSearch.mockResolvedValue({
      available: true,
      matches: [
        {
          classification: "commitment",
          counterparty: "Ada",
          score: 0.91,
          subject: "Launch follow-up",
          summary: "Ada promised the revised launch plan.",
          threadId: "thread-1",
        },
      ],
    });

    renderPalette(requiredProps);
    await user.click(screen.getByRole("button", { name: /search mail/i }));
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "launch promise");

    await waitFor(() => {
      expect(fetchers.fetchSemanticSearch).toHaveBeenCalledWith(
        "launch promise",
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText("Launch follow-up")).toBeVisible();
    expect(screen.getByText("Ada · Promise · 91%")).toBeVisible();
    expect(screen.queryByText("Mail evidence")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Command search" })).toHaveAttribute(
      "placeholder",
      "Describe the mail to find…",
    );
  });

  it("keeps a mail match past the first six", async () => {
    const user = userEvent.setup();
    fetchers.fetchSemanticSearch.mockResolvedValue({
      available: true,
      matches: Array.from({ length: 8 }, (_, index) => ({
        classification: "commitment",
        counterparty: "Ada",
        score: 0.8,
        subject: `Cedar mail ${index + 1}`,
        summary: "A promise.",
        threadId: `thread-${index + 1}`,
      })),
    });

    renderPalette(requiredProps);
    await user.click(screen.getByRole("button", { name: /search mail/i }));
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "cedar mail");

    expect(await screen.findByText("Cedar mail 8")).toBeVisible();
    expect(screen.getByText("Cedar mail 7")).toBeVisible();
    expect(screen.getByText("Cedar mail 1")).toBeVisible();
  });

  it("distinguishes an unavailable workspace capability from a search failure", async () => {
    const user = userEvent.setup();
    fetchers.fetchSemanticSearch.mockResolvedValue({ available: false, matches: [] });

    renderPalette(requiredProps);
    await user.click(screen.getByRole("button", { name: /search mail/i }));
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "renewal risk");

    expect(
      await screen.findByText("Mail search is not set up for this workspace yet."),
    ).toBeVisible();
  });

  it("keeps a conversation past the first eight in the list", () => {
    const sessions = Array.from({ length: 9 }, (_, index) => ({
      runId: `run-${index + 1}`,
      title: `Conversation ${index + 1}`,
      updatedAt: index,
    }));
    renderPalette({ ...requiredProps, sessions });
    expect(screen.getByRole("button", { name: "Conversation 9" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Conversation 1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: paletteEarlierConversationsLabel() })).toBeNull();
  });

  it("offers earlier conversations only when another page exists", async () => {
    const user = userEvent.setup();
    const onLoadMoreSessions = vi.fn();
    const onOpenChange = vi.fn();
    const sessions = [{ runId: "run-1", title: "Conversation 1", updatedAt: 1 }];
    renderPalette({
      ...requiredProps,
      hasMoreSessions: true,
      onLoadMoreSessions,
      onOpenChange,
      sessions,
      sessionsLoadError: "Could not load earlier conversations.",
    });
    await user.click(screen.getByRole("button", { name: paletteEarlierConversationsLabel() }));
    expect(onLoadMoreSessions).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Could not load earlier conversations." }),
    ).toBeVisible();
  });

  it("names the company search instead of accounts", () => {
    renderPalette(requiredProps);
    expect(screen.getByRole("button", { name: "Companies" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accounts" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Command search" })).toHaveAttribute(
      "placeholder",
      "Search companies, or type a command…",
    );
    expect(screen.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Settings · Preferences" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Settings · Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use light theme" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Use system theme" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Theme: light" })).toBeNull();
  });

  it("explains a rate limit instead of saying search is down", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockRejectedValue(new Error("Request failed (429)"));
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "acme");
    expect(
      await screen.findByText(
        "Too many requests were sent from this workspace. Wait a moment, then try again.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Search is temporarily unavailable.")).toBeNull();
  });

  it("keeps the short search line when the failure is unexplained", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockRejectedValue(new Error("upstream"));
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "acme");
    expect(await screen.findByText("Search is temporarily unavailable.")).toBeVisible();
  });

  it("offers another page only when the server says more companies match", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockImplementation(async (filters: { offset?: number }) => {
      if (filters?.offset) {
        return {
          relationships: [{ id: "company-extra", kind: "company", displayName: "Search Extra" }],
          hasMore: false,
        };
      }
      return {
        relationships: [{ id: "company-1", kind: "company", displayName: "Search Co" }],
        hasMore: true,
      };
    });
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "Search");
    expect(await screen.findByRole("button", { name: "Search Co" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search Extra" })).toBeNull();
    await user.click(screen.getByRole("button", { name: paletteMoreCompaniesLabel() }));
    expect(await screen.findByRole("button", { name: "Search Extra" })).toBeVisible();
    expect(screen.queryByRole("button", { name: paletteMoreCompaniesLabel() })).toBeNull();
  });

  it("lists every company the search returned", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        id: `company-${index + 1}`,
        kind: "company",
        displayName: `Search Co ${index + 1}`,
      })),
    );
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "Search Co");
    expect(await screen.findByRole("button", { name: "Search Co 7" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Search Co 1" })).toBeVisible();
  });

  it("opens the company that the search found", async () => {
    const user = userEvent.setup();
    const onNavigateRelationship = vi.fn();
    fetchers.fetchRelationships.mockResolvedValue([
      { id: "company-1", displayName: "acme harbor" },
    ]);
    renderPalette({ ...requiredProps, onNavigateRelationship });
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "acme");
    await user.click(await screen.findByRole("button", { name: "acme harbor" }));
    expect(onNavigateRelationship).toHaveBeenCalledWith("company-1");
  });

  it("titles a company stored as its domain", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockResolvedValue([
      {
        id: "company-domain",
        kind: "company",
        displayName: "northwind.example",
        accountDomain: "northwind.example",
      },
    ]);
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "north");
    expect(await screen.findByRole("button", { name: "Northwind" })).toBeVisible();
  });

  it("keeps a person out of company search", async () => {
    const user = userEvent.setup();
    fetchers.fetchRelationships.mockResolvedValue([
      { id: "company-1", kind: "company", displayName: "acme harbor" },
      { id: "person-1", kind: "person", displayName: "ada lovelace" },
    ]);
    renderPalette(requiredProps);
    await user.type(screen.getByRole("textbox", { name: "Command search" }), "ada");
    expect(await screen.findByRole("button", { name: "acme harbor" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "ada lovelace" })).toBeNull();
  });

  it("fills the search box with the company a surface asked about", async () => {
    renderPalette({ ...requiredProps, querySeed: "Acme", seedNonce: 1 });
    expect(await screen.findByDisplayValue("Acme")).toBeVisible();
  });
});
