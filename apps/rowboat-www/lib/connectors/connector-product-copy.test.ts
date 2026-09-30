import { describe, expect, it } from "vitest";

import {
  connectorProductDescription,
  scopeProductDetail,
  scopeProductLabel,
} from "./connector-product-copy";

describe("connector product descriptions", () => {
  it("replaces catalog jargon for known connections", () => {
    expect(
      connectorProductDescription("canvas", "Banking, invoicing, dunning, transactions"),
    ).toBe("Banking, invoices, collections, and payments.");
    expect(
      connectorProductDescription("eigen", "Knowledge retrieval, reasoning context, and governed actions"),
    ).toBe("Search what you know, and run an action only after you approve it.");
    expect(connectorProductDescription("hubspot", "CRM contacts, deals, companies, tickets, and notes")).toBe(
      "Contacts, deals, companies, tickets, and notes.",
    );
    expect(connectorProductDescription("conduit", "Data pipelines, event routing, and operational integrations")).not.toMatch(
      /pipeline|operational/i,
    );
  });

  it("names Eigen permissions without the internal product", () => {
    expect(scopeProductLabel("eigen:actions.execute", "Execute governed actions")).toBe(
      "Run an approved action",
    );
    expect(scopeProductDetail("eigen:knowledge.read", "Search governed Eigen knowledge and citations.")).toBe(
      "Search what this workspace already knows.",
    );
    expect(scopeProductLabel("conduit:pipelines.read", "Read pipelines")).toBe("See how data moves");
    expect(scopeProductDetail("conduit:pipelines.write", "Create or update pipeline configuration.")).toBe(
      "Change how data moves between the tools you connect.",
    );
    expect(scopeProductLabel("github:repo.read", "Read repositories")).toBe("Read repositories");
    expect(scopeProductLabel("corinthian:ar.read", "Read accounts receivable")).toBe("See what is owed");
    expect(scopeProductDetail("corinthian:ar.read", "View receivables, balances, and aging context.")).toBe(
      "See who owes money, how much, and how long it has been open.",
    );
    expect(scopeProductDetail("canvas:invoices.read", "View invoice balances, status, due dates, and line-item context.")).toBe(
      "See balances, status, due dates, and each line on the invoice.",
    );
    expect(scopeProductDetail("canvas:customers.read", "View customer identity and account context needed to interpret invoices.")).toBe(
      "See who the invoice is for.",
    );
    expect(scopeProductDetail("cadence:payment_runs.read", "View payment-run status, totals, and approval context.")).not.toMatch(
      /payment-run|approval context/i,
    );
    expect(scopeProductDetail("cadence:payments.execute", "Execute a payment only after a separate action-specific approval.")).toBe(
      "Send a payment only after you approve that payment.",
    );
  });

  it("keeps an unknown connection's stored sentence", () => {
    expect(connectorProductDescription("acme", "Internal ledger sync")).toBe("Internal ledger sync");
    expect(connectorProductDescription("github", "Repositories, issues, pull requests, and code review context")).toBe(
      "Repositories, issues, and pull requests.",
    );
    expect(connectorProductDescription("stripe", "Customers, charges, invoices, subscriptions, and refunds")).toBe(
      "Customers, charges, invoices, subscriptions, and refunds.",
    );
  });
});
