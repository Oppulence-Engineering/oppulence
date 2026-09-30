import { describe, expect, it } from "vitest";

import { connectorProductDescription } from "./connector-product-copy";

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

  it("keeps an unknown connection's stored sentence", () => {
    expect(connectorProductDescription("github", "Repositories, issues, pull requests, and code review context")).toBe(
      "Repositories, issues, pull requests, and code review context",
    );
  });
});
