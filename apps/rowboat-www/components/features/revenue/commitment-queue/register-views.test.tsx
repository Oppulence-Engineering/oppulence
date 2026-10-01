import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  overdueRegisterFilter,
  registerAccountChoices,
  registerFilterFor,
} from "@/lib/revenue/commitment-register-filter";
import { REGISTER_VIEWS } from "./commitment-queue";

// One-pager §3: the register has five views. Each must be one query against
// GET /v1/commitments, not a separate screen with its own data path. Keeping
// the labels and the filters in one module is what stops them drifting apart.
describe("the five register views", () => {
  it("names all five", () => {
    expect(REGISTER_VIEWS.map((view) => view.id)).toEqual([
      "we_owe",
      "they_owe",
      "changed",
      "by_account",
      "by_owner",
    ]);
  });

  it("asks for outbound obligations that are still live", () => {
    expect(registerFilterFor("we_owe")).toMatchObject({
      direction: "promised_by_me",
      state: ["open", "at_risk"],
    });
  });

  it("asks for inbound obligations, the view no other tool offers", () => {
    expect(registerFilterFor("they_owe")).toMatchObject({
      direction: "promised_by_them",
      state: ["open", "at_risk"],
    });
  });

  it("scopes 'what changed' to a window rather than a direction", () => {
    const filter = registerFilterFor("changed");
    expect(filter).not.toBeNull();
    if (!filter) throw new Error("changed view did not produce a filter");
    expect(filter.changedSince).toBeTruthy();
    expect(filter.direction).toBeUndefined();
    expect(new Date(filter.changedSince as string).getTime()).toBeLessThan(Date.now());
  });

  it("passes through the account and the owner", () => {
    expect(registerFilterFor("by_account", { relationshipId: "rel-1" })).toMatchObject({
      relationshipId: "rel-1",
    });
    expect(registerFilterFor("by_owner", { owner: "sam@x.co" })).toMatchObject({
      owner: "sam@x.co",
    });
  });

  it("does not turn an unscoped account or owner view into a full-ledger request", () => {
    expect(registerFilterFor("by_account")).toBeNull();
    expect(registerFilterFor("by_owner", { owner: "  " })).toBeNull();
  });

  it("includes candidates only when the review filter asks for them", () => {
    expect(registerFilterFor("we_owe", { includeCandidates: true })).toMatchObject({
      includeCandidates: true,
    });
    expect(registerFilterFor("we_owe")?.includeCandidates).toBeUndefined();
  });

  it("every request is bounded, so no view can fetch the whole ledger", () => {
    for (const filter of [
      registerFilterFor("we_owe"),
      registerFilterFor("they_owe"),
      registerFilterFor("changed"),
      registerFilterFor("by_account", { relationshipId: "rel-1" }),
      registerFilterFor("by_owner", { owner: "sam@x.co" }),
    ]) {
      expect(filter?.limit).toBeGreaterThan(0);
    }
  });

  it("opens home's overdue count across directions, without promises that are only due soon", () => {
    const filter = overdueRegisterFilter("2026-10-01T00:00:00Z");
    expect(filter.direction).toBeUndefined();
    expect(filter.state).toEqual(["at_risk", "disputed"]);
    expect(filter.dueBefore).toBe("2026-10-01T00:00:00Z");
    expect(filter.limit).toBe(200);
  });

  it("lists a saved company even when the graph has not projected it", () => {
    expect(
      registerAccountChoices(
        [
          { id: "company-1", kind: "company", displayName: "Dogfood Harbor" },
          { id: "person-1", kind: "person", displayName: "Ada" },
        ],
        [],
      ),
    ).toEqual([{ id: "company-1", label: "Dogfood Harbor" }]);
    expect(
      registerAccountChoices([], [{ kind: "relationship", relationshipId: "graph-1", label: "Acme" }]),
    ).toEqual([{ id: "graph-1", label: "Acme" }]);
    expect(
      registerAccountChoices(
        [],
        [
          {
            kind: "relationship",
            relationshipId: "person-1",
            label: "Ada",
            metadata: { kind: "person" },
          },
          {
            kind: "relationship",
            relationshipId: "graph-1",
            label: "Acme",
            metadata: { kind: "company" },
          },
        ],
      ),
    ).toEqual([{ id: "graph-1", label: "Acme" }]);
    expect(
      registerAccountChoices(
        [{ id: "person-1", kind: "person", displayName: "Ada" }],
        [
          {
            kind: "relationship",
            relationshipId: "person-1",
            label: "Ada",
            metadata: { kind: "person" },
          },
        ],
      ),
    ).toEqual([]);
    const hook = fs.readFileSync(
      path.join(import.meta.dirname, "../../../../hooks/queries/use-commitments.ts"),
      "utf8",
    );
    expect(hook).toContain("registerAccountChoices(");
    expect(hook).toContain("fetchRelationships({}, signal)");
  });
});
