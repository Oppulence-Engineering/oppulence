// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import fs from "node:fs";
import path from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import {
  CommitmentQueue,
  formatMissingEvidence,
  missingEvidenceLabel,
  REGISTER_VIEWS,
  registerPartyLabels,
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
  });

  it("names both sides of a mutual promise", async () => {
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

  it("asks for an account when that view has none selected", () => {
    expect(REGISTER_VIEWS.find((view) => view.id === "by_account")?.hint).toBe(
      "Every promise for one account.",
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
    expect(screen.getByText("Select one account to see every promise for it.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Account, Choose an account" })).toBeVisible();
    expect(screen.queryByText(/one relationship/)).toBeNull();
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
    expect(screen.getByRole("combobox", { name: "Account, Acme" })).toBeVisible();
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
    expect(screen.queryByText("Select one account to see every promise for it.")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Account, Choose an account" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add a company" }));
    expect(onOpenAccounts).toHaveBeenCalledOnce();
  });

  it("shows the operational promise, evidence, warning, and next action", async () => {
    render(<CommitmentQueue aria-label="Client commitments" {...props()} />);

    const component = screen.getByRole("region", { name: "Client commitments" });
    expect(component).toHaveAttribute("data-slot", "commitment-queue");
    expect(component).toHaveTextContent("Send the signed security packet");
    await userEvent.click(screen.getByText("Acme"));
    expect(component).toHaveTextContent("Taylor");
    expect(component).toHaveTextContent("Morgan");
    expect(component).toHaveTextContent("Due within 72h");
    await userEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(component).toHaveTextContent("I will send the signed security packet by Friday.");
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /Run 6-month Promise Leak Audit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Gmail & Calendar/ })).toBeEnabled();
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
      screen.queryByRole("textbox", { name: "What is blocking this commitment" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm blocked" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark blocked" }));
    const reason = screen.getByRole("textbox", { name: "What is blocking this commitment" });
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
    expect(screen.queryByText("Mark this commitment fulfilled?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark fulfilled" }));
    expect(screen.getByText("Mark this commitment fulfilled?")).toBeVisible();
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

it("does not offer a meeting import that opens the company directory", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "commitment-queue.tsx"), "utf8");
  expect(source).toContain("and the message it came from.");
  expect(source).not.toContain("exact evidence behind it");
  expect(source).not.toContain("Import meeting evidence");
  expect(source).not.toContain("import reviewed meeting evidence");
  expect(source).not.toContain("two-sided");
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
