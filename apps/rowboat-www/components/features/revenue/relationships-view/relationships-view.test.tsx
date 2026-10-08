import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { actionReasonCopy, missionControlGapCopy } from "@/lib/revenue/revenue";

const source = fs.readFileSync(path.join(import.meta.dirname, "relationships-view.tsx"), "utf8");

import {
  activitySummaryLabel,
  communicationPreviewLabel,
  companyDomainHref,
  companyDomainLabel,
  companyName,
  evidenceExcerptLabel,
  companyDirectoryCount,
  companyCategoriesLabel,
  personSheetProfile,
  personParticipantLabel,
  companyDirectoryRemainderLabel,
  attentionForCompanyDirectory,
  companyDirectoryTitle,
  companyHealthFilterName,
  companyRecordLabel,
  companyListEmptyCopy,
  companyListFailureCopy,
  companyDirectoryHasConnectedSource,
  companySourceCountsAsConnected,
  sourcesAttentionLabel,
  companyLifecycleFilterName,
  companySheetPositionLabel,
  companyReviewCopy,
  reviewHasRecordedActivity,
  companyDescriptionCopy,
  companyLastActivityLabel,
  recommendationPriorityLabel,
  companyEmailDetail,
  companyEmailHref,
  companyNextActionCopy,
  companyStateAnswer,
  missionControlChangeAnswer,
  accountDetailSourceCopy,
  openableAccountDetailCount,
  missionControlPromiseAnswer,
  missionControlStateAnswer,
  missionControlActionAnswer,
  recordDetailBadge,
  supportedRecordValue,
  completenessExplanationCopy,
  privacyDecisionCopy,
  capturePolicyLabel,
  governanceCaptureLabel,
  governanceRouteLabel,
  governancePlaceLabel,
  governanceRetentionLabel,
  governanceDisclosureLabel,
  governanceDeletionLabel,
  governanceExcerptLabel,
  governanceReceiptRemainder,
  communicationTimelineEmptyCopy,
  emailActivityEmptyCopy,
  communicationTimelineTitle,
  earlierMailLabel,
  activityHistoryTitle,
  applySheetPane,
  captureSheetPane,
  sheetPaneFailureCopy,
  sheetPaneRefreshCopy,
  earlierActivityLabel,
  relationshipChangeEmptyCopy,
  relationshipChangeTitle,
  earlierChangesLabel,
  focusedReviewTitle,
  earlierEvidenceLabel,
  mailThreadSubjectLabel,
  mailThreadPartyLabel,
  mailMessageCountLabel,
  mailReplyLabel,
  reviewEvidenceKindLabel,
  acceptedPromiseLabel,
  mutualPlanCreateLabel,
  mutualPlanEmptyCopy,
  mutualPlanApproveLabel,
  mutualPlanHeading,
  mutualPlanItemLine,
  mutualPlanShareLabel,
  promiseLinkEndLabel,
  promiseLinkKindLabel,
  promiseLinkTitle,
  mutualPlanStatusLabel,
  deletionReceiptStatusLabel,
  rankingFactorLabel,
  rankingFactorReason,
  relationshipChangeLabel,
  contradictionSourceLabel,
  contradictionReasonCopy,
  recoveryClassificationLabel,
  recoveryExplanationCopy,
  evidencePublicationLabel,
  externalPlanShareLabel,
  conversationDeletionAvailable,
  conversationNoteCount,
  deleteConversationConfirmCopy,
  completenessHeading,
  completenessProductLabel,
  sourceLagLabel,
  identityReviewBlockCopy,
  detailEvidenceCopy,
  detailSourceLabel,
  enrichmentAvailabilityCopy,
  researchPanelTitle,

  researchStatusPendingCopy,
  enrichConfirmCopy,
  identityAnchorKindLabel,
  identityDecisionLabel,
  identityImpactLabel,
  identityMatchDetail,
  sourceConnectionSectionCopy,
  sourceListedOnConnectionsPage,
  googleAccountCanBeRead,
  sourcesNeedingRepair,
  identityMatchLabel,
  participantRoleLabel,
  recommendationApprovalLabel,
  recommendationPolicyLabel,
  duplicateInboxLabel,
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
    expect(source).toContain("attentionForCompanyDirectory(");
    expect(source).toContain("!personIds.has(item.relationshipId)");
    expect(source).not.toContain(
      "companies.some((relationship) => relationship.id === item.relationshipId)",
    );
    expect(source).not.toContain("JSON.stringify(change.before");
    expect(source).toContain("aria-label={`Connect ${item.displayName}`}");
    expect(source).toContain("aria-label={`Permissions for ${item.displayName}`}");
  });

  it("prints every category on the company row", () => {
    expect(companyCategoriesLabel(["ledger", "atelier"])).toBe("ledger, atelier");
    expect(companyCategoriesLabel(["  packet  "])).toBe("packet");
    expect(companyCategoriesLabel([])).toBe("Not filled in");
    expect(companyCategoriesLabel(undefined)).toBe("Not filled in");
    expect(companyCategoriesLabel(["  ", ""])).toBe("Not filled in");
    expect(source).toContain("companyCategoriesLabel(relationship.categories)");
    expect(source).toContain("companyCategoriesLabel(data.relationship.categories)");
    expect(source).not.toContain('data.relationship.categories?.join(", ")');
    expect(source).not.toContain("relationship.categories?.[0]");
    expect(personSheetProfile({ title: "  ", fallbackTitle: "CFO", location: "  " })).toEqual([
      "CFO",
    ]);
    expect(personSheetProfile({ title: "  ", location: "   " })).toEqual([]);
    expect(
      personSheetProfile({
        title: "Finance lead",
        company: "Acme",
        seniority: "VP",
        location: "Lisbon",
      }),
    ).toEqual(["Finance lead", "Acme", "VP", "Lisbon"]);
    expect(source).toContain("personSheetProfile({");
    expect(
      personParticipantLabel({
        displayName: "A. Harbor",
        email: "ada@harbor-person.example",
        person: { displayName: "Ada Harbor", primaryEmail: "ada@harbor-person.example" },
      }),
    ).toBe("Ada Harbor");
    expect(
      personParticipantLabel({ displayName: "   ", email: "bea@harbor-person.example" }),
    ).toBe("bea@harbor-person.example");
    expect(personParticipantLabel({ displayName: "Bea Cole" })).toBe("Bea Cole");
    expect(personParticipantLabel({ displayName: "   " })).toBe("Unknown person");
    expect(source).toContain("personParticipantLabel(participant)");
    expect(source).not.toContain("{participant.displayName}");
    expect(source).not.toContain(
      'className="bg-background-100 text-[11px] capitalize text-primary/60"',
    );
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
    expect(
      companyListEmptyCopy({
        filtered: false,
        hasConnectedSource: true,
        lookbackLabel: "6 months",
      }),
    ).toBe(
      "Gmail is connected. Run the 6 months audit from Promises to discover companies and the people behind each conversation.",
    );
    for (const status of ["connected", "backfilling", "live", "stale", "rebuilding", "degraded"]) {
      expect(companySourceCountsAsConnected(status)).toBe(true);
    }
    for (const status of ["not_connected", "authorizing", "reconnect_required", "disconnected"]) {
      expect(companySourceCountsAsConnected(status)).toBe(false);
    }
    expect(companyDirectoryHasConnectedSource([], [{ accounts: [{ status: "stale" }] }])).toBe(true);
    expect(companyDirectoryHasConnectedSource([], [{ accounts: [{ status: "not_connected" }] }])).toBe(
      false,
    );
    expect(companyDirectoryHasConnectedSource([], [])).toBe(false);
    expect(companyDirectoryHasConnectedSource([{ status: "live" }], [])).toBe(true);
    expect(source).toContain("companyDirectoryHasConnectedSource(sources, sourceInventory)");
    expect(sourcesAttentionLabel(1)).toBe("1 needs attention");
    expect(sourcesAttentionLabel(2)).toBe("2 need attention");
    expect(source).toContain("sourcesAttentionLabel(needsRepair)");
    expect(source).toContain("companyListEmptyCopy({");
    expect(companyListFailureCopy()).toBe("Companies could not load. Try again.");
    expect(source).toContain(
      "listNeverLoaded(relationshipsQuery.isError, relationshipsQuery.data)",
    );
    expect(source).toContain("relationshipsQuery.data != null");
    expect(source).toContain('listRefreshFailureCopy("companies")');
    expect(source).toContain("companyListFailureCopy()");
    expect(source).toContain("relationshipsQuery.refetch()");
    expect(source).toContain('"Couldn\'t load"');
    expect(companySheetPositionLabel(1, 4, false)).toBe("1 of 4 in All companies");
    expect(companySheetPositionLabel(1, 1, true)).toBe("1 of 1 in this filter");
    expect(companySheetPositionLabel(1, 200, false, true)).toBe("1 of 200+ in All companies");
    expect(source).toContain("companySheetPositionLabel(position, total, filtered, hasMore)");
    expect(companyDirectoryCount(200, true)).toBe("200+");
    expect(companyDirectoryCount(201, false)).toBe("201");
    expect(companyDirectoryRemainderLabel()).toBe("Show the next companies");
    expect(source).toContain("offset: directoryPage.length + extraCompanies.length");
    expect(source).toContain(
      'fetchRelationshipAttention(\n        "open",\n        undefined,\n        attentionPage.length + extraAttention.length,',
    );
    expect(source).toContain("attentionPageHasMore");
    expect(source).not.toContain("% ATTENTION_PAGE_SIZE");
    expect(source).not.toContain("attentionExhausted");
    expect(source).toContain("COMPANY_DIRECTORY_PAGE");
    expect(source).not.toContain("in All companies`");
  });

  it("drops attention for a company a finished filter hid", () => {
    const lumen = { relationshipId: "lumen" };
    const quill = { relationshipId: "quill" };
    const items = [lumen, quill];
    const loaded = [{ id: "quill" }];
    expect(
      attentionForCompanyDirectory(items, loaded, { filtered: false, hasMore: false }).map(
        (item) => item.relationshipId,
      ),
    ).toEqual(["lumen", "quill"]);
    expect(
      attentionForCompanyDirectory(items, loaded, { filtered: true, hasMore: true }).map(
        (item) => item.relationshipId,
      ),
    ).toEqual(["lumen", "quill"]);
    expect(
      attentionForCompanyDirectory(items, loaded, { filtered: true, hasMore: false }).map(
        (item) => item.relationshipId,
      ),
    ).toEqual(["quill"]);
  });

  it("does not offer company checkboxes that select nothing", () => {
    expect(source).not.toContain("Select all companies");
    expect(source).not.toContain("Select ${relationship.displayName}");
  });

  it("uses company words for create, update, and load failures", () => {
    expect(source).toContain('onNotice("Company added.")');
    expect(source).toContain('onNotice("Company updated.")');
    expect(source).toContain('errMessage(error, "Could not create the company.")');
    expect(source).toContain("setFormError(message)");
    expect(source).toContain('errMessage(error, "Could not load this company.")');
    expect(source).toContain('errMessage(error, "Could not update this company.")');
    expect(source).toContain("setActionError(message)");
    expect(source).toContain("reportSheetFailure(error, \"Could not open the original detail.\")");
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
    expect(companyName({ displayName: "   ", accountDomain: "harbor-blank.example" })).toBe(
      "Harbor Blank",
    );
    expect(companyName({ displayName: "  Northwind  ", accountDomain: "other.example" })).toBe(
      "Northwind",
    );
    expect(companyName({ displayName: "   ", accountDomain: "   " })).toBe("Unknown company");
    expect(companyDomainLabel("  harbor-blank.example  ")).toBe("harbor-blank.example");
    expect(companyDomainLabel("   ")).toBe("Not filled in");
    expect(activitySummaryLabel("   ")).toBe("Open the source");
    expect(activitySummaryLabel("The harbor packet arrived")).toBe("The harbor packet arrived");
    expect(activitySummaryLabel("Action outcome observed: meeting booked.")).toBe("Meeting booked");
    expect(activitySummaryLabel("Action outcome observed: bad recommendation.")).toBe(
      "Not a good suggestion",
    );
    expect(communicationPreviewLabel("   ")).toBe("No message preview");
    expect(communicationPreviewLabel("Invoice packet")).toBe("Invoice packet");
    expect(evidenceExcerptLabel("   ")).toBe("Evidence excerpt unavailable");
    expect(source).toContain("activitySummaryLabel(observation.summary)");
    expect(source).toContain("communicationPreviewLabel(item.subject)");
    expect(source).not.toContain('observation.summary || "Open the source"');
    expect(source).not.toContain('item.subject || "No message preview"');
    expect(source).toContain("companyDomainLabel(relationship.accountDomain)");
    expect(source).not.toContain("{relationship.accountDomain}");
    expect(source).toContain("companyLinkedInAction(");
    expect(source).toContain("{companyLinkedIn?.label}");
    expect(source).not.toContain("View company");
    expect(source).toContain('aria-label="Show company graph"');
    expect(source).toContain('aria-label="Show company list"');
    expect(source).toContain("clearCompanyGraphURL()");
    expect(source).toContain(
      '<dd className="text-primary/75">{companyName(data.relationship)}</dd>',
    );
    expect(source).not.toContain(
      '<dd className="capitalize text-primary/75">{companyName(data.relationship)}</dd>',
    );
    expect(source).toContain("promiseFollowUpTitle(");
    expect(source).toContain("promiseFollowUpEmptyCopy(");
    expect(source).toContain("overduePromiseCount(data.commitments)");
    expect(source).not.toContain("No promises are due for a follow-up.");
    expect(source).not.toContain("Commitment recovery (");
    expect(source).not.toContain('aria-label="Show accounts"');
    expect(source).not.toContain('aria-label="Show relationship graph"');
    expect(source).toContain("Public research");
    expect(source).not.toContain("Profile enrichment");
    expect(researchPanelTitle()).toBe("Know who works at a company");
    expect(researchPanelTitle()).not.toContain("inbox");
    expect(source).toContain("{researchPanelTitle()}");
    expect(source).not.toContain("Know who is behind the inbox");
    expect(source).toContain(">Any health</SelectItem>");
    expect(companyHealthFilterName("all")).toBe("Health, Any health");
    expect(companyHealthFilterName("needs_attention")).toBe("Health, Needs attention");
    expect(companyRecordLabel("unknown")).toBe("Not known");
    expect(companyRecordLabel("needs_attention")).toBe("Needs attention");
    expect(companyRecordLabel("healthy")).toBe("Healthy");
    expect(companyRecordLabel("active_customer")).toBe("Active customer");
    expect(companyRecordLabel("former_customer")).toBe("Former customer");
    expect(source).toContain("companyRecordLabel(relationship.health)");
    expect(source).toContain('data-record-overlay="screen"');
    expect(source).toContain("md:left-[var(--shell-sidebar-screen-offset)]");
    expect(source).toContain("md:w-[calc(100%-var(--shell-sidebar-screen-offset))]");
    expect(source).not.toContain("md:left-[285px]");
    expect(source).toContain("supportedRecordValue(\n                      data.relationship.lifecycle,");
    expect(source).toContain("supportedRecordValue(\n                      data.relationship.health,");
    expect(source).toContain("supportedRecordValue(\n                      data.relationship.engagement,");
    expect(source).not.toContain("humanize(relationship.health)");
    expect(source).not.toContain("humanize(data.relationship.health)");
    expect(source).not.toContain('"text-[13px] font-normal capitalize"');
    expect(companyLifecycleFilterName("all")).toBe("Lifecycle, Any lifecycle");
    expect(companyLifecycleFilterName("evaluation")).toBe("Lifecycle, Evaluation");
    expect(source).toContain("aria-label={companyHealthFilterName(health)}");
    expect(source).toContain("aria-label={companyLifecycleFilterName(lifecycle)}");
    expect(source).not.toContain(">All health</SelectItem>");
    expect(source).toContain(">Any lifecycle</SelectItem>");
    expect(source).not.toContain(">All stages</SelectItem>");
    expect(source).not.toContain('placeholder="Stage"');
    expect(sourcesNeedingRepair([])).toBe(0);
    expect(sourcesNeedingRepair([{ status: "live" }, { status: "reconnect_required" }])).toBe(1);
    expect(sourcesNeedingRepair([{ status: "connected" }, { status: "backfilling" }])).toBe(0);
    expect(source).toContain("sourcesNeedingRepair(sources)");
    expect(source).not.toContain("companyAttention.length + identityCandidates.length");
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
    expect(source).toContain('attentionCompanies === 1 ? "company" : "companies"');
    expect(source).toContain("attentionCompanyCount(companyAttention)");
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
    expect(source).toContain('aria-label="Description"');
    expect(source).toContain('placeholder="Description (optional)"');
    expect(source).not.toContain('aria-label="Company notes"');
    expect(source).not.toContain("Notes about this company");
    expect(source).toContain("Mail and meetings can fill in its people and activity later.");
    expect(source).toContain('["history", "Activity"]');
    expect(source).toContain('["emails", `Email threads ${data.emailThreads.length}`]');
    expect(source).toContain("Email threads (${data.emailThreads.length})");
    expect(source).not.toContain("`Emails ${data.emailThreads.length}`");
    expect(source).not.toContain("Email activity (");
    expect(source).not.toContain('>Emails</TableHead>');
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
    expect(sourceConnectionSectionCopy([{ accounts: [] }])).toEqual({
      title: "Sources to connect",
      body: "Connect Gmail or HubSpot. Reading builds company history. Anything that writes waits for your approval.",
    });
    expect(
      sourceConnectionSectionCopy([
        { accounts: [{ status: "stale" }] },
        { accounts: [] },
      ]),
    ).toEqual({
      title: "Sources that need a look",
      body: "Refresh a source that is already connected, or connect one that is not. Reading builds company history. Anything that writes waits for your approval.",
    });
    expect(sourceConnectionSectionCopy([{ accounts: [{ status: "stale" }] }]).title).toBe(
      "Sources that need a look",
    );
    expect(sourceConnectionSectionCopy([{ accounts: [{ status: "reconnect_required" }] }]).title).toBe(
      "Sources to connect",
    );
    expect(source).toContain("sourceConnectionSectionCopy(needsAttention)");

    expect(
      googleAccountCanBeRead({
        status: "stale",
        missingScopes: [],
        sourceAccountId: "default",
        grantedScopes: [],
      }),
    ).toBe(false);
    expect(
      googleAccountCanBeRead({
        status: "stale",
        missingScopes: [],
        sourceAccountId: "me@gmail.com",
        grantedScopes: [],
      }),
    ).toBe(true);
    expect(
      googleAccountCanBeRead({
        status: "live",
        missingScopes: [],
        sourceAccountId: "default",
        grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      }),
    ).toBe(true);
    expect(source).toContain("sourceCardAccount(item)");
    expect(source).toContain('item.source === "google" && !googleAccountCanBeRead(account)');
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
    expect(source).toContain("duplicateInboxLabel(candidates.length, hasMore)");
    expect(source).toContain("Show the next duplicates");
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

  it("says when public research could not be checked", () => {
    expect(researchStatusPendingCopy(false)).toBe(
      "Checking whether public research is available…",
    );
    expect(researchStatusPendingCopy(true)).toBe("Public research could not be checked.");
    expect(source).toContain('researchStatusPendingCopy(statusPhase === "failed")');
    expect(source).not.toContain(">Checking whether public research is available…</p>");
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

  it("describes a company record without model jargon", async () => {
    expect(
      companyReviewCopy({ previousReviewedStateVersion: 0, changedSinceReview: false }),
    ).toEqual({
      change: "No account details have changed yet.",
      footer: "Not reviewed yet.",
    });
    expect(reviewHasRecordedActivity([])).toBe(false);
    expect(reviewHasRecordedActivity([{}])).toBe(true);
    expect(
      companyReviewCopy({ previousReviewedStateVersion: 0, changedSinceReview: false }, true),
    ).toEqual({
      change: "No account details have changed yet. Promises and meetings are in the sections below.",
      footer: "Not reviewed yet.",
    });
    expect(
      companyReviewCopy({ previousReviewedStateVersion: 2, changedSinceReview: false }),
    ).toEqual({
      change: "Nothing changed since your last review.",
      footer: "Nothing new since your last review.",
    });
    expect(companyStateAnswer("prospect", "unknown")).toBe(
      "Lifecycle: Prospect · Health: Not known",
    );
    expect(companyStateAnswer("active_customer", "needs_attention")).toBe(
      "Lifecycle: Active customer · Health: Needs attention",
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
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: true, value: "active_customer" },
        health: { supported: true, value: "needs_attention" },
      }),
    ).toBe("Lifecycle: Active customer · Health: Needs attention");
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: false, value: "prospect" },
        health: { supported: false, value: "unknown" },
        engagement: { supported: true, value: "declining" },
        sentiment: { supported: false, value: "unknown" },
      }),
    ).toBe("Engagement: Declining");
    expect(
      missionControlStateAnswer({
        lifecycle: { supported: true, value: "prospect" },
        engagement: { supported: true, value: "declining" },
        sentiment: { supported: true, value: "negative" },
      }),
    ).toBe("Lifecycle: Prospect · Engagement: Declining · Sentiment: Negative");
    expect(missionControlPromiseAnswer([])).toBe("");
    expect(
      missionControlPromiseAnswer([
        { status: "open", acceptance: "candidate", text: "Guess the packet" },
        { status: "fulfilled", acceptance: "accepted", text: "Already sent" },
      ]),
    ).toBe("");
    expect(
      missionControlStateAnswer(
        { lifecycle: { supported: false, value: "prospect" } },
        [{ status: "open", acceptance: "internally_confirmed", text: "Send the packet" }],
      ),
    ).toBe("Open promise: Send the packet");
    expect(
      missionControlStateAnswer(
        { lifecycle: { supported: true, value: "prospect" } },
        [
          { status: "open", acceptance: "accepted", text: "Send the packet" },
          { status: "open", acceptance: "internally_confirmed", text: "Book the review" },
        ],
      ),
    ).toBe("Lifecycle: Prospect · 2 open promises.");
    const riskNow = Date.parse("2026-10-03T19:00:00Z");
    expect(
      missionControlPromiseAnswer(
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the quay risk",
            dueAt: "2026-10-01T15:00:00Z",
          },
        ],
        riskNow,
      ),
    ).toBe("At risk promise: Send the quay risk");
    expect(
      missionControlStateAnswer(
        { lifecycle: { supported: false, value: "prospect" } },
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the quay risk",
            dueAt: "2026-10-05T12:00:00Z",
          },
        ],
        riskNow,
      ),
    ).toBe("At risk promise: Send the quay risk");
    expect(
      missionControlPromiseAnswer(
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the quay due",
            dueAt: "2026-10-20T15:00:00Z",
          },
        ],
        riskNow,
      ),
    ).toBe("Open promise: Send the quay due");
    expect(
      missionControlPromiseAnswer(
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the packet",
            dueAt: "2026-10-20T15:00:00Z",
          },
          {
            status: "open",
            acceptance: "accepted",
            text: "Send the quay risk",
            dueAt: "2026-10-01T15:00:00Z",
          },
        ],
        riskNow,
      ),
    ).toBe("1 open promise and 1 promise at risk.");
    expect(
      missionControlPromiseAnswer(
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the quay risk",
            dueAt: "2026-10-01T15:00:00Z",
          },
          {
            status: "at_risk",
            acceptance: "accepted",
            text: "Book the review",
          },
        ],
        riskNow,
      ),
    ).toBe("2 promises are at risk.");
    expect(accountDetailSourceCopy(0, 8)).toBe("0 of 8 account details have a source");
    expect(accountDetailSourceCopy(0, 8, true)).toBe(
      "0 of 8 account details come from a source you can open.",
    );
    expect(accountDetailSourceCopy(1, 8)).toBe("1 of 8 account details have a source");
    expect(
      openableAccountDetailCount({
        lifecycle: { evidence: [] },
        health: { evidence: [{ observationId: "obs-1" }] },
      }),
    ).toBe(1);
    expect(openableAccountDetailCount({ lifecycle: { evidence: [] } })).toBe(0);
    expect(source).toContain("missionControlStateAnswer(model.evidence, commitments)");
    expect(source).toContain("accountDetailSourceCopy(supported, total)");
    expect(source).toContain("openableAccountDetailCount(model.evidence)");
    expect(source).toContain("accountDetailSourceCopy(openable, total, true)");
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
    expect(source).toContain("missionControlStateAnswer(model.evidence, commitments)");
    expect(missionControlActionAnswer(null)).toBe("No action is currently recommended.");
    expect(
      missionControlActionAnswer(null, [
        { status: "open", acceptance: "internally_confirmed", text: "Send the quay review" },
      ]),
    ).toBe("Open promise: Send the quay review. No follow-up is drafted.");
    expect(
      missionControlActionAnswer(
        null,
        [
          {
            status: "open",
            acceptance: "internally_confirmed",
            text: "Send the quay risk",
            dueAt: "2026-10-01T15:00:00Z",
          },
        ],
        Date.parse("2026-10-03T19:00:00Z"),
      ),
    ).toBe("At risk promise: Send the quay risk. No follow-up is drafted.");
    expect(
      missionControlActionAnswer(null, [
        { status: "open", acceptance: "internally_confirmed", text: "Send the packet" },
        { status: "open", acceptance: "accepted", text: "Book the review" },
      ]),
    ).toBe("2 open promises. No follow-up is drafted.");
    expect(
      missionControlActionAnswer(
        {
          actionType: "meeting_follow_up",
          reason: "You confirmed this follow-up from the meeting.",
        },
        [{ status: "open", acceptance: "internally_confirmed", text: "Send the packet" }],
      ),
    ).toBe("Meeting follow-up. You confirmed this follow-up from the meeting.");
    expect(
      missionControlActionAnswer({
        actionType: "meeting_follow_up",
        reason: "You confirmed this follow-up from the meeting.",
      }),
    ).toBe("Meeting follow-up. You confirmed this follow-up from the meeting.");
    expect(
      missionControlActionAnswer({
        actionType: "meeting_follow_up",
        reason: "You confirmed this follow-up from source evidence meeting/commitment:harbor-rank.",
      }),
    ).toBe("Meeting follow-up. You confirmed this follow-up from the meeting.");
    expect(missionControlActionAnswer({ reason: "Send the harbor note" })).toBe(
      "Send the harbor note",
    );
    expect(source).toContain("missionControlActionAnswer(model.activeRecommendation, commitments)");
    expect(source).toContain("missionControlActionAnswer(null, data.commitments)");
    expect(source).toContain("actionReasonCopy(recommendation?.reason)");
    expect(source).toContain("actionReasonCopy(action.reason)");
    expect(
      actionReasonCopy(
        "You confirmed this follow-up from source evidence meeting/commitment:harbor-rank.",
      ),
    ).toBe("You confirmed this follow-up from the meeting.");
    expect(actionReasonCopy("You confirmed this follow-up from the meeting.")).toBe(
      "You confirmed this follow-up from the meeting.",
    );
    expect(source).not.toContain("String(model.evidence.lifecycle?.value ?? \"unknown\")");
    expect(recordDetailBadge("Sentiment", "unknown")).toBe("Sentiment · Not known");
    expect(recordDetailBadge("Health", "needs_attention")).toBe("Health · Needs attention");
    expect(supportedRecordValue("prospect", { supported: false })).toBe("Not known");
    expect(supportedRecordValue("prospect", { supported: true })).toBe("Prospect");
    expect(supportedRecordValue("unknown", undefined)).toBe("Not known");
    expect(supportedRecordValue("healthy", { supported: true })).toBe("Healthy");
    expect(supportedRecordValue("needs_attention", { supported: true })).toBe("Needs attention");
    expect(source).toContain("companyReviewCopy(model, reviewHasRecordedActivity(commitments))");
    expect(source).toContain("reviewCopy.footer !== reviewCopy.change");
    expect(source).toContain('comboboxFilterName("Detail", humanize(dimension))');
    expect(source).toContain('comboboxFilterName("Value", companyRecordLabel(value))');
    expect(source).not.toContain("Reviewed {new Date(model.asOf)");
    expect(source).toContain('disabled={busy === "recovery" || data.commitments.length === 0}');
    expect(completenessExplanationCopy("No source connection has completed its first useful sync.")).toBe(
      "Connect a source before these details can fill in.",
    );
    expect(
      missionControlGapCopy("No source connection has completed its first useful sync.", 0, 8),
    ).toBe("Connect a source before these details can fill in.");
    expect(
      missionControlGapCopy("No source connection has completed its first useful sync.", 1, 8),
    ).toBe("7 account details still need a source.");
    expect(
      missionControlGapCopy(
        "One or more material values have no accessible supporting evidence.",
        7,
        8,
      ),
    ).toBe("1 account detail still needs a source.");
    expect(
      missionControlGapCopy(
        "One or more material values have no accessible supporting evidence.",
        0,
        8,
      ),
    ).toBe("Account details have no source you can open.");
    expect(
      missionControlGapCopy("A required source is stale or disconnected.", 3, 8),
    ).toBe("A source needs reconnecting.");
    expect(source).toContain("missionControlGapCopy(model.completeness.explanation, supported, total)");
    expect(
      completenessExplanationCopy(
        "One or more material values have no accessible supporting evidence.",
      ),
    ).toBe("Account details have no source you can open.");
    expect(completenessExplanationCopy("Required source evidence is current.")).toBe(
      "The details you can open are up to date.",
    );
    expect(completenessExplanationCopy("A required source is stale or disconnected.")).toBe(
      "A source needs reconnecting.",
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
    expect(governanceCaptureLabel("manual_capture")).toBe("Captured by hand");
    expect(governanceRouteLabel("local_transcription_to_oppulence")).toBe(
      "Transcribed on this device, then saved here",
    );
    expect(governancePlaceLabel("local_device")).toBe("On this device");
    expect(governanceRetentionLabel("untilTranscribed")).toBe("Kept until it is transcribed");
    expect(governanceRetentionLabel("until_transcribed")).toBe("Kept until it is transcribed");
    expect(governanceDisclosureLabel("not_recorded")).toBe("People were not told");
    expect(governanceDeletionLabel("scheduled_after_transcription")).toBe(
      "Scheduled to be deleted after transcription",
    );
    expect(governanceExcerptLabel("not_retained")).toBe("No audio was kept");
    expect(mailThreadSubjectLabel("   ")).toBe("Email conversation");
    expect(mailThreadSubjectLabel("The quill invoice")).toBe("The quill invoice");
    expect(mailThreadPartyLabel("  ")).toBe("Gmail");
    expect(mailThreadPartyLabel(" ada@northwind.example ")).toBe("ada@northwind.example");
    expect(mailMessageCountLabel(0)).toBe("0 messages");
    expect(mailMessageCountLabel(1)).toBe("1 message");
    expect(mailMessageCountLabel(2)).toBe("2 messages");
    expect(mailMessageCountLabel(Number.NaN)).toBe("0 messages");
    expect(source).toContain("mailThreadSubjectLabel(thread.subject)");
    expect(source).toContain("mailThreadPartyLabel(thread.counterpartyEmail)");
    expect(source).toContain("mailMessageCountLabel(thread.messageCount)");
    expect(source).not.toContain('thread.subject || "Email conversation"');
    expect(mailReplyLabel("needs_reply")).toBe("Needs a reply");
    expect(mailReplyLabel("awaiting_reply")).toBe("Waiting on them");
    expect(mailReplyLabel("quiet")).toBe("Quiet");
    expect(reviewEvidenceKindLabel("speaker")).toBe("Who said it");
    expect(reviewEvidenceKindLabel("claim")).toBe("What was said");
    expect(mutualPlanStatusLabel("internally_approved")).toBe("Approved in this workspace");
    expect(mutualPlanHeading("draft", 1)).toBe("Draft · Version 1");
    expect(mutualPlanHeading("internally_approved", 2)).toBe(
      "Approved in this workspace · Version 2",
    );
    expect(mutualPlanItemLine("Send the harbor note", "jordan@northpier.example")).toBe(
      "Send the harbor note · jordan@northpier.example",
    );
    expect(mutualPlanItemLine("Send the harbor note", "Jordan Buyer")).toBe(
      "Send the harbor note · Jordan Buyer",
    );
    expect(mutualPlanItemLine("Send the harbor note", "plan-participant")).toBe(
      "Send the harbor note",
    );
    expect(mutualPlanItemLine("Send the harbor note", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5")).toBe(
      "Send the harbor note",
    );
    expect(mutualPlanApproveLabel()).toBe("Approve this plan");
    expect(mutualPlanShareLabel()).toBe("Draft an email to share this plan");
    expect(acceptedPromiseLabel("Send the cedar notes")).toBe(
      "They accepted “Send the cedar notes”",
    );
    expect(acceptedPromiseLabel("  ")).toBe("They accepted “this promise”");
    expect(mutualPlanCreateLabel()).toBe("Create from promises they accepted");
    expect(mutualPlanEmptyCopy()).toBe("A shared plan starts once they accept a promise.");
    expect(promiseLinkTitle(2)).toBe("Promise links (2)");
    expect(promiseLinkKindLabel("blocks")).toBe("Blocks");
    expect(promiseLinkKindLabel("requires")).toBe("Requires");
    expect(promiseLinkKindLabel("supersedes")).toBe("Replaces");
    expect(promiseLinkEndLabel("")).toBe("Unknown promise");
    expect(promiseLinkEndLabel("Send the cedar notes")).toBe("Send the cedar notes");
    expect(source).toContain("acceptedPromiseLabel(item.text)");
    expect(source).toContain("mutualPlanCreateLabel()");
    expect(source).toContain("mutualPlanEmptyCopy()");
    expect(source).not.toContain("Create from accepted promises");
    expect(source).not.toContain("Accept a promise to build a shared plan.");
    expect(source).toContain("promiseLinkTitle(data.commitmentDependencies.length)");
    expect(source).toContain("promiseLinkKindLabel(dependency.kind)");
    expect(source).toContain("promiseLinkEndLabel(from?.text)");
    expect(source).not.toContain("Confirm accepted:");
    expect(source).not.toContain("Commitment graph");
    expect(source).not.toContain("{dependency.kind}");
    expect(source).not.toContain("Unknown commitment");
    expect(source).toContain("mutualPlanHeading(plan.status, plan.currentRevision.version)");
    expect(source).toContain("mutualPlanItemLine(item.title, item.ownerParticipantRef)");
    expect(source).toContain("mutualPlanApproveLabel()");
    expect(source).toContain("mutualPlanShareLabel()");
    expect(source).not.toContain("Queue exact revision for sharing");
    expect(source).not.toContain("{item.title} · {item.ownerParticipantRef}");
    expect(deletionReceiptStatusLabel("partial")).toBe("Some copies are still there");
    expect(relationshipChangeLabel("next_action")).toBe("Next action");
    expect(relationshipChangeLabel("risks")).toBe("Risks");
    expect(contradictionSourceLabel("desktop_note")).toBe("A note");
    expect(contradictionSourceLabel("gmail")).toBe("Gmail");
    expect(contradictionSourceLabel("ai_inference")).toBe("A suggestion");
    expect(contradictionReasonCopy("deterministic assertion authority selected the current value")).toBe(
      "A stronger source already chose the current value.",
    );
    expect(contradictionReasonCopy("Selected desktop_note as current evidence.")).toBe(
      "You chose the value from A note.",
    );
    expect(source).toContain("contradictionSourceLabel(side.source)");
    expect(source).toContain("contradictionReasonCopy(item.reason)");
    expect(source).toContain("relationshipChangeLabel(change.dimension)");
    expect(source).toContain("relationshipDeltaValue(side.value)");
    expect(source).not.toContain("(side) => side.source)");
    expect(rankingFactorLabel("commitment_due_state")).toBe("Due date");
    expect(rankingFactorLabel("source_completeness")).toBe("Source coverage");
    expect(rankingFactorLabel("outcome_learning")).toBe("Earlier outcomes");
    expect(rankingFactorReason("An accepted commitment is overdue.")).toBe(
      "This promise is past due.",
    );
    expect(
      rankingFactorReason(
        "Bounded prior decisions and outcomes adjust ordering, never authority.",
      ),
    ).toBe("Earlier results change the order. They do not approve the action.");
    expect(
      rankingFactorReason("Fresh source coverage changes confidence in the queue position."),
    ).toBe("How complete the sources are changes where this sits.");
    expect(rankingFactorReason("This promise is past due.")).toBe("This promise is past due.");
    expect(source).toContain("rankingFactorLabel(factor.factor)");
    expect(source).toContain("rankingFactorReason(factor.reason)");
    expect(source).not.toContain("humanize(factor.factor)");
    expect(source).not.toContain("{factor.reason}");
    expect(source).toContain("reviewEvidenceKindLabel(item.kind)");
    expect(source).toContain("mutualPlanHeading(plan.status, plan.currentRevision.version)");
    expect(source).toContain("deletionReceiptStatusLabel(data.intelligence.deletionReceipts[0].status)");
    expect(source).not.toContain("{item.kind}");
    expect(source).not.toContain("humanize(plan.status)");
    expect(source).not.toContain("humanize(data.intelligence.deletionReceipts[0].status)");
    expect(recoveryClassificationLabel("unknown_stale_sources")).toBe("A source is out of date");
    expect(recoveryClassificationLabel("forgotten")).toBe("This promise looks forgotten");
    expect(recoveryClassificationLabel("fulfilled")).toBe("The promise was kept");
    expect(recoveryClassificationLabel("likely_fulfilled")).toBe("The promise may already be kept");
    expect(
      recoveryExplanationCopy("fulfilled", "Fresh explicit source evidence proves fulfillment."),
    ).toBe("A newer source shows this promise was kept.");
    expect(
      recoveryExplanationCopy(
        "forgotten",
        "Fresh evidence suggests forgotten; human review is required.",
      ),
    ).toBe("This promise looks forgotten. Review it before acting.");
    expect(
      recoveryExplanationCopy(
        "unknown_stale_sources",
        "Evidence is incomplete; stale sources: gmail.",
      ),
    ).toBe("A connected source is out of date, so this promise cannot be checked yet.");
    expect(
      recoveryExplanationCopy("blocked", "This promise is blocked. Review it before acting."),
    ).toBe("This promise is blocked. Review it before acting.");
    expect(
      recoveryExplanationCopy(
        "renegotiated",
        "This promise was renegotiated. Review the new terms.",
      ),
    ).toBe("This promise was renegotiated. Review the new terms.");
    expect(source).toContain("mailReplyLabel(thread.replyState)");
    expect(source).toContain("recoveryClassificationLabel(evaluation.classification)");
    expect(source).not.toContain("humanize(thread.replyState)");
    expect(source).not.toContain("humanize(evaluation.classification)");
    expect(source).toContain("governancePlaceLabel(receipt.region)");
    expect(source).toContain("governanceRetentionLabel(receipt.retention)");
    expect(source).not.toContain("{receipt.region}");
    expect(source).not.toContain("{receipt.retention}");
    expect(source).not.toContain("humanize(receipt.capturePolicy)");
    expect(source).not.toContain("humanize(receipt.evidenceClip)");
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
    expect(completenessHeading("partial", 0)).toBe("No account details have a source yet");
    expect(completenessHeading("partial", Number.NaN)).toBe("No account details have a source yet");
    expect(completenessHeading("partial", 1)).toBe("Some details are still missing");
    expect(completenessHeading("complete", 0)).toBe("Details are current");
    expect(source).toContain("completenessHeading(model.completeness.status, supported)");
    expect(sourceLagLabel(0)).toBe("");
    expect(sourceLagLabel(24)).toBe("1 minute behind");
    expect(sourceLagLabel(12 * 60)).toBe("12 minutes behind");
    expect(sourceLagLabel(21 * 60 * 60 + 12 * 60)).toBe("21 hours behind");
    expect(sourceLagLabel(36 * 60 * 60)).toBe("2 days behind");
    expect(source).toContain("sourceLagLabel(account.lagSeconds)");
    expect(source).not.toContain("m lag");
    expect(completenessProductLabel("partial")).toBe("Some details are still missing");
    expect(completenessProductLabel("complete")).toBe("Details are current");
    expect(completenessProductLabel("custom_status")).toBe("Custom Status");
    expect(identityReviewBlockCopy(1)).toBe(
      "1 possible duplicate must be reviewed before you act.",
    );
    expect(identityReviewBlockCopy(2)).toBe(
      "2 possible duplicates must be reviewed before you act.",
    );
    expect(source).toContain("identityReviewBlockCopy(model.completeness.unresolvedIdentityCount)");
    expect(detailSourceLabel("ai_inference", true)).toBe("Suggested");
    expect(detailSourceLabel("external_research", true)).toBe("Public research");
    expect(detailSourceLabel("external_research", false)).toBe("Not filled in yet");
    expect(detailSourceLabel("source_fact", false)).toBe("Not filled in yet");
    expect(source).toContain('case "external_research":\n      return "Public research";');
    expect(source).toContain("activitySourceLabel(ref.source)");
    expect(source).not.toContain("relationshipLabel(ref.source)");
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
    expect(
      liveCueCopy({
        kind: "missing_next_step",
        title: "No next step",
        detail: "Agree on an owner and a dated next step before the meeting ends.",
      }),
    ).toEqual({
      title: "No next step",
      detail: "Add an owner and a date for what happens next.",
    });
    expect(
      liveCueCopy({
        kind: "contradiction",
        title: "Relationship evidence conflicts",
        detail: "Which lifecycle value should be current?",
      }),
    ).toEqual({
      title: "Two details disagree",
      detail: "Which Lifecycle should be the current one?",
    });
    expect(
      liveCueCopy({
        kind: "contradiction",
        title: "Relationship evidence conflicts",
        detail: "Which next_action value should be current?",
      }),
    ).toEqual({
      title: "Two details disagree",
      detail: "Which Next action should be the current one?",
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
    expect(source).toContain("companyDomainLabel(data.relationship.accountDomain)");
    expect(source).not.toContain('data.relationship.accountDomain?.trim() || "Not filled in"');
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
    expect(companyLastActivityLabel(undefined)).toBe("No activity");
    expect(companyLastActivityLabel(null)).toBe("No activity");
    expect(companyLastActivityLabel("")).toBe("No activity");
    expect(companyLastActivityLabel("not-a-date")).toBe("No activity");
    expect(
      companyLastActivityLabel(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()),
    ).toMatch(/ago$/);
    expect(source).toContain("companyLastActivityLabel(relationship.lastTouchAt)");
    expect(source).toContain("companyLastActivityLabel(data.relationship.lastTouchAt)");
    expect(source).toContain(">Last activity</TableHead>");
    expect(source).toContain('"Last activity",\n                      companyLastActivityLabel(data.relationship.lastTouchAt)');
    expect(source).toContain(">Domain</TableHead>");
    expect(source).not.toContain(">Last interaction</TableHead>");
    expect(source).not.toContain('"Last interaction"');
    expect(source).not.toContain(">Domains</TableHead>");
    expect(recommendationPriorityLabel(80)).toBe("High");
    expect(recommendationPriorityLabel(40)).toBe("Medium");
    expect(recommendationPriorityLabel(0)).toBe("Low");
    expect(source).toContain("recommendationPriorityLabel(action.priorityScore)");
    expect(source).not.toContain("priority {action.priorityScore}");
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
    expect(source).toContain("commitmentPreviewRemainder(hiddenCommitments)");
    expect(source).toContain("openCommitmentCount(data.commitments)");
    expect(source).toContain("`Promises ${data.commitments.length}`");
    expect(source).toContain("`Promises (${data.commitments.length})`");
    expect(source).toContain('["Open promises", String(openCommitmentCount(data.commitments))]');
    expect(source).not.toContain(
      '["Open commitments", String(data.commitments.filter((item) => item.status === "open").length)]',
    );
    expect(source).toContain("data.commitments.length,");
    expect(source).not.toContain("mapCommitmentsToAccountTimeline(data.commitments, 8)");
    expect(source).not.toContain("relationship.stateReason");
    expect(source).toContain("No description yet");
    expect(source).not.toContain("Not on a list");
    expect(source).not.toContain(">Lists<");
    expect(source).toContain("Correct a detail");
    expect(source).toContain('placeholder="Why is this wrong?"');
    expect(source).toContain("Save this transcript");
    expect(source).toContain("communicationTimelineEmptyCopy(");
    expect(source).toContain('timeline.some((item) => item.source === "meeting")');
    expect(source).not.toContain("No mail or meetings yet.");
    expect(communicationTimelineEmptyCopy(false)).toBe("No Gmail or calendar events yet.");
    expect(emailActivityEmptyCopy(false)).toBe("No Gmail threads linked yet.");
    expect(emailActivityEmptyCopy(true)).toBe(
      "No Gmail threads linked yet. Confirmed meetings are in Activity.",
    );
    expect(source).toContain("emailActivityEmptyCopy(");
    expect(source).not.toContain(">No Gmail threads linked yet.</EmptyText>");
    expect(communicationTimelineEmptyCopy(true)).toBe(
      "No Gmail or calendar events yet. Confirmed meetings are in Activity.",
    );
    expect(source).toContain("captureSheetPane(() => getRelationshipTimelinePage(id))");
    expect(source).not.toContain("observations: [] as RelationshipObservation[]");
    expect(sheetPaneFailureCopy("Activity")).toBe("Activity could not load. Try again.");
    expect(sheetPaneRefreshCopy("activity")).toBe("Could not refresh activity. Try again.");
    expect(
      applySheetPane({ sameCompany: true, current: ["kept"], failed: true, next: null }),
    ).toEqual(["kept"]);
    expect(
      applySheetPane({ sameCompany: false, current: ["old"], failed: true, next: null }),
    ).toEqual([]);
    expect(
      applySheetPane({ sameCompany: true, current: ["kept"], failed: false, next: ["next"] }),
    ).toEqual(["next"]);
    await expect(captureSheetPane(async () => "ok")).resolves.toEqual({ ok: true, value: "ok" });
    await expect(captureSheetPane(async () => Promise.reject(new Error("down")))).resolves.toEqual({
      ok: false,
    });
    expect(communicationTimelineTitle(2, true)).toBe("Email & meeting timeline (2+)");
    expect(communicationTimelineTitle(3, false)).toBe("Email & meeting timeline (3)");
    expect(communicationTimelineTitle(0, false, true)).toBe("Email & meeting timeline");
    expect(earlierMailLabel()).toBe("Show earlier mail and meetings");
    expect(activityHistoryTitle(50, true)).toBe("Activity history (50+)");
    expect(activityHistoryTitle(51, false)).toBe("Activity history (51)");
    expect(activityHistoryTitle(0, false, true)).toBe("Activity history");
    expect(earlierActivityLabel()).toBe("Show earlier activity");
    expect(relationshipChangeTitle(2, true)).toBe("What changed (2+)");
    expect(relationshipChangeTitle(3, false)).toBe("What changed (3)");
    expect(relationshipChangeTitle(0, false, true)).toBe("What changed");
    expect(source).toContain("relationshipChangeEmptyCopy(");
    expect(source).toContain("timeline.length > 0 || data.commitments.length > 0");
    expect(source).not.toContain("Nothing has changed yet.");
    expect(relationshipChangeEmptyCopy(false)).toBe("No account details have changed yet.");
    expect(relationshipChangeEmptyCopy(true)).toBe(
      "No account details have changed yet. Promises and meetings are in the sections below.",
    );
    expect(earlierChangesLabel()).toBe("Show earlier changes");
    expect(focusedReviewTitle(0, true)).toBe("Focused evidence review (0+)");
    expect(focusedReviewTitle(1, false)).toBe("Focused evidence review (1)");
    expect(earlierEvidenceLabel()).toBe("Show earlier evidence");
    expect(governanceReceiptRemainder(1)).toBe("Show the other 1 receipt");
    expect(governanceReceiptRemainder(4)).toBe("Show the other 4 receipts");
    expect(source).toContain(
      [
        "communicationTimelineTitle(",
        "                      communicationTimeline.length,",
        "                      communicationHasMore,",
        "                      mailFailed,",
        "                    )",
      ].join("\n"),
    );
    expect(source).toContain(
      "activityHistoryTitle(timeline.length, timelineHasMore, historyFailed)",
    );
    expect(source).toContain("governanceReceiptRemainder(hiddenReceipts)");
    expect(source).toContain("earlierMailLabel()");
    expect(source).toContain("earlierActivityLabel()");
    expect(source).toContain(
      "relationshipChangeTitle(changes.length, changesHasMore, changesFailed)",
    );
    expect(source).toContain("earlierChangesLabel()");
    expect(source).toContain("focusedReviewTitle(items.length, hasMore)");
    expect(source).toContain("earlierEvidenceLabel()");
    expect(source).toContain("onLoadMore={() => void loadEarlierEvidence()}");
    expect(source).toContain("Could not load earlier evidence.");
    expect(source).toContain("Could not load earlier changes.");
    expect(source).toContain("onLoadMore={() => void loadMoreSheetDuplicates()}");
    expect(source).toContain("hasMore={hasMoreSheetDuplicates}");
    expect(source).not.toContain("governanceReceipts.slice(0, 5)");
    expect(source).toContain("Activity history");
    expect(source).toContain("activityLinesBesideSummary(");
    expect(source).toContain("activityEvidenceLines(");
    expect(source).toContain("evidence[observation.id]");
    expect(source).toContain("observation.normalizedFacts");
    expect(source).toContain("activityHeading(observation.source, observation.eventType)");
    expect(source).toContain("activitySourceLabel(item.source)");
    expect(source).toContain("activitySourceLabel(source.source)");
    expect(source).toContain("sourceConnectionLabel(source)");
    expect(source).not.toContain("statuses.slice(0, 4)");
    expect(source).toContain("{statuses.map((source) => (");
    expect(source).toContain("sourceConnectionLabel({\n                    source: item.source,");
    expect(source).toContain("completenessProductLabel(account.completeness)");
    expect(source).toContain("enrichConfirmCopy(");
    expect(enrichConfirmCopy(2, 1, 1.5)).toBe(
      "Fill in 2 companies and 1 person for about $1.50? Only names, company domains, and known employers are sent.",
    );
    expect(enrichConfirmCopy(1, 2, 0.004)).toContain("1 company and 2 people for about less than a cent");
    expect(recommendationPolicyLabel("passed")).toBe("Cleared");
    expect(recommendationPolicyLabel("pending")).toBe("Not checked");
    expect(recommendationPolicyLabel("review_required")).toBe("Review required");
    expect(recommendationPolicyLabel("stale")).toBe("Re-check needed");
    expect(recommendationPolicyLabel("blocked")).toBe("Blocked");
    expect(recommendationApprovalLabel("pending")).toBe("Awaiting approval");
    expect(recommendationApprovalLabel("approved")).toBe("Approved");
    expect(recommendationApprovalLabel("rejected")).toBe("Rejected");
    expect(recommendationApprovalLabel("custom_hold")).toBe("Custom Hold");
    expect(source).toContain("recommendationPolicyLabel(action.policyStatus)");
    expect(source).toContain("recommendationApprovalLabel(action.approvalStatus)");
    expect(source).not.toContain("recommendationStatusLabel(");
    expect(source).toContain("attentionReasonLabel(action.detector)");
    expect(participantRoleLabel("decision_maker")).toBe("Decision maker");
    expect(participantRoleLabel("executive_sponsor")).toBe("Executive sponsor");
    expect(participantRoleLabel("primary_contact")).toBe("Primary contact");
    expect(participantRoleLabel("former_contact")).toBe("Former contact");
    expect(participantRoleLabel("champion")).toBe("Champion");
    expect(source).toContain("participantRoleLabel(participant.role)");
    expect(source).toContain("personSeniorityLabel(person.seniority)");
    expect(source).toContain("personFactValue(attribute.dimension, attribute.value)");
    expect(source).not.toContain("${participant.role}");
    expect(source).toContain("personEvidenceLabel(attribute.dimension)");
    expect(source).not.toContain("{action.policyStatus}");
    expect(source).not.toContain("{action.approvalStatus}");
    expect(source).not.toContain("window.confirm");
    expect(source).not.toContain('humanize(account?.status || "not_connected")');
    expect(source).not.toContain("humanize(account.completeness)");
    expect(source).not.toContain("{source.source} · {source.status}");
    expect(source).toContain("mailAccessReason(item.access.reason)");
    expect(source).not.toContain("JSON.stringify(evidence[observation.id]");
    expect(source).toContain("removePersonConfirmCopy(name)");
    expect(source).toContain("Confirm remove");
    expect(source).not.toContain("window.confirm(\n                                        `Remove ${participant.displayName}");
    expect(source).not.toContain("{observation.source} · {humanize(observation.eventType)}");
    expect(source).not.toContain("{humanize(observation.source)} · {humanize(observation.eventType)}");
    expect(source).not.toContain("{humanize(item.access.reason)}");
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
    expect(duplicateInboxLabel(50, true)).toBe("50+ possible duplicates");
    expect(duplicateInboxLabel(51, false)).toBe("51 possible duplicates");
    expect(duplicateInboxLabel(1, false)).toBe("1 possible duplicate");
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
    expect(
      identityMatchDetail({
        anchorKind: "resource_ref",
        anchorProvider: "hubspot",
        anchorPreview: "hubspot:company:123",
      }),
    ).toBe("Matched on a linked record from HubSpot: hubspot:company:123");
    expect(identityAnchorKindLabel("resource_ref")).toBe("a linked record");
    expect(identityImpactLabel("assertions", 1)).toBe("1 saved detail");
    expect(identityImpactLabel("observations", 2)).toBe("2 recorded events");
    expect(identityImpactLabel("participants", 1)).toBe("1 person");
    expect(identityImpactLabel("evidence", 2)).toBe("2 supporting records");
    expect(identityImpactLabel("commitments", 1)).toBe("1 promise");
    expect(identityImpactLabel("commitments", 4)).toBe("4 promises");
    expect(identityDecisionLabel("keep_separate")).toBe("Keep separate");
    expect(identityDecisionLabel("move_evidence")).toBe("Move the evidence");
    expect(identityDecisionLabel("defer")).toBe("Decide later");
    expect(source).toContain("identityImpactLabel(kind, Number(count))");
    expect(source).toContain("identityDecisionLabel(decision)");
    expect(source).toContain("setReviewError(message)");
    expect(source).toContain("Could not save this review. Refresh and try again.");
    expect(source).not.toContain("{count} {humanize(kind)}");
    expect(source).not.toContain("relationshipLabel(decision)");
  });
});
