// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchConsoleResources: vi.fn(),
  fetchWorkspaceNotes: vi.fn(),
}));

vi.mock("@/lib/console/console", () => ({
  createConsoleResource: vi.fn(),
  deleteConsoleResource: vi.fn(),
  patchConsoleResource: vi.fn(),
}));
vi.mock("@/hooks/queries/utils/fetch-console", () => ({
  fetchConsoleResources: mocks.fetchConsoleResources,
  fetchConsolePreferences: vi.fn(),
}));
vi.mock("@/hooks/queries/utils/fetch-workspace-notes", () => ({
  fetchWorkspaceNotes: mocks.fetchWorkspaceNotes,
}));
vi.mock("@/lib/revenue/revenue", () => ({
  relativeTime: () => "now",
}));
vi.mock("@oppulence/ui/components/dialog", () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

import { NotesView, sortTasksByDue } from "@/components/features/revenue/workspace-records/workspace-records-view";

const timestamps = {
  createdAt: "2026-09-17T12:00:00Z",
  updatedAt: "2026-09-17T12:00:00Z",
  sortOrder: 0,
};

function renderNotes() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotesView onError={vi.fn()} onNotice={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("durable note templates and favorites", () => {
  beforeEach(() => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [
        {
          externalId: "note-1",
          title: "Account review",
          body: "Follow up",
          relationshipId: "relationship-1",
          relationshipName: "Acme",
          occurredAt: "2026-09-17T12:00:00Z",
          eventType: "note",
        },
      ],
      relationships: [{ id: "relationship-1", kind: "organization", displayName: "Acme" }],
      failedTimelineCount: 0,
    });
    mocks.fetchConsoleResources.mockImplementation(async (kind: string) =>
      kind === "note_template"
        ? [
            {
              ...timestamps,
              id: "11111111-1111-4111-8111-111111111111",
              kind,
              name: "Weekly review",
              payload: { title: "Weekly review", body: "Wins and risks" },
            },
          ]
        : [
            {
              ...timestamps,
              id: "22222222-2222-4222-8222-222222222222",
              kind,
              payload: { noteId: "note-1" },
            },
          ],
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("renders the real favorite count from durable resources", async () => {
    renderNotes();

    expect((await screen.findAllByText("Account review")).length).toBeGreaterThan(0);
    expect(screen.getByText("Favorites").parentElement).toHaveTextContent("1");
  });

  it("says a note cannot be saved until a company exists", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
    });
    const onNotice = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={onNotice} />
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.type(screen.getByLabelText("Note title"), "Call notes");

    expect(screen.getByText("Link a company to save this note.")).toBeInTheDocument();
    expect(screen.getByLabelText("Linked company")).toHaveTextContent("No companies yet");

    await user.click(screen.getByRole("button", { name: "Close note" }));
    expect(onNotice).toHaveBeenCalledWith("Link a company before this note can be saved.");
  });

  it("opens the template library from the empty note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.click(await screen.findByRole("button", { name: "View all templates" }));

    expect(await screen.findByText("Reusable note templates")).toBeInTheDocument();
    expect(screen.getByText("Weekly review")).toBeInTheDocument();
  });

  it("opens the template editor from the empty note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Create new template" }));

    expect(await screen.findByRole("heading", { name: "New note template" })).toBeInTheDocument();
  });

  it("applies a durable template to a new note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("tab", { name: /Templates/ }));
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    expect(await screen.findByDisplayValue("Weekly review")).toBeInTheDocument();
    expect(screen.getByText("Wins and risks")).toBeInTheDocument();
  });

  it("opens the note a copied link points at", async () => {
    window.history.replaceState(null, "", "/app/revenue?tab=commitments#note=note-1");
    renderNotes();

    expect(await screen.findByDisplayValue("Account review")).toBeInTheDocument();
  });

  it("says when the linked note is gone", async () => {
    window.history.replaceState(null, "", "/app/revenue?tab=notes#note=missing");
    const onNotice = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={onNotice} />
      </QueryClientProvider>,
    );

    await screen.findAllByText("Account review");
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith("That note is no longer in this workspace."),
    );
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();
  });

  it("copies a link that stays on the notes tab", async () => {
    window.history.replaceState(null, "", "/app/revenue?tab=commitments#note=note-1");
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderNotes();

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/app/revenue?tab=notes#note=note-1`,
      ),
    );
  });

  it("does not call an older note created today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 30, 15, 0, 0));
    renderNotes();

    expect(await screen.findByText("Earlier")).toBeInTheDocument();
    expect(screen.queryByText("Created today")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
import { describe, expect, it } from "vitest";

import { collapseWorkspaceNotes, groupWorkspaceNotes, plateText } from "@/lib/revenue/revenue-records";
import type { RelationshipObservation, RevenueRelationship } from "@/lib/revenue/types";

const relationship = {
  id: "relationship-1",
  displayName: "Acme",
} as RevenueRelationship;

const observation = (
  externalId: string,
  occurredAt: string,
  eventType: "note" | "note_deleted",
  facts: Record<string, unknown>,
) =>
  ({
    externalId,
    occurredAt,
    eventType,
    normalizedFacts: facts,
    source: "desktop_note",
  }) as RelationshipObservation;

describe("workspace record notes", () => {
  it("keeps the latest version and hides deleted notes", () => {
    const notes = collapseWorkspaceNotes(
      [relationship],
      [
        [
          observation("event-1", "2026-09-01T12:00:00Z", "note", {
            noteId: "note-1",
            title: "Original",
          }),
          observation("event-2", "2026-09-02T12:00:00Z", "note", {
            noteId: "note-1",
            title: "Updated",
            liveLinked: true,
          }),
          observation("event-3", "2026-09-03T12:00:00Z", "note", {
            noteId: "note-2",
            title: "Delete me",
          }),
          observation("event-4", "2026-09-04T12:00:00Z", "note_deleted", {
            noteId: "note-2",
          }),
        ],
      ],
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      externalId: "note-1",
      title: "Updated",
      liveLinked: true,
    });
  });

  it("keeps Plate blocks readable in note previews", () => {
    expect(
      plateText([
        { type: "p", children: [{ text: "First line" }] },
        { type: "p", children: [{ text: "Second " }, { text: "line" }] },
      ]),
    ).toBe("First line\nSecond line");
  });

  it("groups notes by the reader's local day", () => {
    const now = new Date(2026, 8, 30, 15, 0, 0);
    const note = (externalId: string, occurredAt: string): ReturnType<typeof collapseWorkspaceNotes>[number] => ({
      externalId,
      title: externalId,
      body: "",
      relationshipId: "relationship-1",
      relationshipName: "Acme",
      occurredAt,
      eventType: "note",
    });
    const today = new Date(2026, 8, 30, 9, 0, 0).toISOString();
    const yesterday = new Date(2026, 8, 29, 9, 0, 0).toISOString();
    const earlier = new Date(2026, 8, 17, 9, 0, 0).toISOString();

    expect(
      groupWorkspaceNotes(
        [note("older", earlier), note("yesterday", yesterday), note("today", today)],
        now,
        true,
      ).map((group) => [group.label, group.notes.map((item) => item.externalId)]),
    ).toEqual([
      ["Created today", ["today"]],
      ["Created yesterday", ["yesterday"]],
      ["Earlier", ["older"]],
    ]);

    expect(
      groupWorkspaceNotes([note("older", earlier), note("today", today)], now, false).map(
        (group) => group.label,
      ),
    ).toEqual(["Earlier", "Created today"]);
  });
});

describe("task due order", () => {
  it("puts undated tasks after dated ones, and reverses when latest is requested", () => {
    const tasks = [
      { id: "undated" },
      { id: "later", dueAt: "2026-10-02" },
      { id: "sooner", dueAt: "2026-09-01" },
    ];
    expect(sortTasksByDue(tasks, true).map((task) => task.id)).toEqual([
      "sooner",
      "later",
      "undated",
    ]);
    expect(sortTasksByDue(tasks, false).map((task) => task.id)).toEqual([
      "later",
      "sooner",
      "undated",
    ]);
  });
});
