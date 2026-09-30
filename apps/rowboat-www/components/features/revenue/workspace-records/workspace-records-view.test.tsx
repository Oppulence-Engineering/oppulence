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

import {
  NotesView,
  personDirectoryTitle,
  enrichmentEvidence,
  personEnrichmentLabel,
  personEvidenceProvenance,
  personSheetSubtitle,
  sortTasksByDue,
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

  it("applies a durable template to a new note", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("tab", { name: /Templates/ }));
    await user.click(await screen.findByRole("button", { name: "Apply" }));

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
    await user.click(await screen.findByRole("button", { name: "Insert heading" }));

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

describe("people directory labels", () => {
  it("names the full list and a search", () => {
    expect(personDirectoryTitle("")).toEqual({ label: "All people", filtered: false });
    expect(personDirectoryTitle("   ")).toEqual({ label: "All people", filtered: false });
    expect(personDirectoryTitle("ada")).toEqual({ label: "Filtered", filtered: true });
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
    expect(personEvidenceProvenance({ extractor: "unknown", source: "gmail" })).toBe("Gmail");
    expect(personEvidenceProvenance({ extractor: "unknown", source: "user" })).toBe("Added by you");
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

describe("empty note template heading", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "workspace-records-view.tsx"),
    "utf8",
  );

  it("names the template links instead of a generic actions heading", () => {
    expect(source).toContain("uppercase tracking-wide text-primary/45\">\n                Templates");
    expect(source).toContain("<Plus /> New template");
    expect(source).not.toContain("<Plus /> Create template");
    expect(source).not.toContain(
      "uppercase tracking-wide text-primary/45\">\n                Actions",
    );
  });
});

describe("people directory copy", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "workspace-records-view.tsx"),
    "utf8",
  );

  it("talks about companies on the empty directory and the account count", () => {
    expect(source).toContain("keep a contact for each company.");
    expect(source).toContain("<Plus /> New person");
    expect(source).not.toContain("Add person");
    expect(source).toContain("Mail and meetings can fill in the rest later.");
    expect(source).not.toContain("synced activity and enrichment");
    expect(source).toContain("Fill in their role and company");
    expect(source).not.toContain("Enrich profiles with evidence");
    expect(source).toContain(">Companies</TableHead>");
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
    expect(source).not.toContain("Could not load profile evidence.");
  });
});
