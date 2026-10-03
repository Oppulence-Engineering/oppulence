// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import fs from "node:fs";
import path from "node:path";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import {
  CommitmentQueue,
  commitmentDetailStatus,
  commitmentSearchText,
  acceptanceLabel,
  evidenceGapFact,
  formatMissingEvidence,
  missingEvidenceLabel,
  REGISTER_VIEWS,
  registerConfidenceLabel,
  registerCompanyLabel,
  registerPartyLabels,
  registerCountLabel,
  registerEmptyAccountsDetail,
  registerEmptyAccountsTitle,
  registerElsewhereCopy,
  registerMissDetail,
  registerMissTitle,
  registerNextCompaniesLabel,
  registerAccountScopeCopy,
  registerRemainderLabel,
  registerRowStatus,
  registerSharedPromiseCopy,
  sourceWatchCopy,
  urgencyLabel,
} from "./commitment-queue";
import type {
  RegisterEntry,
  RelationshipSourceInventoryItem,
  RevenueLeakScan,
} from "@/lib/revenue/types";

afterEach(cleanup);

const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// The queue reads the register now, so the fixture is a register row rather
// than a relationship-graph node with edges the component had to reassemble.
function entries(acceptance: RegisterEntry["acceptance"] = "accepted"): RegisterEntry[] {
  return [
    {
      id: "commitment-1",
      direction: "promised_by_me",
      text: "Send the signed security packet",
      status: "open",
      state: "at_risk",
      relationshipId: "rel-1",
      relationshipName: "Acme",
      dueAt,
      confidence: 0.65,
      userConfirmed: acceptance !== "candidate",
      acceptance,
      ownerParticipantRef: "Taylor",
      counterpartyParticipantRef: "Morgan",
      sourcePhrase: "I will send the signed security packet by Friday.",
      currentEventVersion: 3,
    },
  ];
}

const sources: RelationshipSourceInventoryItem[] = [
  {
    source: "google",
    displayName: "Google Gmail & Calendar",
    evidence: [],
    actions: [],
    readScopes: [],
    writeScopes: [],
    scopeExplanation: "Read account evidence.",
    connectPath: "/google",
    disconnectPath: "/google",
    supportsReconnect: true,
    supportsResync: true,
    expectedCadenceSeconds: 900,
    accounts: [],
  },
];

// A dead grant is a fact about the source, not only about a past scan. The
// component now asks the source before telling anyone to reconnect.
const brokenSources: RelationshipSourceInventoryItem[] = [
  {
    ...sources[0],
    accounts: [
      {
        connectionId: "google-1",
        source: "google",
        sourceAccountId: "me@gmail.com",
        status: "reconnect_required",
        backfillPhase: "failed",
        backfillCompleted: 0,
        backfillTotal: 0,
        completeness: "stale",
        expectedCadenceSeconds: 900,
        lagSeconds: 0,
        retryCount: 1,
        requiredScopes: [],
        grantedScopes: [],
        missingScopes: [],
      },
    ],
  },
];

function props(overrides: Partial<ComponentProps<typeof CommitmentQueue>> = {}) {
  return {
    entries: entries(),
    relationshipCount: 1,
    sources,
    onScan: vi.fn(),
    onOpenConnectors: vi.fn(),
    onOpenAccounts: vi.fn(),
    onOpenRecoveryQueue: vi.fn(),
    onTransition: vi.fn(async () => true),
    onDraftRecovery: vi.fn(async () => true),
    ...overrides,
  };
}

describe("CommitmentQueue", () => {
  it("names an overdue promise and a missing promiser", () => {
    expect(urgencyLabel("overdue")).toBe("Overdue");
    expect(urgencyLabel("due_soon")).toBe("Due within 72h");
    expect(urgencyLabel("closed")).toBe("Closed");
    expect(missingEvidenceLabel("promiser")).toBe("who promised");
    expect(missingEvidenceLabel("recipient")).toBe("who it was promised to");
    expect(formatMissingEvidence(["promiser", "due date"])).toBe("who promised, due date");
    expect(formatMissingEvidence([])).toBe("");
    expect(acceptanceLabel("internally_confirmed")).toBe("Confirmed in this workspace");
    expect(acceptanceLabel("accepted")).toBe("Accepted");
    expect(acceptanceLabel("candidate")).toBe("Needs confirmation");
    expect(evidenceGapFact([])).toEqual({ label: "Evidence", value: "Complete" });
    expect(evidenceGapFact(["promiser", "exact quote"])).toEqual({
      label: "Evidence missing",
      value: "who promised, exact quote",
    });
  });

  it("names both sides of a mutual promise", async () => {
    expect(registerCompanyLabel("  ")).toBe("Unknown company");
    expect(registerCompanyLabel("Acme")).toBe("Acme");
    expect(registerPartyLabels({ direction: "promised_by_me", relationshipName: "   " })).toEqual({
      owner: "You",
      counterparty: "Unknown company",
    });
    expect(registerPartyLabels({ direction: "mutual", relationshipName: "Acme" })).toEqual({
      owner: "You and Acme",
      counterparty: "You and Acme",
    });
    expect(registerPartyLabels({ direction: "promised_by_me", relationshipName: "Acme" })).toEqual({
      owner: "You",
      counterparty: "Acme",
    });
    expect(
      registerPartyLabels({
        direction: "promised_by_them",
        relationshipName: "Acme",
        counterpartyParticipantRef: "Morgan",
      }),
    ).toEqual({ owner: "Acme", counterparty: "You" });
    expect(
      registerPartyLabels({
        direction: "promised_by_me",
        relationshipName: "Harbor Record",
        ownerParticipantRef: "local-user",
        counterpartyParticipantRef: "meeting-counterparty",
      }),
    ).toEqual({ owner: "You", counterparty: "Harbor Record" });
    expect(
      registerPartyLabels({
        direction: "promised_by_them",
        relationshipName: "Harbor Record",
        ownerParticipantRef: "meeting-counterparty",
        counterpartyParticipantRef: "local-user",
      }),
    ).toEqual({ owner: "Harbor Record", counterparty: "You" });
    expect(
      registerPartyLabels({
        direction: "mutual",
        relationshipName: "Harbor Record",
        ownerParticipantRef: "local-user",
        counterpartyParticipantRef: "meeting-counterparty",
      }),
    ).toEqual({
      owner: "You and Harbor Record",
      counterparty: "You and Harbor Record",
    });
    expect(
      registerPartyLabels({
        direction: "promised_by_me",
        relationshipName: "Harbor Record",
        ownerParticipantRef: "Taylor",
        counterpartyParticipantRef: "Morgan",
      }),
    ).toEqual({ owner: "Taylor", counterparty: "Morgan" });
    const mutual = {
      ...entries()[0],
      id: "commitment-mutual",
      direction: "mutual",
      text: "Trade the redlines",
      state: "open",
      ownerParticipantRef: "",
      counterpartyParticipantRef: "",
    };
    render(<CommitmentQueue {...props({ entries: [mutual] })} />);
    expect(screen.getByText("You and Acme")).toBeVisible();
    await userEvent.click(screen.getByText("Trade the redlines"));
    expect(screen.getByText("Promised by")).toBeVisible();
    expect(screen.getAllByText("You and Acme").length).toBeGreaterThan(1);
  });

  it("asks for a company when that view has none selected", () => {
    expect(REGISTER_VIEWS.find((view) => view.id === "by_account")?.label).toBe("By company");
    expect(REGISTER_VIEWS.find((view) => view.id === "by_account")?.hint).toBe(
      "Every promise for one company.",
    );
    expect(REGISTER_VIEWS.find((view) => view.id === "they_owe")?.hint).toBe(
      "Promises they made to us.",
    );
    expect(REGISTER_VIEWS.map((view) => view.hint).join(" ")).not.toMatch(
      /obligation|no other tool|handover|two-sided/i,
    );
    render(
      <CommitmentQueue
        aria-label="Client commitments"
        {...props({
          view: "by_account",
          accounts: [{ id: "acct-1", label: "Acme" }],
        })}
      />,
    );
    expect(screen.getByText("Select one company to see every promise for it.")).toBeVisible();
    expect(registerAccountScopeCopy([{ direction: "mutual", relationshipName: "Quay Mutual" }])).toBe(
      "Quay Mutual has a shared promise. Choose it to see that promise.",
    );
    expect(registerSharedPromiseCopy([{ direction: "mutual", relationshipName: "Quay Mutual" }])).toBe(
      "1 shared promise with Quay Mutual. Choose Quay Mutual in By company.",
    );
    expect(screen.getByRole("combobox", { name: "Company, Choose a company" })).toBeVisible();
    expect(screen.queryByText(/one relationship/)).toBeNull();
    cleanup();
    render(
      <CommitmentQueue
        aria-label="Client commitments"
        {...props({
          view: "by_account",
          accounts: [{ id: "acct-1", label: "Quay Mutual" }],
          otherPromises: [{ direction: "mutual", relationshipName: "Quay Mutual" }],
        })}
      />,
    );
    expect(
      screen.getByText("Quay Mutual has a shared promise. Choose it to see that promise."),
    ).toBeVisible();
    expect(screen.queryByText("1 shared promise is in By company.")).toBeNull();
    const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
    expect(source).toContain("registerAccountScopeCopy(otherPromises)");
  });

  it("names the company chosen on the by-account menu", () => {
    render(
      <CommitmentQueue
        {...props({
          view: "by_account",
          accountId: "acct-1",
          accounts: [{ id: "acct-1", label: "Acme" }],
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Company, Acme" })).toBeVisible();
  });

  it("opens the recovery queue from the empty register without claiming an approval", async () => {
    const onOpenRecoveryQueue = vi.fn();
    render(<CommitmentQueue {...props({ entries: [], onOpenRecoveryQueue })} />);
    expect(screen.getByText("What you can do")).toBeVisible();
    expect(screen.queryByText("Learn more")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve recovery before anything is sent" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Review recovery drafts" }));
    expect(onOpenRecoveryQueue).toHaveBeenCalledOnce();
  });

  it("loads a company past the directory page into By company", async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
    const onLoadMoreAccounts = vi.fn();
    const { rerender } = render(
      <CommitmentQueue
        {...props({
          view: "by_account",
          accounts: [{ id: "acct-1", label: "Visible Account 1" }],
          hasMoreAccounts: true,
          onLoadMoreAccounts,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Company, Choose a company" }));
    expect(screen.queryByRole("option", { name: "Hidden Account Co" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: registerNextCompaniesLabel() }));
    expect(onLoadMoreAccounts).toHaveBeenCalledOnce();
    rerender(
      <CommitmentQueue
        {...props({
          view: "by_account",
          accounts: [
            { id: "acct-1", label: "Visible Account 1" },
            { id: "acct-hidden", label: "Hidden Account Co" },
          ],
          hasMoreAccounts: false,
          onLoadMoreAccounts,
        })}
      />,
    );
    expect(screen.getByRole("option", { name: "Hidden Account Co" })).toBeVisible();
  });

  it("asks for the next companies when the loaded page has none", () => {
    expect(registerEmptyAccountsTitle(false)).toBe("No companies yet");
    expect(registerEmptyAccountsDetail(true)).toBe(
      "Show the next companies before choosing a company.",
    );
    render(
      <CommitmentQueue
        {...props({
          view: "by_account",
          accounts: [],
          hasMoreAccounts: true,
          onLoadMoreAccounts: vi.fn(),
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: registerEmptyAccountsTitle(true) })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No companies yet" })).toBeNull();
    expect(screen.getByRole("button", { name: registerNextCompaniesLabel() })).toBeVisible();
  });

  it("says there is nothing to choose when the workspace has no companies", async () => {
    const onOpenAccounts = vi.fn();
    render(
      <CommitmentQueue
        aria-label="Client commitments"
        {...props({ view: "by_account", accounts: [], onOpenAccounts })}
      />,
    );
    expect(screen.getByRole("heading", { name: "No companies yet" })).toBeVisible();
    expect(
      screen.queryByText("Select one account to see its two-sided promise history."),
    ).toBeNull();
    expect(screen.queryByText("Select one company to see every promise for it.")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Company, Choose a company" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add a company" }));
    expect(onOpenAccounts).toHaveBeenCalledOnce();
  });

  it("shows the operational promise, evidence, warning, and next action", async () => {
    render(<CommitmentQueue aria-label="Client commitments" {...props()} />);

    const component = screen.getByRole("region", { name: "Client commitments" });
    expect(component).toHaveAttribute("data-slot", "commitment-queue");
    expect(component).toHaveTextContent("Send the signed security packet");
    expect(screen.getByRole("columnheader", { name: "Confidence" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Score" })).not.toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(registerConfidenceLabel(100)).toBe("100%");
    expect(registerConfidenceLabel(0)).toBe("0%");
    await userEvent.click(screen.getByText("Acme"));
    expect(component).toHaveTextContent("Taylor");
    expect(component).toHaveTextContent("Morgan");
    expect(component).toHaveTextContent("Due within 72h");
    expect(screen.getByText("Promise status").parentElement?.parentElement).toHaveTextContent(
      "At risk",
    );
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(0);
    for (const label of screen.getAllByText("At risk")) {
      expect(label).not.toHaveClass("capitalize");
    }
    await userEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(component).toHaveTextContent("I will send the signed security packet by Friday.");
    const queueSource = fs.readFileSync(
      path.join(import.meta.dirname, "commitment-queue.tsx"),
      "utf8",
    );
    expect(queueSource).not.toContain('"rounded-[2px] capitalize"');
    expect(
      screen.queryByRole("button", { name: /Run 6-month Promise Leak Audit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Gmail & Calendar/ })).toBeEnabled();
  });

  it("keeps an unconfirmed due-soon promise in Review after it is opened", async () => {
    expect(commitmentDetailStatus({ state: "at_risk", acceptance: "candidate" })).toBe("Review");
    expect(commitmentDetailStatus({ state: "open", acceptance: "accepted" })).toBe("Open");
    expect(commitmentDetailStatus({ state: "at_risk", acceptance: "accepted" })).toBe("At risk");
    expect(registerRowStatus({ state: "open", acceptance: "internally_confirmed", urgency: "open" })).toEqual({
      label: "Open",
      variant: "amber",
    });
    expect(registerRowStatus({ state: "at_risk", acceptance: "accepted", urgency: "due_soon" })).toEqual({
      label: "At risk",
      variant: "red",
    });
    expect(registerRowStatus({ state: "at_risk", acceptance: "candidate", urgency: "due_soon" })).toEqual({
      label: "Review",
      variant: "amber",
    });
    expect(registerRowStatus({ state: "met", acceptance: "accepted", urgency: "closed" })).toEqual({
      label: "Met",
      variant: "green",
    });

    render(
      <CommitmentQueue
        aria-label="Client commitments"
        {...props({ entries: entries("candidate") })}
      />,
    );
    await userEvent.click(screen.getByText("Acme"));

    const promiseStatus = screen.getByText("Promise status").parentElement?.parentElement;
    expect(promiseStatus).toHaveTextContent("Review");
    expect(promiseStatus).not.toHaveTextContent("At risk");
    const recordStatus = screen.getByText("Record details").parentElement;
    expect(recordStatus).toHaveTextContent("Review");
    expect(recordStatus).not.toHaveTextContent("At risk");
    expect(screen.getByText("Needs confirmation")).toBeInTheDocument();
    expect(screen.getByText("Confirm or correct this promise.")).toBeInTheDocument();
    expect(screen.queryByText("Confirm or correct confirmation.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
  });

  it("calls an open confirmed promise Open on the row and in the record", async () => {
    const open = {
      ...entries("internally_confirmed")[0],
      id: "commitment-open",
      state: "open" as const,
      dueAt: "2026-12-01T15:00:00.000Z",
      text: "Send the quay status",
      relationshipName: "Quay Status",
    };
    render(<CommitmentQueue aria-label="Client commitments" {...props({ entries: [open] })} />);

    expect(screen.getByText("Open")).toBeVisible();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Quay Status"));
    expect(screen.getByText("Promise status").parentElement?.parentElement).toHaveTextContent("Open");
    expect(screen.getByText("Confirmed in this workspace")).toBeVisible();
    const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
    expect(source).toContain("registerRowStatus(item)");
    expect(source).not.toContain('label: "Confirmed"');
  });

  it("names the next step from whether Google is connected", async () => {
    expect(sourceWatchCopy({ connected: false, needsReconnect: false })).toBe(
      "Connect Gmail and Calendar to watch for fulfillment or a reply.",
    );
    expect(sourceWatchCopy({ connected: false, needsReconnect: true })).toBe(
      "Reconnect Google to watch for fulfillment or a reply.",
    );
    expect(sourceWatchCopy({ connected: true, needsReconnect: false })).toBe(
      "Watch connected sources for fulfillment or a reply.",
    );

    const open = {
      ...entries("internally_confirmed")[0],
      id: "commitment-watch",
      state: "open" as const,
      dueAt: "2026-12-01T15:00:00.000Z",
      text: "Send the quay watch",
      relationshipName: "Quay Watch",
    };
    const { unmount } = render(
      <CommitmentQueue aria-label="Client commitments" {...props({ entries: [open] })} />,
    );
    await userEvent.click(screen.getByText("Quay Watch"));
    expect(
      screen.getByText("Connect Gmail and Calendar to watch for fulfillment or a reply."),
    ).toBeVisible();
    expect(
      screen.queryByText("Watch connected sources for fulfillment or a reply."),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <CommitmentQueue
        aria-label="Client commitments"
        {...props({ entries: [open], sources: brokenSources })}
      />,
    );
    await userEvent.click(screen.getByText("Quay Watch"));
    expect(screen.getByText("Reconnect Google to watch for fulfillment or a reply.")).toBeVisible();

    const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
    expect(source).toContain("sourceWatchCopy({ connected: googleConnected, needsReconnect: googleNeedsReconnect })");
  });

  it("does not send a stale Google source through OAuth", () => {
    render(
      <CommitmentQueue
        {...props({
          entries: [],
          sources: [
            {
              ...sources[0],
              accounts: [
                {
                  connectionId: "google-1",
                  source: "google",
                  sourceAccountId: "me@gmail.com",
                  status: "stale",
                  backfillPhase: "completed",
                  backfillCompleted: 1,
                  backfillTotal: 1,
                  completeness: "stale",
                  expectedCadenceSeconds: 900,
                  lagSeconds: 1_801,
                  retryCount: 0,
                  requiredScopes: [],
                  grantedScopes: [],
                  missingScopes: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/No explicit promises were found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google connected/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Run 6-month Promise Leak Audit/ })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Connect Gmail & Calendar/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Google and run/)).not.toBeInTheDocument();
  });

  it("shows what the latest audit accomplished", () => {
    render(
      <CommitmentQueue
        {...props({
          latestScan: {
            id: "scan-1",
            status: "completed",
            mode: "linked",
            lookbackDays: 90,
            threadsSeen: 12,
            candidatesSeen: 2,
            relationshipsCreated: 2,
          },
        })}
      />,
    );

    expect(screen.getByText("Latest 90-day audit")).toBeInTheDocument();
    expect(screen.getByText("12", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("New companies").closest("div")).toHaveTextContent("2New companies");
    expect(screen.getByRole("button", { name: "Review companies" })).toBeEnabled();
  });

  it("asks for a scope before loading an owner view", () => {
    render(<CommitmentQueue {...props({ entries: [], owner: "", view: "by_owner" })} />);

    expect(screen.getByRole("textbox", { name: "Filter by owner" })).toBeInTheDocument();
    expect(screen.getByText("Enter an owner")).toBeInTheDocument();
    expect(screen.queryByText(/Connect Gmail and Calendar to find/)).not.toBeInTheDocument();
  });

  it("shows the quote on Evidence and keeps the decision on Overview", async () => {
    const user = userEvent.setup();
    render(<CommitmentQueue {...props({ entries: entries("candidate") })} />);

    await user.click(screen.getByText("Acme"));

    expect(screen.getByRole("tablist", { name: "Promise detail" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm promise" })).toBeVisible();
    expect(screen.queryByText(/signed security packet by Friday/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Activity" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));

    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("data-state", "inactive");
    expect(screen.getByText(/signed security packet by Friday/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm promise" })).not.toBeInTheDocument();
  });

  it("asks what is blocking on the promise instead of a browser prompt", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("should not run");
    const onTransition = vi.fn(async () => true);
    const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
    render(<CommitmentQueue {...props({ entries: entries("accepted"), onTransition })} />);

    await user.click(screen.getByText("Acme"));
    expect(
      screen.queryByRole("textbox", { name: "What is blocking this promise" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm blocked" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark blocked" }));
    const reason = screen.getByRole("textbox", { name: "What is blocking this promise" });
    expect(screen.getByRole("button", { name: "Confirm blocked" })).toBeDisabled();
    await user.type(reason, "Waiting on legal review");
    await user.click(screen.getByRole("button", { name: "Confirm blocked" }));

    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "commitment-1" }),
        expect.objectContaining({
          kind: "blocked",
          blocker: "Waiting on legal review",
          idempotencyKey: "commitment-queue:blocked:commitment-1:v3",
        }),
      ),
    );
    expect(prompt).not.toHaveBeenCalled();
    expect(source).not.toContain("window.prompt");
    expect(await screen.findByRole("button", { name: "Unblock" })).toBeVisible();
    expect(screen.getByText("Resolve the blocker or renegotiate the promise.")).toBeVisible();
    prompt.mockRestore();
  });

  it("asks to mark a promise fulfilled on the page instead of a browser confirm", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onTransition = vi.fn(async () => true);
    const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
    render(<CommitmentQueue {...props({ entries: entries("accepted"), onTransition })} />);

    await user.click(screen.getByText("Acme"));
    expect(screen.queryByText("Mark this promise fulfilled?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark fulfilled" }));
    expect(screen.getByText("Mark this promise fulfilled?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm fulfilled" }));

    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "commitment-1" }),
        expect.objectContaining({
          kind: "fulfilled",
          idempotencyKey: "commitment-queue:fulfilled:commitment-1:v3",
        }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(source).not.toContain("window.confirm");
    expect(await screen.findByText("Closed from observed or confirmed evidence.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark fulfilled" })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("replaces the open record after the other party accepts", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(async () => true);
    const { rerender } = render(
      <CommitmentQueue {...props({ entries: entries("internally_confirmed"), onTransition })} />,
    );

    await user.click(screen.getByText("Acme"));
    expect(screen.getByText("Confirmed in this workspace")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark accepted" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "They accepted" }));

    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "commitment-1", acceptance: "internally_confirmed" }),
        expect.objectContaining({
          kind: "accepted",
          idempotencyKey: "commitment-queue:accepted:commitment-1:v3",
        }),
      ),
    );

    rerender(<CommitmentQueue {...props({ entries: entries("accepted"), onTransition })} />);

    expect(screen.getByText("Accepted")).toBeVisible();
    expect(screen.queryByRole("button", { name: "They accepted" })).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed in this workspace")).not.toBeInTheDocument();
  });

  it("records confirmation and correction through transition callbacks", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(async () => true);
    render(<CommitmentQueue {...props({ entries: entries("candidate"), onTransition })} />);

    await user.click(screen.getByText("Acme"));
    await user.click(screen.getByRole("button", { name: "Confirm promise" }));
    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith(
        expect.objectContaining({ id: "commitment-1" }),
        expect.objectContaining({
          kind: "internally_confirmed",
          idempotencyKey: "commitment-queue:internally_confirmed:commitment-1:v3",
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Correct" }));
    const promise = screen.getByRole("textbox", { name: "Corrected promise" });
    await user.clear(promise);
    await user.type(promise, "Send the final security packet");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(onTransition).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "commitment-1" }),
        expect.objectContaining({
          kind: "corrected",
          action: "Send the final security packet",
          idempotencyKey: "commitment-queue:corrected:commitment-1:v3",
        }),
      ),
    );
  });

  it("shows a failed correction inside the dialog", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(async () => "Could not update the commitment.");
    render(<CommitmentQueue {...props({ entries: entries("candidate"), onTransition })} />);

    await user.click(screen.getByText("Acme"));
    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not update the commitment.",
    );
    expect(within(dialog).getByRole("textbox", { name: "Corrected promise" })).toHaveValue(
      "Send the signed security packet",
    );
  });
});

describe("when the register is empty for a reason", () => {
  const deadGrant: RevenueLeakScan = {
    id: "scan-failed",
    status: "failed",
    mode: "linked",
    lookbackDays: 90,
    threadsSeen: 0,
    candidatesSeen: 0,
    error:
      "revenue: gmail thread sweep: gmail threads.list: google api /gmail/v1/users/me/threads returned 401: Request had invalid authentication credentials.",
  };

  // The bug this replaces: a dead Google grant produced an empty register and
  // the words "Connect Gmail and Calendar", sending a user who was already
  // connected back through an OAuth flow that could not help them.
  it("names the dead grant and offers to reconnect", () => {
    render(
      <CommitmentQueue
        {...props({ entries: [], failedScan: deadGrant, sources: brokenSources })}
      />,
    );

    expect(screen.getByText("Google needs reconnecting")).toBeInTheDocument();
    expect(screen.getByText(/stopped accepting the authorization/)).toBeInTheDocument();
    // The toolbar's audit button becomes the fix too. It used to stay "Run
    // audit" beside this error and start scans that failed within a second.
    const reconnect = screen.getAllByRole("button", { name: /Reconnect Google/ });
    expect(reconnect).toHaveLength(2);
    for (const button of reconnect) expect(button).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Run 6-month Promise Leak Audit/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect Gmail & Calendar/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google connected/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Gmail and Calendar to find/)).not.toBeInTheDocument();
  });

  // A provider outage is not the user's fault and must not send them through
  // OAuth. It offers a retry instead.
  it("offers a retry for a transient failure, not a reconnect", () => {
    render(
      <CommitmentQueue
        {...props({
          entries: [],
          failedScan: { ...deadGrant, error: "google api /gmail returned 503: Backend Error" },
        })}
      />,
    );

    expect(screen.getByText("The last audit did not finish")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Google could not finish reading your mail. Try the audit again in a few minutes.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Backend Error/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run the audit again/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reconnect Google/ })).not.toBeInTheDocument();
  });

  // Mid-scan, "no promises were found" reads as a result. It is not one.
  it("says it is still reading while a scan runs", () => {
    render(<CommitmentQueue {...props({ entries: [], scanning: true })} />);

    expect(screen.getByText("Reading your last 6 months")).toBeInTheDocument();
    expect(screen.queryByText(/No explicit promises were found/)).not.toBeInTheDocument();
  });
});

// Fix 4's contract at the UI edge: when the register request fails, the panel
// passes the failure down and the queue shows it. It must never silently fall
// through to the "connect your accounts" onboarding copy, which is what a
// failed fetch used to look like.
it("shows a register failure instead of the onboarding prompt", () => {
  render(
    <CommitmentQueue
      {...props({
        entries: [],
        sources: [],
        error: "The commitment register could not be loaded.",
      })}
    />,
  );

  expect(screen.getByText("The commitment register could not be loaded.")).toBeInTheDocument();
  expect(screen.queryByText(/Connect Gmail and Calendar to find/)).not.toBeInTheDocument();
});

it("points at the view that holds a promise this view does not", () => {
  expect(registerElsewhereCopy("we_owe", [])).toBeNull();
  expect(registerElsewhereCopy("we_owe", [{ direction: "promised_by_them" }])).toEqual({
    title: "No promises we made",
    detail: "1 promise they made is in What they owe us.",
  });
  expect(
    registerElsewhereCopy("they_owe", [{ direction: "promised_by_me" }, { direction: "mutual" }]),
  ).toEqual({
    title: "No promises they made",
    detail: "1 promise we made is in What we owe. 1 shared promise. Choose the company in By company.",
  });
  expect(registerElsewhereCopy("changed", [{ direction: "promised_by_them" }])).toEqual({
    title: "No promises changed in the last 7 days",
    detail: "1 promise they made is in What they owe us.",
  });
  expect(registerElsewhereCopy("overdue", [{ direction: "promised_by_them" }])).toEqual({
    title: "No promises are past due",
    detail: "1 promise they made is in What they owe us.",
  });
  expect(registerCountLabel(0, false, true, true)).toBe("None past due");
  const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
  expect(source).toContain("in the last 7 days.");
  render(
    <CommitmentQueue
      {...props({
        entries: [],
        sources: [],
        otherPromises: [{ direction: "promised_by_them" }],
      })}
    />,
  );
  expect(screen.getByRole("heading", { name: "No promises we made" })).toBeInTheDocument();
  expect(screen.getByText("1 promise they made is in What they owe us.")).toBeInTheDocument();
  expect(screen.getByText("None in this view")).toBeInTheDocument();
  expect(screen.queryByText("0 commitments")).not.toBeInTheDocument();
  expect(screen.queryByText("No commitments yet")).not.toBeInTheDocument();
});

it("keeps the empty register when its refresh fails", () => {
  render(
    <CommitmentQueue
      {...props({
        entries: [],
        sources: [],
        registerKnown: true,
        error: "Could not refresh the commitment register. Try again.",
      })}
    />,
  );

  expect(screen.getByText("No commitments yet")).toBeInTheDocument();
  expect(screen.getByText(/Connect Gmail and Calendar to find/)).toBeInTheDocument();
  expect(
    screen.getByText("Could not refresh the commitment register. Try again."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("The commitment register could not be loaded."),
  ).not.toBeInTheDocument();
});

it("keeps loaded promises when the register refresh fails", async () => {
  const onRetry = vi.fn();
  render(
    <CommitmentQueue
      {...props({
        entries: entries(),
        error: "The commitment register could not be loaded.",
        onRetry,
      })}
    />,
  );

  expect(screen.getByText("The commitment register could not be loaded.")).toBeInTheDocument();
  expect(screen.getByText("Send the signed security packet")).toBeInTheDocument();
  expect(screen.queryByText("No commitments yet")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

// Dogfooding found this: the reconnect warning only rendered on an empty
// register. With rows on screen the list still looked authoritative while it
// was quietly going out of date, and nothing said the audits had stopped.
it("keeps warning about a dead grant even when the register has rows", () => {
  render(
    <CommitmentQueue
      {...props({
        entries: entries(),
        sources: brokenSources,
        failedScan: {
          id: "scan-failed",
          status: "failed",
          mode: "linked",
          lookbackDays: 90,
          threadsSeen: 0,
          candidatesSeen: 0,
          error: "google api /gmail returned 401: Request had invalid authentication credentials.",
        },
      })}
    />,
  );

  expect(screen.getByText("Google needs reconnecting")).toBeInTheDocument();
  expect(screen.getByText(/not being updated until you reconnect/)).toBeInTheDocument();
  // The rows are still there — the warning is additive, not a replacement.
  expect(screen.getByText("Send the signed security packet")).toBeInTheDocument();
});

// The bug a real reconnect exposed: the register kept demanding another
// reconnect after the user had already done one, because it read only the old
// failed scan and never asked whether the source was working again.
it("stops demanding a reconnect once the source is healthy again", () => {
  render(
    <CommitmentQueue
      {...props({
        entries: [],
        sources,
        failedScan: {
          id: "scan-old",
          status: "failed",
          mode: "linked",
          lookbackDays: 90,
          threadsSeen: 0,
          candidatesSeen: 0,
          error: "google api /gmail returned 401: Request had invalid authentication credentials.",
        },
      })}
    />,
  );

  expect(screen.queryByRole("button", { name: /Reconnect Google/ })).not.toBeInTheDocument();
  expect(screen.getByText(/connection looks healthy now/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Run the audit again/ })).toBeInTheDocument();
});

// "90 conversations reviewed" counted every thread swept, including inbox mail
// the audit never judged. The number now reflects what was examined.
it("reports what the audit examined, not everything it swept", () => {
  render(
    <CommitmentQueue
      {...props({
        entries: entries(),
        latestScan: {
          id: "scan-cov",
          status: "completed",
          mode: "linked",
          lookbackDays: 90,
          threadsSeen: 90,
          candidatesSeen: 0,
          threadsDeepRead: 8,
          threadsSnippetOnly: 2,
          threadsSkipped: 80,
        },
      })}
    />,
  );

  // 8 deep + 2 preview = 10 examined, not 90 swept.
  expect(screen.getByText("10")).toBeInTheDocument();
  expect(screen.queryByText("90")).not.toBeInTheDocument();
  expect(screen.getByText("Not a conversation")).toBeInTheDocument();
  expect(screen.getByText("80")).toBeInTheDocument();
});

it("does not offer a new row that cannot be added", () => {
  render(<CommitmentQueue {...props()} />);
  expect(screen.getByText("Send the signed security packet")).toBeInTheDocument();
  expect(screen.queryByText("New row")).not.toBeInTheDocument();
});

it("shows the past-due promise home counted, including one we are owed", () => {
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const row = entries()[0];
  render(
    <CommitmentQueue
      {...props({
        overdueOnly: true,
        entries: [
          {
            ...row,
            id: "they",
            direction: "promised_by_them",
            text: "Send the sandbox login",
            dueAt: past,
          },
          {
            ...row,
            id: "soon",
            text: "Ship the packet next week",
            dueAt: soon,
          },
        ],
      })}
    />,
  );
  expect(screen.getByRole("tab", { name: "Overdue" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "What we owe" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  expect(screen.getByText("Send the sandbox login")).toBeInTheDocument();
  expect(screen.queryByText("Ship the packet next week")).not.toBeInTheDocument();
});

it("keeps the commitment filter and drops the chips that did nothing", () => {
  render(<CommitmentQueue {...props()} />);
  expect(screen.queryByRole("button", { name: "Filter" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Commitments, Active" })).toBeInTheDocument();
});

it("keeps promises past the first register page one click away", () => {
  expect(registerCountLabel(200, true)).toBe("200+ commitments");
  expect(registerCountLabel(1, true)).toBe("1+ commitment");
  expect(registerCountLabel(201, false)).toBe("201 commitments");
  expect(registerCountLabel(0, false)).toBe("0 commitments");
  expect(registerCountLabel(0, false, true)).toBe("None in this view");
  expect(registerCountLabel(0, false, true, true)).toBe("None past due");
  expect(registerCountLabel(1, false, true)).toBe("1 commitment");
  expect(registerRemainderLabel()).toBe("Show the next promises");
  expect(registerMissTitle(true)).toBe("No loaded promises match this view");
  expect(registerMissTitle(false)).toBe("No commitments match this view");
  expect(registerMissDetail(true)).toBe("Show the next promises to keep looking.");
  expect(registerMissDetail(false)).toBe("Change the filter or search query.");
  const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
  expect(source).toContain("registerCountLabel(");
  expect(source).toContain("Boolean(elsewhere) || otherPromisesPending");
  expect(source).not.toContain("filtered.length === items.length");
  expect(source).toContain("registerRemainderLabel()");
  expect(source).toContain("onLoadMorePromises");
});

it("keeps looking when a search misses only the loaded page", async () => {
  const user = userEvent.setup();
  const onLoadMorePromises = vi.fn();
  render(
    <CommitmentQueue
      {...props({
        hasMorePromises: true,
        onLoadMorePromises,
      })}
    />,
  );

  await user.type(screen.getByRole("textbox", { name: "Search commitments" }), "hidden packet");

  expect(screen.getByText("0+ commitments")).toBeInTheDocument();
  expect(screen.getByText("No loaded promises match this view")).toBeInTheDocument();
  expect(screen.getByText("Show the next promises to keep looking.")).toBeInTheDocument();
  expect(screen.queryByText("No commitments match this view")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Show the next promises" }));
  expect(onLoadMorePromises).toHaveBeenCalledTimes(1);
});

it("finds a promise by the status and score printed on the row", async () => {
  const user = userEvent.setup();
  const quiet = {
    ...entries()[0],
    id: "commitment-2",
    text: "Ship the quiet packet",
    state: "open" as const,
    confidence: 0.4,
    relationshipName: "Lumen",
  };
  render(<CommitmentQueue {...props({ entries: [...entries(), quiet] })} />);

  const box = screen.getByRole("textbox", { name: "Search commitments" });
  await user.type(box, "At risk");
  expect(screen.getByText("Acme")).toBeInTheDocument();
  expect(screen.queryByText("Lumen")).not.toBeInTheDocument();

  await user.clear(box);
  await user.type(box, "65");
  expect(screen.getByText("Acme")).toBeInTheDocument();
  expect(screen.queryByText("Lumen")).not.toBeInTheDocument();

  await user.clear(box);
  await user.type(box, "Open");
  expect(screen.getByText("Lumen")).toBeInTheDocument();
  expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  expect(
    commitmentSearchText({
      id: "commitment-1",
      relationshipId: "rel-1",
      relationshipName: "Acme",
      text: "Send the signed security packet",
      direction: "promised_by_me",
      owner: "Taylor",
      counterparty: "Morgan",
      state: "at_risk",
      acceptance: "accepted",
      missingEvidence: [],
      nextAction: "Watch",
      urgency: "due_soon",
      confidence: 65,
      currentEventVersion: 3,
    }),
  ).toBe(
    [
      "Acme Taylor Morgan Send the signed security packet 65 At risk",
      "Due within 72h At risk Accepted Missing Not confirmed Evidence Complete Watch",
    ].join(" "),
  );
  const undated = commitmentSearchText({
    id: "commitment-3",
    relationshipId: "rel-3",
    relationshipName: "Quill",
    text: "Send the quill excerpt",
    direction: "promised_by_me",
    owner: "Ada",
    counterparty: "Morgan",
    state: "open",
    acceptance: "internally_confirmed",
    missingEvidence: [],
    nextAction: "Watch connected sources for fulfillment or a reply.",
    urgency: "open",
    confidence: 80,
    currentEventVersion: 1,
  });
  expect(undated).toContain("Missing");
  expect(undated).toContain("Not confirmed");
  expect(undated).not.toContain("Overdue");
  const overdue = commitmentSearchText({
    id: "commitment-4",
    relationshipId: "rel-4",
    relationshipName: "Lumen",
    text: "Send the lumen excerpt",
    direction: "promised_by_me",
    owner: "Ada",
    counterparty: "Riley",
    dueAt: "2026-09-01T12:00:00.000Z",
    state: "at_risk",
    acceptance: "internally_confirmed",
    missingEvidence: [],
    nextAction: "Draft a recovery message or task now.",
    urgency: "overdue",
    confidence: 70,
    currentEventVersion: 1,
  });
  expect(overdue).toContain("Overdue");
  expect(overdue).not.toContain("Not confirmed");
  expect(overdue).not.toContain("Missing");
});

it("says nothing matches once every loaded promise was searched", async () => {
  const user = userEvent.setup();
  render(<CommitmentQueue {...props()} />);

  await user.type(screen.getByRole("textbox", { name: "Search commitments" }), "hidden packet");

  expect(screen.getByText("No commitments match this view")).toBeInTheDocument();
  expect(screen.getByText("Change the filter or search query.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show the next promises" })).not.toBeInTheDocument();
});

it("does not offer a meeting import that opens the company directory", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
  expect(source).toContain("and the message it came from.");
  expect(source).not.toContain("exact evidence behind it");
  expect(source).not.toContain("Import meeting evidence");
  expect(source).not.toContain("import reviewed meeting evidence");
  expect(source).not.toContain("two-sided");
  expect(source).toContain('data-record-overlay="shell"');
  expect(source).toContain(
    "md:left-[var(--shell-sidebar-offset,calc(0.625rem+1px+var(--shell-sidebar-width,252px)))]",
  );
  expect(source).not.toContain("md:left-[285px]");
  expect(source).toContain("Add a company");
  expect(source).toContain("openCompanyCreate(onOpenAccounts)");
  expect(source).toContain('if (filter === "overdue" && item.urgency !== "overdue") return false;');
  expect(source).not.toContain('subscribeDueCommitments(() => setFilter("due"))');
  expect(source).toContain(
    "data-[state=active]:bg-background-200 data-[state=active]:text-primary",
  );
  expect(source).not.toContain(
    'className="rounded-none bg-background-200 px-3 py-1.5 text-[13px] data-[state=active]:bg-background-200"',
  );
});
