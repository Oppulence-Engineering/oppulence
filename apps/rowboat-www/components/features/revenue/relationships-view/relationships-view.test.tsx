import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "relationships-view.tsx"), "utf8");

import {
  companyDirectoryTitle,
  completenessProductLabel,
  detailSourceLabel,
  enrichmentAvailabilityCopy,
  identityMatchDetail,
  identityMatchLabel,
  identitySupportLabel,
  liveCueCopy,
} from "@/components/features/revenue/relationships-view/relationships-view";

describe("RelationshipsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function RelationshipsView");
  });

  it("names a filtered company list and offers to clear it", () => {
    expect(companyDirectoryTitle({ query: "", health: "all", lifecycle: "all" })).toEqual({
      label: "All companies",
      filtered: false,
    });
    expect(companyDirectoryTitle({ query: "acme", health: "all", lifecycle: "all" })).toEqual({
      label: "Filtered",
      filtered: true,
    });
    expect(
      companyDirectoryTitle({ query: " ", health: "at_risk", lifecycle: "all" }).filtered,
    ).toBe(true);
  });

  it("does not offer company checkboxes that select nothing", () => {
    expect(source).not.toContain("Select all companies");
    expect(source).not.toContain("Select ${relationship.displayName}");
  });

  it("uses company words for create, update, and load failures", () => {
    expect(source).toContain('onNotice("Company added.")');
    expect(source).toContain('onNotice("Company updated.")');
    expect(source).toContain('errMessage(error, "Could not create the company.")');
    expect(source).toContain('errMessage(error, "Could not load this company.")');
    expect(source).toContain('errMessage(error, "Could not update this company.")');
    expect(source).toContain('errMessage(error, "Could not load companies.")');
    expect(source).toContain('errMessage(error, "Could not fill in companies and people.")');
    expect(source).not.toContain("Relationship added.");
    expect(source).not.toContain("Relationship state updated.");
    expect(source).not.toContain("Could not create the relationship.");
    expect(source).not.toContain("Could not load the relationship.");
    expect(source).not.toContain("Could not load relationship intelligence.");
    expect(source).not.toContain("Could not update this relationship.");
    expect(source).not.toContain("Could not enrich relationship profiles.");
    expect(source).toContain('aria-label="Show company graph"');
    expect(source).toContain('aria-label="Show company list"');
    expect(source).not.toContain('aria-label="Show accounts"');
    expect(source).not.toContain('aria-label="Show relationship graph"');
    expect(source).toContain("Public research");
    expect(source).not.toContain("Profile enrichment");
    expect(source).toContain(">Any health</SelectItem>");
    expect(source).not.toContain(">All health</SelectItem>");
    expect(source).toContain(">All stages</SelectItem>");
    expect(source).toContain("<Sparkle /> Sources");
    expect(source).toContain("Sources and company details");
    expect(source).not.toContain(">All lifecycle</SelectItem>");
    expect(source).not.toContain("Data health");
    expect(source).not.toContain("Allow cited enrichment");
    expect(source).not.toContain("Relationship enrichment");
    expect(source).toContain("Delete shared conversation evidence for this company?");
    expect(source).not.toContain("for this relationship?");
    expect(source).toContain('companyAttention.length === 1 ? "company" : "companies"');
    expect(source).toContain('aria-label="Company domain"');
    expect(source).toContain('placeholder="Company domain (optional)"');
    expect(source).toContain("Mail and meetings can fill in its people and activity later.");
    expect(source).not.toContain("synced conversations");
    expect(source).toContain('{ label: "One place for each company" }');
    expect(source).toContain('{ label: "People stay with their company" }');
    expect(source).not.toContain("One model per company");
    expect(source).not.toContain("People roll up");
    expect(source).not.toContain("Account domain");
    expect(source).not.toContain("One model per account");
    expect(source).toContain("Reading builds company history.");
    expect(source).toContain("Sources to connect");
    expect(source).not.toContain("Evidence sources");
    expect(source).toContain("Could not update this source.");
    expect(source).not.toContain("evidence source");
    expect(source).toContain("Review saved.");
    expect(source).not.toContain("Identity decision applied.");
    expect(source).not.toContain("action scopes remain");
    expect(source).not.toContain("approval-gated");
    expect(source).not.toContain("backfill ${progress}%");
    expect(source).not.toContain("ambiguous relationship");
    expect(source).toContain("possible {candidates.length === 1 ? \"duplicate\" : \"duplicates\"}");
    expect(source).toContain("Review possible duplicates");
    expect(source).toContain("Needs your review");
    expect(source).toContain('placeholder="Why you made this choice (optional)"');
    expect(source).toContain("Could not open the original detail.");
    expect(source).not.toContain("Identity review");
    expect(source).not.toContain("Human decision required");
    expect(source).not.toContain("Optional audit reason");
    expect(source).not.toContain("evidence item");
    expect(source).not.toContain("preview withheld");
    expect(source).not.toContain("recommendation confidence");
    expect(source).not.toContain("Could not open source evidence.");
    expect(source).not.toContain("Parallel Web");
    expect(source).toContain("None connected");
    expect(source).not.toContain("No evidence sources yet");
    expect(source).toContain("Download support file");
    expect(source).toContain("Support file downloaded. Secrets are left out.");
    expect(source).not.toContain("Export diagnostics");
    expect(source).not.toContain("beta diagnostics");
  });

  it("names the enrichment plan instead of the research vendor", () => {
    expect(
      enrichmentAvailabilityCopy({
        available: false,
        reason: "plan_required",
        requiredPlan: "intelligence",
      }),
    ).toBe(
      "Public research is part of the Intelligence plan. This workspace does not include it.",
    );
    expect(enrichmentAvailabilityCopy({ available: false, reason: "unconfigured" })).toBe(
      "Public research is not available in this workspace.",
    );
    expect(
      enrichmentAvailabilityCopy({ available: true, reason: "plan_required", requiredPlan: "pro" }),
    ).toBe("Available on the Pro plan.");
    expect(enrichmentAvailabilityCopy({ available: true, reason: "capability_disabled" })).toBe(
      "Cloud research is disabled for this workspace.",
    );
  });

  it("describes a company record without model jargon", () => {
    expect(completenessProductLabel("partial")).toBe("Some details are still missing");
    expect(completenessProductLabel("complete")).toBe("Details are current");
    expect(completenessProductLabel("custom_status")).toBe("Custom Status");
    expect(detailSourceLabel("ai_inference", true)).toBe("Suggested");
    expect(detailSourceLabel("source_fact", false)).toBe("Not filled in yet");
    expect(liveCueCopy({ kind: "missing_next_step", title: "No next step", detail: "Agree on an owner and a dated next step before the meeting ends." })).toEqual({
      title: "No next step",
      detail: "Add an owner and a date for what happens next.",
    });
    expect(source).toContain("Suggestions (");
    expect(source).not.toContain("Live cue cards");
    expect(source).not.toContain("before the meeting ends");
    expect(source).toContain("Some details are still missing");
    expect(source).toContain("details have a source");
    expect(source).toContain("details come from a source you can open");
    expect(source).toContain("See where each detail came from");
    expect(source).toContain("Not filled in");
    expect(source).toContain("No description yet");
    expect(source).toContain("Not on a list");
    expect(source).toContain("Correct a detail");
    expect(source).toContain('placeholder="Why is this wrong?"');
    expect(source).toContain("Save this transcript");
    expect(source).toContain("No mail or meetings yet.");
    expect(source).toContain("Activity history");
    expect(source).not.toContain("Not enriched");
    expect(source).not.toContain("winning assertion");
    expect(source).not.toContain("state dimensions sourced");
    expect(source).not.toContain("Inspect dimension evidence");
    expect(source).not.toContain("Correct the model");
    expect(source).not.toContain("Why is the model wrong?");
    expect(source).not.toContain("Built from synced email activity");
    expect(source).not.toContain("Synced companies · Gmail");
    expect(source).not.toContain("Publish reviewed evidence");
    expect(source).not.toContain("authority rank");
    expect(source).not.toContain("Evidence timeline");
    expect(source).not.toContain("No synced communication metadata yet");
  });

  it("asks Oppulence from the company sheet instead of showing a dead badge", () => {
    expect(source).toContain("useAskOppulence");
    expect(source).toContain("askOppulence(askedCompany ? companyName(askedCompany) : undefined)");
    expect(source).not.toContain(">Ask Oppulence</Badge>");
  });

  it("names a possible duplicate in product language", () => {
    expect(identitySupportLabel(1)).toBe("1 supporting detail");
    expect(identitySupportLabel(3)).toBe("3 supporting details");
    expect(identityMatchLabel(0.42)).toBe("42% match");
    expect(
      identityMatchDetail({
        anchorKind: "email",
        anchorProvider: "google",
        anchorPreview: "ada@example.com",
      }),
    ).toBe("Matched on Email from Google: ada@example.com");
    expect(identityMatchDetail({ anchorKind: "domain", anchorPreview: "  " })).toBe(
      "Matched on Domain: not shown",
    );
  });
});
