// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchConsoleResources: vi.fn(),
  fetchWorkspaceNotes: vi.fn(),
  fetchMoreWorkspaceNotes: vi.fn(),
  ingestRelationshipObservations: vi.fn(),
  deletePerson: vi.fn(async () => undefined),
  getPersonAttributes: vi.fn(async () => []),
}));

const records = vi.hoisted(() => ({
  people: [] as Array<{
    id: string;
    displayName: string;
    aliases: string[];
    status: string;
    relationshipCount: number;
    attributesVersion: number;
    primaryEmail?: string;
  }>,
  peopleError: null as Error | null,
  actionsError: null as Error | null,
  peopleRefetch: vi.fn(async () => undefined),
  actionsRefetch: vi.fn(async () => undefined),
  relationshipsError: null as Error | null,
  relationshipsRefetch: vi.fn(async () => ({ isError: false })),
}));

vi.mock("@/lib/console/console", () => ({
  createConsoleResource: vi.fn(),
  deleteConsoleResource: vi.fn(),
  patchConsoleResource: vi.fn(),
}));
vi.mock("@/hooks/queries/utils/fetch-console", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/queries/utils/fetch-console")>();
  return {
    ...actual,
    fetchConsoleResources: mocks.fetchConsoleResources,
    fetchConsolePreferences: vi.fn(),
  };
});
vi.mock("@/hooks/queries/utils/fetch-workspace-notes", () => ({
  fetchWorkspaceNotes: mocks.fetchWorkspaceNotes,
  fetchMoreWorkspaceNotes: mocks.fetchMoreWorkspaceNotes,
}));
vi.mock("@/lib/revenue/revenue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/revenue/revenue")>();
  return {
    ...actual,
    relativeTime: () => "now",
    ingestRelationshipObservations: mocks.ingestRelationshipObservations,
    deletePerson: mocks.deletePerson,
    getPersonAttributes: mocks.getPersonAttributes,
  };
});
vi.mock("@/hooks/queries/use-revenue-actions", () => ({
  useRevenueActions: () => ({
    data: records.actionsError
      ? undefined
      : [
          {
            id: "task-1",
            reason: "Call the harbor",
            relationshipId: "relationship-1",
            dueAt: "2026-10-11T21:00:00.000Z",
            actionType: "follow_up_task",
            channel: "task",
          },
          {
            id: "task-hidden",
            reason: "Call the hidden account",
            relationshipId: "relationship-hidden",
            relationshipName: "Hidden Account Co",
            dueAt: "2026-10-12T21:00:00.000Z",
            actionType: "follow_up_task",
            channel: "task",
          },
        ],
    isPending: false,
    isError: records.actionsError != null,
    error: records.actionsError,
    refetch: records.actionsRefetch,
  }),
}));
vi.mock("@/hooks/queries/use-relationships", () => ({
  useRelationships: () => ({
    data: [{ id: "relationship-1", kind: "company", displayName: "Acme" }],
    isPending: false,
    isError: records.relationshipsError != null,
    error: records.relationshipsError,
    refetch: records.relationshipsRefetch,
    dataUpdatedAt: 1,
  }),
  usePersons: () => ({
    data: records.peopleError && records.people.length === 0 ? undefined : records.people,
    isPending: false,
    isError: records.peopleError != null,
    error: records.peopleError,
    refetch: records.peopleRefetch,
  }),
}));
vi.mock("@/components/auth/auth-gate", () => ({
  useAuthSession: () => ({
    user: { email: "ada@example.com", workosUserId: "user_ada" },
  }),
}));
vi.mock("@oppulence/ui/components/dialog", () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

import { listRefreshFailureCopy } from "@/components/features/revenue/shared/shared";
import { removePersonConfirmCopy } from "@/lib/revenue/source-product-copy";
import {
  NotesView,
  PeopleView,
  TasksView,
  personDirectoryCount,
  personDirectoryTitle,
  personRemainderLabel,
  peopleListEmptyCopy,
  peopleListFailureCopy,
  noteListFailureCopy,
  taskListFailureCopy,
  taskCompaniesFailureCopy,
  enrichmentEvidence,
  personEnrichmentLabel,
  personEvidenceProvenance,
  personEvidenceLabel,
  personFactValue,
  personSeniorityLabel,
  personAccountDomain,
  personSheetDetail,
  personAliasNames,
  personDirectoryRole,
  personKnownFact,
  personLastInteractionLabel,
  personDirectorySubtitle,
  personSheetSubtitle,
  sortTasksByDue,
  linkedCompanyName,
  nextNoteCompaniesLabel,
  noteCompanyMenuLabel,
  noteCompanyLabel,
  noteNeedsCompanyCopy,
  noteCountLabel,
  earlierNotesLabel,
  notesEmptyDescription,
  notesRemainderLabel,
  notesTabContinues,
  NOTE_LINK_SEEK_PAGES,
  templateCountLabel,
  nextTemplatesLabel,
  nextFavoritesLabel,
  favoriteNotesLabel,
  favoriteNotesEmptyCopy,
  taskCompanyName,
  taskFilterName,
  taskListEmptyCopy,
} from "@/components/features/revenue/workspace-records/workspace-records-view";

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
      hasMoreNotes: false,
      timelineCursors: [],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
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

    expect(screen.getByText(noteNeedsCompanyCopy("status", false))).toBeInTheDocument();
    expect(noteNeedsCompanyCopy("status", false)).toBe("Add a company to save this note.");
    expect(screen.getByLabelText("Linked company, No companies yet")).toHaveTextContent(
      "No companies yet",
    );

    await user.click(screen.getByRole("button", { name: "Close note" }));
    expect(onNotice).toHaveBeenCalledWith(noteNeedsCompanyCopy("notice", false));
    expect(noteNeedsCompanyCopy("notice", false)).toBe(
      "Add a company before this note can be saved.",
    );

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onNotice).toHaveBeenCalledWith(
      "This note has not been saved, so there is no link to copy.",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("leaves a new note unlinked when companies already exist", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [
        { id: "relationship-1", kind: "organization", displayName: "Acme" },
        { id: "relationship-2", kind: "organization", displayName: "Harbor" },
      ],
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
    expect(screen.getByLabelText("Linked company, Link a company")).toBeInTheDocument();
    expect(screen.queryByLabelText("Linked company, Acme")).toBeNull();

    await user.type(screen.getByLabelText("Note title"), "Call notes");
    expect(screen.getByText(noteNeedsCompanyCopy("status", true))).toBeInTheDocument();
    expect(noteNeedsCompanyCopy("status", true)).toBe("Link a company to save this note.");

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(mocks.ingestRelationshipObservations).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Close note" }));
    expect(onNotice).toHaveBeenCalledWith(noteNeedsCompanyCopy("notice", true));
    expect(noteNeedsCompanyCopy("notice", true)).toBe(
      "Link a company before this note can be saved.",
    );
  });

  it("loads a later company into a new note without selecting it", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [{ id: "relationship-1", kind: "organization", displayName: "Acme" }],
      failedTimelineCount: 0,
      hasMoreNotes: true,
      nextRelationshipOffset: 200,
      timelineCursors: [],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [
        { id: "relationship-hidden", kind: "organization", displayName: "Hidden Account Co" },
      ],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
    });
    const user = userEvent.setup();
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.click(screen.getByRole("combobox", { name: "Linked company, Link a company" }));
    expect(screen.getByRole("option", { name: "Acme" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hidden Account Co" })).toBeNull();

    await user.click(screen.getByRole("button", { name: nextNoteCompaniesLabel() }));

    expect(mocks.fetchMoreWorkspaceNotes).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("option", { name: "Hidden Account Co" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("option", { name: "Acme" })).toHaveAttribute("aria-selected", "false");
    expect(mocks.ingestRelationshipObservations).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: nextNoteCompaniesLabel() })).toBeNull();
  });

  it("does not say the workspace has no companies while a later page still has them", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: true,
      nextRelationshipOffset: 200,
      timelineCursors: [],
    });
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);

    expect(noteCompanyMenuLabel(0, true)).toBe("More companies are still in this list.");
    expect(
      screen.getByRole("combobox", {
        name: "Linked company, More companies are still in this list.",
      }),
    ).toBeEnabled();
    expect(screen.queryByText("No companies yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a company" })).toBeNull();
  });

  it("does not claim earlier notes when only more companies remain", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [{ id: "relationship-1", kind: "organization", displayName: "Acme" }],
      failedTimelineCount: 0,
      hasMoreNotes: true,
      nextRelationshipOffset: 200,
      timelineCursors: [],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [
        { id: "relationship-hidden", kind: "organization", displayName: "Hidden Account Co" },
      ],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
    });
    const user = userEvent.setup();
    renderNotes();

    expect(await screen.findByText(notesEmptyDescription(false))).toBeInTheDocument();
    expect(screen.queryByText(notesEmptyDescription(true))).toBeNull();
    expect(screen.getByRole("tab", { name: /^Notes/ })).not.toHaveTextContent("0+");
    await user.click(screen.getByRole("button", { name: notesRemainderLabel(false) }));

    expect(mocks.fetchMoreWorkspaceNotes).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: notesRemainderLabel(false) })).toBeNull();
  });

  it("opens the company named on a meeting note", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [
        {
          externalId: "note-1",
          title: "Harbor follow-up",
          body: "Ask about the sandbox login.",
          meetingLinked: true,
          relationshipId: "relationship-1",
          relationshipName: "Acme",
          occurredAt: "2026-09-17T12:00:00Z",
          eventType: "note",
        },
      ],
      relationships: [{ id: "relationship-1", kind: "organization", displayName: "Acme" }],
      failedTimelineCount: 0,
    });
    const onOpenCompany = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={vi.fn()} onOpenCompany={onOpenCompany} />
      </QueryClientProvider>,
    );

    expect(noteCompanyLabel("Acme")).toBe("Open company Acme");
    expect(noteCompanyLabel("  ")).toBe("Open company company");
    expect(await screen.findByText("Meeting note")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open company Acme" }));
    expect(onOpenCompany).toHaveBeenCalledWith("relationship-1");
    expect(screen.queryByLabelText("Note title")).toBeNull();
  });

  it("opens New company from an empty note", async () => {
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
    });
    const onOpenCompanies = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={vi.fn()} onOpenCompanies={onOpenCompanies} />
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.click(screen.getByRole("button", { name: "Add a company" }));

    expect(onOpenCompanies).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Note title")).toBeNull();
  });

  it("opens the template library from the empty note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    expect(screen.queryByText("Favorite templates")).not.toBeInTheDocument();
    expect(screen.queryByText(/you favorite/)).not.toBeInTheDocument();
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

  it("hides note list controls while templates are open", async () => {
    const user = userEvent.setup();
    renderNotes();

    expect(await screen.findByRole("button", { name: /Sorted by/ })).toBeVisible();
    await user.click(await screen.findByRole("tab", { name: /Templates/ }));

    expect(screen.queryByRole("button", { name: /Sorted by/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "List view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grid view" })).not.toBeInTheDocument();
    expect(screen.queryByText("View settings")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New template" })).toBeVisible();
  });

  it("keeps a single new-template button when none exist yet", async () => {
    mocks.fetchConsoleResources.mockImplementation(async (kind: string) => {
      if (kind === "note_template") return [];
      return [
        {
          id: "favorite-1",
          kind: "note_favorite",
          name: "Account review",
          payload: { externalId: "note-1" },
          ...timestamps,
        },
      ];
    });
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
    });
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("tab", { name: /Templates/ }));

    expect(await screen.findByText("No templates yet")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "New template" })).toHaveLength(1);
  });

  it("applies a durable template to a new note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("tab", { name: /Templates/ }));
    expect(screen.getByRole("button", { name: "Edit Weekly review" })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Apply Weekly review" }));

    expect(await screen.findByDisplayValue("Weekly review")).toBeInTheDocument();
    expect(screen.getByText("Wins and risks")).toBeInTheDocument();
  });

  it("names the signed-in author and does not close the note from minimize", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);

    expect(screen.getByLabelText("Note author ada")).toHaveTextContent("A");
    expect(screen.queryByText("Y")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimize note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark as meeting note" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Maximize note" }));
    await user.click(screen.getByRole("button", { name: "Minimize note" }));

    expect(screen.getByLabelText("Note title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimize note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Maximize note" })).toBeEnabled();
  });

  it("inserts a heading from the note content control", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Insert content" }));
    const before = document.querySelectorAll("h2").length;
    await user.click(await screen.findByRole("button", { name: "Insert heading 2" }));

    expect(document.querySelectorAll("h2").length).toBe(before + 1);
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
    expect(mocks.fetchMoreWorkspaceNotes).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();
  });

  it("opens a linked note that is still on a later page", async () => {
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
      hasMoreNotes: true,
      timelineCursors: [{ relationshipId: "relationship-1", before: "2026-09-01T00:00:00Z" }],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [
        {
          externalId: "note-hidden",
          title: "Hidden desk note",
          body: "Still here",
          relationshipId: "relationship-1",
          relationshipName: "Acme",
          occurredAt: "2026-08-01T12:00:00Z",
          eventType: "note",
        },
      ],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
    });
    window.history.replaceState(null, "", "/app/revenue?tab=notes#note=note-hidden");
    const onNotice = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={onNotice} />
      </QueryClientProvider>,
    );

    expect(await screen.findByDisplayValue("Hidden desk note")).toBeInTheDocument();
    expect(onNotice).not.toHaveBeenCalledWith("That note is no longer in this workspace.");
    expect(mocks.fetchMoreWorkspaceNotes).toHaveBeenCalledTimes(1);
  });

  it("stops walking earlier pages and does not call a buried note gone", async () => {
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
      hasMoreNotes: true,
      timelineCursors: [{ relationshipId: "relationship-1", before: "2026-09-01T00:00:00Z" }],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: true,
      timelineCursors: [{ relationshipId: "relationship-1", before: "2026-08-01T00:00:00Z" }],
    });
    window.history.replaceState(null, "", "/app/revenue?tab=notes#note=note-buried");
    const onNotice = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={onNotice} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        "That note is further back than the notes already open.",
      ),
    );
    expect(mocks.fetchMoreWorkspaceNotes).toHaveBeenCalledTimes(NOTE_LINK_SEEK_PAGES);
    expect(onNotice).not.toHaveBeenCalledWith("That note is no longer in this workspace.");
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();
  });

  it("keeps a favorited note that is still on a later page", async () => {
    const user = userEvent.setup();
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
      hasMoreNotes: true,
      timelineCursors: [{ relationshipId: "relationship-1", before: "2026-09-01T00:00:00Z" }],
    });
    mocks.fetchMoreWorkspaceNotes.mockResolvedValue({
      notes: [
        {
          externalId: "note-hidden",
          title: "Hidden desk note",
          body: "Still here",
          relationshipId: "relationship-1",
          relationshipName: "Acme",
          occurredAt: "2026-08-01T12:00:00Z",
          eventType: "note",
        },
      ],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
    });
    mocks.fetchConsoleResources.mockImplementation(async (kind: string) =>
      kind === "note_template"
        ? []
        : [
            {
              ...timestamps,
              id: "22222222-2222-4222-8222-222222222222",
              kind,
              payload: { noteId: "note-hidden" },
            },
          ],
    );
    renderNotes();

    expect(await screen.findByText("Favorited notes are further back.")).toBeInTheDocument();
    expect(screen.getByText("Favorites").parentElement).toHaveTextContent("0+");
    expect(screen.queryByText("Favorite a note to keep it here.")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Show earlier notes" })[0]);

    expect(await screen.findByRole("button", { name: "Hidden desk note" })).toBeInTheDocument();
    expect(screen.getByText("Favorites").parentElement).toHaveTextContent("1");
    expect(screen.queryByText("Favorited notes are further back.")).not.toBeInTheDocument();
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

  it("says notes failed to load instead of claiming there are no notes", async () => {
    mocks.fetchWorkspaceNotes.mockRejectedValue(new Error("boom"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesView onError={vi.fn()} onNotice={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(noteListFailureCopy())).toBeVisible();
    expect(screen.getByText("Couldn't load")).toBeVisible();
    expect(screen.queryByText(/No notes yet/)).not.toBeInTheDocument();
    mocks.fetchWorkspaceNotes.mockResolvedValue({
      notes: [],
      relationships: [],
      failedTimelineCount: 0,
      hasMoreNotes: false,
      timelineCursors: [],
    });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No notes yet/)).toBeVisible();
    expect(screen.queryByText("Couldn't load")).not.toBeInTheDocument();
  });
});
import { describe, expect, it } from "vitest";

describe("people directory labels", () => {
  it("names the full list and a search", () => {
    expect(personDirectoryTitle("")).toEqual({ label: "All people", filtered: false });
    expect(personDirectoryTitle("   ")).toEqual({ label: "All people", filtered: false });
    expect(personDirectoryTitle("ada")).toEqual({ label: "Filtered", filtered: true });
    expect(personDirectoryCount(500, true)).toBe("500+");
    expect(personDirectoryCount(501, false)).toBe("501");
    expect(personRemainderLabel()).toBe("Show the next people");
  });

  it("counts profile facts and ignores the projection counter", () => {
    expect(personEnrichmentLabel({})).toBe("Not filled in");
    expect(personEnrichmentLabel({ employmentStatus: "unknown" })).toBe("Not filled in");
    expect(personEnrichmentLabel({ location: "Lisbon" })).toBe("1 detail filled in");
    expect(personEnrichmentLabel({ location: "Lisbon", title: "VP", department: "Sales" })).toBe(
      "3 details filled in",
    );
    expect(personEnrichmentLabel({ employmentStatus: "departed" })).toBe("1 detail filled in");
  });

  it("does not present a typed name as enrichment", () => {
    expect(personSheetSubtitle({})).toBe("No email");
    expect(personSheetSubtitle({ primaryEmail: "ada@acme.com" })).toBe("ada@acme.com");
    expect(personDirectorySubtitle({})).toBe("No email");
    expect(personDirectorySubtitle({ primaryEmail: "ada@acme.com" })).toBe("ada@acme.com");
    expect(personDirectorySubtitle({ aliases: [" Dee Cole ", ""] })).toBe(
      "No email · Also known as Dee Cole",
    );
    expect(personAliasNames(["Dee Cole", "Indy"])).toBe("Dee Cole, Indy");
    expect(personKnownFact("")).toBe("Not known");
    expect(personKnownFact("  ")).toBe("Not known");
    expect(personKnownFact("Finance")).toBe("Finance");
    expect(personLastInteractionLabel(null)).toBe("Not known");
    expect(personLastInteractionLabel("")).toBe("Not known");
    expect(personLastInteractionLabel("2026-10-01T12:00:00.000Z")).toBe("now");
    expect(personDirectoryRole({})).toBe("Not known");
    expect(personDirectoryRole({ title: "  ", seniority: "  ", participantRoles: [" "] })).toBe(
      "Not known",
    );
    expect(personDirectoryRole({ participantRoles: ["decision_maker"] })).toBe("Decision maker");
    expect(
      personDirectoryRole({
        title: "Finance lead",
        participantRoles: ["decision_maker", "decision_maker"],
      }),
    ).toBe("Finance lead · Decision maker");
    expect(
      personDirectoryRole({
        title: "Decision maker",
        participantRoles: ["decision_maker"],
      }),
    ).toBe("Decision maker");
    expect(personAccountDomain("Ada <ada@northwind.example>")).toBe("northwind.example");
    expect(personAccountDomain("mailto:ada@northwind.example")).toBe("northwind.example");
    expect(personAccountDomain("ada@northwind.example")).toBe("northwind.example");
    expect(personAccountDomain("no address")).toBeUndefined();
    expect(personSheetDetail("LinkedIn", "https://www.linkedin.com/in/ada")).toEqual({
      text: "View profile",
      href: "https://www.linkedin.com/in/ada",
    });
    expect(personSheetDetail("LinkedIn", "javascript:alert(1)")).toEqual({ text: "Not known" });
    expect(personSheetDetail("LinkedIn", "")).toEqual({ text: "Not known" });
    expect(personSheetDetail("Domain", "acme.com")).toEqual({
      text: "acme.com",
      href: "https://acme.com",
    });
    expect(personSheetDetail("Domain", "javascript:alert(1)")).toEqual({
      text: "javascript:alert(1)",
    });
    expect(personSheetDetail("Domain", "")).toEqual({ text: "Not known" });
    expect(personSheetDetail("Role", "")).toEqual({ text: "Not known" });
    expect(personSheetDetail("Role", "Founder")).toEqual({ text: "Founder" });
    expect(
      enrichmentEvidence([
        { dimension: "display_name", status: "active" },
        { dimension: "alias", status: "active" },
        { dimension: "title", status: "retracted" },
        { dimension: "location", status: "active" },
      ]).map((attribute) => attribute.dimension),
    ).toEqual(["location"]);
    expect(personEvidenceProvenance({ extractor: "email_signature", source: "gmail" })).toBe(
      "From their email signature",
    );
    expect(personEvidenceProvenance({ extractor: "email_header", source: "gmail" })).toBe(
      "From an email header",
    );
    expect(personEvidenceProvenance({ extractor: "email_header", source: "user" })).toBe(
      "Added by you",
    );
    expect(personEvidenceProvenance({ extractor: "unknown", source: "gmail" })).toBe("Gmail");
    expect(personEvidenceProvenance({ extractor: "unknown", source: "user" })).toBe("Added by you");
    expect(personEvidenceLabel("org_name")).toBe("Company");
    expect(personEvidenceLabel("linkedin_url")).toBe("LinkedIn");
    expect(personEvidenceLabel("employment_status")).toBe("Employment");
    expect(personEvidenceLabel("org_name")).not.toContain("org_name");
    expect(personEvidenceLabel("custom_fact")).toBe("Custom Fact");
    expect(personSeniorityLabel("vp")).toBe("VP");
    expect(personSeniorityLabel("ic")).toBe("Individual contributor");
    expect(personSeniorityLabel("executive")).toBe("Executive");
    expect(personSeniorityLabel("Vice President")).toBe("Vice President");
    expect(personSeniorityLabel("")).toBe("");
    expect(personFactValue("seniority", "vp")).toBe("VP");
    expect(personFactValue("employment_status", "departed")).toBe("Left the company");
    expect(personFactValue("employment_status", "active")).toBe("Current");
    expect(personFactValue("location", "Berlin")).toBe("Berlin");
  });
});

import {
  collapseWorkspaceNotes,
  groupWorkspaceNotes,
  plateText,
} from "@/lib/revenue/revenue-records";
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

  it("names a domain-stored company the same way the companies page does", () => {
    const notes = collapseWorkspaceNotes(
      [
        {
          id: "relationship-domain",
          displayName: "northwind.example",
          accountDomain: "northwind.example",
        } as RevenueRelationship,
      ],
      [
        [
          observation("event-domain", "2026-09-05T12:00:00Z", "note", {
            noteId: "note-domain",
            title: "Renewal",
          }),
        ],
      ],
    );
    expect(notes[0]?.relationshipName).toBe("Northwind");
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
    const note = (
      externalId: string,
      occurredAt: string,
    ): ReturnType<typeof collapseWorkspaceNotes>[number] => ({
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
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "workspace-records-view.tsx"),
    "utf8",
  );

  it("puts undated tasks after dated ones, and reverses when latest is requested", () => {
    expect(source).toContain("personEvidenceLabel(attribute.dimension)");
    expect(source).toContain("Verify source {index + 1}");
    expect(source).not.toContain(".slice(0, 2)\n                    .map((url, index)");
    expect(source).not.toContain('attribute.dimension.replaceAll("_", " ")');
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

  it("names an empty due filter instead of saying the workspace has no tasks", () => {
    expect(taskListEmptyCopy("today")).toBe("Nothing is due today.");
    expect(taskListEmptyCopy("today", true)).toBe("Nothing loaded is due today.");
    expect(taskListEmptyCopy("overdue")).toBe("Nothing is overdue.");
    expect(taskListEmptyCopy("overdue", true)).toBe("Nothing loaded is overdue.");
    expect(taskListEmptyCopy("all")).toBeNull();
    expect(taskListEmptyCopy("all", true)).toBe("More tasks are still in this list.");
    expect(taskFilterName("all")).toBe("Tasks, All tasks");
    expect(taskFilterName("overdue")).toBe("Tasks, Overdue");
    expect(linkedCompanyName("No companies yet")).toBe("Linked company, No companies yet");
    expect(noteCompanyMenuLabel(1, true)).toBe("Link a company");
    expect(noteCompanyMenuLabel(0, false)).toBe("No companies yet");
    expect(nextNoteCompaniesLabel()).toBe("Show the next companies");
    expect(source).toContain("aria-label={taskFilterName(filter)}");
    expect(source).toContain("taskListEmptyCopy(filter, hasMoreTasks)");
    expect(source).toContain("taskIsDueToday(task.dueAt, today)");
    expect(source).toContain("companyName(relationship)");
    expect(source).toContain("taskIsOverdue(task.dueAt, now)");
    expect(source).not.toContain("new Date(task.dueAt).getTime() < now");
    expect(source).not.toContain("task.dueAt?.slice(0, 10) === today");
    expect(source).toContain("Show all tasks");
    expect(source).toContain("Show the next tasks");
    expect(noteCountLabel(1, true)).toBe("1+");
    expect(noteCountLabel(2, false)).toBe("2");
    expect(earlierNotesLabel()).toBe("Show earlier notes");
    expect(notesRemainderLabel(true)).toBe("Show earlier notes");
    expect(notesRemainderLabel(false)).toBe("Show the next companies");
    expect(notesEmptyDescription(true)).toBe("Earlier notes are still on these companies.");
    expect(notesEmptyDescription(false)).toBe("More companies are still in this list.");
    expect(notesTabContinues(0, false, true)).toBe(false);
    expect(notesTabContinues(0, true, false)).toBe(true);
    expect(notesTabContinues(2, false, true)).toBe(true);
    expect(templateCountLabel(100, false)).toBe("100");
    expect(templateCountLabel(100, true)).toBe("100+");
    expect(nextTemplatesLabel()).toBe("Show the next templates");
    expect(nextFavoritesLabel()).toBe("Show the next favorites");
    expect(favoriteNotesLabel(0, 1)).toBe("0+");
    expect(favoriteNotesLabel(1, 0)).toBe("1");
    expect(favoriteNotesEmptyCopy(1, true)).toBe("Favorited notes are further back.");
    expect(favoriteNotesEmptyCopy(1, false)).toBe(
      "A favorite points at a note that is no longer here.",
    );
    expect(favoriteNotesEmptyCopy(0, false)).toBe("Favorite a note to keep it here.");
    expect(source).toContain("templatePage.length + extraTemplates.length");
    expect(source).toContain("favoritePage.length + extraFavorites.length");
    expect(source).toContain("fetchMoreWorkspaceNotes");
    expect(source).toContain("personPageHasMore");
    expect(source).toContain("peoplePage.length + extraPeople.length");
    expect(source).not.toContain("peoplePage.length === PERSON_PAGE_SIZE");
    expect(source).toContain('useRevenueActions("open", ACTION_QUEUE_PAGE, "task")');
    expect(source).toContain("actionPageHasMore");
    expect(source).toContain("taskPage.length + extraTasks.length");
    expect(source).not.toContain("loadedTaskCount.current");
    expect(source).not.toContain("=== ACTION_QUEUE_PAGE");
    expect(source).toContain("No tasks yet! Create your first");
    expect(taskListFailureCopy()).toBe("Tasks could not load. Try again.");
    expect(taskCompaniesFailureCopy()).toBe("Companies could not load. Try again.");
    expect(source).toContain("actionsQuery.isError");
    expect(source).toContain(
      "relationshipsQuery.isError && !failedListIsEmpty(actionsQuery.isError, tasks.length)",
    );
    expect(source).toContain('listRefreshFailureCopy("tasks")');
    expect(source).toContain("taskListFailureCopy()");
    expect(source).toContain("taskCompaniesFailureCopy()");
    expect(source).toContain(
      'onError(errMessage(relationshipsQuery.error, "Could not load companies."))',
    );
    expect(source).toContain("onOpenCompany(task.relationshipId)");
  });

  it("keeps the task list when only the company directory failed", async () => {
    cleanup();
    records.relationshipsError = new Error("directory down");
    records.relationshipsRefetch.mockClear();
    const onError = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TasksView onError={onError} onNotice={vi.fn()} onOpenCompany={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Call the harbor")).toBeVisible();
    expect(screen.getByText(taskCompaniesFailureCopy())).toBeVisible();
    expect(screen.queryByText(taskListFailureCopy())).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("directory down");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(records.relationshipsRefetch).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("");
    records.relationshipsError = null;
    cleanup();
  });

  it("opens the company named on a task", async () => {
    const onOpenCompany = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TasksView onError={vi.fn()} onNotice={vi.fn()} onOpenCompany={onOpenCompany} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Call the harbor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open company Acme" }));
    expect(onOpenCompany).toHaveBeenCalledWith("relationship-1");
  });

  it("names a task whose company is past the loaded directory page", async () => {
    cleanup();
    const onOpenCompany = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TasksView onError={vi.fn()} onNotice={vi.fn()} onOpenCompany={onOpenCompany} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Open company Hidden Account Co" }),
    ).toBeVisible();
    expect(screen.queryByText("Unlinked")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open company Hidden Account Co" }));
    expect(onOpenCompany).toHaveBeenCalledWith("relationship-hidden");
    expect(taskCompanyName(undefined, "Hidden Account Co")).toBe("Hidden Account Co");
    expect(taskCompanyName("Acme", "Hidden Account Co")).toBe("Acme");
    expect(taskCompanyName(undefined, "  ")).toBe("");
  });

  it("says tasks failed to load instead of claiming there are no tasks", async () => {
    records.actionsError = new Error("boom");
    records.actionsRefetch.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TasksView onError={vi.fn()} onNotice={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(taskListFailureCopy())).toBeVisible();
    expect(screen.queryByText(/No tasks yet/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(records.actionsRefetch).toHaveBeenCalled();
    records.actionsError = null;
  });
});

describe("empty note template heading", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "workspace-records-view.tsx"),
    "utf8",
  );

  it("names the template links instead of a generic actions heading", () => {
    expect(source).toContain('aria-label="Notes and templates"');
    expect(source).toContain("uppercase tracking-wide text-primary/45\">\n                Templates");
    expect(source).toContain("<Plus /> New template");
    expect(source).not.toContain("<Plus /> Create template");
    expect(source).not.toContain(
      "uppercase tracking-wide text-primary/45\">\n                Actions",
    );
    expect(source).toContain(
      '{ label: "Heading 2", icon: TextHTwo, run: () => editor.tf.toggleBlock("h2") }',
    );
    expect(source).toContain('["h2", "Insert heading 2"]');
    expect(source).not.toContain("TextHOne");
    expect(source).toContain('lastSaved.current ? "Delete note" : "Discard draft"');
  });
});

describe("people directory copy", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "workspace-records-view.tsx"),
    "utf8",
  );

  it("talks about companies on the empty directory and the account count", () => {
    expect(source).toContain("keep a contact for each company.");
    expect(peopleListEmptyCopy(true)).toBe("No people match this search.");
    expect(peopleListEmptyCopy(false)).toContain("keep a contact for each company.");
    expect(peopleListFailureCopy()).toBe("People could not load. Try again.");
    expect(noteListFailureCopy()).toBe("Notes could not load. Try again.");
    expect(source).toContain("peopleListEmptyCopy(directoryTitle.filtered)");
    expect(source).toContain("failedListIsEmpty(peopleQuery.isError, people.length)");
    expect(source).toContain('listRefreshFailureCopy("people")');
    expect(source).toContain("failedListIsEmpty(notesQuery.isError, notes.length)");
    expect(source).toContain('listRefreshFailureCopy("notes")');
    expect(source).toContain("refetchClearingBanner(() => peopleQuery.refetch(), onError)");
    expect(source).toContain("refetchClearingBanner(() => notesQuery.refetch(), onError)");
    expect(source).toContain("refetchClearingBanner(() => actionsQuery.refetch(), onError)");
    expect(source).toContain("notesQuery.isError");
    expect(source).toContain("peopleListFailureCopy()");
    expect(source).toContain("noteListFailureCopy()");
    expect(source).toContain("<Plus /> New person");
    expect(source).not.toContain("Add person");
    expect(source).toContain("Mail and meetings can fill in the rest later.");
    expect(source).not.toContain("synced activity and enrichment");
    expect(source).toContain("Fill in their role and company");
    expect(source).not.toContain("Enrich profiles with evidence");
    expect(source).toContain(">Companies</TableHead>");
    expect(source).toContain("personSeniorityLabel(person.seniority)");
    expect(source).toContain("personFactValue(attribute.dimension, attribute.value)");
    expect(source).toContain(
      'personFactValue("employment_status", person.employmentStatus)',
    );
    expect(source).toContain('person.employmentStatus === "departed"');
    expect(source).not.toContain("{person.seniority}");
    expect(source).not.toContain("{attribute.value}");
    expect(source).toContain("personKnownFact(personCompanyTitle(person))");
    expect(source).toContain("personKnownFact(person.department)");
    expect(source).toContain("personKnownFact(person.location)");
    expect(source).toContain("personLastInteractionLabel(person.lastInteractionAt)");
    expect(source).toContain('["Company", personCompanyTitle(person) || undefined]');
    expect(source).not.toContain("{person.orgName || \"—\"}");
    expect(source).toContain("personSheetDetail(label, value)");
    expect(source).not.toContain('{value || "Not known"}');
    expect(source).toContain('["Domain", person.orgDomain]');
    expect(source).not.toContain("person.orgName || person.orgDomain");
    expect(source).toContain("company timeline");
    expect(source).not.toContain("relationship-aware");
    expect(source).not.toContain(">Relationships</TableHead>");
    expect(source).not.toContain("relationship timeline");
    expect(source).toContain("Link notes to companies");
    expect(source).toContain('{ label: "Turn notes into promises" }');
    expect(source).not.toContain("Turn notes into commitments");
    expect(source).toContain("Link a task to a company");
    expect(source).not.toContain("Link notes to accounts");
    expect(source).not.toContain("Introduction to tasks");
    expect(source).toContain('placeholder="Quarterly company review"');
    expect(source).toContain('placeholder="The text a new note starts with…"');
    expect(source).not.toContain("Add prompts or a reusable note structure");
    expect(source).not.toContain("Quarterly account review");
    expect(source).toContain('errMessage(error, "Could not load this profile.")');
    expect(source).toContain("deletePerson(selected.id)");
    expect(source).toContain('errMessage(error, "Could not remove this person.")');
    expect(source).toContain("removePersonConfirmCopy(person.displayName)");
    expect(source).not.toContain("window.confirm");
    expect(removePersonConfirmCopy("Morgan Hale")).toContain(
      "later sync will not recreate them",
    );
    expect(source).not.toContain("Could not load profile evidence.");
  });

  it("asks to remove a person on the sheet instead of a browser confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    records.people = [
      {
        id: "person-1",
        displayName: "Morgan Hale",
        aliases: [],
        status: "active",
        relationshipCount: 0,
        attributesVersion: 0,
        primaryEmail: "morgan@harbor.example",
      },
    ];
    mocks.deletePerson.mockClear();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PeopleView onError={vi.fn()} onNotice={vi.fn()} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Open Morgan Hale" }));
    expect(screen.queryByText(/everything derived from them/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(removePersonConfirmCopy("Morgan Hale"))).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(mocks.deletePerson).toHaveBeenCalledWith("person-1"));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
    records.people = [];
  });

  it("says people failed to load instead of claiming the directory is empty", async () => {
    cleanup();
    records.peopleError = new Error("boom");
    records.peopleRefetch.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PeopleView onError={vi.fn()} onNotice={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(peopleListFailureCopy())).toBeVisible();
    expect(screen.getByText("Couldn't load")).toBeVisible();
    expect(screen.queryByText(/Connect Gmail or add a person/)).not.toBeInTheDocument();
    expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(records.peopleRefetch).toHaveBeenCalled();
    records.peopleError = null;
  });

  it("keeps people on screen when a refresh fails", async () => {
    cleanup();
    records.people = [
      {
        id: "person-1",
        displayName: "Morgan Hale",
        aliases: [],
        status: "active",
        relationshipCount: 0,
        attributesVersion: 0,
        primaryEmail: "morgan@harbor.example",
      },
    ];
    records.peopleError = new Error("people down");
    records.peopleRefetch.mockClear();
    const onError = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PeopleView onError={onError} onNotice={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Morgan Hale")).toBeVisible();
    expect(screen.getByText(listRefreshFailureCopy("people"))).toBeVisible();
    expect(screen.queryByText(peopleListFailureCopy())).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(records.peopleRefetch).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("");
    records.people = [];
    records.peopleError = null;
    cleanup();
  });
});
