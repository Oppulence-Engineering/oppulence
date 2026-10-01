import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "relationships-view.tsx"), "utf8");

import {
  companyDomainHref,
  companyName,
  companyDirectoryTitle,
  companyHealthFilterName,
  companyListEmptyCopy,
  companyStageFilterName,
  companySheetPositionLabel,
  companyReviewCopy,
  companyDescriptionCopy,
  companyEmailDetail,
  companyEmailHref,
  companyNextActionCopy,
  companyStateAnswer,
  missionControlChangeAnswer,
  missionControlStateAnswer,
  recordDetailBadge,
  completenessExplanationCopy,
  privacyDecisionCopy,
  capturePolicyLabel,
  evidencePublicationLabel,
  externalPlanShareLabel,
  conversationDeletionAvailable,
  conversationNoteCount,
  deleteConversationConfirmCopy,
  completenessProductLabel,
  detailEvidenceCopy,
  detailSourceLabel,
  enrichmentAvailabilityCopy,
  identityMatchDetail,
  sourceListedOnConnectionsPage,
  identityMatchLabel,
  identitySupportLabel,
  liveCueCopy,
  liveCueVisible,
} from "@/components/features/revenue/relationships-view/relationships-view";

describe("RelationshipsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function RelationshipsView");
    expect(source).toContain('"health",\n    "people",\n    "nextAction",');
    expect(source).not.toContain('"headquarters",\n    "employees",\n    "funding",');
    expect(source).toContain("subscribeCompanyCreate(() => setCreating(true))");
    expect(source).toContain("relationshipDeltaValue(change.before)");
    expect(source).toContain("attentionWithoutTasks(");
    expect(source).not.toContain("JSON.stringify(change.before");
    expect(source).toContain("aria-label={`Connect ${item.displayName}`}");
    expect(source).toContain("aria-label={`Permissions for ${item.displayName}`}");
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
    expect(companyDirectoryTitle({ query: " ", health: "at_risk", lifecycle: "all" }).filtered,
    ).toBe(true);
    expect(
      companyListEmptyCopy({ filtered: true, hasConnectedSource: false, lookbackLabel: "6 months" }),
    ).toBe("No companies match these filters.");
    expect(
      companyListEmptyCopy({
        filtered: false,
        hasConnectedSource: false,
        lookbackLabel: "6 months",
      }),
    ).toBe("Connect Gmail to discover companies from real conversations, or add one by hand.");
    expect(source).toContain("companyListEmptyCopy({");
    expect(companySheetPositionLabel(1, 4, false)).toBe("1 of 4 in All companies");
    expect(companySheetPositionLabel(1, 1, true)).toBe("1 of 1 in this filter");
    expect(source).toContain("companySheetPositionLabel(position, total, filtered)");
    expect(source).not.toContain("in All companies`");
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
    expect(companyName({ displayName: "northwind.example", accountDomain: "northwind.example" })).toBe(
      "Northwind",
    );
    expect(
      companyName({ displayName: "hello@northwind.example", accountDomain: "northwind.example" }),
    ).toBe("Northwind");
    expect(
      companyName({ displayName: "Billing @ Northwind", accountDomain: "northwind.example" }),
    ).toBe("Billing @ Northwind");
    expect(companyName({ displayName: "Northwind", accountDomain: "northwind.example" })).toBe(
      "Northwind",
    );
    expect(source).toContain('aria-label="Show company graph"');
    expect(source).toContain('aria-label="Show company list"');
    expect(source).toContain("clearCompanyGraphURL()");
    expect(source).toContain(
      '<dd className="text-primary/75">{companyName(data.relationship)}</dd>',
    );
    expect(source).not.toContain(
      '<dd className="capitalize text-primary/75">{companyName(data.relationship)}</dd>',
    );
    expect(source).toContain("Promises to follow up (");
    expect(source).not.toContain("Commitment recovery (");
    expect(source).not.toContain('aria-label="Show accounts"');
    expect(source).not.toContain('aria-label="Show relationship graph"');
    expect(source).toContain("Public research");
    expect(source).not.toContain("Profile enrichment");
    expect(source).toContain(">Any health</SelectItem>");
    expect(companyHealthFilterName("all")).toBe("Health, Any health");
    expect(companyHealthFilterName("needs_attention")).toBe("Health, Needs Attention");
    expect(companyStageFilterName("all")).toBe("Stage, All stages");
    expect(companyStageFilterName("evaluation")).toBe("Stage, Evaluation");
    expect(source).toContain("aria-label={companyHealthFilterName(health)}");
    expect(source).toContain("aria-label={companyStageFilterName(lifecycle)}");
    expect(source).not.toContain(">All health</SelectItem>");
    expect(source).toContain(">All stages</SelectItem>");
    expect(source).toContain("<Sparkle /> Sources");
    expect(source).toContain("Sources and company details");
    expect(source).not.toContain(">All lifecycle</SelectItem>");
    expect(source).not.toContain("Data health");
    expect(source).not.toContain("Allow cited enrichment");
    expect(source).not.toContain("Relationship enrichment");
    expect(source).toContain("Delete shared conversation evidence for this company?");
    expect(deleteConversationConfirmCopy()).toContain(
      "Delete shared conversation evidence for this company?",
    );
    expect(source).toContain("deleteConversationConfirmCopy()");
    expect(source).toContain("Confirm delete");
    expect(source).not.toContain(
      'window.confirm(\n                              "Delete shared conversation evidence',
    );
    expect(source).not.toContain("for this relationship?");
    expect(source).toContain('companyAttention.length === 1 ? "company" : "companies"');
    expect(companyDomainHref("acme.com")).toBe("https://acme.com");
    expect(companyDomainHref("  https://acme.com/about  ")).toBe("https://acme.com/about");
    expect(companyDomainHref("http://acme.com")).toBe("http://acme.com");
    expect(companyDomainHref("javascript:alert(1)")).toBeNull();
    expect(companyDomainHref("")).toBeNull();
    expect(source).toContain("companyDomainHref(relationship.accountDomain)");
    expect(source).toContain("companyDomainHref(data.relationship.accountDomain)");
    expect(source).not.toContain("href={`https://${relationship.accountDomain}`}");
    expect(source).toContain('aria-label="Company domain"');
    expect(source).toContain('placeholder="Company domain (optional)"');
    expect(source).toContain("Mail and meetings can fill in its people and activity later.");
    expect(source).toContain('["history", "Activity"]');
    expect(source).toContain('["emails", `Emails ${data.emailThreads.length}`]');
    expect(source).toContain("id={`${id}:history`}");
    expect(source).toContain("id={`${id}:emails`}");
    expect(source).toContain('onClick={() => openSection(section)}');
    expect(source).toContain('aria-current={activeSection === section ? "page" : undefined}');
    expect(source).not.toContain('onClick={() => openSection("activity")}');
    expect(source).not.toContain(
      'className="h-auto rounded-none bg-background-200 px-3 py-1.5 text-primary"',
    );
    expect(source).toContain("<Plus /> New company");
    expect(source).not.toContain("<Plus /> Add company");
    expect(source).not.toContain("synced conversations");
    expect(source).toContain('{ label: "One place for each company" }');
    expect(source).toContain('{ label: "People stay with their company" }');
    expect(source).not.toContain("One model per company");
    expect(source).not.toContain("People roll up");
    expect(source).not.toContain("Account domain");
    expect(source).not.toContain("One model per account");
    expect(source).toContain("Reading builds company history.");
    expect(source).toContain("Connect Gmail or HubSpot.");
    expect(source).not.toContain("Connect Gmail, Slack, or HubSpot.");
    expect(source).toContain("can&apos;t be connected from this page yet.");
    expect(sourceListedOnConnectionsPage("google")).toBe(true);
    expect(sourceListedOnConnectionsPage("hubspot")).toBe(true);
    expect(sourceListedOnConnectionsPage("slack")).toBe(false);
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
    expect(
      companyReviewCopy({ previousReviewedStateVersion: 0, changedSinceReview: false }),
    ).toEqual({ change: "Not reviewed yet.", footer: "Not reviewed yet." });
    expect(
      companyReviewCopy({ previousReviewedStateVersion: 2, changedSinceReview: false }),
    ).toEqual({
      change: "Nothing changed since your last review.",
      footer: "Nothing new since your last review.",
    });
    expect(companyStateAnswer("prospect", "unknown")).toBe(
      "Lifecycle: Prospect · Health: Unknown",
    );
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: false, value: "prospect" },
        health: { supported: false, value: "unknown" },
      }),
    ).toBe("No supported answer yet.");
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: true, value: "prospect" },
        health: { supported: false, value: "unknown" },
      }),
    ).toBe("Lifecycle: Prospect");
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: false, value: "prospect" },
        health: { supported: true, value: "healthy" },
      }),
    ).toBe("Health: Healthy");
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: true, value: "prospect" },
        health: { supported: true, value: "healthy" },
      }),
    ).toBe("Lifecycle: Prospect · Health: Healthy");
    expect(missionControlChangeAnswer([], "State changed")).toBe("State changed");
    expect(missionControlChangeAnswer([{ dimension: "evidence" }], "State changed")).toBe(
      "Supporting evidence changed.",
    );
    expect(
      missionControlChangeAnswer(
        [{ dimension: "lifecycle" }, { dimension: "evidence" }],
        "State changed",
      ),
    ).toBe("Lifecycle, Supporting evidence");
    expect(source).toContain("missionControlChangeAnswer(model.changes, \"State changed\")");
    expect(source).toContain("missionControlStateAnswer(model.evidence)");
    expect(source).not.toContain("String(model.evidence.lifecycle?.value ?? \"unknown\")");
    expect(recordDetailBadge("Sentiment", "unknown")).toBe("Sentiment · Unknown");
    expect(source).toContain("companyReviewCopy(model)");
    expect(source).toContain("reviewCopy.footer !== reviewCopy.change");
    expect(source).toContain('comboboxFilterName("Detail", humanize(dimension))');
    expect(source).toContain('comboboxFilterName("Value", humanize(value))');
    expect(source).not.toContain("Reviewed {new Date(model.asOf)");
    expect(source).toContain('disabled={busy === "recovery" || data.commitments.length === 0}');
    expect(completenessExplanationCopy("No source connection has completed its first useful sync.")).toBe(
      "Connect a source before these details can fill in.",
    );
    expect(completenessExplanationCopy("Details are already current.")).toBe(
      "Details are already current.",
    );
    expect(privacyDecisionCopy(0)).toBe("No privacy decisions recorded.");
    expect(privacyDecisionCopy(1)).toBe("1 privacy decision recorded.");
    expect(privacyDecisionCopy(4)).toBe("4 privacy decisions recorded.");
    expect(source).toContain("privacyDecisionCopy(data.intelligence.governanceDecisions.length)");
    expect(source).not.toContain("effectivePolicy.policyVersion");
    expect(capturePolicyLabel("require_consent")).toBe("Ask before capturing");
    expect(capturePolicyLabel("deny")).toBe("Do not capture");
    expect(capturePolicyLabel("allow")).toBe("Capture is allowed");
    expect(evidencePublicationLabel(true)).toBe("Shared excerpts: on");
    expect(evidencePublicationLabel(false)).toBe("Shared excerpts: off");
    expect(externalPlanShareLabel(true)).toBe("Plan sharing outside this workspace: allowed");
    expect(externalPlanShareLabel(false)).toBe("Plan sharing outside this workspace: blocked");
    expect(source).not.toContain("Saving details:");
    expect(source).not.toContain("External share:");
    expect(
      conversationDeletionAvailable({
        emailThreads: 0,
        meetingsAndMail: 0,
        commitments: 0,
        conversationNotes: 0,
      }),
    ).toBe(false);
    expect(
      conversationDeletionAvailable({
        emailThreads: 0,
        meetingsAndMail: 0,
        commitments: 1,
        conversationNotes: 0,
      }),
    ).toBe(true);
    expect(conversationNoteCount(["user", "meeting", "gmail"])).toBe(1);
    expect(source).toContain("No mail or meeting data to delete.");
    expect(completenessProductLabel("partial")).toBe("Some details are still missing");
    expect(completenessProductLabel("complete")).toBe("Details are current");
    expect(completenessProductLabel("custom_status")).toBe("Custom Status");
    expect(detailSourceLabel("ai_inference", true)).toBe("Suggested");
    expect(detailSourceLabel("source_fact", false)).toBe("Not filled in yet");
    expect(
      detailEvidenceCopy({
        supported: false,
        missingReason: "No active assertion supports this value at the response asOf boundary.",
      }),
    ).toBe("Nothing connected has filled this in.");
    expect(
      detailEvidenceCopy({
        supported: false,
        missingReason: "The winning assertion has no accessible source evidence reference.",
      }),
    ).toBe("This detail has no source you can open.");
    expect(detailEvidenceCopy({ supported: false })).toBe("Nothing connected has filled this in.");
    expect(
      detailEvidenceCopy({ supported: true, reason: "Confirmed in the last meeting." }),
    ).toBe("Confirmed in the last meeting.");
    expect(source).toContain("detailEvidenceCopy(item)");
    expect(source).not.toContain("{item.reason || item.missingReason}");
    expect(liveCueCopy({ kind: "missing_next_step", title: "No next step", detail: "Agree on an owner and a dated next step before the meeting ends." })).toEqual({
      title: "No next step",
      detail: "Add an owner and a date for what happens next.",
    });
    expect(liveCueVisible({ kind: "missing_next_step" }, "prospect")).toBe(false);
    expect(liveCueVisible({ kind: "missing_next_step" }, "evaluation")).toBe(true);
    expect(liveCueVisible({ kind: "overdue_commitment" }, "prospect")).toBe(true);
    expect(source).toContain("liveCueVisible(cue, data?.relationship.lifecycle ?? \"\")");
    expect(source).toContain("Suggestions (");
    expect(source).not.toContain("Live cue cards");
    expect(source).not.toContain("before the meeting ends");
    expect(source).toContain("Some details are still missing");
    expect(source).toContain("details have a source");
    expect(source).toContain("details come from a source you can open");
    expect(source).toContain("See where each detail came from");
    expect(source).toContain('data.relationship.accountDomain?.trim() || "Not filled in"');
    expect(companyEmailHref("ada@acme.com")).toBe("mailto:ada@acme.com");
    expect(companyEmailHref("  ada@acme.com  ")).toBe("mailto:ada@acme.com");
    expect(companyEmailHref("ada@acme.com?bcc=evil@example.com")).toBeNull();
    expect(companyEmailHref("javascript:alert(1)")).toBeNull();
    expect(companyEmailHref("")).toBeNull();
    expect(companyEmailDetail("")).toEqual({ text: "Not filled in" });
    expect(companyEmailDetail("ada@acme.com")).toEqual({
      text: "ada@acme.com",
      href: "mailto:ada@acme.com",
    });
    expect(source).toContain("companyEmailDetail(data.relationship.primaryEmail)");
    expect(source).toContain(
      "companyEmailHref(primaryContact?.email || data.relationship.primaryEmail)",
    );
    expect(source).not.toContain("mailto:${primaryContact.email}");
    expect(source).not.toContain("Not detected");
    expect(source).toContain("Not filled in");
    expect(companyDescriptionCopy({})).toBe("No description yet");
    expect(companyDescriptionCopy({ summary: "  " })).toBe("No description yet");
    expect(companyDescriptionCopy({ summary: "Builds boats" })).toBe("Builds boats");
    expect(
      companyDescriptionCopy({ companyDescription: "A harbor company", summary: "Builds boats" }),
    ).toBe("A harbor company");
    expect(companyNextActionCopy({})).toBe("No open action");
    expect(companyNextActionCopy({ nextAction: "Send the packet" })).toBe("Send the packet");
    expect(companyNextActionCopy({ openActions: 1 })).toBe("1 open action");
    expect(companyNextActionCopy({ openActions: 2 })).toBe("2 open actions");
    expect(source).toContain("companyDescriptionCopy(data.relationship)");
    expect(source).toContain("companyNextActionCopy(relationship)");
    expect(source).not.toContain("relationship.stateReason");
    expect(source).toContain("No description yet");
    expect(source).not.toContain("Not on a list");
    expect(source).not.toContain(">Lists<");
    expect(source).toContain("Correct a detail");
    expect(source).toContain('placeholder="Why is this wrong?"');
    expect(source).toContain("Save this transcript");
    expect(source).toContain("No mail or meetings yet.");
    expect(source).toContain("Activity history");
    expect(source).toContain("activityEvidenceLines(");
    expect(source).toContain("evidence[observation.id]");
    expect(source).toContain("observation.normalizedFacts");
    expect(source).toContain(
      "{humanize(observation.source)} · {humanize(observation.eventType)}",
    );
    expect(source).not.toContain("JSON.stringify(evidence[observation.id]");
    expect(source).toContain("removePersonConfirmCopy(participant.displayName)");
    expect(source).toContain("Confirm remove");
    expect(source).not.toContain("window.confirm(\n                                        `Remove ${participant.displayName}");
    expect(source).not.toContain("{observation.source} · {humanize(observation.eventType)}");
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

  it("opens the company named in the address and clears it when the sheet closes", () => {
    expect(source).toContain("const detail = revenueParams.company");
    expect(source).toContain("void setRevenueParams({ company: id })");
    expect(source).toContain("void setRevenueParams({ company: null })");
    expect(source).toContain("onClose={closeDetail}");
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
