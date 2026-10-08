package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// documentedObservationContentHash is observationContentHash for the Gmail
// observation sample: the published summary, facts {"adapter":"gmail"}, and a
// sealed payload of JSON null. Mission Control copies this value as stored.
const documentedObservationContentHash = "c649f448e463924ae2a0923fcc6d409bc5a808004027b16bfbea961336650984"

// Support references are diagnosticRef: kind, then sha256, then 24 hex
// characters of sha256("tfa-"+kind+":"+id). These use the published workspace
// id, the published connection id, and that connection's Google account.
const (
	documentedWorkspaceSupportRef     = "workspace:sha256:1d811ce10de82ecb6ed8274b"
	documentedConnectionSupportRef    = "connection:sha256:da73462ccdf527f07099a17f"
	documentedSourceAccountSupportRef = "source-account:sha256:24021bb72aca268d3989017b"
)

// documentedDeletionVerificationHash is deletionVerificationHash for the
// published request id, the api_evidence target, and zero affected records.
// The server still records that target as deleted.
const documentedDeletionVerificationHash = "sha256:5c15791fbeefd579cf530b240c1a3d5eec1d94058e045c8a4eadf0d1385ebfbf"

// documentedActionRevisionHash is RevisionContent.Hash for the published warm
// follow-up draft, assigned to the documented signed-in user.
const documentedActionRevisionHash = "sha256:746c1d9cd3925b8e632fc1b4bd539758514cb1aefdf31948fe8d1b45ce74c29d"

// The commitment register records an acceptance with this key. An omitted
// evidence list is stored as user-transition plus that key.
const (
	documentedQueueAcceptKey      = "commitment-queue:accepted:8b8dfa9b-a7b2-46ea-982c-622a914c00e5:v3"
	documentedQueueAcceptReason   = "Reviewed from the Commitment Queue (accepted)."
	documentedQueueAcceptEvidence = "user-transition:" + documentedQueueAcceptKey
)

// The identity inbox sends a new UUID for each decision and this reason when
// the review box is empty.
const (
	documentedIdentityDecisionKey    = "cb8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedIdentityDecisionReason = "Reviewed in the identity inbox: merge."
)

// The shared plan page sends a new UUID for each response. A plan item id is
// the accepted commitment id with an item prefix.
const (
	documentedPlanResponseID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanItemID     = "item:8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
)

// The company page sends a new UUID for each conversation deletion. The server
// stores that same id as the receipt.
const documentedDeletionRequestID = "eb8dfa9b-a7b2-46ea-982c-622a914c00e5"

// Focused review sends these reasons for every correction and every decision.
const (
	documentedConversationCorrectionReason = "User corrected conversation evidence during focused review."
	documentedConversationDecisionReason   = "User decided a proposed conversation change."
)

// Propose follow-up on the company node sends a task. The label is the
// published relationship name, and the body is that relationship's summary.
const (
	documentedGraphFollowUpReason  = "Follow up on company: Jordan Buyer"
	documentedGraphFollowUpMessage = "Asked for pricing in April; wants a follow-up in July."
)

// The queue Dismiss button sends this reason, and the server stores it on the action.
const documentedQueueDismissReason = "not_relevant"

// Confirm reject sends this reason when the optional box is empty.
const documentedRejectReason = "not_appropriate"

// Portfolio attention Acknowledge sends this reason, and the server stores it as stateReason.
const documentedAttentionAcknowledgeReason = "Reviewed from the portfolio attention queue."

// Confirm remove sends this reason. The server stores it on the deletion receipt.
const documentedPersonRemovalReason = "user_action"

const documentedPersonID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"
const documentedPersonRemovalReceiptID = "fb8dfa9b-a7b2-46ea-982c-622a914c00e5"

// Fill in companies and people posts these pending ids, companies first.
const documentedResearchCompanyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
const documentedResearchPersonID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"

// Revenue memory and outbound governance surface (RFC 030). Always mounted;
// without a configured facade the workspace runs in local mode (observation
// and drafts work, preflight and sends fail closed).

const (
	graphExecutionStatusDescription = "Needs reconcile when this execution is ambiguous."
	graphExecutionStatusExample     = "ambiguous"
)

const (
	conversationObservationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	conversationClaimID       = "claim-risk"
	conversationExternalID    = "oppulence:session-42"
	conversationSourceVersion = "fingerprint-1"
)

// conversationReviewItemID matches reviewItemID: review: plus the first 8 bytes
// of sha256(observationID:claimID:kind).
func conversationReviewItemID(observationID, claimID, kind string) string {
	sum := sha256.Sum256([]byte(observationID + ":" + claimID + ":" + kind))
	return "review:" + hex.EncodeToString(sum[:8])
}

// conversationReviewBatchID matches the review batch: review: plus the first 12
// bytes of sha256(externalID:sourceVersion:conversation-review-v1).
func conversationReviewBatchID(externalID, sourceVersion string) string {
	sum := sha256.Sum256([]byte(externalID + ":" + sourceVersion + ":conversation-review-v1"))
	return "review:" + hex.EncodeToString(sum[:12])
}

// conversationPolicyLayerExample matches the builtin layer hashed by
// resolveConversationPolicyLayers. Field order is the stored JSON order.
type conversationPolicyLayerExample struct {
	LayerID          string   `json:"layerId"`
	Scope            string   `json:"scope"`
	Enforced         bool     `json:"enforced"`
	Capture          string   `json:"capture"`
	ModelRoute       string   `json:"modelRoute"`
	PublishEvidence  bool     `json:"publishEvidence"`
	ExternalShare    bool     `json:"externalShare"`
	RetentionDays    int      `json:"retentionDays"`
	RedactionClasses []string `json:"redactionClasses"`
	LegalHold        bool     `json:"legalHold"`
}

func builtinConversationPolicyVersion() string {
	payload, _ := json.Marshal([]conversationPolicyLayerExample{{
		LayerID: "builtin:conversation-policy-v1", Scope: "organization", Enforced: true,
		Capture: "require_consent", ModelRoute: "hosted_allowed", PublishEvidence: true,
		ExternalShare: true, RetentionDays: 30,
		RedactionClasses: []string{"credentials", "financial", "health", "personal_identifier"},
	}})
	sum := sha256.Sum256(payload)
	return "policy:" + hex.EncodeToString(sum[:12])
}

// documentedRelationshipStateHash is the projector digest of the
// RevenueRelationship sample: projector version 2 and no winning assertions.
// A review acknowledgement is stored only when this value matches.
const documentedRelationshipStateHash = "sha256:454f195e2389d36fd49e5c9b9656b7b47a3629332a84eb570edf3fa5248851e1"

func addRevenueSchemas(schemas obj) {
	schemas["RevenueWorkspace"] = objectSchema("Mapping between the Rowboat tenant and the canonical OutboundConsole workspace. Local mode has no link: observation and draft-only execution work while preflight and sends stay disabled.", obj{
		"id":                     uuidSchema("Workspace id.", "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"mode":                   stringEnum("Workspace mode.", "local", "local", "linked"),
		"status":                 stringEnum("Link health.", "active", "active", "disconnected", "repair_required"),
		"outboundOrganizationId": stringSchema("OutboundConsole organization id.", "org_01ABC"),
		"outboundWorkspaceId":    stringSchema("OutboundConsole workspace id.", "ws_01ABC"),
		"lastVerifiedAt":         stringSchema("When the link was last verified.", "2026-07-12T12:00:00Z", obj{"format": "date-time"}, nullable()),
		"preflightAvailable":     boolSchema("Whether policy preflight can run (linked and active).", false),
	}, "id", "mode", "status", "preflightAvailable")

	schemas["RevenueRelationship"] = objectSchema("Canonical, living relationship state projected from append-only evidence. CRM and communication systems remain evidence sources; this object is the shared model rendered by web and desktop.", obj{
		"id":                    uuidSchema("Relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"kind":                  stringEnum("Relationship kind.", "person", "person", "company", "customer", "opportunity", "referral", "partner"),
		"displayName":           stringSchema("Human display name.", "Jordan Buyer"),
		"primaryEmail":          stringSchema("Primary email address.", "buyer@example.com"),
		"accountDomain":         stringSchema("Account domain.", "example.com"),
		"summary":               stringSchema("Bounded relationship summary.", documentedGraphFollowUpMessage),
		"status":                stringEnum("Lifecycle status.", "active", "active", "dormant", "closed", "archived"),
		"lastTouchAt":           stringSchema("Last observed touch.", "2026-04-10T15:00:00Z", obj{"format": "date-time"}, nullable()),
		"nextActionAt":          stringSchema("Next planned action.", "2026-07-01T00:00:00Z", obj{"format": "date-time"}, nullable()),
		"openActions":           intSchema("Open queue actions for this relationship.", 1),
		"peopleCount":           intSchema("Active people currently attached to this relationship.", 3),
		"emailThreadCount":      intSchema("Observed email threads currently attached to this relationship.", 12),
		"commitmentCount":       intSchema("Commitments currently recorded on this relationship.", 4),
		"nextAction":            stringSchema("Recommended next action.", "Confirm the security review owner."),
		"lifecycle":             stringEnum("Commercial lifecycle.", "evaluation", "prospect", "evaluation", "contracting", "onboarding", "active_customer", "renewal", "churned", "former_customer"),
		"engagement":            stringEnum("Direction of engagement.", "declining", "unknown", "increasing", "steady", "declining", "dormant"),
		"sentiment":             stringEnum("Observed sentiment.", "mixed", "unknown", "positive", "mixed", "negative"),
		"health":                stringEnum("Explainable health state; never a magic score.", "needs_attention", "unknown", "healthy", "needs_attention", "critical"),
		"stateReason":           stringSchema("Evidence-backed explanation of the projected state.", "Security review was promised, but no owner or meeting exists."),
		"stateVersion":          intSchema("Monotonic projection version.", 4),
		"stateHash":             stringSchema("Stable hash of canonical projected values and winning assertions.", documentedRelationshipStateHash),
		"projectorVersion":      intSchema("Deterministic projector version.", 2),
		"projectedAt":           stringSchema("Explicit evaluation time used by the projector.", "2026-07-25T16:00:00Z", obj{"format": "date-time"}, nullable()),
		"lastChangedAt":         stringSchema("Last material state change.", "2026-07-25T16:00:00Z", obj{"format": "date-time"}, nullable()),
		"risks":                 arraySchema("Current relationship risks.", stringSchema("Risk.", "Security review has no owner.")),
		"milestones":            arraySchema("Reached relationship milestones.", stringSchema("Milestone.", "Proposal shared.")),
		"resourceRefs":          arraySchema("Canonical product:type:externalId references.", stringSchema("Resource reference.", "hubspot:company:123")),
		"categories":            arraySchema("Source-backed company categories.", stringSchema("Category.", "Artificial intelligence")),
		"companyDescription":    stringSchema("Source-backed company description.", "Builds AI infrastructure for customer operations."),
		"linkedinUrl":           stringSchema("Verified public LinkedIn company URL.", "https://www.linkedin.com/company/acme"),
		"companyEnrichmentRefs": freeFormSchema("Citation URLs keyed by enriched company field."),
		"companyEnrichmentData": freeFormSchema("Cited public-web company facts keyed by enrichment field."),
		"companyEnrichedAt":     stringSchema("When the company profile was last enriched.", "2026-09-06T08:00:00Z", obj{"format": "date-time"}, nullable()),
	}, "id", "kind", "displayName", "status", "lifecycle", "engagement", "sentiment", "health", "stateVersion", "projectorVersion", "risks", "milestones", "resourceRefs", "categories")

	schemas["RelationshipParticipant"] = objectSchema("A person participating in the relationship, resolved across provider identities.", obj{
		"id":           uuidSchema("Participant id.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"displayName":  stringSchema("Display name.", "Avery Chen"),
		"email":        stringSchema("Normalized email.", "avery@acme.com"),
		"role":         stringSchema("Relationship role.", "champion"),
		"title":        stringSchema("Current title.", "VP Operations"),
		"active":       boolSchema("Whether the participant is active.", true),
		"externalRefs": arraySchema("Provider identity references.", stringSchema("External reference.", "hubspot:contact:123")),
	}, "id", "displayName", "role", "active", "externalRefs")

	schemas["RelationshipCommitment"] = objectSchema("An open or completed promise attached to the relationship.", obj{
		"id":                         uuidSchema("Commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"direction":                  stringEnum("Who owes the commitment.", "promised_by_me", "promised_by_me", "promised_by_them", "mutual"),
		"text":                       stringSchema("Commitment text.", "Send the security packet."),
		"status":                     stringEnum("Stored commitment status.", "open", "open", "fulfilled", "missed", "waived", "cancelled", "superseded"),
		"dueAt":                      stringSchema("Due time.", "2026-07-22T17:00:00Z", obj{"format": "date-time"}, nullable()),
		"confidence":                 numberSchema("Extraction confidence.", 0.94),
		"userConfirmed":              boolSchema("Whether a human confirmed it.", false),
		"ownerParticipantRef":        stringSchema("Promise owner.", "alex@example.com"),
		"counterpartyParticipantRef": stringSchema("Promise counterparty.", "jordan@example.com"),
		"beneficiaryParticipantRef":  stringSchema("Promise beneficiary.", "customer:acme"),
		"sourcePhrase":               stringSchema("Exact source phrase.", "I will send it by Friday."),
		"duePhrase":                  stringSchema("Due condition as stated.", "by Friday"),
		"dueTimezone":                stringSchema("Timezone used to resolve the due date.", "America/Los_Angeles"),
		"acceptance":                 stringEnum("Acceptance state.", "internally_confirmed", "candidate", "internally_confirmed", "offered", "accepted", "disputed"),
		"blocker":                    stringSchema("Current blocker.", "Waiting on security review."),
		"completedAt":                stringSchema("Completion time.", "2026-07-22T17:00:00Z", obj{"format": "date-time"}, nullable()),
		"currentEventVersion":        intSchema("Current transition version.", 3),
	}, "id", "direction", "text", "status", "confidence", "userConfirmed")
	schemas["CommitmentRegisterEntry"] = obj{
		"description": "One cross-account register row with its reader-facing state and account.",
		"allOf": []any{
			ref("RelationshipCommitment"),
			objectSchema("Register projection.", obj{
				"state":            stringEnum("Reader-facing state.", "at_risk", "open", "at_risk", "met", "missed", "waived", "disputed", "cancelled", "superseded"),
				"relationshipId":   uuidSchema("Counterparty relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
				"relationshipName": stringSchema("Counterparty account.", "Acme"),
			}, "state"),
		},
	}
	schemas["CommitmentDependency"] = objectSchema("An evidence-backed directed edge between two commitments.", obj{
		"dependencyId":     uuidSchema("Dependency id.", "3b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"relationshipId":   uuidSchema("Relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"fromCommitmentId": uuidSchema("Origin commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"toCommitmentId":   uuidSchema("Target commitment id.", "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51"),
		"kind":             stringEnum("Dependency semantics.", "blocks", "blocks", "requires", "supersedes"),
		"evidenceRefs":     arraySchema("Evidence references.", stringSchema("Reference.", "relationship-observation:ab12")),
		"createdAt":        stringSchema("Creation time.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}),
	}, "dependencyId", "relationshipId", "fromCommitmentId", "toCommitmentId", "kind", "evidenceRefs", "createdAt")
	eventObservationID := "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	eventEvidence := arraySchema("Exact evidence references.", stringSchema("Reference.", "relationship-observation:"+eventObservationID))
	eventEvidence["example"] = []any{"relationship-observation:" + eventObservationID}
	schemas["CommitmentEvent"] = objectSchema("One immutable event in a commitment transition stream.", obj{
		"eventId":                    uuidSchema("Event id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"commitmentId":               uuidSchema("Commitment id.", "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51"),
		"sourceEventId":              stringSchema("Idempotent source event id.", "user-accept:commitment-1"),
		"version":                    obj{"type": "integer", "minimum": 1},
		"kind":                       stringEnum("Transition kind.", "accepted", "proposed", "internally_confirmed", "offered", "accepted", "disputed", "blocked", "unblocked", "corrected", "due_date_changed", "renegotiated", "fulfilled", "missed", "waived", "cancelled", "superseded"),
		"actorType":                  stringEnum("Transition authority.", "user", "user", "source_fact", "deterministic_rule", "ai_candidate"),
		"actorRef":                   stringSchema("User who recorded this change.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"),
		"occurredAt":                 stringSchema("Event time.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}),
		"sourceObservationId":        stringSchema("Source observation id.", eventObservationID),
		"evidenceRefs":               eventEvidence,
		"ownerParticipantRef":        stringSchema("Promise owner.", "alex@example.com"),
		"counterpartyParticipantRef": stringSchema("Promise counterparty.", "jordan@example.com"),
		"beneficiaryParticipantRef":  stringSchema("Promise beneficiary.", "customer:acme"),
		"action":                     stringSchema("Promised action at this event.", "Send the security packet."),
		"duePhrase":                  stringSchema("Original due phrase.", "by Friday"),
		"dueAt":                      stringSchema("Resolved due time.", "2026-08-07T17:00:00Z", obj{"format": "date-time"}),
		"dueTimezone":                stringSchema("Due-time timezone.", "America/New_York"),
		"blocker":                    stringSchema("Blocker detail.", "Waiting on legal."),
		"reason":                     stringSchema("Transition rationale.", "Counterparty accepted in writing."),
		"supersedesCommitmentId":     uuidSchema("Superseded commitment id.", "a13cf25b-d195-45f3-a665-3a38ba575392"),
	}, "eventId", "commitmentId", "sourceEventId", "version", "kind", "actorType", "occurredAt", "evidenceRefs")

	schemas["RelationshipObservation"] = objectSchema("Immutable, idempotent provider evidence used to project relationship state.", obj{
		"id":              uuidSchema("Observation id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"source":          stringSchema("Evidence source.", "gmail"),
		"sourceAccountId": stringSchema("Provider account id.", "me@company.com"),
		"externalId":      stringSchema("Provider event id.", "message-123"),
		"sourceVersion":   stringSchema("Provider event version.", "1"),
		"eventType":       stringSchema("Normalized event type.", "commitment_created"),
		"occurredAt":      stringSchema("Provider occurrence time.", "2026-07-18T17:30:00Z", obj{"format": "date-time"}),
		"receivedAt":      stringSchema("Ingestion time.", "2026-07-18T17:31:00Z", obj{"format": "date-time"}),
		"summary":         stringSchema("Bounded evidence summary.", "We promised to send the security packet."),
		"normalizedFacts": obj{"type": "object", "description": "Provider-neutral normalized facts.", "additionalProperties": true, "example": obj{"adapter": "gmail"}},
		"contentHash":     stringSchema("Hash of summary, facts, and sealed payload.", documentedObservationContentHash),
	}, "id", "source", "externalId", "sourceVersion", "eventType", "occurredAt", "receivedAt", "normalizedFacts", "contentHash")

	assertionIDs := arraySchema("Assertions selected by deterministic precedence.", stringSchema("Assertion id.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	assertionIDs["example"] = []any{"7b8dfa9b-a7b2-46ea-982c-622a914c00e5"}
	schemas["RelationshipStateSnapshot"] = objectSchema("Immutable projection snapshot created only when material relationship state changes.", obj{
		"id":                uuidSchema("Snapshot id.", "5b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"version":           intSchema("Relationship state version.", 4),
		"state":             freeFormSchema("Projected state at this version."),
		"stateHash":         stringSchema("Stable hash of canonical state and winning assertions.", documentedRelationshipStateHash),
		"projectorVersion":  intSchema("Projector version used for this snapshot.", 1),
		"evaluatedAt":       stringSchema("Explicit evaluation time used by the projector.", "2026-07-25T16:00:00Z", obj{"format": "date-time"}),
		"changedDimensions": arraySchema("Material dimensions that changed.", stringSchema("Dimension.", "health")),
		"assertionIds":      assertionIDs,
		"createdAt":         stringSchema("Snapshot creation time.", "2026-07-25T16:00:00Z", obj{"format": "date-time"}),
	}, "id", "version", "state", "stateHash", "projectorVersion", "evaluatedAt", "changedDimensions", "assertionIds", "createdAt")

	schemas["RelationshipSourceStatus"] = objectSchema("User-facing authorization, backfill, freshness, repair, revocation, and disconnect state for one stable provider connection. Tokens and raw cursors are never returned.", obj{
		"connectionId":           uuidSchema("Stable source connection id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"source":                 stringEnum("Source provider.", "google", "google", "slack", "hubspot"),
		"sourceAccountId":        stringSchema("Provider account or workspace id.", "me@company.com"),
		"consentingActorId":      uuidSchema("User who connected this source.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"),
		"status":                 stringEnum("Connection lifecycle.", "live", "not_connected", "authorizing", "connected", "backfilling", "live", "degraded", "stale", "rebuilding", "reconnect_required", "disconnected"),
		"backfillPhase":          stringEnum("Backfill phase.", "live", "idle", "queued", "running", "live", "paused", "failed"),
		"backfillCompleted":      intSchema("Accepted backfill records.", 250),
		"backfillTotal":          intSchema("Known backfill total, zero when unknown.", 1000),
		"completeness":           stringEnum("Impact on relationship completeness.", "partial", "complete", "partial", "stale", "rebuilding", "disconnected"),
		"expectedCadenceSeconds": intSchema("Expected live-sync cadence.", 900),
		"lagSeconds":             intSchema("Calculated sync lag.", 42),
		"requiredScopes":         arraySchema("Scopes required by enabled capabilities.", stringSchema("Scope.", "https://www.googleapis.com/auth/gmail.readonly")),
		"grantedScopes":          arraySchema("Currently granted scopes.", stringSchema("Scope.", "https://www.googleapis.com/auth/gmail.readonly")),
		"missingScopes":          arraySchema("Missing or revoked required scopes.", stringSchema("Scope.", "https://www.googleapis.com/auth/gmail.readonly")),
		"errorCode":              stringSchema("Categorical safe error code.", "rate_limited"),
		"retryCount":             intSchema("Bounded retry count.", 2),
		"nextRetryAt":            stringSchema("Next retry.", "2026-07-31T14:05:00Z", obj{"format": "date-time"}, nullable()),
		"authorizationStartedAt": stringSchema("Authorization start.", "2026-07-31T13:00:00Z", obj{"format": "date-time"}, nullable()),
		"authorizedAt":           stringSchema("Authorization completion.", "2026-07-31T13:01:00Z", obj{"format": "date-time"}, nullable()),
		"syncStartedAt":          stringSchema("Backfill start.", "2026-07-31T13:01:00Z", obj{"format": "date-time"}, nullable()),
		"backfillCompletedAt":    stringSchema("Backfill completion.", "2026-07-31T13:10:00Z", obj{"format": "date-time"}, nullable()),
		"lastProviderEventAt":    stringSchema("Newest provider event observed.", "2026-07-31T13:58:00Z", obj{"format": "date-time"}, nullable()),
		"lastObservationAt":      stringSchema("Newest accepted observation.", "2026-07-31T13:58:00Z", obj{"format": "date-time"}, nullable()),
		"lastSyncAt":             stringSchema("Most recent sync attempt.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"lastSuccessAt":          stringSchema("Most recent successful sync.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"lastFailedSyncAt":       stringSchema("Most recent failed sync.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"disconnectedAt":         stringSchema("User disconnect time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"revokedAt":              stringSchema("Provider revocation time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"lastError":              stringSchema("Bounded, user-safe error summary.", "Provider synchronization is delayed."),
	}, "connectionId", "source", "sourceAccountId", "status", "backfillPhase", "backfillCompleted", "backfillTotal", "completeness", "expectedCadenceSeconds", "lagSeconds", "requiredScopes", "grantedScopes", "missingScopes", "retryCount")

	schemas["RelationshipSourceInventoryItem"] = objectSchema("Guided source card with consent explanation, supported evidence/actions, and every connected account.", obj{
		"source":                 stringEnum("Source provider.", "google", "google", "slack", "hubspot"),
		"displayName":            stringSchema("Provider display name.", "Google Gmail & Calendar"),
		"evidence":               arraySchema("Evidence contributed.", stringSchema("Evidence category.", "email_threads")),
		"actions":                arraySchema("Approval-gated actions supported.", stringSchema("Action category.", "gmail_send")),
		"readScopes":             arraySchema("Progressive read scopes.", stringSchema("Scope.", "https://www.googleapis.com/auth/gmail.readonly")),
		"writeScopes":            arraySchema("Progressive action scopes.", stringSchema("Scope.", "gmail.send")),
		"scopeExplanation":       stringSchema("Why the scopes are requested.", "Read scopes build relationship history."),
		"connectPath":            stringSchema("Managed connection entry path.", "/v1/google-oauth/start"),
		"disconnectPath":         stringSchema("Credential disconnect path.", "/v1/google-oauth"),
		"supportsReconnect":      boolSchema("Whether reconnect is supported.", true),
		"supportsResync":         boolSchema("Whether resync is supported.", true),
		"expectedCadenceSeconds": intSchema("Expected cadence.", 900),
		"accounts":               arraySchema("Provider accounts.", ref("RelationshipSourceStatus")),
	}, "source", "displayName", "evidence", "actions", "readScopes", "writeScopes", "scopeExplanation", "connectPath", "disconnectPath", "supportsReconnect", "supportsResync", "expectedCadenceSeconds", "accounts")

	schemas["RelationshipIdentityDecision"] = objectSchema("Immutable actor-bound identity decision.", obj{
		"id": uuidSchema("Decision id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "decision": stringSchema("Decision kind.", "merge"),
		"candidateVersion": intSchema("Candidate version decided.", 1), "actorId": uuidSchema("User who made this decision.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"),
		"reason": stringSchema("Decision reason.", "Confirmed the provider records are the same account."), "decidedAt": stringSchema("Decision time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"compensatesDecisionId": uuidSchema("Decision compensated by undo.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
	}, "id", "decision", "candidateVersion", "actorId", "decidedAt")
	movedObservations := arraySchema("Moved observation ids.", stringSchema("Observation id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	movedObservations["example"] = []any{"6b8dfa9b-a7b2-46ea-982c-622a914c00e5"}

	movedObjects := arraySchema("All moved graph objects.", stringSchema("Object ref.", "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	movedObjects["example"] = []any{"relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"}

	movedIdentities := arraySchema("Affected identity ids.", stringSchema("Identity id.", "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	movedIdentities["example"] = []any{"1b8dfa9b-a7b2-46ea-982c-622a914c00e5"}
	schemas["RelationshipIdentityLineage"] = objectSchema("Immutable graph lineage produced by an identity decision.", obj{
		"id": uuidSchema("Lineage event id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "kind": stringSchema("Lineage kind.", "merged"),
		"actorId": uuidSchema("User who recorded this change.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"), "reason": stringSchema("Reason.", "Confirmed duplicate."),
		"observationIds":        arraySchema("Moved observation ids.", stringSchema("Observation id.", "observation:1")),
		"identityIds":           movedIdentities,
		"movedObjectRefs":       arraySchema("All moved graph objects.", stringSchema("Object ref.", "relationship-observation:1")),
		"beforeRelationshipIds": withExample(arraySchema("Relationship ids before.", stringSchema("Relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5")), []any{"9c8dfa9b-a7b2-46ea-982c-622a914c00e5", "3a196c5e-b10e-46cb-a177-7c001f7be573"}),
		"afterRelationshipIds":  withExample(arraySchema("Relationship ids after.", stringSchema("Relationship id.", "3a196c5e-b10e-46cb-a177-7c001f7be573")), []any{"3a196c5e-b10e-46cb-a177-7c001f7be573"}),
		"occurredAt":            stringSchema("Event time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
	}, "id", "kind", "actorId", "observationIds", "identityIds", "movedObjectRefs", "beforeRelationshipIds", "afterRelationshipIds", "occurredAt")
	reviewEvidence := arraySchema("Evidence references.", stringSchema("Evidence ref.", "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	reviewEvidence["example"] = []any{"relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"}
	schemas["RelationshipIdentityCandidate"] = objectSchema("Durable, optimistic-versioned exact-anchor ambiguity review.", obj{
		"id": uuidSchema("Candidate id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "status": stringEnum("Review state.", "pending", "pending", "deferred", "resolving", "resolved", "undone"),
		"candidateType": stringSchema("Candidate kind.", "anchor_collision"), "version": intSchema("Optimistic version.", 1),
		"proposedRelationship": ref("RevenueRelationship"), "existingRelationship": ref("RevenueRelationship"),
		"anchorKind": stringSchema("Exact anchor kind.", "provider_resource"), "anchorProvider": stringSchema("Provider.", "hubspot"), "anchorPreview": stringSchema("Redacted anchor preview.", "contact …123"),
		"matchingAnchors": arraySchema("Matching exact anchors.", stringSchema("Anchor.", "hubspot:contact:123")), "conflictingAnchors": arraySchema("Conflicting anchors.", stringSchema("Anchor.", "email:other@example.com")),
		"evidenceRefs": reviewEvidence, "evidenceCount": intSchema("Affected evidence count.", 4),
		"evidenceFrom": stringSchema("Earliest evidence.", "2026-01-01T00:00:00Z", obj{"format": "date-time"}, nullable()), "evidenceTo": stringSchema("Latest evidence.", "2026-07-31T00:00:00Z", obj{"format": "date-time"}, nullable()),
		"impact": freeFormSchema("Counts and history that would move."), "recommendedDecision": stringSchema("Advisory decision.", "merge"), "recommendationConfidence": numberSchema("Advisory confidence.", 0.92),
		"decision": stringSchema("Resolved decision.", "merge"), "decisionReason": stringSchema("Reason.", "Confirmed duplicate."), "decisionActorId": uuidSchema("User who resolved this review.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"), "decidedAt": stringSchema("Decision time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"decisions": arraySchema("Decision history.", ref("RelationshipIdentityDecision")), "lineage": arraySchema("Lineage history.", ref("RelationshipIdentityLineage")),
	}, "id", "status", "candidateType", "version", "proposedRelationship", "existingRelationship", "anchorKind", "matchingAnchors", "conflictingAnchors", "evidenceRefs", "evidenceCount", "impact", "recommendedDecision", "recommendationConfidence", "decisions", "lineage")

	attentionEvidence := arraySchema("Evidence refs.", stringSchema("Evidence ref.", "revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"))
	attentionEvidence["example"] = []any{"revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"}
	schemas["RelationshipAttentionItem"] = objectSchema("Versioned relationship-native reason for portfolio attention.", obj{
		"id": uuidSchema("Attention id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "version": intSchema("Optimistic version.", 1),
		"relationshipId": uuidSchema("Relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"), "relationshipName": stringSchema("Relationship name.", "Acme"),
		"reasonCode": stringSchema("Detector reason.", "overdue_commitment"), "explanation": stringSchema("Readable explanation.", "A confirmed promise is overdue by two days."),
		"triggeringObjectRef": stringSchema("Triggering object.", "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "evidenceRefs": arraySchema("Evidence refs.", stringSchema("Evidence ref.", "relationship-observation:1")),
		"urgencyBand": stringEnum("Urgency.", "high", "low", "normal", "high", "critical"), "rankScore": intSchema("Internal deterministic rank.", 82), "rankFactors": freeFormSchema("Readable factor contributions."),
		"sourceRequirements": arraySchema("Fresh sources required.", stringSchema("Source.", "google")), "recommendationId": uuidSchema("Recommendation id.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "recommendationRevision": intSchema("Recommendation revision.", 2),
		"ownerId": uuidSchema("Assigned user id.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"), "status": stringEnum("Triage state.", "open", "open", "acknowledged", "snoozed", "dismissed", "superseded", "resolved"), "stateReason": stringSchema("Why this item was acknowledged, snoozed, or dismissed. Empty while it is still open.", nil),
		"snoozedUntil": stringSchema("Snooze time.", "2026-08-07T14:00:00Z", obj{"format": "date-time"}, nullable()), "expiresAt": stringSchema("Expiry time.", "2026-08-07T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"detectorVersion": intSchema("Detector version.", 1), "projectorVersion": intSchema("Projector version.", 1), "relationshipStateVersion": intSchema("Relationship version evaluated.", 4),
		"acknowledgedBy": stringSchema("User who acknowledged this item. Empty until it is acknowledged.", nil, obj{"format": "uuid"}, nullable()), "acknowledgedAt": stringSchema("When this item was acknowledged. Empty until then.", nil, obj{"format": "date-time"}, nullable()),
		"dismissedBy": stringSchema("User who dismissed this item. Empty until it is dismissed.", nil, obj{"format": "uuid"}, nullable()), "dismissedAt": stringSchema("When this item was dismissed. Empty until then.", nil, obj{"format": "date-time"}, nullable()),
		"createdAt": stringSchema("Created time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}), "updatedAt": stringSchema("Updated time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
	}, "id", "version", "relationshipId", "relationshipName", "reasonCode", "explanation", "triggeringObjectRef", "evidenceRefs", "urgencyBand", "rankScore", "rankFactors", "sourceRequirements", "status", "detectorVersion", "projectorVersion", "relationshipStateVersion", "createdAt", "updatedAt")

	schemas["MissionControlEvidenceReference"] = objectSchema("Immutable evidence supporting one projected relationship dimension.", obj{
		"observationId": uuidSchema("Observation id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"source":        stringSchema("Canonical source.", "hubspot"),
		"observedAt":    stringSchema("Source occurrence time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"evidencePath":  stringSchema("Authorized evidence inspection path.", "/v1/relationships/9c8dfa9b-a7b2-46ea-982c-622a914c00e5/evidence/6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"contentHash":   stringSchema("Immutable observation content hash.", documentedObservationContentHash),
	}, "observationId", "source", "observedAt", "evidencePath", "contentHash")

	schemas["MissionControlDimensionEvidence"] = objectSchema("Winning typed assertion, authority decision, validity, and evidence for one projected dimension.", obj{
		"dimension": stringSchema("Projected dimension.", "health"), "value": obj{
			"description": "Typed projected value. Scalar dimensions return a string; risk and milestone return string arrays.",
			"nullable":    true,
			"oneOf": []any{
				stringSchema("Scalar projected value.", "needs_attention"),
				arraySchema("Collection projected value.", stringSchema("Projected list item.", "Security review is blocked.")),
			},
		},
		"supported": boolSchema("Whether accessible evidence supports the value.", true), "missingReason": stringSchema("Why support is missing.", "No accepted assertion is valid at this boundary."),
		"assertionId": uuidSchema("Winning assertion id.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "authority": stringEnum("Assertion source authority.", "source_fact", "user_correction", "source_fact", "deterministic", "external_research", "ai_inference"),
		"authorityRank": intSchema("Deterministic ordinal authority rank.", 4), "status": stringEnum("Assertion lifecycle state.", "accepted", "proposed", "accepted", "rejected", "superseded", "retracted", "expired", "active"),
		"confidence": numberSchema("Assertion confidence.", 1, obj{"minimum": 0, "maximum": 1}), "reason": stringSchema("Evidence-backed explanation.", "CRM deal stage changed to closed won."),
		"valueSchemaVersion": intSchema("Typed dimension schema version.", 1), "extractorVersion": stringSchema("Extractor or deterministic rule version.", "hubspot-company-v1"),
		"projectorCompatVersion": intSchema("Minimum compatible projector version.", 2), "reviewerId": uuidSchema("User who reviewed this value.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"),
		"reviewDecision": stringEnum("Explicit review decision.", "accepted", "accepted", "rejected"), "reviewedAt": stringSchema("Explicit review time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"validFrom": stringSchema("Assertion validity start.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()), "validTo": stringSchema("Assertion validity end.", "2026-08-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"fresh": boolSchema("Whether supporting sources are fresh and complete.", true), "evidence": arraySchema("Supporting observations.", ref("MissionControlEvidenceReference")),
	}, "dimension", "supported", "fresh", "evidence")

	schemas["MissionControlReadModel"] = objectSchema("One server-owned, version-consistent answer to state, change, evidence, action, completeness, and control.", obj{
		"contractVersion": stringSchema("Read-contract version.", "tfa-r1.1-2026-08-26"), "aggregateHash": stringSchema("Stable hash of every material answer in this aggregate.", "sha256:cd34"), "asOf": stringSchema("Explicit response boundary.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"stateVersion": intSchema("Relationship state version.", 4), "stateHash": stringSchema("Stable state hash.", documentedRelationshipStateHash), "projectorVersion": intSchema("Projector version.", 1), "detectorVersion": intSchema("Detector version.", 1),
		"freshnessBoundary": stringSchema("Earliest source freshness boundary.", "2026-07-31T14:30:00Z", obj{"format": "date-time"}, nullable()), "previousReviewedStateVersion": intSchema("Last acknowledged version.", 3), "changedSinceReview": boolSchema("Whether material state changed.", true),
		"changes": arraySchema("Dimension-level changes.", freeFormSchema("Mission Control change.")), "evidence": obj{"type": "object", "description": "Dimension-keyed winning typed assertions and evidence references.", "additionalProperties": ref("MissionControlDimensionEvidence")},
		"completeness": freeFormSchema("Source coverage, missing dimensions, ambiguity, and external-action safety."), "activeRecommendation": freeFormSchema("Active revision-bound recommendation and factors."),
		"pending": freeFormSchema("Pending correction, identity, approval, execution, and reconciliation counts."), "capabilities": freeFormSchema("Authorized operation links."),
	}, "contractVersion", "aggregateHash", "asOf", "stateVersion", "stateHash", "projectorVersion", "detectorVersion", "previousReviewedStateVersion", "changedSinceReview", "changes", "evidence", "completeness", "pending", "capabilities")

	schemas["BetaDiagnostics"] = objectSchema("Metadata-only support export. It excludes relationship names, addresses, evidence, action bodies, tokens, cursors, raw errors, and correlation identifiers.", obj{
		"schemaVersion": stringSchema("Diagnostics contract version.", "tfa-support-v1"),
		"generatedAt":   stringSchema("Generation time.", "2026-08-01T15:00:00Z", obj{"format": "date-time"}),
		"workspaceRef":  stringSchema("One-way workspace support reference.", documentedWorkspaceSupportRef),
		"features": arraySchema("Workspace rollout controls.", objectSchema("Feature diagnostic.", obj{
			"capability": stringSchema("Capability id.", "action_gmail"), "enabled": boolSchema("Whether enabled.", false),
			"rolloutStage": stringSchema("Rollout stage.", "internal_read_only"), "reasonCode": stringSchema("Categorical change reason.", "internal_canary"),
		}, "capability", "enabled", "rolloutStage")),
		"sources": arraySchema("Redacted connection lifecycle metadata.", objectSchema("Source diagnostic.", obj{
			"connectionRef": stringSchema("One-way connection support reference.", documentedConnectionSupportRef), "source": stringSchema("Provider.", "google"),
			"sourceAccountRef": stringSchema("One-way provider account support reference.", documentedSourceAccountSupportRef), "status": stringSchema("Lifecycle state.", "degraded"), "completeness": stringSchema("Completeness state.", "stale"),
			"backfillPhase": stringSchema("Backfill phase.", "failed"), "backfillCompleted": intSchema("Completed units.", 20), "backfillTotal": intSchema("Total units.", 100),
			"lagSeconds": intSchema("Current lag.", 900), "missingScopeCount": intSchema("Count only; scope values remain on the user-facing connection card.", 0),
			"errorCode": stringSchema("Safe categorical error.", "provider_outage"), "retryCount": intSchema("Retry attempts.", 2),
		}, "connectionRef", "source", "sourceAccountRef", "status", "completeness", "backfillPhase", "backfillCompleted", "backfillTotal", "lagSeconds", "missingScopeCount", "retryCount")),
		"counts": freeFormSchema("Bounded operational counts keyed by stable category."),
		"trustFunnel": arraySchema("Categorical trust funnel totals.", objectSchema("Trust total.", obj{
			"eventName": stringSchema("Event category.", "mission_control_opened"), "outcome": stringSchema("Outcome category.", "viewed"), "count": intSchema("Total.", 12),
		}, "eventName", "outcome", "count")),
		"checks": arraySchema("Release guardrail checks.", objectSchema("Diagnostic check.", obj{
			"code": stringSchema("Stable check code.", "projection_dead_letter"), "status": stringEnum("Check state.", "pass", "pass", "attention"),
			"explanation": stringSchema("Content-free operator explanation.", "No relationship projection is dead-lettered."), "count": intSchema("Affected objects.", 0),
		}, "code", "status", "explanation", "count")),
	}, "schemaVersion", "generatedAt", "workspaceRef", "features", "sources", "counts", "trustFunnel", "checks")

	schemas["ConversationClaim"] = objectSchema("A material conversation claim anchored to exact words, time, speaker confidence, and capture caveats.", obj{
		"id":                stringSchema("Stable claim id.", conversationClaimID),
		"kind":              stringEnum("Claim kind.", "risk", "risk", "objection", "decision", "milestone", "sentiment", "stakeholder", "lifecycle", "commitment"),
		"value":             stringSchema("Normalized claim value.", "Security review may delay renewal."),
		"exactQuote":        stringSchema("Exact supporting transcript words.", "We are concerned security could delay the renewal."),
		"startMs":           intSchema("Start offset in milliseconds.", 12000),
		"endMs":             intSchema("End offset in milliseconds.", 16000),
		"speakerId":         stringSchema("Meeting-scoped speaker id; never a persistent voiceprint.", "anonymous:remote-channel"),
		"speakerLabel":      stringSchema("Current meeting-scoped speaker label.", "Other"),
		"speakerConfidence": numberSchema("Speaker attribution confidence.", 0.55),
		"confidence":        numberSchema("Claim confidence.", 0.72),
		"captureCaveats":    arraySchema("Capture caveats.", stringSchema("Caveat.", "Remote channel may contain multiple speakers.")),
		"material":          boolSchema("Whether the claim can affect state or action.", true),
		"stateDimension":    stringSchema("Projected state dimension when applicable.", "risk"),
		"observationId":     uuidSchema("Supporting immutable observation.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
	}, "id", "kind", "value", "exactQuote", "startMs", "endMs", "speakerId", "speakerLabel", "speakerConfidence", "confidence", "captureCaveats", "material")

	schemas["ConversationReviewItem"] = objectSchema("One evidence-backed proposed change requiring approve, correct, reject, or defer review.", obj{
		"id":                 stringSchema("Stable review item id.", conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")),
		"kind":               stringEnum("Review kind.", "speaker", "word", "speaker", "entity", "claim", "capture"),
		"label":              stringSchema("Review prompt.", "Resolve the speaker for a material statement."),
		"currentValue":       stringSchema("Current inferred value.", "Other"),
		"confidence":         numberSchema("Current confidence.", 0.55),
		"observationId":      uuidSchema("Supporting observation.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"claimId":            stringSchema("Material claim id.", conversationClaimID),
		"stateDimension":     stringSchema("Canonical state dimension affected by correction.", "risk"),
		"exactQuote":         stringSchema("Exact words under review.", "We are concerned."),
		"batchId":            stringSchema("Idempotent review batch id.", conversationReviewBatchID(conversationExternalID, conversationSourceVersion)),
		"status":             stringEnum("Review state.", "pending_review", "pending_review", "accepted", "corrected", "rejected", "deferred"),
		"before":             freeFormSchema("State pinned before conversation processing."),
		"proposedAfter":      freeFormSchema("Typed proposed value after this item."),
		"caveats":            arraySchema("Extraction and capture caveats.", stringSchema("Caveat.", "Speaker assignment requires review.")),
		"dependentActionIds": arraySchema("Actions invalidated by rejection or correction.", stringSchema("Action id.", "action:ab12")),
		"baselineVersion":    intSchema("Pinned relationship-state version.", 4),
	}, "id", "kind", "label", "currentValue", "confidence", "observationId")

	schemas["ConversationGovernanceReceipt"] = objectSchema("Capture, routing, retention, disclosure, legal-hold, deletion, and evidence-clip receipt stored beside a transcript.", obj{
		"receiptId":             stringSchema("Receipt id.", "governance:session-42:2026-07-31T14:00:00Z"),
		"capturedAt":            stringSchema("Capture time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"capturePolicy":         stringSchema("Capture policy in force.", "manual_capture"),
		"routing":               stringSchema("Evidence routing path.", "local_transcription_to_oppulence"),
		"region":                stringSchema("Processing region or boundary.", "local_device"),
		"retention":             stringSchema("Retention policy.", "untilTranscribed"),
		"participantDisclosure": stringSchema("Recorded participant disclosure status.", "not_recorded"),
		"legalHold":             boolSchema("Whether deletion is blocked by legal hold.", false),
		"deletionOutcome":       stringSchema("Observed deletion outcome.", "scheduled_after_transcription"),
		"evidenceClip":          stringEnum("Material audio evidence status; retained clips may only be encrypted.", "not_retained", "not_retained", "encrypted"),
	}, "receiptId", "capturedAt", "capturePolicy", "routing", "region", "retention", "participantDisclosure", "legalHold", "deletionOutcome", "evidenceClip")

	schemas["ResolvedConversationPolicy"] = objectSchema("Monotonically resolved conversation policy with every contributing layer recorded.", obj{
		"capture":          stringEnum("Capture rule.", "require_consent", "deny", "require_consent", "allow"),
		"modelRoute":       stringEnum("Most permissive model route allowed.", "hosted_allowed", "local_only", "region_restricted", "hosted_allowed"),
		"publishEvidence":  boolSchema("Whether shared evidence publication is allowed.", true),
		"externalShare":    boolSchema("Whether externally scoped plan sharing is allowed.", true),
		"retentionDays":    intSchema("Maximum retention in days.", 30),
		"redactionClasses": arraySchema("Classes removed at outbound boundaries.", stringSchema("Redaction class.", "personal_identifier")),
		"legalHold":        boolSchema("Whether required deletion is blocked.", false),
		"policyVersion":    stringSchema("Hash-bound effective policy version.", builtinConversationPolicyVersion()),
		"sourceLayerIds":   arraySchema("Policy layers that contributed.", stringSchema("Layer id.", "builtin:conversation-policy-v1")),
		"resolvedAt":       stringSchema("Resolution time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
	}, "capture", "modelRoute", "publishEvidence", "externalShare", "retentionDays", "redactionClasses", "legalHold", "policyVersion", "sourceLayerIds", "resolvedAt")

	schemas["ConversationDeletionReceipt"] = objectSchema("Immutable deletion request and per-target verification state. Pending device or provider targets keep the receipt partial.", obj{
		"receiptId":   stringSchema("Idempotent request id.", documentedDeletionRequestID, obj{"format": "uuid"}),
		"requestedAt": stringSchema("Request time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"scopeRef":    stringSchema("Relationship scope.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"legalHold":   boolSchema("Whether legal hold blocked deletion.", false),
		"status":      stringEnum("Aggregate deletion state.", "partial", "pending", "blocked", "partial", "verified"),
		"targets": arraySchema("Per-target outcomes.", objectSchema("Deletion target outcome.", obj{
			"target":           stringEnum("Deletion target.", "api_evidence", "local_recording", "local_note", "outbox", "api_evidence", "embedding", "plan_share", "provider"),
			"status":           stringEnum("Target state.", "deleted", "pending", "deleted", "not_found", "blocked", "failed"),
			"verificationHash": stringSchema("Content-free verification hash.", documentedDeletionVerificationHash),
			"errorCode":        stringSchema("Bounded failure code.", "legal_hold"),
			"attempts":         intSchema("Attempts made.", 1),
		}, "target", "status", "attempts")),
		"completedAt": stringSchema("Time every required target was verified.", "2026-07-31T14:01:00Z", obj{"format": "date-time"}, nullable()),
	}, "receiptId", "requestedAt", "scopeRef", "legalHold", "status", "targets")

	schemas["PersonDeletionReceipt"] = objectSchema("Receipt for removing one person and the rows derived from them. Suppression anchors keep the next sync from recreating that person.", obj{
		"receiptId":               uuidSchema("Receipt id.", documentedPersonRemovalReceiptID),
		"personId":                uuidSchema("Removed person id.", documentedPersonID),
		"requestedAt":             stringSchema("Request time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"completedAt":             stringSchema("Completion time.", "2026-07-31T14:01:00Z", obj{"format": "date-time"}),
		"reason":                  stringEnum("Why this person was removed.", documentedPersonRemovalReason, documentedPersonRemovalReason, "subject_request"),
		"suppressedIdentities":    intSchema("Suppression anchors written.", 1),
		"attributesDeleted":       intSchema("Attribute rows deleted.", 1),
		"identitiesDeleted":       intSchema("Identity rows deleted.", 1),
		"interactionStatsDeleted": intSchema("Interaction stat rows deleted.", 1),
		"mergeCandidatesDeleted":  intSchema("Merge candidates deleted.", 0),
		"personsDeleted":          intSchema("Person rows deleted.", 1),
	}, "receiptId", "personId", "requestedAt", "completedAt", "reason", "suppressedIdentities", "attributesDeleted", "identitiesDeleted", "interactionStatsDeleted", "mergeCandidatesDeleted", "personsDeleted")

	schemas["CloudResearchConsentState"] = objectSchema("Whether this workspace allows public research to send a counterparty name and domain to the research vendor.", obj{
		"consented":   boolSchema("Whether public research is allowed.", true),
		"consentedAt": stringSchema("When public research was allowed. Absent after Turn off.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}, nullable()),
	}, "consented")

	schemas["CompanyResearchOutcome"] = objectSchema("Result of filling in one company from public research.", obj{
		"relationshipId": uuidSchema("Company relationship id.", documentedResearchCompanyID),
		"matched":        boolSchema("Whether the vendor identified the company.", true),
		"written":        intSchema("Details saved.", 1),
		"replayed":       boolSchema("Whether this company was already filled in at the current version.", false),
	}, "relationshipId", "matched", "written", "replayed")
	schemas["PersonResearchOutcome"] = objectSchema("Result of filling in one person from public research.", obj{
		"personId": uuidSchema("Person id.", documentedResearchPersonID),
		"matched":  boolSchema("Whether the vendor identified the person.", true),
		"written":  intSchema("Details saved.", 1),
		"replayed": boolSchema("Whether this person was already filled in at the current version.", false),
	}, "personId", "matched", "written", "replayed")

	schemas["RelationshipIntelligence"] = objectSchema("Derived trust surface for a relationship: conversation claims, focused review, exact delta, governance, contradictions, and live cue cards.", obj{
		"claims":                    arraySchema("Material quote-backed claims.", ref("ConversationClaim")),
		"reviewItems":               arraySchema("Only low-confidence review items.", ref("ConversationReviewItem")),
		"governanceReceipts":        arraySchema("Transcript governance receipts.", ref("ConversationGovernanceReceipt")),
		"delta":                     freeFormSchema("Exact before/after values, uncertain claim ids, contradictions, and recommendation reason."),
		"liveCues":                  arraySchema("Account-history cue cards for the next/live meeting.", freeFormSchema("Cue card.")),
		"contradictionCases":        arraySchema("Typed durable conflicts.", freeFormSchema("Contradiction case.")),
		"recoveryEvaluations":       arraySchema("Bounded commitment recovery evaluations.", freeFormSchema("Recovery evaluation.")),
		"recommendationEvaluations": arraySchema("Immutable contextual ranking factors.", freeFormSchema("Recommendation evaluation.")),
		"mutualActionPlans":         arraySchema("Revision-bound bilateral plans.", freeFormSchema("Mutual action plan.")),
		"effectivePolicy":           ref("ResolvedConversationPolicy"),
		"governanceDecisions":       arraySchema("Immutable checkpoint decisions.", freeFormSchema("Governance decision.")),
		"deletionReceipts":          arraySchema("Deletion status and verification.", ref("ConversationDeletionReceipt")),
		"observationPageHasMore":    boolSchema("An older conversation exists beyond this page of focused review.", true),
	}, "claims", "reviewItems", "governanceReceipts", "delta", "liveCues", "contradictionCases", "recoveryEvaluations", "recommendationEvaluations", "mutualActionPlans", "effectivePolicy", "governanceDecisions", "deletionReceipts")

	schemas["RelationshipGraphNode"] = objectSchema("A versioned, typed relationship graph node. Meaning is explicit so clients can render status without relying on color alone.", obj{
		"id":                 stringSchema("Stable node id.", "relationship:9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"kind":               stringEnum("Node kind.", "relationship", "relationship", "person", "commitment", "risk", "milestone", "action", "evidence", "source", "note"),
		"label":              stringSchema("Human-readable label.", "Northstar Labs"),
		"relationshipId":     uuidSchema("Primary relationship id when applicable.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"relationshipIds":    arraySchema("All associated relationships, including shared participants.", uuidSchema("Relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5")),
		"summary":            stringSchema("Evidence-backed summary.", "Security review is overdue."),
		"status":             stringSchema("Domain status.", "open"),
		"role":               stringSchema("Participant role.", "champion"),
		"source":             stringSchema("Evidence source.", "meeting"),
		"lifecycle":          stringSchema("Commercial lifecycle.", "renewal"),
		"engagement":         stringSchema("Engagement state.", "declining"),
		"sentiment":          stringSchema("Sentiment state.", "mixed"),
		"health":             stringSchema("Health state.", "needs_attention"),
		"approvalStatus":     stringSchema("Action approval state.", "pending"),
		"policyStatus":       stringSchema("Action policy state.", "passed"),
		"executionStatus":    stringSchema(graphExecutionStatusDescription, graphExecutionStatusExample),
		"freshness":          stringEnum("Evidence freshness.", "current", "current", "aging", "stale", "unknown"),
		"confidence":         obj{"type": "number", "minimum": 0, "maximum": 1, "example": 0.88},
		"priority":           obj{"type": "integer", "minimum": 0, "maximum": 100, "example": 82},
		"dueAt":              stringSchema("Due time.", "2026-08-12T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"occurredAt":         stringSchema("Evidence occurrence time.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"updatedAt":          stringSchema("Last material update.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"changedSinceReview": boolSchema("Whether this state is newer than the viewer's acknowledgement.", true),
		"changedDimensions":  arraySchema("Changed state dimensions.", stringSchema("Dimension.", "health")),
		"evidenceRefs":       arraySchema("Inspectable evidence ids.", stringSchema("Evidence id.", "4b8dfa9b-a7b2-46ea-982c-622a914c00e5")),
		"resourceRef":        stringSchema("Underlying record id used by explicit Open actions.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"metadata":           freeFormSchema("Kind-specific bounded metadata."),
	}, "id", "kind", "label", "relationshipIds", "changedSinceReview", "changedDimensions", "evidenceRefs", "metadata")

	schemas["RelationshipGraphEdge"] = objectSchema("A typed graph edge whose source-to-target direction is semantically meaningful.", obj{
		"id":           stringSchema("Stable edge id.", "edge:ab12cd34"),
		"source":       stringSchema("Source node id.", "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"target":       stringSchema("Target node id.", "commitment:26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51"),
		"kind":         stringEnum("Edge kind.", "requires", "participant_of", "owns", "has_commitment", "blocks", "requires", "supersedes", "has_risk", "has_milestone", "recommended_for", "supports", "contradicts", "observed_from", "linked_note"),
		"label":        stringSchema("Human-readable edge label.", "requires"),
		"directed":     boolSchema("Whether the source-to-target direction is meaningful.", true),
		"confidence":   obj{"type": "number", "minimum": 0, "maximum": 1, "example": 0.88},
		"evidenceRefs": arraySchema("Evidence supporting the connection.", stringSchema("Evidence id.", "4b8dfa9b-a7b2-46ea-982c-622a914c00e5")),
	}, "id", "source", "target", "kind", "label", "directed", "evidenceRefs")

	schemas["RelationshipGraph"] = objectSchema("Shared read model for Account Graph and Portfolio Graph in web and desktop. Historical reads are bounded by asOf and every governed action remains permission-gated.", obj{
		"contractVersion":    stringSchema("Wire contract version.", "2026-08-01"),
		"generatedAt":        stringSchema("Projection generation time.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}),
		"asOf":               stringSchema("Historical evidence boundary.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}),
		"historical":         boolSchema("Whether the response is an historical projection.", false),
		"scope":              stringEnum("Graph scope.", "portfolio", "portfolio", "relationship"),
		"relationshipId":     uuidSchema("Relationship id for account scope.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"depth":              obj{"type": "integer", "minimum": 1, "maximum": 3, "example": 2},
		"nodes":              arraySchema("Typed nodes.", ref("RelationshipGraphNode")),
		"edges":              arraySchema("Typed directed edges.", ref("RelationshipGraphEdge")),
		"hasMore":            boolSchema("Another company exists beyond this page.", true),
		"observationHasMore": boolSchema("An older conversation exists beyond this page.", true),
		"permissions": objectSchema("Viewer capabilities for this projection.", obj{
			"canView":       boolSchema("May view.", true),
			"canContribute": boolSchema("May propose state or actions.", true),
			"canApprove":    boolSchema("May approve current action revisions.", false),
			"canExecute":    boolSchema("May explicitly execute approved actions.", false),
			"canSaveViews":  boolSchema("May save graph views.", true),
		}, "canView", "canContribute", "canApprove", "canExecute", "canSaveViews"),
	}, "contractVersion", "generatedAt", "asOf", "historical", "scope", "depth", "nodes", "edges", "permissions")

	schemas["RevenueAction"] = objectSchema("One Revenue Action Queue item. State is split into independent dimensions: queue triage, policy preflight, approval, and execution. Every edit creates a new revision and invalidates the previous policy decision and approval.", obj{
		"id":                      uuidSchema("Action id.", "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"relationshipId":          uuidSchema("Owning relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"relationshipName":        stringSchema("Owning company name. The directory is paged, so a task still names a company that is not on the first page.", "Acme"),
		"actionType":              stringEnum("Action type.", "warm_follow_up", "warm_follow_up", "proposal_nudge", "referral_reconnect", "customer_risk", "meeting_follow_up", "meeting_recap", "crm_update", "follow_up_task", "calendar_hold", "commitment_rescue"),
		"channel":                 stringEnum("Delivery channel.", "email", "email", "slack", "call", "crm_task", "crm", "task", "calendar"),
		"detector":                stringEnum("Detector that produced the action.", "manual", "requested_follow_up_due", "unanswered_proposal", "waiting_on_me", "dormant_warm_opportunity", "neglected_referral", "former_customer_reconnect", "conversation_action_pack", "commitment_due", "manual"),
		"revision":                intSchema("Current revision number.", 1),
		"revisionHash":            stringSchema("Canonical hash of the revision content.", documentedActionRevisionHash),
		"reason":                  stringSchema("Human-readable evidence-backed reason.", "They asked for a follow-up in July."),
		"recipientEmail":          stringSchema("Recipient email address.", "buyer@example.com"),
		"proposedSubject":         stringSchema("Proposed email subject.", "Following up as promised"),
		"proposedMessage":         stringSchema("Proposed message body.", "Hi Jordan — you asked me to circle back this month..."),
		"senderAccountRef":        stringSchema("Sender account reference.", "gmail:me@company.com"),
		"priorityScore":           intSchema("Explainable priority score (0-100).", 82),
		"priorityComponents":      freeFormSchema("Per-component priority breakdown; every component is stored and shown."),
		"queueStatus":             stringEnum("Operator triage state.", "open", "open", "snoozed", "dismissed", "handled"),
		"policyStatus":            stringEnum("Preflight state. Facade unavailability keeps pending (fail closed).", "pending", "pending", "passed", "review_required", "blocked", "stale"),
		"approvalStatus":          stringEnum("Approval state, bound to the exact revision and decision.", "pending", "pending", "approved", "rejected"),
		"executionStatus":         stringEnum("Execution state. A lost provider result is ambiguous, never auto-resent.", "pending", "pending", "requested", "sent", "failed", "ambiguous", "cancelled"),
		"executionOwner":          stringEnum("Exactly one owner may execute a revision.", "rowboat", "rowboat", "outbound"),
		"executionMode":           stringEnum("Draft lands in the operator's mailbox; send requires a passed unexpired decision and a linked workspace.", "draft", "draft", "send"),
		"approvedRevision":        intSchema("Revision the approval is bound to.", 1),
		"approvedAt":              stringSchema("Approval time.", "2026-07-12T12:05:00Z", obj{"format": "date-time"}, nullable()),
		"providerMessageId":       stringSchema("Provider message id after execution.", "msg_01"),
		"providerThreadId":        stringSchema("Provider thread id after execution.", "thread_01"),
		"executedAt":              stringSchema("Execution time.", "2026-07-12T12:06:00Z", obj{"format": "date-time"}, nullable()),
		"executionError":          stringSchema("Bounded execution error.", ""),
		"reconciliationStatus":    stringEnum("Read-only provider reconciliation state for an ambiguous write.", "pending", "pending", "found", "not_found", "error", "manual_review"),
		"reconciliationAttempts":  intSchema("Number of bounded provider lookups performed.", 1),
		"reconciliationCheckedAt": stringSchema("Most recent provider lookup time.", "2026-07-12T12:07:00Z", obj{"format": "date-time"}, nullable()),
		"reconciliationNextAt":    stringSchema("Next scheduled read-only lookup time.", "2026-07-12T12:12:00Z", obj{"format": "date-time"}, nullable()),
		"reconciliationError":     stringSchema("Bounded provider lookup error.", ""),
		"dismissReason":           stringSchema("Dismissal reason label.", documentedQueueDismissReason),
		"snoozedUntil":            stringSchema("Snooze wake time.", "2026-07-20T09:00:00Z", obj{"format": "date-time"}, nullable()),
		"dueAt":                   stringSchema("Due time.", "2026-07-15T00:00:00Z", obj{"format": "date-time"}, nullable()),
		"createdAt":               stringSchema("Creation time.", "2026-07-12T12:00:00Z", obj{"format": "date-time"}),
		"updatedAt":               stringSchema("Last update time.", "2026-07-12T12:06:00Z", obj{"format": "date-time"}),
		"evidence": arraySchema("Exact supporting evidence available in the approval UI.", objectSchema("Action evidence.", obj{
			"id":                   uuidSchema("Evidence id.", "4b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
			"source":               stringSchema("Evidence source.", "meeting"),
			"sourceRecordId":       stringSchema("Source record id.", "oppulence:session-42:claim:claim-risk"),
			"excerpt":              stringSchema("Exact supporting words.", "We are concerned security could delay renewal."),
			"occurredAt":           stringSchema("Evidence time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
			"externalEvidenceRefs": arraySchema("Observation, timestamp, and speaker references.", stringSchema("Reference.", "timestamp:12000-16000")),
		}, "id", "source", "sourceRecordId", "occurredAt", "externalEvidenceRefs")),
	}, "id", "actionType", "channel", "detector", "revision", "revisionHash", "reason", "priorityScore", "queueStatus", "policyStatus", "approvalStatus", "executionStatus", "executionOwner", "executionMode", "evidence")

	schemas["RevenuePolicyDecision"] = objectSchema("Immutable OutboundConsole preflight decision for one exact action revision. Rowboat snapshots the decision; it never composes one.", obj{
		"id":           uuidSchema("Decision snapshot id.", "2b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"revision":     intSchema("Action revision the decision is about.", 1),
		"revisionHash": stringSchema("Revision hash the decision is bound to.", documentedActionRevisionHash),
		"status":       stringEnum("Decision status.", "passed", "passed", "review_required", "blocked"),
		"reasonCodes":  arraySchema("Bounded reason codes.", stringSchema("Reason code.", "suppression.opted_out")),
		"verification": freeFormSchema("Verification sub-result snapshot."),
		"suppression":  freeFormSchema("Suppression sub-result snapshot."),
		"research":     freeFormSchema("Research sub-result snapshot."),
		"crm":          freeFormSchema("CRM sub-result snapshot; unknown when the connector is unavailable."),
		"evaluatedAt":  stringSchema("Evaluation time.", "2026-07-12T12:00:00Z", obj{"format": "date-time"}),
		"expiresAt":    stringSchema("Decision expiry; expired decisions must be re-evaluated before approval or execution.", "2026-07-13T12:00:00Z", obj{"format": "date-time"}),
	}, "id", "revision", "revisionHash", "status", "evaluatedAt", "expiresAt")

	schemas["RevenueImpact"] = objectSchema("Aggregate ROI picture for the caller's revenue queue: how many open loops were surfaced, how they were triaged, how many were acted on, and what came back.", obj{
		"surfaced":              intSchema("Total actions ever surfaced.", 42),
		"open":                  intSchema("Actions currently open.", 8),
		"openTasks":             intSchema("Open follow-up tasks. These are saved work, not recovery follow-ups.", 3),
		"handled":               intSchema("Actions marked handled.", 20),
		"snoozed":               intSchema("Actions snoozed.", 3),
		"dismissed":             intSchema("Actions dismissed.", 11),
		"approved":              intSchema("Actions approved.", 18),
		"executed":              intSchema("Actions executed (draft created or email sent).", 16),
		"replied":               intSchema("Replies observed.", 6),
		"meetingsBooked":        intSchema("Meetings booked.", 2),
		"won":                   intSchema("Deals marked won.", 1),
		"lost":                  intSchema("Deals marked lost.", 1),
		"replyRate":             obj{"type": "number", "nullable": true, "description": "Reply rate = replied / executed; null with no denominator.", "example": 0.38},
		"meetingRate":           obj{"type": "number", "nullable": true, "description": "Meeting rate = meetings / executed; null with no denominator.", "example": 0.12},
		"outcomes":              freeFormSchema("Raw outcome-kind counts."),
		"relationships":         intSchema("Active relationships in the portfolio.", 24),
		"atRiskRelationships":   intSchema("Distinct relationships with at least one open attention item.", 7),
		"criticalRelationships": intSchema("Distinct relationships with a critical open attention item.", 2),
		"portfolioRiskScore":    intSchema("Deterministic 0-100 portfolio exposure score from each account's highest open risk.", 31),
		"overdueCommitments":    intSchema("Confirmed or accepted open commitments past due.", 5),
		"overdueByUs":           intSchema("Overdue commitments promised by the user or their team.", 3),
		"overdueByThem":         intSchema("Overdue commitments promised by the counterparty.", 2),
		"longestOverdueDays":    intSchema("Whole days the oldest open commitment is overdue.", 12),
		"riskReasons": arraySchema("Deterministic reasons currently exposing relationships.", objectSchema("Relationship risk reason.", obj{
			"reason":        stringSchema("Stable reason code.", "unanswered_proposal"),
			"relationships": intSchema("Distinct affected relationships.", 3),
		}, "reason", "relationships")),
		"byDetector": arraySchema("Per-detector contribution.", objectSchema("Detector stat.", obj{
			"detector": stringSchema("Detector.", "unanswered_proposal"),
			"surfaced": intSchema("Surfaced by this detector.", 12),
			"handled":  intSchema("Handled from this detector.", 7),
		})),
	}, "surfaced", "open", "openTasks", "handled", "approved", "executed", "relationships", "atRiskRelationships", "criticalRelationships", "portfolioRiskScore", "overdueCommitments", "overdueByUs", "overdueByThem", "longestOverdueDays", "riskReasons")

	schemas["RevenueDigest"] = objectSchema("The proactive digest content: the top open loops plus running impact counts. This is what the scheduled digest email is built from.", obj{
		"generatedAt":    stringSchema("When composed.", "2026-07-23T09:00:00Z", obj{"format": "date-time"}),
		"openCount":      intSchema("Total open actions.", 8),
		"replied":        intSchema("Replies observed.", 6),
		"meetingsBooked": intSchema("Meetings booked.", 2),
		"handled":        intSchema("Actions handled.", 20),
		"top": arraySchema("Highest-priority open loops.", objectSchema("Digest action.", obj{
			"detector":  stringSchema("Human detector label.", "Unanswered proposal"),
			"recipient": stringSchema("Recipient email.", "buyer@example.com"),
			"reason":    stringSchema("Evidence-backed reason.", "You sent a proposal 10 days ago with no reply."),
			"priority":  intSchema("Priority score.", 82),
		})),
	}, "generatedAt", "openCount")

	schemas["RevenueLeakScan"] = objectSchema("One bounded historical scan over connected sources (Gmail first). Detectors are deterministic; counts, errors, and freshness make runs incremental and auditable.", obj{
		"id":                   uuidSchema("Scan id.", "4d8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"status":               stringEnum("Scan status.", "running", "pending", "running", "completed", "failed"),
		"mode":                 stringEnum("Workspace mode at scan time.", "local", "local", "linked"),
		"lookbackDays":         intSchema("Historical lookback in days.", 180),
		"threadsSeen":          intSchema("Threads examined.", 42),
		"candidatesSeen":       intSchema("Detector candidates found.", 7),
		"relationshipsCreated": intSchema("New relationships recorded.", 3),
		"evidencesCreated":     intSchema("New evidence rows recorded.", 5),
		"actionsCreated":       intSchema("New queue actions created.", 5),
		"commitmentsCreated":   intSchema("New commitments recorded.", 4),
		"threadsDeepRead":      intSchema("Threads examined from complete message bodies.", 30),
		"threadsSnippetOnly":   intSchema("Threads examined from snippets only.", 8),
		"threadsSkipped":       intSchema("Threads skipped because readable evidence was unavailable.", 4),
		"startedAt":            stringSchema("Start time.", "2026-07-23T12:00:00Z", obj{"format": "date-time"}, nullable()),
		"completedAt":          stringSchema("Completion time.", "2026-07-23T12:00:40Z", obj{"format": "date-time"}, nullable()),
		"sourceFreshnessAt":    stringSchema("Newest source timestamp observed (incremental cursor).", "2026-07-22T09:00:00Z", obj{"format": "date-time"}, nullable()),
		"error":                stringSchema("Bounded failure reason.", ""),
	}, "id", "status", "mode", "lookbackDays")

	schemas["RevenueOutcome"] = objectSchema("One observed action outcome, append-only and idempotent on (action, source, sourceEventId).", obj{
		"id":            uuidSchema("Outcome id.", "3c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"kind":          stringEnum("Outcome kind.", "replied", "sent", "delivered", "bounced", "replied", "meeting_booked", "won", "lost", "dismissed", "bad_recommendation", "deal_advanced", "onboarding_progressed", "renewed", "escalated", "churned", "corrected"),
		"source":        stringEnum("Observing source.", "user", "gmail", "calendar", "crm", "user", "outbound", "slack", "meeting", "task"),
		"sourceEventId": stringSchema("Source event id used for deduplication. Log outcome sends manual, the kind, and the current time.", "manual:replied:1783864800000"),
		"occurredAt":    stringSchema("When the outcome occurred.", "2026-07-12T14:00:00Z", obj{"format": "date-time"}),
	}, "id", "kind", "source", "sourceEventId", "occurredAt")

	schemas["CommunicationAccess"] = objectSchema("Authorized communication fields for one actor.", obj{
		"metadata":      boolSchema("Metadata visibility.", true),
		"subject":       boolSchema("Subject visibility.", true),
		"body":          boolSchema("Body visibility.", true),
		"attachments":   boolSchema("Attachment visibility.", true),
		"protected":     boolSchema("Protected recipient match.", false),
		"reason":        stringSchema("Decision reason.", "mailbox_owner"),
		"policyVersion": intSchema("Policy version.", 1),
	}, "metadata", "subject", "body", "attachments", "reason")
	schemas["CommunicationTimelineItem"] = objectSchema("One redacted communication metadata row.", obj{
		"id":              uuidSchema("Interaction id.", mailMeetingsInteractionID),
		"source":          stringEnum("Provider source.", "gmail", "gmail", "calendar"),
		"interactionType": stringEnum("Interaction kind.", "email", "email", "meeting"),
		"direction":       stringSchema("Direction.", "outbound"),
		"subject":         stringSchema("Redacted subject.", "Follow up"),
		"occurredAt":      stringSchema("When it occurred.", mailMeetingsOccurredAt, obj{"format": "date-time"}),
		"visibility":      stringEnum("Stored visibility.", "metadata", "private", "metadata", "full"),
		"ownerId":         uuidSchema("Mailbox owner.", mailMeetingsOwnerID),
		"bodyLocked":      boolSchema("Whether the body remains locked.", false),
		"attachmentCount": intSchema("Attachment count.", 1),
		"access":          ref("CommunicationAccess"),
	}, "id", "source", "interactionType", "occurredAt", "visibility", "ownerId", "bodyLocked", "access")
	schemas["CommunicationTimelinePage"] = objectSchema("Paginated communication timeline.", obj{
		"items":        arraySchema("Timeline items.", ref("CommunicationTimelineItem")),
		"hasMore":      boolSchema("More pages exist.", false),
		"nextBefore":   stringSchema("Time of the last record on this page. Send it to load older records that share that time.", mailMeetingsOccurredAt, obj{"format": "date-time"}, nullable()),
		"nextBeforeId": stringSchema("Id of the last record on this page. Send it with the time so records that share that time stay on the next page.", mailMeetingsInteractionID, obj{"format": "uuid"}, nullable()),
	}, "items", "hasMore")
}

// restoreRevenueSchemaOverrides runs after the generic Ent field documentation
// overlay. Runtime schemas may reuse names such as status and reason with
// domain-specific semantics, so their contract must win over entity defaults.
func restoreRevenueSchemaOverrides(schemas obj) {
	if evidence := asObj(schemas["MissionControlDimensionEvidence"]); evidence != nil {
		properties := asObj(evidence["properties"])
		properties["reason"] = stringSchema("Evidence-backed explanation.", "CRM deal stage changed to closed won.")
		properties["status"] = stringEnum(
			"Assertion lifecycle state.",
			"accepted",
			"proposed", "accepted", "rejected", "superseded", "retracted", "expired", "active",
		)
	}
	// The generic overlay used to stamp the credit-ledger enum onto every
	// property named reason. These fields are not ledger entries.
	setSchemaReason(schemas, "ActionProposal", stringSchema("Reason recorded when this proposal is rejected or fails.", "The invoice was already paid."))
	setSchemaReason(schemas, "CommitmentEvent", stringSchema("Transition rationale.", "Counterparty accepted in writing."))
	setSchemaReason(schemas, "CommunicationAccess", stringSchema("Decision reason.", "owner_default"))
	setSchemaReason(schemas, "CommunicationShareGrant", stringSchema("Why this content was shared.", "The account owner asked for the thread."))
	setSchemaReason(schemas, "ConnectorAuditEvent", stringSchema("Why this connector decision was recorded.", "subscription_ended"))
	setSchemaReason(schemas, "ConsentEntitlement", stringSchema("Machine-readable denial reason.", "scope_not_in_plan", nullable()))
	setSchemaReason(schemas, "InternalInvalidateRequest", stringSchema("Semantic revocation reason.", "subscription_ended", nullable()))
	setSchemaReason(schemas, "PersonAttribute", stringSchema("Why this detail was recorded.", "The title was in the email signature."))
	setSchemaReason(schemas, "PersonSuppression", stringEnum(
		"Why this person was removed. subject_request means they asked. user_action means the account holder removed them.",
		"user_action",
		"user_action", "subject_request",
	))
	setSchemaReason(schemas, "RelationshipAssertion", stringSchema("Evidence-backed explanation.", "CRM deal stage changed to closed won."))
	setSchemaReason(schemas, "RelationshipIdentityDecision", stringSchema("Decision reason.", "Confirmed the provider records are the same account."))
	setSchemaReason(schemas, "RelationshipIdentityLineage", stringSchema("Reason.", "Confirmed duplicate."))
	setSchemaReason(schemas, "RelationshipLineageEvent", stringSchema("Why this identity change was recorded.", "Confirmed the provider records are the same account."))
}

func setSchemaReason(schemas obj, name string, field obj) {
	schema := asObj(schemas[name])
	if schema == nil {
		return
	}
	properties := asObj(schema["properties"])
	if properties == nil || properties["reason"] == nil {
		return
	}
	properties["reason"] = field
}

func restoreConversationReviewIdentifiers(schemas obj) {
	itemID := conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")
	batchID := conversationReviewBatchID(conversationExternalID, conversationSourceVersion)
	if claim := asObj(schemas["ConversationClaim"]); claim != nil {
		if properties := asObj(claim["properties"]); properties != nil {
			properties["id"] = stringSchema("Stable claim id.", conversationClaimID)
		}
	}
	if review := asObj(schemas["ConversationReviewItem"]); review != nil {
		if properties := asObj(review["properties"]); properties != nil {
			properties["id"] = stringSchema("Stable review item id.", itemID)
			properties["claimId"] = stringSchema("Material claim id.", conversationClaimID)
			properties["batchId"] = stringSchema("Idempotent review batch id.", batchID)
		}
	}
}

const (
	documentedPlanID             = "plan:ab8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanCommitmentID   = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanOwnerID        = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanRevisionID     = "revision:cb8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedPlanRevisionHash   = "sha256:935371863ce9346ba2c85a787c066e76f7afd07a607fab5a9c3badb5034a4966"
	documentedPlanResponseToken  = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	documentedPlanDecisionID     = "governance:ab8dfa9ba7b246ea982c622a"
)

func documentedPlanItem() obj {
	return obj{
		"itemId":              "item:" + documentedPlanCommitmentID,
		"commitmentId":        documentedPlanCommitmentID,
		"title":               "Send the security packet.",
		"ownerParticipantRef": "alex@example.com",
		"dependencyItemIds":   []any{},
		"dueAt":               "2026-09-14T17:00:00Z",
		"status":              "open",
		"evidenceRefs":        []any{"revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
	}
}

func documentedPlanRevision() obj {
	return obj{
		"revisionId":   documentedPlanRevisionID,
		"planId":       documentedPlanID,
		"version":      1,
		"revisionHash": documentedPlanRevisionHash,
		"createdAt":    "2026-07-31T14:00:00Z",
		"createdBy":    documentedPlanOwnerID,
		"items":        []any{documentedPlanItem()},
	}
}

func documentedMutualActionPlan(status, tokenState, decisionID string) obj {
	plan := obj{
		"planId":           documentedPlanID,
		"relationshipId":   documentedPlanRelationshipID,
		"internalOwnerRef": documentedPlanOwnerID,
		"counterpartyRef":  "jordan@example.com",
		"status":           status,
		"currentRevision":  documentedPlanRevision(),
		"tokenState":       tokenState,
	}
	if decisionID != "" {
		plan["sharePolicyDecisionId"] = decisionID
	}
	return plan
}

func mutualActionPlanItemSchema() obj {
	return objectSchema("One step on the plan.", obj{
		"itemId":              stringSchema("Step id.", "item:"+documentedPlanCommitmentID),
		"commitmentId":        uuidSchema("Commitment this step came from.", documentedPlanCommitmentID),
		"title":               stringSchema("Step title.", "Send the security packet."),
		"ownerParticipantRef": stringSchema("Who owns the step.", "alex@example.com"),
		"dependencyItemIds":   arraySchema("Steps this one waits on.", stringSchema("Step id.", "item:"+documentedPlanCommitmentID)),
		"dueAt":               stringSchema("When the step is due.", "2026-09-14T17:00:00Z", obj{"format": "date-time"}),
		"status":              stringSchema("Step status.", "open"),
		"evidenceRefs":        arraySchema("Evidence for the step.", stringSchema("Evidence reference.", "revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5")),
	}, "itemId", "title", "ownerParticipantRef", "dependencyItemIds", "status", "evidenceRefs")
}

func mutualActionPlanSchema(statusExample, tokenStateExample string) obj {
	return objectSchema("The plan the company sheet reads.", obj{
		"planId":           stringSchema("Plan id.", documentedPlanID),
		"relationshipId":   uuidSchema("Company id.", documentedPlanRelationshipID),
		"internalOwnerRef": uuidSchema("Person who owns the plan inside this workspace.", documentedPlanOwnerID),
		"counterpartyRef":  stringSchema("The other party.", "jordan@example.com"),
		"status": stringEnum("Plan status.", statusExample,
			"draft", "revised", "internally_approved", "shared", "counterparty_responded", "completed", "cancelled"),
		"currentRevision": objectSchema("The revision this approval is bound to.", obj{
			"revisionId":   stringSchema("Revision id.", documentedPlanRevisionID),
			"planId":       stringSchema("Plan id.", documentedPlanID),
			"version":      intSchema("Revision number.", 1),
			"revisionHash": stringSchema("Hash of the steps.", documentedPlanRevisionHash),
			"createdAt":    stringSchema("When this revision was written.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
			"createdBy":    uuidSchema("Who wrote this revision.", documentedPlanOwnerID),
			"items":        arraySchema("Plan steps.", mutualActionPlanItemSchema()),
		}, "revisionId", "planId", "version", "revisionHash", "createdAt", "createdBy", "items"),
		"sharePolicyDecisionId": stringSchema("Decision recorded when the plan was shared.", documentedPlanDecisionID),
		"tokenState":            stringEnum("Share token state.", tokenStateExample, "not_issued", "active"),
	}, "planId", "relationshipId", "internalOwnerRef", "counterpartyRef", "status", "currentRevision", "tokenState")
}

const documentedMailboxPolicyID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5"

func documentedMailboxPolicy() obj {
	return obj{
		"id":                     documentedMailboxPolicyID,
		"sourceAccountId":        "you@company.com",
		"metadataVisibility":     "workspace",
		"shareSubject":           true,
		"shareBody":              false,
		"shareAttachments":       false,
		"signatureEnrichment":    true,
		"modelContactExtraction": true,
		"retentionDays":          540,
		"version":                1,
	}
}

const (
	documentedDraftPlanID         = "plan:eb8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedDraftRevisionID     = "revision:0c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedDraftRevisionHash   = "sha256:b718e82644ea4d98cb7a1f3ee6503cd6d3463df9c211e85051737f7654067f4d"
	documentedDraftCommitmentID   = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedDraftRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedDraftOwnerID        = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
)

func documentedDraftPlanItem() obj {
	return obj{
		"itemId":              "item:" + documentedDraftCommitmentID,
		"commitmentId":        documentedDraftCommitmentID,
		"title":               "Send the security packet.",
		"ownerParticipantRef": "alex@example.com",
		"dependencyItemIds":   []any{},
		"dueAt":               "2026-07-22T17:00:00Z",
		"status":              "open",
		"evidenceRefs":        []any{"revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
	}
}

func documentedDraftPlan() obj {
	return obj{
		"planId":           documentedDraftPlanID,
		"relationshipId":   documentedDraftRelationshipID,
		"internalOwnerRef": documentedDraftOwnerID,
		"counterpartyRef":  "jordan@example.com",
		"status":           "draft",
		"currentRevision": obj{
			"revisionId":   documentedDraftRevisionID,
			"planId":       documentedDraftPlanID,
			"version":      1,
			"revisionHash": documentedDraftRevisionHash,
			"createdAt":    "2026-07-18T17:30:00Z",
			"createdBy":    documentedDraftOwnerID,
			"items":        []any{documentedDraftPlanItem()},
		},
		"tokenState": "not_issued",
	}
}

func draftPlanSchema() obj {
	return objectSchema("The draft plan the company sheet reads.", obj{
		"planId":           stringSchema("Plan id.", documentedDraftPlanID),
		"relationshipId":   uuidSchema("Company id.", documentedDraftRelationshipID),
		"internalOwnerRef": uuidSchema("Person who owns the plan inside this workspace.", documentedDraftOwnerID),
		"counterpartyRef":  stringSchema("The other party.", "jordan@example.com"),
		"status": stringEnum("Plan status.", "draft",
			"draft", "revised", "internally_approved", "shared", "counterparty_responded", "completed", "cancelled"),
		"currentRevision": objectSchema("The first revision.", obj{
			"revisionId":   stringSchema("Revision id.", documentedDraftRevisionID),
			"planId":       stringSchema("Plan id.", documentedDraftPlanID),
			"version":      intSchema("Revision number.", 1),
			"revisionHash": stringSchema("Hash of the steps.", documentedDraftRevisionHash),
			"createdAt":    stringSchema("When this revision was written.", "2026-07-18T17:30:00Z", obj{"format": "date-time"}),
			"createdBy":    uuidSchema("Who wrote this revision.", documentedDraftOwnerID),
			"items": arraySchema("Plan steps.", objectSchema("One step on the plan.", obj{
				"itemId":              stringSchema("Step id.", "item:"+documentedDraftCommitmentID),
				"commitmentId":        uuidSchema("Commitment this step came from.", documentedDraftCommitmentID),
				"title":               stringSchema("Step title.", "Send the security packet."),
				"ownerParticipantRef": stringSchema("Who owns the step.", "alex@example.com"),
				"dependencyItemIds":   arraySchema("Steps this one waits on.", stringSchema("Step id.", "item:"+documentedDraftCommitmentID)),
				"dueAt":               stringSchema("When the step is due.", "2026-07-22T17:00:00Z", obj{"format": "date-time"}),
				"status":              stringSchema("Step status.", "open"),
				"evidenceRefs":        arraySchema("Evidence for the step.", stringSchema("Evidence reference.", "revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5")),
			}, "itemId", "title", "ownerParticipantRef", "dependencyItemIds", "status", "evidenceRefs")),
		}, "revisionId", "planId", "version", "revisionHash", "createdAt", "createdBy", "items"),
		"tokenState": stringEnum("Share token state.", "not_issued", "not_issued", "active"),
	}, "planId", "relationshipId", "internalOwnerRef", "counterpartyRef", "status", "currentRevision", "tokenState")
}

const (
	documentedSnoozeActionID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedSnoozeWake     = "2026-08-07T14:00:00Z"
)

func documentedSnoozedAction() obj {
	return obj{
		"id":               documentedSnoozeActionID,
		"relationshipId":   "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         1,
		"revisionHash":     "sha256:ab12...",
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"priorityScore":    82,
		"queueStatus":      "snoozed",
		"policyStatus":     "pending",
		"approvalStatus":   "pending",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"snoozedUntil":     documentedSnoozeWake,
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-31T14:00:00Z",
		"evidence":         []any{},
	}
}

const (
	documentedDraftActionID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedDraftSubject  = "Following up as promised"
	documentedDraftMessage  = "Hi Jordan — circling back as promised."
	documentedDraftHash     = "sha256:35a77a7dc38e7b2d73e06e754a8a5767b3b8af2234f5caeeb532c63e488b2925"
)

func documentedDraftEditRequest() obj {
	return obj{
		"proposedSubject": documentedDraftSubject,
		"proposedMessage": documentedDraftMessage,
	}
}

func documentedSavedDraft() obj {
	return obj{
		"id":               documentedDraftActionID,
		"relationshipId":   "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         2,
		"revisionHash":     documentedDraftHash,
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  documentedDraftSubject,
		"proposedMessage":  documentedDraftMessage,
		"senderAccountRef": "gmail:me@company.com",
		"priorityScore":    82,
		"queueStatus":      "open",
		"policyStatus":     "pending",
		"approvalStatus":   "pending",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-31T14:00:00Z",
		"evidence":         []any{},
	}
}

const documentedDraftedActionID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"

func documentedProviderDraft() obj {
	return obj{
		"id":                documentedDraftedActionID,
		"relationshipId":    "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName":  "Acme",
		"actionType":        "warm_follow_up",
		"channel":           "email",
		"detector":          "requested_follow_up_due",
		"revision":          1,
		"revisionHash":      "sha256:ab12...",
		"reason":            "They asked for a follow-up in July.",
		"recipientEmail":    "buyer@example.com",
		"proposedSubject":   "Following up as promised",
		"proposedMessage":   "Hi Jordan — you asked me to circle back this month...",
		"senderAccountRef":  "gmail:me@company.com",
		"priorityScore":     82,
		"queueStatus":       "handled",
		"policyStatus":      "pending",
		"approvalStatus":    "approved",
		"executionStatus":   "sent",
		"executionOwner":    "rowboat",
		"executionMode":     "draft",
		"approvedRevision":  1,
		"approvedAt":        "2026-07-12T12:05:00Z",
		"providerMessageId": "draft_1",
		"executedAt":        "2026-07-12T12:06:00Z",
		"createdAt":         "2026-07-12T12:00:00Z",
		"updatedAt":         "2026-07-12T12:06:00Z",
		"evidence":          []any{},
	}
}

const documentedApprovedActionID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"

func documentedApprovedAction() obj {
	return obj{
		"id":               documentedApprovedActionID,
		"relationshipId":   "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         1,
		"revisionHash":     "sha256:ab12...",
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  "Following up as promised",
		"proposedMessage":  "Hi Jordan — you asked me to circle back this month...",
		"senderAccountRef": "gmail:me@company.com",
		"priorityScore":    82,
		"queueStatus":      "open",
		"policyStatus":     "pending",
		"approvalStatus":   "approved",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"approvedRevision": 1,
		"approvedAt":       "2026-07-12T12:05:00Z",
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-12T12:05:00Z",
		"evidence":         []any{},
	}
}

const (
	documentedRejectedRecommendationID   = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedRecommendationRejectReason = "Not the right next move"
)

func documentedRejectedRecommendation() obj {
	return obj{
		"id":               documentedRejectedRecommendationID,
		"relationshipId":   "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         1,
		"revisionHash":     "sha256:ab12...",
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  "Following up as promised",
		"proposedMessage":  "Hi Jordan — you asked me to circle back this month...",
		"senderAccountRef": "gmail:me@company.com",
		"priorityScore":    82,
		"queueStatus":      "open",
		"policyStatus":     "pending",
		"approvalStatus":   "rejected",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-12T12:04:00Z",
		"evidence":         []any{},
	}
}

const (
	documentedSavedNoteRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedSavedNoteObservationID  = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedSavedNoteExternalID     = "c18dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedSavedNoteProjectionJob  = "d18dfa9b-a7b2-46ea-982c-622a914c00e5"
	documentedSavedNoteOccurredAt     = "2026-09-01T12:00:00Z"
	documentedSavedNoteContentHash    = "cb2c6d9de0a502140de524129b786b3c768a4fe3f4c59a7aba3eef7724474d47"
	documentedSavedNoteStateHash      = "sha256:e42c0202f5034a1965e117a1a6c7065bcd09e1439493cea57074fa06572905c9"
)

func documentedSavedNoteFacts() obj {
	return obj{
		"noteId": "note-1",
		"title":  "Renewal context",
		"body":   "Use the updated terms.",
		"content": []any{obj{
			"type":     "p",
			"children": []any{obj{"text": "Use the updated terms."}},
		}},
		"meetingLinked": false,
	}
}

func documentedSavedNoteRequest() obj {
	return obj{"observations": []any{obj{
		"relationshipId":  documentedSavedNoteRelationshipID,
		"source":          "desktop_note",
		"externalId":      documentedSavedNoteExternalID,
		"sourceVersion":   "1",
		"eventType":       "note",
		"occurredAt":      documentedSavedNoteOccurredAt,
		"summary":         "Renewal context",
		"normalizedFacts": documentedSavedNoteFacts(),
	}}}
}

func documentedSavedNoteResponse() obj {
	return obj{"results": []any{obj{
		"observation": obj{
			"id":              documentedSavedNoteObservationID,
			"source":          "desktop_note",
			"externalId":      documentedSavedNoteExternalID,
			"sourceVersion":   "1",
			"eventType":       "note",
			"occurredAt":      documentedSavedNoteOccurredAt,
			"receivedAt":      documentedSavedNoteOccurredAt,
			"summary":         "Renewal context",
			"normalizedFacts": documentedSavedNoteFacts(),
			"contentHash":     documentedSavedNoteContentHash,
		},
		"relationship": obj{
			"id":               documentedSavedNoteRelationshipID,
			"kind":             "company",
			"displayName":      "Cedar Notes",
			"status":           "active",
			"lastTouchAt":      documentedSavedNoteOccurredAt,
			"peopleCount":      0,
			"emailThreadCount": 0,
			"commitmentCount":  0,
			"lifecycle":        "prospect",
			"engagement":       "unknown",
			"sentiment":        "unknown",
			"health":           "unknown",
			"stateVersion":     0,
			"stateHash":        documentedSavedNoteStateHash,
			"projectorVersion": 2,
			"projectedAt":      documentedSavedNoteOccurredAt,
			"risks":            []any{},
			"milestones":       []any{},
			"resourceRefs":     []any{},
			"categories":       []any{},
		},
		"duplicate":        false,
		"projectionStatus": "completed",
		"projectionJobId":  documentedSavedNoteProjectionJob,
	}}}
}

const documentedApprovedRecommendationID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"

func documentedApprovedRecommendation() obj {
	return obj{
		"id":               documentedApprovedRecommendationID,
		"relationshipId":   "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         1,
		"revisionHash":     "sha256:ab12...",
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  "Following up as promised",
		"proposedMessage":  "Hi Jordan — you asked me to circle back this month...",
		"senderAccountRef": "gmail:me@company.com",
		"priorityScore":    82,
		"queueStatus":      "open",
		"policyStatus":     "pending",
		"approvalStatus":   "approved",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"approvedRevision": 1,
		"approvedAt":       "2026-07-12T12:05:00Z",
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-12T12:05:00Z",
		"evidence":         []any{},
	}
}

func addRevenuePaths(paths obj) {
	actionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid"}}}

	paths["/v1/revenue-workspaces/current"] = obj{"get": operation("Revenue", "Get current revenue workspace", "Returns the caller's revenue workspace mapping and preflight health, creating the local-mode workspace on first touch.", "getRevenueWorkspace", bearer(), nil, nil, obj{
		"200": jsonResponse("Current workspace.", ref("RevenueWorkspace"), nil),
		"401": responseRef("401"),
	})}
	// Add rule leaves Protected address selected and posts the address typed
	// into the field. The placeholder that field shows is buyer@example.com.
	const privacyRuleKind = "protected_address"
	const privacyRuleValue = "buyer@example.com"
	const privacyRuleID = "3b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const privacyRuleHash = "sha256:6a6c26195c3682faa816966af789717c3bfa834eee6c599d667d2b3429c27cfd"
	paths["/v1/revenue-workspaces/current/communication-privacy-rules"] = obj{"post": operation("Revenue", "Add rule", "Add rule sends kind protected_address and value buyer@example.com. The server lowercases the address, stores an active rule, and returns that rule with the sha256 of the stored address.", "createCommunicationPrivacyRule", bearer(), nil, jsonRequest("Privacy rule.", objectSchema("Privacy rule.", obj{
		"kind":  stringEnum("Rule kind. Add rule leaves the default protected address selected.", privacyRuleKind, "protected_address", "protected_domain", "blocked_address", "blocked_domain"),
		"value": stringSchema("Address or domain typed into the rule field.", privacyRuleValue),
	}, "kind", "value"), obj{"kind": privacyRuleKind, "value": privacyRuleValue}), obj{
		"201": jsonResponse("Stored privacy rule.", objectSchema("Stored privacy rule.", obj{
			"id":        uuidSchema("Rule id.", privacyRuleID),
			"kind":      stringEnum("Stored rule kind.", privacyRuleKind, "protected_address", "protected_domain", "blocked_address", "blocked_domain"),
			"value":     stringSchema("Normalized address or domain.", privacyRuleValue),
			"valueHash": stringSchema("sha256 of the normalized value.", privacyRuleHash),
			"active":    boolSchema("New rules are stored active.", true),
		}, "id", "kind", "value", "valueHash", "active"), obj{
			"id": privacyRuleID, "kind": privacyRuleKind, "value": privacyRuleValue, "valueHash": privacyRuleHash, "active": true,
		}),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
	})}
	paths["/v1/revenue-workspaces/link"] = obj{"post": operation("Revenue", "Link the OutboundConsole workspace", "Completes the OutboundConsole workspace link and switches the workspace to linked mode. Requires a configured policy facade; without one the call fails closed.", "linkRevenueWorkspace", bearer(), nil, jsonRequest("OutboundConsole identifiers.", objectSchema("Link request.", obj{
		"outboundOrganizationId": stringSchema("OutboundConsole organization id.", "org_01ABC"),
		"outboundWorkspaceId":    stringSchema("OutboundConsole workspace id.", "ws_01ABC"),
	}, "outboundWorkspaceId"), obj{"outboundOrganizationId": "org_01ABC", "outboundWorkspaceId": "ws_01ABC"}), obj{
		"200": jsonResponse("Linked workspace.", ref("RevenueWorkspace"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"503": problemResponse("Checked sending is not configured, so the link stays off.", ref("ErrorEnvelope"), problemExample(503, "Service Unavailable", "policy preflight unavailable; the action stays pending", "facade_unavailable")),
	})}

	paths["/v1/revenue-impact"] = obj{"get": operation("Revenue", "Impact", impactCountsDescription, "getRevenueImpact", bearer(), nil, nil, obj{
		"200": jsonResponse("Impact summary.", ref("RevenueImpact"), impactCounts()),
		"401": responseRef("401"),
	})}
	paths["/v1/revenue-search"] = obj{"get": operation("Revenue", "Search mail", "Search mail sends the words typed in the palette. The answer lists the closest mail first, with the subject, the other person's email, the kind of thread, why it matched, and how close it is. When mail search is not set up, the answer includes no matches.", "revenueSemanticSearch", bearer(), []any{obj{"name": "q", "in": "query", "required": true, "description": "Words typed in Search mail.", "schema": stringSchema("Words typed in Search mail.", searchMailQuery)}}, nil, obj{
		"200": jsonResponse("The mail Search mail ranks.", objectSchema("Mail search answer.", obj{
			"available": boolSchema("Whether mail search is set up.", true),
			"matches": arraySchema("Closest mail first.", objectSchema("One mail thread.", obj{
				"threadId":       stringSchema("Mail thread id.", "tc"),
				"subject":        stringSchema("Subject.", "Launch plan"),
				"counterparty":   stringSchema("Other person's email.", "client@example.org"),
				"classification": stringEnum("Kind of thread.", "other", "deal", "invoice", "client", "referral", "other"),
				"summary":        stringSchema("Why this thread matched.", "An explicit promise in this message needs confirmation."),
				"score":          numberSchema("How close this thread is.", 0.9130171833009648),
			})),
		}), searchMailResponse()),
		"400": responseRef("400"),
		"401": responseRef("401"),
	})}
	paths["/v1/revenue-digest"] = obj{"get": operation("Revenue", "Preview the proactive digest", "Returns the digest content the scheduled email is built from: the top open loops and running impact counts.", "getRevenueDigest", bearer(), nil, nil, obj{
		"200": jsonResponse("Digest content.", ref("RevenueDigest"), nil),
		"401": responseRef("401"),
	})}

	paths["/v1/revenue-leak-scans"] = obj{
		"get": operation("Revenue", "List revenue leak scans", "Returns the caller's persisted audit history newest first, including automatic runs and runs started in other sessions. A full page is the end of the history when hasMore is false.", "listRevenueLeakScans", bearer(), []any{
			obj{"name": "limit", "in": "query", "required": false, "description": "Maximum scans to return (default 10, max 100).", "schema": obj{"type": "integer", "minimum": 1, "maximum": 100}},
			obj{"name": "offset", "in": "query", "required": false, "description": "Page offset.", "schema": obj{"type": "integer", "minimum": 0}},
		}, nil, obj{
			"200": jsonResponse("Audit history.", objectSchema("Audit history. A full page is the end of the history when hasMore is false.", obj{
				"hasMore": obj{"description": "Another audit exists beyond this page.", "type": "boolean"},
				"scans":   arraySchema("Scans newest first.", ref("RevenueLeakScan")),
			}, "scans"), nil),
			"400": responseRef("400"),
			"401": responseRef("401"),
		}),
		"post": operation("Revenue", "Run Promise Leak Audit", "Run Promise Leak Audit reads the last six months of connected Gmail. The button sends lookbackDays 180. One audit runs at a time; poll the scan id for progress.", "startRevenueLeakScan", bearer(), nil, jsonRequestOptional("Scan options.", objectSchema("Scan request.", obj{
			"lookbackDays": intSchema("Historical lookback in days. Run Promise Leak Audit sends 180. Omitted values use 180. Maximum 365.", 180),
		}), obj{"lookbackDays": 180}), obj{
			"202": jsonResponse("Scan started.", ref("RevenueLeakScan"), obj{
				"id":                   "4d8dfa9b-a7b2-46ea-982c-622a914c00e5",
				"status":               "running",
				"mode":                 "local",
				"lookbackDays":         180,
				"threadsSeen":          0,
				"candidatesSeen":       0,
				"relationshipsCreated": 0,
				"evidencesCreated":     0,
				"actionsCreated":       0,
				"commitmentsCreated":   0,
				"threadsDeepRead":      0,
				"threadsSnippetOnly":   0,
				"threadsSkipped":       0,
				"startedAt":            "2026-07-23T12:00:00Z",
			}),
			"401": responseRef("401"),
			"409": problemResponse("A scan is already running, or no scan source is configured.", ref("ErrorEnvelope"), problemExample(409, "Conflict", "revenue: scan unavailable: a scan is already running", "scan_unavailable")),
		})}
	paths["/v1/revenue-leak-scans/{scanId}"] = obj{"get": operation("Revenue", "Get scan progress", "Returns progress, counts, errors, and source freshness for one scan.", "getRevenueLeakScan", bearer(), []any{obj{"name": "scanId", "in": "path", "required": true, "description": "Scan id.", "schema": obj{"type": "string", "format": "uuid"}}}, nil, obj{
		"200": jsonResponse("Scan state.", ref("RevenueLeakScan"), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}

	// The commitment register: obligations across every account. Every other
	// commitment path is nested under a relationship id and cannot answer
	// "what do we owe anyone", which is the product.
	paths["/v1/commitments"] = obj{"get": operation("Relationship Intelligence", "List the commitment register", "Lists confirmed commitments across every account in the workspace. The five register views are five query strings against this route: what we owe (direction=promised_by_me), what they owe us (direction=promised_by_them), what changed (changedSince), by account (relationshipId), and by owner (owner). Unconfirmed candidates are excluded unless includeCandidates is set, because a low-confidence extraction belongs in the review queue rather than the register. A full page is the end of the register when hasMore is false.", "listCommitments", bearer(), []any{
		obj{"name": "direction", "in": "query", "required": false, "description": "promised_by_me, promised_by_them, or mutual.", "schema": obj{"type": "string"}},
		obj{"name": "state", "in": "query", "required": false, "description": "Comma-separated register states: open, at_risk, met, missed, waived, disputed. at_risk is derived from the due date.", "schema": obj{"type": "string"}},
		obj{"name": "owner", "in": "query", "required": false, "description": "Owner participant reference.", "schema": obj{"type": "string"}},
		obj{"name": "relationshipId", "in": "query", "required": false, "description": "Restrict to one account.", "schema": obj{"type": "string", "format": "uuid"}},
		obj{"name": "dueBefore", "in": "query", "required": false, "description": "Only commitments due before this instant.", "schema": obj{"type": "string", "format": "date-time"}},
		obj{"name": "changedSince", "in": "query", "required": false, "description": "Only commitments updated at or after this instant.", "schema": obj{"type": "string", "format": "date-time"}},
		obj{"name": "limit", "in": "query", "required": false, "description": "Page size (default 50, max 200).", "schema": obj{"type": "integer"}},
		obj{"name": "offset", "in": "query", "required": false, "description": "Page offset.", "schema": obj{"type": "integer"}},
		obj{"name": "includeCandidates", "in": "query", "required": false, "description": "Include unconfirmed extractions for a review surface.", "schema": obj{"type": "boolean"}},
	}, nil, obj{
		"200": jsonResponse("The register page.", objectSchema("Commitment register. A full page is the end of the register when hasMore is false.", obj{
			"commitments": arraySchema("Register rows, each with its derived state and account.", ref("CommitmentRegisterEntry")),
			"hasMore":     boolSchema("Another promise exists beyond this page.", false),
		}, "commitments"), nil),
		"400": responseRef("400"), "401": responseRef("401"),
	})}
	paths["/v1/commitments/{commitmentId}/export"] = obj{"get": operation("Relationship Intelligence", "Export record", "Export record downloads this promise as Markdown. The request uses format md. The file names the company, the promise, the state, the due date, the quoted mail, and the history.", "exportCommitment", bearer(), []any{
		obj{"name": "commitmentId", "in": "path", "required": true, "description": "Commitment id.", "schema": uuidSchema("Commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5")},
		obj{"name": "format", "in": "query", "required": false, "description": "md for the file Export record downloads.", "schema": stringSchema("Export format.", "md")},
	}, nil, obj{
		"200": markdownDownloadResponse("The Markdown file Export record downloads.", objectSchema("Commitment record.", obj{
			"id":           stringSchema("Commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
			"generatedAt":  stringSchema("When the record was produced.", "2026-09-09T12:00:00Z", obj{"format": "date-time"}),
			"account":      stringSchema("Counterparty account.", "Acme"),
			"direction":    stringSchema("promised_by_me, promised_by_them, or mutual.", "promised_by_me"),
			"text":         stringSchema("The obligation.", "Migration live by the 14th"),
			"state":        stringSchema("Register state.", "at_risk"),
			"dueAt":        stringSchema("Resolved due time.", "2026-09-14T17:00:00Z", obj{"format": "date-time"}, nullable()),
			"duePhrase":    stringSchema("Due condition as stated.", "by the 14th"),
			"owner":        stringSchema("Promise owner.", "alex@example.com"),
			"counterparty": stringSchema("Promise counterparty.", "jordan@example.com"),
			"confidence":   numberSchema("Extraction confidence.", 0.95),
			"evidence": arraySchema("Verbatim cited sources.", objectSchema("Cited source.", obj{
				"source": stringSchema("Source system.", "gmail"), "excerpt": stringSchema("Verbatim quote.", "We will have the migration live by the 14th."), "occurredAt": stringSchema("When the source was created.", "2026-09-06T12:00:00Z", obj{"format": "date-time"}), "contentHash": stringSchema("Content hash of the source.", "sha256:abc123"), "sourceUri": stringSchema("Link to the source.", "https://mail.google.com/thread-1"),
			}, "source", "excerpt", "occurredAt", "contentHash")),
			"history": arraySchema("Ordered state changes.", objectSchema("Transition.", obj{
				"version": intSchema("Event version.", 2), "kind": stringSchema("Event kind.", "internally_confirmed"), "actorType": stringSchema("Who caused it.", "user"), "actorRef": stringSchema("User who recorded this change.", "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"), "occurredAt": stringSchema("When.", "2026-09-07T09:00:00Z", obj{"format": "date-time"}),
			}, "version", "kind", "actorType", "occurredAt")),
		}, "id", "generatedAt", "account", "direction", "text", "state", "confidence", "evidence", "history"), exportedCommitmentMarkdown),
		"401": responseRef("401"), "404": responseRef("404"),
	})}
	paths["/v1/revenue-leak-scans/{scanId}/report"] = obj{"get": operation("Revenue", "Get the open promises report", "Returns the commitments found in the scan window that have no evidence of fulfilment, each with the exact message that created it. Pass format=md for the document handed to a prospect. Unlike the register this deliberately includes unconfirmed candidates, because the report is the surface on which they are reviewed.", "getOpenPromisesReport", bearer(), []any{
		obj{"name": "scanId", "in": "path", "required": true, "description": "Scan id.", "schema": obj{"type": "string", "format": "uuid"}},
		obj{"name": "format", "in": "query", "required": false, "description": "md for Markdown; JSON otherwise.", "schema": obj{"type": "string"}},
	}, nil, obj{
		"200": jsonOrMarkdownResponse("The open promises report.", objectSchema("Open promises report.", obj{
			"generatedAt":   stringSchema("When the report was produced.", "2026-09-09T12:00:00Z", obj{"format": "date-time"}),
			"lookbackDays":  intSchema("Scan window in days.", 180),
			"threadsSeen":   intSchema("Conversations read.", 412),
			"scanStatus":    stringSchema("Scan status.", "completed"),
			"outboundCount": intSchema("Promises we made.", 12),
			"inboundCount":  intSchema("Promises made to us.", 5),
			"byAccount":     obj{"type": "object", "additionalProperties": obj{"type": "integer"}, "description": "Open promise count by account."},
			"truncated":     boolSchema("Whether more than 200 matching promises exist.", false),
			"items": arraySchema("Open promises, at risk first.", objectSchema("Open promise.", obj{
				"commitmentId": stringSchema("Commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "account": stringSchema("Counterparty account.", "Acme"), "direction": stringSchema("Who owes the promise.", "promised_by_me"), "text": stringSchema("The obligation.", "Migration live by the 14th"), "state": stringSchema("Register state.", "at_risk"), "dueAt": stringSchema("Resolved due time.", "2026-09-14T17:00:00Z", obj{"format": "date-time"}, nullable()), "duePhrase": stringSchema("Due condition as stated.", "by the 14th"), "owner": stringSchema("Promise owner.", "alex@example.com"), "sourceQuote": stringSchema("The exact message that created it.", "We will have the migration live by the 14th."), "sourceUri": stringSchema("Link to the source.", "https://mail.google.com/thread-1"), "occurredAt": stringSchema("When the source was created.", "2026-09-06T12:00:00Z", obj{"format": "date-time"}),
			}, "commitmentId", "account", "direction", "text", "state")),
		}, "generatedAt", "lookbackDays", "threadsSeen", "scanStatus", "outboundCount", "inboundCount", "byAccount", "items", "truncated"), nil),
		"401": responseRef("401"), "404": responseRef("404"),
	})}

	paths["/v1/relationships"] = obj{
		"get": operation("Relationship Intelligence", "All companies", companyDirectoryDescription, "listRelationships", bearer(), []any{
			obj{"name": "q", "in": "query", "required": false, "description": "Account, domain, or contact search. All companies sends none.", "schema": obj{"type": "string"}},
			obj{"name": "lifecycle", "in": "query", "required": false, "description": "Lifecycle filter. All companies sends none.", "schema": obj{"type": "string"}},
			obj{"name": "health", "in": "query", "required": false, "description": "Health filter. All companies sends none.", "schema": obj{"type": "string"}},
			obj{"name": "engagement", "in": "query", "required": false, "description": "Engagement filter. All companies sends none.", "schema": obj{"type": "string"}},
			obj{"name": "offset", "in": "query", "required": false, "description": "How many companies to skip. All companies sends none. Each page is 200 rows, newest touch first.", "schema": obj{"type": "integer", "minimum": 0}},
		}, nil, obj{
			"200": jsonResponse("Company directory.", objectSchema("Relationship list.", obj{
				"relationships": arraySchema("Companies and people, newest touch first.", ref("RevenueRelationship")),
				"hasMore":       boolSchema("Another company exists beyond this page.", false),
			}, "relationships", "hasMore"), companyDirectoryPage()),
			"401": responseRef("401"),
		}),
		"post": operation("Relationship Intelligence", "Create a relationship", "Records a canonical relationship in the caller's workspace.", "createRelationship", bearer(), nil, jsonRequest("Relationship.", objectSchema("Create request.", obj{
			"kind":          stringEnum("Relationship kind.", "person", "person", "company", "customer", "opportunity", "referral", "partner"),
			"displayName":   stringSchema("Display name.", "Jordan Buyer"),
			"primaryEmail":  stringSchema("Primary email.", "buyer@example.com"),
			"accountDomain": stringSchema("Account domain.", "example.com"),
			"summary":       stringSchema("Summary.", "Warm lead from the April demo."),
		}, "kind", "displayName"), obj{"kind": "person", "displayName": "Jordan Buyer", "primaryEmail": "buyer@example.com"}), obj{
			"201": jsonResponse("Created relationship.", ref("RevenueRelationship"), nil),
			"400": responseRef("400"),
			"401": responseRef("401"),
		}),
	}
	paths["/v1/relationships/graph"] = obj{"get": operation(
		"Relationship Intelligence",
		"Get the relationship graph",
		"Returns the shared versioned graph read model for an account or the authorized portfolio. Historical asOf reads exclude later evidence and proposed actions.",
		"getRelationshipGraph",
		bearer(),
		[]any{
			obj{"name": "scope", "in": "query", "required": false, "description": "Portfolio or one relationship.", "schema": obj{"type": "string", "enum": []string{"portfolio", "relationship"}, "default": "portfolio"}},
			obj{"name": "relationshipId", "in": "query", "required": false, "description": "Required when scope=relationship.", "schema": obj{"type": "string", "format": "uuid"}},
			obj{"name": "depth", "in": "query", "required": false, "description": "Bounded graph expansion depth.", "schema": obj{"type": "integer", "minimum": 1, "maximum": 3, "default": 2}},
			obj{"name": "asOf", "in": "query", "required": false, "description": "Historical evidence boundary; must not be in the future.", "schema": obj{"type": "string", "format": "date-time"}},
			obj{"name": "offset", "in": "query", "required": false, "description": "Company offset. The first page is the 200 most recently updated companies.", "schema": obj{"type": "integer", "minimum": 0}},
			obj{"name": "observationOffset", "in": "query", "required": false, "description": "Evidence offset. The first page is the newest conversations on each company.", "schema": obj{"type": "integer", "minimum": 0}},
		},
		nil,
		obj{
			"200": jsonResponse("Authorized relationship graph.", ref("RelationshipGraph"), nil),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)}
	relationshipParam := []any{obj{"name": "relationshipId", "in": "path", "required": true, "description": "Relationship id.", "schema": obj{"type": "string", "format": "uuid"}}}
	paths["/v1/relationships/{relationshipId}"] = obj{"get": operation("Relationship Intelligence", "Get relationship mission control", "Returns living relationship state, governed recommendations, participants, and commitments.", "getRelationship", bearer(), relationshipParam, nil, obj{
		"200": jsonResponse("Relationship detail.", objectSchema("Relationship detail.", obj{
			"relationship":           ref("RevenueRelationship"),
			"actions":                arraySchema("Actions for this relationship.", ref("RevenueAction")),
			"recommendations":        arraySchema("Governed recommendations.", ref("RevenueAction")),
			"participants":           arraySchema("Relationship participants.", ref("RelationshipParticipant")),
			"commitments":            arraySchema("Open and completed commitments.", ref("RelationshipCommitment")),
			"commitmentDependencies": arraySchema("Evidence-backed commitment graph edges.", ref("CommitmentDependency")),
			"intelligence":           ref("RelationshipIntelligence"),
			"missionControl":         ref("MissionControlReadModel"),
		}), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/timeline"] = obj{"get": operation("Relationship Intelligence", "Activity", "Activity loads when a company opens. The request asks for the first 50 records and sends no older-page time. The answer lists the newest activity first, from Slack, Calendar, Gmail, and HubSpot.", "getRelationshipTimeline", bearer(), []any{
		obj{"name": "relationshipId", "in": "path", "required": true, "description": "Company id.", "schema": obj{"type": "string", "format": "uuid", "example": activityRelationshipID}},
		obj{"name": "limit", "in": "query", "required": false, "description": "How many records to return. Opening a company asks for 50.", "schema": obj{"type": "integer", "minimum": 1, "maximum": 200, "example": 50}},
		obj{"name": "before", "in": "query", "required": false, "description": "Return records before this time. The first page does not send it.", "schema": obj{"type": "string", "format": "date-time"}},
		obj{"name": "beforeId", "in": "query", "required": false, "description": "With before, also return records at that time whose id sorts earlier. The first page does not send it.", "schema": obj{"type": "string", "format": "uuid"}},
	}, nil, obj{
		"200": jsonResponse("The activity this company loads.", objectSchema("Observation page.", obj{
			"observations": arraySchema("Observations.", ref("RelationshipObservation")),
			"hasMore":      boolSchema("An older record exists beyond this page.", false),
			"nextBefore":   stringSchema("Time of the last record on this page. Send it to load older records that share that time.", "2026-07-08T15:00:00Z", obj{"format": "date-time"}, nullable()),
			"nextBeforeId": stringSchema("Id of the last record on this page. Send it with the time so records that share that time stay on the next page.", activityHubSpotID, obj{"format": "uuid"}, nullable()),
		}, "observations", "hasMore"), activityHistoryPage()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/communication-timeline"] = obj{"get": operation("Relationship Intelligence", "Mail and meetings", "Mail and meetings loads when a company opens. The request asks for the first 50 records and sends no older-page time. The answer is the newest record, the sent message Follow up, and shows this mailbox can see it.", "getRelationshipCommunicationTimeline", bearer(), []any{
		obj{"name": "relationshipId", "in": "path", "required": true, "description": "Company id.", "schema": obj{"type": "string", "format": "uuid", "example": mailMeetingsRelationshipID}},
		obj{"name": "limit", "in": "query", "required": false, "description": "How many records to return. Opening a company asks for 50.", "schema": obj{"type": "integer", "minimum": 1, "maximum": 100, "example": 50}},
		obj{"name": "before", "in": "query", "required": false, "description": "Return records before this time. The first page does not send it.", "schema": obj{"type": "string", "format": "date-time"}},
		obj{"name": "beforeId", "in": "query", "required": false, "description": "With before, also return records at that time whose id sorts earlier. The first page does not send it.", "schema": obj{"type": "string", "format": "uuid"}},
	}, nil, obj{
		"200": jsonResponse("The mail and meetings this company loads.", ref("CommunicationTimelinePage"), mailMeetingsPage()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	changesParam := []any{
		obj{"name": "relationshipId", "in": "path", "required": true, "description": "Relationship id.", "schema": obj{"type": "string", "format": "uuid", "example": whatChangedRelationshipID}},
		obj{"name": "limit", "in": "query", "required": false, "description": "Maximum snapshots. A company asks for the two newest.", "schema": obj{"type": "integer", "minimum": 1, "maximum": 50, "example": 2}},
		obj{"name": "offset", "in": "query", "required": false, "description": "Older snapshots to skip. The first page sends none.", "schema": obj{"type": "integer", "minimum": 0}},
	}
	paths["/v1/relationships/{relationshipId}/changes"] = obj{"get": operation("Relationship Intelligence", "What changed", "What changed loads when a company opens. The request asks for the two newest snapshots and sends no older-page offset. Acme has one snapshot: engagement, health, and lifecycle changed together.", "getRelationshipChanges", bearer(), changesParam, nil, obj{
		"200": jsonResponse("State changes.", objectSchema("Snapshot list.", obj{
			"snapshots": arraySchema("Snapshots.", ref("RelationshipStateSnapshot")),
			"hasMore":   boolSchema("An older snapshot exists beyond this page.", false),
		}, "snapshots", "hasMore"), whatChangedPage()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/conversation-review"] = obj{"get": operation("Relationship Intelligence", "Get earlier conversation review", "Returns focused review items and governance receipts from conversations older than the newest page.", "getRelationshipConversationReview", bearer(), append(append([]any{}, relationshipParam...), obj{"name": "offset", "in": "query", "required": false, "description": "Observation offset. The first page is the newest 200 conversations.", "schema": obj{"type": "integer", "minimum": 0}}), nil, obj{
		"200": jsonResponse("Conversation review page.", objectSchema("Focused review page.", obj{
			"reviewItems":        arraySchema("Review items from this page of conversations.", ref("ConversationReviewItem")),
			"governanceReceipts": arraySchema("Governance receipts from this page of conversations.", ref("ConversationGovernanceReceipt")),
			"hasMore":            boolSchema("An older conversation exists beyond this page.", false),
		}, "reviewItems", "governanceReceipts", "hasMore"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/acknowledgements"] = obj{"post": operation("Relationship Intelligence", "Acknowledge Mission Control state", "Records the exact state version and hash the actor reviewed. A stale acknowledgement fails with 409.", "acknowledgeMissionControl", bearer(), relationshipParam, jsonRequest("Review boundary.", objectSchema("Mission Control acknowledgement.", obj{
		"stateVersion": intSchema("Reviewed state version.", 4), "stateHash": stringSchema("Reviewed state hash.", documentedRelationshipStateHash),
	}, "stateVersion", "stateHash"), obj{"stateVersion": 4, "stateHash": documentedRelationshipStateHash}), obj{
		"201": jsonResponse("Acknowledgement.", objectSchema("Mission Control acknowledgement result.", obj{"id": uuidSchema("Acknowledgement id.", "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"), "stateVersion": intSchema("Reviewed state version.", 4), "stateHash": stringSchema("Reviewed hash.", documentedRelationshipStateHash), "acknowledgedAt": stringSchema("Review time.", "2026-07-31T14:00:00Z", obj{"format": "date-time"})}, "id", "stateVersion", "stateHash", "acknowledgedAt"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/evidence/{evidenceId}"] = obj{"get": operation("Relationship Intelligence", "Open the original detail", originalDetailDescription, "getRelationshipEvidence", bearer(), []any{
		obj{"name": "relationshipId", "in": "path", "required": true, "description": "Company id.", "schema": obj{"type": "string", "format": "uuid", "example": originalDetailRelationshipID}},
		obj{"name": "evidenceId", "in": "path", "required": true, "description": "Activity id.", "schema": obj{"type": "string", "format": "uuid", "example": originalDetailEvidenceID}},
	}, nil, obj{
		"200": jsonResponse("Original detail.", objectSchema("Evidence result.", obj{"observation": ref("RelationshipObservation"), "payload": freeFormSchema("Decrypted provider body. Empty when the activity stored none.")}), originalDetail()),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/corrections"] = obj{"post": operation("Relationship Intelligence", "Correct relationship state", "Appends a user correction assertion and deterministically reprojects the relationship. Source evidence is never overwritten.", "correctRelationship", bearer(), relationshipParam, jsonRequest("Correction.", objectSchema("Relationship correction.", obj{
		"dimension":             stringEnum("Corrected state dimension.", "health", "lifecycle", "engagement", "sentiment", "health", "summary", "next_action", "risk", "milestone"),
		"value":                 stringSchema("Correct value.", "healthy"),
		"reason":                stringSchema("Why the model is wrong.", "The review happened yesterday."),
		"supersedesAssertionId": stringSchema("Optional active assertion on the same relationship and dimension that this correction permanently replaces.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5", obj{"format": "uuid"}),
		"validTo":               stringSchema("Optional exclusive expiry boundary for a temporary correction.", "2026-08-31T17:00:00Z", obj{"format": "date-time"}, nullable()),
	}, "dimension", "value", "reason"), obj{"dimension": "health", "value": "healthy", "reason": "The review happened yesterday."}), obj{
		"201": jsonResponse("Reprojected relationship.", ref("RevenueRelationship"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	assertionParam := make([]any, len(relationshipParam), len(relationshipParam)+1)
	copy(assertionParam, relationshipParam)
	assertionParam = append(assertionParam, obj{"name": "assertionId", "in": "path", "required": true, "description": "User-correction assertion id.", "schema": obj{"type": "string", "format": "uuid"}})
	paths["/v1/relationships/{relationshipId}/assertions/{assertionId}/retract"] = obj{"post": operation("Relationship Intelligence", "Retract a relationship correction", "Ends one active user correction without rewriting its immutable history, then reprojects at the same explicit evaluation time.", "retractRelationshipAssertion", bearer(), assertionParam, jsonRequest("Retraction.", objectSchema("Correction retraction.", obj{
		"reason": stringSchema("Why the correction is being retracted.", "The correction was entered against the wrong customer call."),
	}, "reason"), obj{"reason": "The correction was entered against the wrong customer call."}), obj{
		"200": jsonResponse("Reprojected relationship.", ref("RevenueRelationship"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/conversation-corrections"] = obj{"post": operation("Relationship Intelligence", "Correct reviewed conversation evidence", "Resolves a focused word, speaker, entity, or material-claim review item. State-affecting corrections append a top-precedence user assertion and reproject deterministically.", "correctConversationEvidence", bearer(), relationshipParam, jsonRequest("Focused correction.", objectSchema("Conversation correction.", obj{
		"reviewItemId":   stringSchema("Focused review item id.", conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")),
		"correctedValue": stringSchema("Human-corrected value.", "Avery Chen"),
		"reason":         stringSchema("Correction reason.", "Avery was the speaker."),
	}, "reviewItemId", "correctedValue", "reason"), obj{"reviewItemId": conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker"), "correctedValue": "Avery Chen", "reason": "Avery was the speaker."}), obj{
		"201": jsonResponse("Corrected relationship and refreshed intelligence.", objectSchema("Correction result.", obj{"relationship": ref("RevenueRelationship"), "intelligence": ref("RelationshipIntelligence")}, "relationship", "intelligence"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/conversation-decisions"] = obj{"post": operation("Relationship Intelligence", "Decide a proposed conversation change", "Approves, corrects, rejects, or defers one evidence-backed semantic candidate. A stale baseline returns 409 and no state mutation.", "decideConversationChange", bearer(), relationshipParam, jsonRequest("Review decision.", objectSchema("Conversation review decision.", obj{
		"reviewItemId":   stringSchema("Review item id.", conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")),
		"kind":           stringEnum("Decision kind.", "approve", "approve", "correct", "reject", "defer"),
		"correctedValue": stringSchema("Required replacement for correct.", "Security review is complete."),
		"reason":         stringSchema("Decision reason.", documentedConversationDecisionReason),
		"deferUntil":     stringSchema("Future reminder for defer.", "2026-08-01T14:00:00Z", obj{"format": "date-time"}),
	}, "reviewItemId", "kind"), obj{"reviewItemId": conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker"), "kind": "approve", "reason": "Customer stated this directly."}), obj{
		"201": jsonResponse("Updated relationship and refreshed review queue.", objectSchema("Decision result.", obj{"relationship": ref("RevenueRelationship"), "intelligence": ref("RelationshipIntelligence")}, "relationship", "intelligence"), nil),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})}
	caseParam := make([]any, len(relationshipParam), len(relationshipParam)+1)
	copy(caseParam, relationshipParam)
	caseParam = append(caseParam, obj{"name": "caseId", "in": "path", "required": true, "description": "Contradiction case id.", "schema": obj{"type": "string"}})
	paths["/v1/relationships/{relationshipId}/contradictions/{caseId}/resolve"] = obj{"post": operation("Relationship Intelligence", "Resolve a typed contradiction", "Records the user's selected evidence side as a top-authority correction without rewriting either source.", "resolveRelationshipContradiction", bearer(), caseParam, jsonRequest("Resolution.", objectSchema("Contradiction resolution.", obj{
		"selectedAssertionId": uuidSchema("Selected assertion id.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"reason":              stringSchema("Optional rationale.", "CRM was updated after the meeting."),
	}, "selectedAssertionId"), obj{"selectedAssertionId": "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"}), obj{
		"201": jsonResponse("Updated relationship and intelligence.", freeFormSchema("Relationship detail result."), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	const reconcileCommitmentID = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const reconcileEvaluationID = "recovery:7cb1669953b1015129545ab3"
	paths["/v1/relationships/{relationshipId}/commitment-recovery/run"] = obj{"post": operation("Relationship Intelligence", "Reconcile now", "Reconcile now sends an empty body. A past-due promise with nothing newer comes back as classification forgotten, and the company sheet reads that as a forgotten promise.", "runCommitmentRecovery", bearer(), relationshipParam, jsonRequestOptional("Empty request.", objectSchema("Recovery request.", obj{}), obj{}), obj{
		"201": jsonResponse("Recovery evaluations.", objectSchema("Recovery evaluations.", obj{
			"evaluations": arraySchema("One classification per due promise.", objectSchema("Recovery evaluation.", obj{
				"evaluationId":       stringSchema("Stable id for this classification.", reconcileEvaluationID),
				"commitmentId":       uuidSchema("Promise id.", reconcileCommitmentID),
				"commitmentVersion":  intSchema("Promise version that was checked.", 3),
				"recoveryWindow":     stringSchema("Day the check ran.", "2026-07-31"),
				"reconcilerVersion":  stringSchema("Checker version.", "commitment-recovery-v1"),
				"classification":     stringEnum("Stored classification.", "forgotten", "forgotten", "unknown_stale_sources", "fulfilled", "likely_fulfilled", "superseded", "renegotiated", "blocked"),
				"evidenceRefs":       arraySchema("Fresh evidence considered.", stringSchema("Evidence reference.", "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5")),
				"staleSources":       nullableArraySchema("Sources that were too old to trust. Null when every source was fresh.", stringSchema("Source.", "google")),
				"requiresReview":     boolSchema("Whether a person must review the result.", true),
				"proposedActionType": stringSchema("Follow-up the checker proposes. A forgotten promise proposes a reminder.", "reminder"),
				"explanation":        stringSchema("Sentence the company sheet shows.", "This promise is past due and nothing newer has closed it."),
				"evaluatedAt":        stringSchema("When the check ran.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
			}, "evaluationId", "commitmentId", "classification", "explanation")),
		}, "evaluations"), obj{"evaluations": []any{obj{
			"evaluationId": reconcileEvaluationID, "commitmentId": reconcileCommitmentID, "commitmentVersion": 3,
			"recoveryWindow": "2026-07-31", "reconcilerVersion": "commitment-recovery-v1", "classification": "forgotten",
			"evidenceRefs": []any{}, "staleSources": nil, "requiresReview": true, "proposedActionType": "reminder",
			"explanation": "This promise is past due and nothing newer has closed it.", "evaluatedAt": "2026-07-31T14:00:00Z",
		}}}),
		"401": responseRef("401"), "404": responseRef("404"),
	})}
	commitmentParam := make([]any, len(relationshipParam), len(relationshipParam)+1)
	copy(commitmentParam, relationshipParam)
	commitmentParam = append(commitmentParam, obj{"name": "commitmentId", "in": "path", "required": true, "description": "Commitment id.", "schema": obj{"type": "string", "format": "uuid"}})
	paths["/v1/relationships/{relationshipId}/commitments/{commitmentId}/events"] = obj{"get": operation("Relationship Intelligence", "Get commitment history", "Returns the append-only transition history for one commitment.", "getCommitmentEvents", bearer(), commitmentParam, nil, obj{
		"200": jsonResponse("Commitment events.", objectSchema("Commitment history.", obj{"events": arraySchema("Ordered immutable events.", ref("CommitmentEvent"))}, "events"), nil),
		"401": responseRef("401"), "404": responseRef("404"),
	})}
	paths["/v1/relationships/{relationshipId}/commitments/{commitmentId}/transitions"] = obj{"post": operation("Relationship Intelligence", "Append a commitment transition", "Validates the state machine and appends one idempotent event before atomically updating the materialized projection.", "appendCommitmentTransition", bearer(), commitmentParam, jsonRequest("Transition.", objectSchema("Commitment transition.", obj{
		"kind":           stringEnum("Event kind.", "accepted", "internally_confirmed", "offered", "accepted", "disputed", "blocked", "unblocked", "corrected", "due_date_changed", "renegotiated", "fulfilled", "missed", "waived", "cancelled", "superseded"),
		"idempotencyKey": stringSchema("Stable source event id.", documentedQueueAcceptKey),
		"reason":         stringSchema("Optional reason.", documentedQueueAcceptReason),
		"dueAt":          stringSchema("Replacement due date.", "2026-08-07T17:00:00Z", obj{"format": "date-time"}),
		"action":         stringSchema("Replacement action for renegotiation.", "Send revised packet."),
		"blocker":        stringSchema("Blocker detail.", "Waiting on legal."),
		"evidenceRefs":   arraySchema("Evidence references. An omitted list is stored as this transition.", stringSchema("Reference.", documentedQueueAcceptEvidence)),
	}, "kind", "idempotencyKey"), obj{"kind": "accepted", "idempotencyKey": documentedQueueAcceptKey, "reason": documentedQueueAcceptReason}), obj{
		"200": jsonResponse("Updated commitment.", ref("RelationshipCommitment"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/commitment-dependencies"] = obj{"post": operation("Relationship Intelligence", "Create a commitment dependency", "Creates an evidence-backed dependency after enforcing tenant and relationship scope and rejecting graph cycles.", "createCommitmentDependency", bearer(), relationshipParam, jsonRequest("Dependency.", objectSchema("Commitment dependency request.", obj{
		"fromCommitmentId": uuidSchema("Origin commitment id.", "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
		"toCommitmentId":   uuidSchema("Target commitment id.", "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51"),
		"kind":             stringEnum("Dependency semantics.", "blocks", "blocks", "requires", "supersedes"),
		"evidenceRefs":     arraySchema("Evidence references.", stringSchema("Reference.", "relationship-observation:ab12")),
	}, "fromCommitmentId", "toCommitmentId", "kind", "evidenceRefs"), obj{"fromCommitmentId": "8b8dfa9b-a7b2-46ea-982c-622a914c00e5", "toCommitmentId": "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51", "kind": "blocks", "evidenceRefs": []any{"relationship-observation:ab12"}}), obj{
		"201": jsonResponse("Created dependency.", ref("CommitmentDependency"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/mutual-action-plans"] = obj{"post": operation("Relationship Intelligence", "Create from promises they accepted", "Create from promises they accepted posts the ids of promises they accepted that are still open. The stored plan status is draft.", "createMutualActionPlan", bearer(), relationshipParam, jsonRequest("Accepted commitments.", objectSchema("Plan create request.", obj{
		"commitmentIds": arraySchema("Commitment ids.", uuidSchema("Commitment id.", documentedDraftCommitmentID)),
	}, "commitmentIds"), obj{"commitmentIds": []any{documentedDraftCommitmentID}}), obj{
		"201": jsonResponse("Draft plan.", draftPlanSchema(), documentedDraftPlan()),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	planParam := make([]any, len(relationshipParam), len(relationshipParam)+1)
	copy(planParam, relationshipParam)
	planParam = append(planParam, obj{"name": "planId", "in": "path", "required": true, "description": "Mutual action plan id.", "schema": obj{"type": "string"}})
	paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}"] = obj{"put": operation("Relationship Intelligence", "Revise a mutual action plan", "Appends a validated revision and invalidates any approval bound to the prior hash.", "reviseMutualActionPlan", bearer(), planParam, jsonRequest("Replacement items.", objectSchema("Plan revision request.", obj{
		"items": arraySchema("Plan items.", freeFormSchema("Mutual action plan item.")),
	}, "items"), nil), obj{
		"200": jsonResponse("Revised plan.", freeFormSchema("Mutual action plan."), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	const pendingCompanyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const pendingPersonID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	paths["/v1/research/companies/pending"] = obj{"get": operation("Relationship Intelligence", "Pending companies", "Fill in companies and people reads this list first, then posts these relationship ids. The pending company is 9c8dfa9b-a7b2-46ea-982c-622a914c00e5.", "listPendingCompanyEnrichment", bearer(), nil, nil, obj{
		"200": jsonResponse("Pending company ids.", objectSchema("Pending companies.", obj{
			"relationshipIds": arraySchema("Pending company ids.", uuidSchema("Relationship id.", pendingCompanyID)),
		}, "relationshipIds"), obj{"relationshipIds": []any{pendingCompanyID}}),
		"401": responseRef("401"),
		"402": responseRef("402"),
		"403": responseRef("403"),
		"409": responseRef("409"),
		"503": responseRef("503"),
	})}
	paths["/v1/research/people/pending"] = obj{"get": operation("Relationship Intelligence", "Pending people", "Fill in companies and people reads this list after the companies, then posts these person ids. The pending person is 1b8dfa9b-a7b2-46ea-982c-622a914c00e5.", "listPendingPersonEnrichment", bearer(), nil, nil, obj{
		"200": jsonResponse("Pending person ids.", objectSchema("Pending people.", obj{
			"personIds": arraySchema("Pending person ids.", uuidSchema("Person id.", pendingPersonID)),
		}, "personIds"), obj{"personIds": []any{pendingPersonID}}),
		"401": responseRef("401"),
		"402": responseRef("402"),
		"403": responseRef("403"),
		"409": responseRef("409"),
		"503": responseRef("503"),
	})}
	paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/approve"] = obj{"post": operation("Relationship Intelligence", "Approve a plan revision", "Binds internal approval to the exact current revision hash.", "approveMutualActionPlan", bearer(), planParam, jsonRequestOptional("Empty request.", objectSchema("Plan approval request.", obj{}), obj{}), obj{
		"200": jsonResponse("Approved plan.", freeFormSchema("Mutual action plan."), nil),
		"401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/share"] = obj{"post": operation("Relationship Intelligence", "Draft an email to share this plan", "Draft an email to share this plan posts an empty body. The stored plan status is shared, the token state is active, and responseToken is the one-time token. The server keeps only the hash of that token.", "shareMutualActionPlan", bearer(), planParam, jsonRequestOptional("Empty request.", objectSchema("Plan share request.", obj{}), obj{}), obj{
		"201": jsonResponse("Shared plan and one-time token.", objectSchema("Plan share result.", obj{
			"plan":          mutualActionPlanSchema("shared", "active"),
			"responseToken": stringSchema("One-time token for the shared plan. The server stores only its hash.", documentedPlanResponseToken),
		}, "plan", "responseToken"), obj{
			"plan":          documentedMutualActionPlan("shared", "active", documentedPlanDecisionID),
			"responseToken": documentedPlanResponseToken,
		}),
		"401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	paths["/v1/relationships/{relationshipId}/conversation-policy"] = obj{
		"get": operation("Relationship Intelligence", "Inspect conversation policy", "Returns all applicable layers and the monotonically resolved effective policy.", "getConversationPolicy", bearer(), relationshipParam, nil, obj{
			"200": jsonResponse("Policy layers and effective policy.", freeFormSchema("Conversation policy result."), nil), "401": responseRef("401"), "404": responseRef("404"),
		}),
		"put": operation("Relationship Intelligence", "Update conversation policy", "Appends authorized policy-layer versions; lower layers may only make handling stricter.", "putConversationPolicy", bearer(), relationshipParam, jsonRequest("Policy layers.", objectSchema("Policy update.", obj{
			"layers": arraySchema("Versioned policy layers.", freeFormSchema("Conversation policy layer.")),
		}, "layers"), nil), obj{
			"201": jsonResponse("Resolved effective policy.", freeFormSchema("Conversation policy result."), nil), "400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"),
		}),
	}
	paths["/v1/research/companies/estimate"] = obj{"get": operation("Relationship Intelligence", "Estimate companies", "When public research is allowed, the companies page loads this estimate and prints the company count. One pending company uses the pro processor: 1000 credits, which is usd 0.1. batchSize 25 is the maximum ids one fill request accepts. The page adds this usd to the people estimate.", "getCompanyResearchEstimate", bearer(), nil, nil, obj{
		"200": jsonResponse("Company research estimate.", objectSchema("Company research estimate.", obj{
			"companies": intSchema("Pending companies.", 1),
			"processor": stringEnum("Research processor. Company estimates use pro.", "pro", "lite", "base", "core", "pro"),
			"credits":   intSchema("Credits for the pending companies. pro is 1000 credits each.", 1000),
			"usd":       numberSchema("credits divided by 10000.", 0.1),
			"batchSize": intSchema("Maximum company ids one fill request accepts.", 25),
		}, "processor", "credits", "usd", "batchSize"), obj{
			"companies": 1, "processor": "pro", "credits": 1000, "usd": 0.1, "batchSize": 25,
		}),
		"401": responseRef("401"),
		"402": responseRef("402"),
		"403": responseRef("403"),
		"409": responseRef("409"),
		"503": responseRef("503"),
	})}
	paths["/v1/research/people/estimate"] = obj{"get": operation("Relationship Intelligence", "Estimate people", "When public research is allowed, the companies page loads this estimate and prints the people count. One pending person uses the pro processor: 1000 credits, which is usd 0.1. batchSize 25 is the maximum ids one fill request accepts. The page adds this usd to the company estimate.", "getPersonResearchEstimate", bearer(), nil, nil, obj{
		"200": jsonResponse("People research estimate.", objectSchema("People research estimate.", obj{
			"people":    intSchema("Pending people.", 1),
			"processor": stringEnum("Research processor. People estimates use pro.", "pro", "lite", "base", "core", "pro"),
			"credits":   intSchema("Credits for the pending people. pro is 1000 credits each.", 1000),
			"usd":       numberSchema("credits divided by 10000.", 0.1),
			"batchSize": intSchema("Maximum person ids one fill request accepts.", 25),
		}, "processor", "credits", "usd", "batchSize"), obj{
			"people": 1, "processor": "pro", "credits": 1000, "usd": 0.1, "batchSize": 25,
		}),
		"401": responseRef("401"),
		"402": responseRef("402"),
		"403": responseRef("403"),
		"409": responseRef("409"),
		"503": responseRef("503"),
	})}
	paths["/v1/relationships/{relationshipId}/conversation-deletion"] = obj{"post": operation("Relationship Intelligence", "Request conversation deletion", "Evaluates legal hold at execution time, removes server-side content transactionally, and returns an idempotent per-target receipt. Device and provider work remains pending until separately verified.", "requestConversationDeletion", bearer(), relationshipParam, jsonRequest("Deletion request.", objectSchema("Deletion request.", obj{
		"requestId": stringSchema("Idempotency key.", documentedDeletionRequestID, obj{"format": "uuid"}),
	}, "requestId"), obj{"requestId": documentedDeletionRequestID}), obj{
		"202": jsonResponse("Deletion receipt.", ref("ConversationDeletionReceipt"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409"),
	})}
	personParam := []any{obj{"name": "personId", "in": "path", "required": true, "description": "Person id.", "schema": obj{"type": "string", "format": "uuid"}}}
	paths["/v1/relationship-persons/{personId}"] = obj{"delete": operation("Relationship Intelligence", "Remove a person", "Confirm remove sends reason user_action. The server stores that reason, deletes the person and every derived row, and writes suppression anchors so the next sync cannot recreate them.", "deleteRelationshipPerson", bearer(), personParam, jsonRequest("Person removal.", objectSchema("Person removal request.", obj{
		"reason": stringEnum("Why this person was removed.", documentedPersonRemovalReason, documentedPersonRemovalReason, "subject_request"),
	}, "reason"), obj{"reason": documentedPersonRemovalReason}), obj{
		"200": jsonResponse("Removal receipt.", ref("PersonDeletionReceipt"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "403": responseRef("403"), "404": responseRef("404"),
	})}

	paths["/v1/research/consent"] = obj{"put": operation("Relationship Intelligence", "Allow public research", "Allow public research sends consented true. Turn off sends consented false. The server stores that choice for the workspace and records consentedAt only while consent is on.", "setCloudResearchConsent", bearer(), nil, jsonRequest("Public research consent.", objectSchema("Public research consent.", obj{
		"consented": boolSchema("Whether public research is allowed.", true),
	}, "consented"), obj{"consented": true}), obj{
		"200": jsonResponse("Stored public research consent.", ref("CloudResearchConsentState"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "403": responseRef("403"),
	})}

	paths["/v1/research/companies"] = obj{"post": operation("Relationship Intelligence", "Fill in companies", "Fill in companies and people posts the pending company ids first. Each request stays within the estimate batch size.", "enrichCompanies", bearer(), nil, jsonRequest("Company research batch.", objectSchema("Company research batch.", obj{
		"relationshipIds": arraySchema("Pending company ids.", uuidSchema("Relationship id.", documentedResearchCompanyID)),
	}, "relationshipIds"), obj{"relationshipIds": []any{documentedResearchCompanyID}}), obj{
		"200": jsonResponse("Company research results.", objectSchema("Company research results.", obj{
			"outcomes": arraySchema("One outcome per company.", ref("CompanyResearchOutcome")),
		}, "outcomes"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "402": responseRef("402"), "403": responseRef("403"), "409": responseRef("409"), "503": responseRef("503"),
	})}
	paths["/v1/research/people"] = obj{"post": operation("Relationship Intelligence", "Fill in people", "Fill in companies and people posts the pending person ids after the companies. Each request stays within the estimate batch size.", "enrichPersons", bearer(), nil, jsonRequest("Person research batch.", objectSchema("Person research batch.", obj{
		"personIds": arraySchema("Pending person ids.", uuidSchema("Person id.", documentedResearchPersonID)),
	}, "personIds"), obj{"personIds": []any{documentedResearchPersonID}}), obj{
		"200": jsonResponse("Person research results.", objectSchema("Person research results.", obj{
			"outcomes": arraySchema("One outcome per person.", ref("PersonResearchOutcome")),
		}, "outcomes"), nil),
		"400": responseRef("400"), "401": responseRef("401"), "402": responseRef("402"), "403": responseRef("403"), "409": responseRef("409"), "503": responseRef("503"),
	})}

	paths["/v1/research/status"] = obj{"get": operation("Relationship Intelligence", "Check public research", "The companies page checks public research before it shows Allow public research. When research is configured, the required plan is intelligence, and consent is still off, the response is available true, allowed false, and reason consent_required.", "getResearchStatus", bearer(), nil, nil, obj{
		"200": jsonResponse("Public research status.", objectSchema("Public research status.", obj{
			"available":    boolSchema("Whether a research vendor is configured.", true),
			"allowed":      boolSchema("Whether this workspace may run public research now.", false),
			"reason":       stringEnum("Why public research is not running. Absent when it is allowed.", "consent_required", "consent_required", "plan_required", "capability_disabled", "provider_unconfigured", "unavailable"),
			"requiredPlan": stringSchema("Plan that includes public research.", "intelligence"),
			"consent": objectSchema("Stored public research consent.", obj{
				"consented":   boolSchema("Whether this workspace has allowed public research.", false),
				"consentedAt": stringSchema("When consent was allowed. Omitted while consent is off.", nil, obj{"format": "date-time"}, nullable()),
			}, "consented"),
		}, "available", "allowed", "requiredPlan", "consent"), obj{
			"available": true, "allowed": false, "reason": "consent_required", "requiredPlan": "intelligence",
			"consent": obj{"consented": false},
		}),
		"401": responseRef("401"),
		"403": responseRef("403"),
	})}
	paths["/v1/relationship-observations/batch"] = obj{"post": operation("Relationship Intelligence", "Ingest relationship observations", "Atomically ingests up to 100 idempotent observations from Gmail, Calendar, Slack, CRM, desktop, or another adapter, then reprojects each affected relationship once.", "ingestRelationshipObservations", bearer(), nil, jsonRequest("Observation batch.", objectSchema("Observation batch.", obj{
		"observations": arraySchema("Provider-neutral observations.", objectSchema("Observation input.", obj{
			"relationshipId":  uuidSchema("Known relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
			"displayName":     stringSchema("Account display name for first ingestion.", "Acme"),
			"primaryEmail":    stringSchema("Primary contact email.", "avery@acme.com"),
			"accountDomain":   stringSchema("Exact account domain.", "acme.com"),
			"resourceRefs":    arraySchema("Canonical product:type:externalId references.", stringSchema("Resource reference.", "desktop:relationship:acme")),
			"source":          stringSchema("Evidence source.", "gmail"),
			"sourceAccountId": stringSchema("Provider account id.", "me@company.com"),
			"externalId":      stringSchema("Provider event id.", "message-123"),
			"sourceVersion":   stringSchema("Provider event version.", "1"),
			"eventType":       stringSchema("Normalized event type.", "commitment_created"),
			"occurredAt":      stringSchema("Occurrence time.", "2026-07-18T17:30:00Z", obj{"format": "date-time"}),
			"receivedAt":      stringSchema("Receipt time.", "2026-07-18T17:30:01Z", obj{"format": "date-time"}),
			"summary":         stringSchema("Bounded evidence summary.", "We promised the security packet."),
			"normalizedFacts": freeFormSchema("Provider-neutral facts."),
			"payload":         freeFormSchema("Raw provider payload, sealed at rest."),
			"participants": arraySchema("Observed relationship participants.", objectSchema("Observation participant.", obj{
				"displayName": stringSchema("Participant display name.", "Avery Chen"),
				"email":       stringSchema("Participant email.", "avery@acme.com"),
				"role":        stringSchema("Relationship role.", "champion"),
				"title":       stringSchema("Participant title.", "VP Engineering"),
				"externalRefs": arraySchema("Provider participant references.",
					stringSchema("Participant reference.", "gmail:contact:123")),
				"direction": stringEnum("Participant interaction direction.", "inbound", "inbound", "outbound", "internal"),
			}, "displayName")),
			"assertions": arraySchema("Typed assertion candidates. Caller authority is ignored; userConfirmed records an explicit reviewed correction.", objectSchema("Observation assertion.", obj{
				"dimension":              stringEnum("Projected dimension.", "health", "lifecycle", "engagement", "sentiment", "health", "summary", "next_action", "risk", "milestone"),
				"value":                  stringSchema("Typed assertion value.", "needs_attention"),
				"valueSchemaVersion":     intSchema("Typed value schema version.", 1),
				"sourceType":             stringEnum("Claimed source type. Unconfirmed public assertions are downgraded to proposed AI-tier candidates.", "ai_inference", "source_fact", "deterministic", "external_research", "ai_inference"),
				"confidence":             numberSchema("Assertion confidence, including explicit zero.", 0.8, obj{"minimum": 0, "maximum": 1}),
				"reason":                 stringSchema("Evidence-backed explanation.", "Recent engagement indicates attention is needed."),
				"validFrom":              stringSchema("Validity start.", "2026-07-18T17:30:00Z", obj{"format": "date-time"}),
				"validTo":                stringSchema("Optional exclusive validity end.", "2026-08-18T17:30:00Z", obj{"format": "date-time"}, nullable()),
				"supersedesAssertionId":  uuidSchema("Reserved for trusted internal writers. Public observation admission ignores it; use the correction endpoint for validated supersession.", "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"),
				"extractorVersion":       stringSchema("Extractor version.", "desktop-review-v1"),
				"projectorCompatVersion": intSchema("Minimum compatible projector version. Public candidates are clamped to the current version.", 2),
				"citationsJson":          stringSchema("JSON citations for external research.", "[]"),
				"userConfirmed":          boolSchema("Whether the authenticated user explicitly accepted this value. The server records it as a user correction with reviewer metadata.", true),
			}, "dimension", "value", "confidence", "reason")),
			"channel":   stringEnum("Interaction channel.", "email", "email", "meeting", "call", "chat", "note", "crm"),
			"direction": stringEnum("Interaction direction.", "inbound", "inbound", "outbound", "internal"),
		}, "source", "externalId", "eventType")),
	}, "observations"), documentedSavedNoteRequest()), obj{
		"201": jsonResponse("Stored note.", freeFormSchema("Observation, relationship, and duplicate status per input."), documentedSavedNoteResponse()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"409": responseRef("409"),
	})}
	paths["/v1/relationship-persons"] = obj{"get": operation("Relationship Intelligence", "People", "People loads this directory. The request asks for the first 500 people. The answer lists each person with their name, email, role, company, and when you last talked.", "listRelationshipPersons", bearer(), []any{
		obj{"name": "limit", "in": "query", "required": false, "description": "How many people to return. The directory asks for 500.", "schema": intSchema("How many people to return. The directory asks for 500.", 500, obj{"minimum": 1, "maximum": 500})},
	}, nil, obj{
		"200": jsonResponse("The people in this workspace.", objectSchema("People directory.", obj{
			"persons": arraySchema("People, most recently active first.", objectSchema("One person.", obj{
				"id":                 uuidSchema("Person id.", peopleDirectoryPersonID),
				"displayName":        stringSchema("Name.", "Sarah Chen"),
				"aliases":            arraySchema("Other names.", stringSchema("Other name.", nil)),
				"primaryEmail":       stringSchema("Email.", "sarah@acme.example"),
				"title":              stringSchema("Role.", "VP Engineering"),
				"orgName":            stringSchema("Company.", "Acme"),
				"orgDomain":          stringSchema("Company domain.", "acme.example"),
				"status":             stringEnum("Whether this person is in the directory.", "active", "active", "merged"),
				"employmentStatus":   stringEnum("Whether their mail still reaches them.", "unknown", "unknown", "active", "departed"),
				"relationshipCount":  intSchema("Companies this person is on.", 1),
				"participantRoles":   arraySchema("Roles on those companies.", stringSchema("Role.", "champion")),
				"firstInteractionAt": stringSchema("When you first talked.", "2026-08-04T12:00:00Z", obj{"format": "date-time"}),
				"lastInteractionAt":  stringSchema("When you last talked.", "2026-08-04T12:00:00Z", obj{"format": "date-time"}),
				"attributesVersion":  intSchema("How many times these details changed.", 1),
			}, "id", "displayName", "aliases", "status", "relationshipCount", "attributesVersion")),
			"hasMore": boolSchema("Whether another person exists past this page.", false),
		}, "persons", "hasMore"), peopleDirectoryResponse()),
		"400": responseRef("400"),
		"401": responseRef("401"),
	})}

	paths["/v1/relationship-persons/{personId}/attributes"] = obj{"get": operation("Relationship Intelligence", "Open person", "Open person loads the profile behind a name in the directory. The request sends only the person id. The answer is each stored detail: the value, where it came from, and why it is there.", "getRelationshipPersonAttributes", bearer(), []any{
		obj{"name": "personId", "in": "path", "required": true, "description": "Person id.", "schema": uuidSchema("Person id.", openPersonID)},
	}, nil, obj{
		"200": jsonResponse("The profile details Open person loads.", objectSchema("Person profile.", obj{
			"attributes": arraySchema("Stored details, newest first.", objectSchema("One stored detail.", obj{
				"id":         uuidSchema("Detail id.", openPersonTitleID),
				"dimension":  stringSchema("Which detail this is.", "title"),
				"value":      stringSchema("The stored detail.", "VP Engineering"),
				"sourceType": stringSchema("How this detail was established.", "source_fact"),
				"source":     stringSchema("Where this detail came from.", "hubspot"),
				"extractor":  stringSchema("How it was read.", "crm_field"),
				"status":     stringSchema("Whether this detail is current.", "active"),
				"confidence": numberSchema("How strongly this detail is held.", 0.7),
				"reason":     stringSchema("Why this detail is here.", "Title supplied by the source record."),
				"observedAt": stringSchema("When it was seen.", "2026-08-04T12:00:00Z", obj{"format": "date-time"}),
				"validFrom":  stringSchema("When it started counting.", "2026-08-04T12:00:00Z", obj{"format": "date-time"}),
			}, "id", "dimension", "value", "sourceType", "source", "extractor", "status", "confidence", "observedAt", "validFrom")),
		}, "attributes"), openPersonProfile()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	planTokenParam := []any{obj{"name": "X-Oppulence-Plan-Token", "in": "header", "required": true, "description": "Scoped plan response token. Never put this token in a URL or query parameter.", "schema": obj{"type": "string"}}}
	paths["/v1/public/mutual-action-plan"] = obj{"get": operation("Relationship Intelligence", "Open a scoped mutual action plan", "Returns only the externally authorized plan revision with internal evidence references removed and policy redactions applied.", "getPublicMutualActionPlan", nil, planTokenParam, nil, obj{
		"200": jsonResponse("Scoped public plan.", freeFormSchema("Public mutual action plan."), nil), "404": responseRef("404"),
	})}
	paths["/v1/public/mutual-action-plan/responses"] = obj{"post": operation("Relationship Intelligence", "Respond to a scoped plan", "Appends an idempotent external response for internal review; it never directly changes canonical commitments.", "respondPublicMutualActionPlan", nil, planTokenParam, jsonRequest("External response.", objectSchema("Plan response.", obj{
		"responseId":    stringSchema("Counterparty-generated idempotency key.", documentedPlanResponseID, obj{"format": "uuid"}),
		"kind":          stringEnum("Response kind.", "confirm", "confirm", "correct", "blocked", "completed", "comment"),
		"itemId":        stringSchema("Plan item id when applicable.", documentedPlanItemID),
		"proposedValue": stringSchema("Proposed correction.", "Move due date to Friday."),
		"comment":       stringSchema("Counterparty comment.", "Waiting on legal."),
	}, "responseId", "kind"), obj{"responseId": documentedPlanResponseID, "kind": "confirm", "comment": ""}), obj{
		"201": jsonResponse("Recorded response.", freeFormSchema("Response receipt."), nil), "400": responseRef("400"), "404": responseRef("404"),
	})}
	paths["/v1/relationship-sources"] = obj{"get": operation("Relationship Intelligence", "List guided source connections", "Returns Google, Slack, and HubSpot capability/scopes plus durable account lifecycle state. No token, secret, or raw cursor is exposed.", "getRelationshipSourceInventory", bearer(), nil, nil, obj{
		"200": jsonResponse("Guided source inventory.", objectSchema("Source inventory.", obj{"sources": arraySchema("Source cards.", ref("RelationshipSourceInventoryItem"))}, "sources"), nil),
		"401": responseRef("401"),
	})}
	paths["/v1/relationship-sources/status"] = obj{"get": operation("Relationship Intelligence", "Get source health", "Returns authorization, backfill, freshness, failure, repair, revocation, and disconnect state for each relationship evidence source.", "getRelationshipSourceStatuses", bearer(), nil, nil, obj{
		"200": jsonResponse("Evidence source health.", objectSchema("Source status list.", obj{"sources": arraySchema("Sources.", ref("RelationshipSourceStatus"))}), nil),
		"401": responseRef("401"),
	})}
	paths["/v1/relationship-beta/diagnostics"] = obj{"get": operation("Relationship Intelligence", "Export redacted beta diagnostics", "Returns metadata-only rollout, source, queue, projection, uncertainty, and trust-funnel diagnostics for workspace administrators. Customer content, credentials, cursors, raw errors, and correlation identifiers are excluded.", "getRelationshipBetaDiagnostics", bearer(), nil, nil, obj{
		"200": jsonResponse("Support-safe diagnostic bundle.", ref("BetaDiagnostics"), nil), "401": responseRef("401"), "403": responseRef("403"),
	})}
	sourceParam := []any{obj{"name": "source", "in": "path", "required": true, "description": "Beta source provider.", "schema": obj{"type": "string", "enum": []any{"google", "slack", "hubspot"}}}}
	paths["/v1/relationship-sources/{source}/authorization"] = obj{"post": operation("Relationship Intelligence", "Report source authorization lifecycle", "Records the bounded consent state, actor, granted read scopes, and safe categorical failure without exposing provider tokens or authorization codes.", "reportRelationshipSourceAuthorization", bearer(), sourceParam, jsonRequest("Authorization lifecycle transition.", objectSchema("Source authorization transition.", obj{
		"sourceAccountId": stringSchema("Provider account id when known; otherwise default.", "me@company.com"),
		"state":           stringEnum("Consent transition.", "completed", "started", "completed", "canceled", "failed"),
		"grantedScopes":   arraySchema("Scopes returned by the provider.", stringSchema("Scope.", "https://www.googleapis.com/auth/gmail.readonly")),
		"errorCode":       stringSchema("Safe categorical error for failed transitions.", "invalid_grant"),
	}, "state"), obj{"sourceAccountId": "me@company.com", "state": "completed", "grantedScopes": []any{"https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.events.readonly"}}), obj{
		"200": jsonResponse("Updated authorization lifecycle.", ref("RelationshipSourceStatus"), nil), "400": responseRef("400"), "401": responseRef("401"), "403": responseRef("403"),
	})}
	resyncSourceParam := []any{obj{"name": "source", "in": "path", "required": true, "description": "Beta source provider.", "schema": obj{"type": "string", "enum": []any{"google", "slack", "hubspot"}, "example": "google"}}}
	paths["/v1/relationship-sources/{source}/resync"] = obj{"post": operation("Relationship Intelligence", "Resync a source", "Retry sync, Refresh now, and Resync post the connected account and queue a fresh read. The stored answer marks that account backfilling, with the read queued and completeness rebuilding.", "resyncRelationshipSource", bearer(), resyncSourceParam, jsonRequest("Source account.", objectSchema("Source resync request.", obj{"sourceAccountId": stringSchema("Provider account id.", retrySyncAccount)}, "sourceAccountId"), obj{"sourceAccountId": retrySyncAccount}), obj{
		"202": jsonResponse("Queued source lifecycle.", ref("RelationshipSourceStatus"), retrySyncStatus()), "400": responseRef("400"), "401": responseRef("401"), "403": responseRef("403"),
	})}
	disconnectSourceParam := []any{
		obj{"name": "source", "in": "path", "required": true, "description": "Beta source provider.", "schema": obj{"type": "string", "enum": []any{"google", "slack", "hubspot"}, "example": "google"}},
		obj{"name": "sourceAccountId", "in": "path", "required": true, "description": "Provider account id.", "schema": obj{"type": "string", "example": "me@company.com"}},
	}
	paths["/v1/relationship-sources/{source}/{sourceAccountId}/disconnect"] = obj{"post": operation("Relationship Intelligence", "Disconnect", "Disconnect posts no request body. The stored source is disconnected, backfill returns to idle, completeness is disconnected, and sync lag is cleared. Credential revocation stays on the connector path shown on the source card.", "disconnectRelationshipSource", bearer(), disconnectSourceParam, nil, obj{
		"200": jsonResponse("Disconnected source.", ref("RelationshipSourceStatus"), documentedDisconnectedSource()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
	})}

	paths["/v1/relationship-identity-candidates"] = obj{"get": operation("Relationship Intelligence", "Review possible duplicates", pendingDuplicatesDescription, "listRelationshipIdentityCandidates", bearer(), []any{
		obj{"name": "status", "in": "query", "required": false, "description": "pending is the inbox. Review possible duplicates asks for pending.", "example": "pending", "schema": obj{"type": "string", "enum": []any{"pending", "deferred", "resolving", "resolved", "undone"}, "example": "pending"}},
		obj{"name": "source", "in": "query", "required": false, "description": "Provider. The inbox does not send this.", "schema": obj{"type": "string"}},
		obj{"name": "relationshipId", "in": "query", "required": false, "description": "Restrict to one company. The inbox does not send this.", "schema": obj{"type": "string", "format": "uuid"}},
		obj{"name": "limit", "in": "query", "required": false, "description": "Page size (max 100). The inbox asks for 50.", "example": 50, "schema": obj{"type": "integer", "example": 50}},
		obj{"name": "offset", "in": "query", "required": false, "description": "How many duplicates to skip. The inbox does not send this on the first page.", "schema": obj{"type": "integer", "minimum": 0}},
	}, nil, obj{"200": jsonResponse("Empty pending duplicate page.", objectSchema("Pending duplicate page.", obj{
		"candidates": arraySchema("Candidates.", ref("RelationshipIdentityCandidate")),
		"hasMore":    boolSchema("Another duplicate exists beyond this page.", false),
	}, "candidates", "hasMore"), pendingDuplicatesPage()), "400": responseRef("400"), "401": responseRef("401")})}
	candidateParam := []any{obj{"name": "candidateId", "in": "path", "required": true, "description": "Identity candidate id.", "schema": obj{"type": "string", "format": "uuid"}}}
	paths["/v1/relationship-identity-candidates/{candidateId}"] = obj{"get": operation("Relationship Intelligence", "Inspect identity candidate", "Returns exact anchors, provider records, evidence range, impact, advisory confidence, immutable decisions, and lineage.", "getRelationshipIdentityCandidate", bearer(), candidateParam, nil, obj{"200": jsonResponse("Identity candidate.", ref("RelationshipIdentityCandidate"), nil), "401": responseRef("401"), "404": responseRef("404")})}
	paths["/v1/relationship-identity-candidates/{candidateId}/decisions"] = obj{"post": operation("Relationship Intelligence", "Decide identity candidate", "Applies merge, keep-separate, move-evidence, split, defer, or compensating undo once at the expected optimistic version.", "decideRelationshipIdentityCandidate", bearer(), candidateParam, jsonRequest("Identity decision.", objectSchema("Identity decision request.", obj{
		"decision": stringEnum("Decision.", "merge", "merge", "keep_separate", "move_evidence", "split", "defer", "undo"), "reason": stringSchema("Actor reason.", documentedIdentityDecisionReason), "expectedVersion": intSchema("Expected candidate version.", 1), "idempotencyKey": stringSchema("Stable client idempotency key.", documentedIdentityDecisionKey, obj{"format": "uuid"}),
	}, "decision", "expectedVersion", "idempotencyKey"), obj{"decision": "merge", "expectedVersion": 1, "reason": documentedIdentityDecisionReason, "idempotencyKey": documentedIdentityDecisionKey}), obj{"200": jsonResponse("Resolved candidate.", ref("RelationshipIdentityCandidate"), nil), "400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409")})}

	paths["/v1/relationship-attention"] = obj{"get": operation("Relationship Intelligence", "List portfolio attention", "Returns deterministic relationship-native attention ordered by explicit factor contributions. A full page is the end of the queue when hasMore is false.", "listRelationshipAttention", bearer(), []any{
		obj{"name": "status", "in": "query", "required": false, "schema": obj{"type": "string", "enum": []any{"open", "acknowledged", "snoozed", "dismissed", "superseded", "resolved", "all"}}},
		obj{"name": "limit", "in": "query", "required": false, "schema": obj{"type": "integer"}},
		obj{"name": "offset", "in": "query", "required": false, "description": "Page offset.", "schema": obj{"type": "integer", "minimum": 0}},
	}, nil, obj{"200": jsonResponse("Attention projection.", objectSchema("Attention list. A full page is the end of the queue when hasMore is false.", obj{
		"contractVersion": stringSchema("Contract version.", "relationship-attention.v1"),
		"asOf":            stringSchema("Read boundary.", "2026-07-31T14:00:00Z", obj{"format": "date-time"}),
		"items":           arraySchema("Attention items.", ref("RelationshipAttentionItem")),
		"hasMore":         boolSchema("Another company exists beyond this page of the queue.", false),
	}, "contractVersion", "asOf", "items"), nil), "401": responseRef("401")})}
	attentionParam := []any{obj{"name": "attentionId", "in": "path", "required": true, "description": "Attention item id.", "schema": obj{"type": "string", "format": "uuid"}}}
	paths["/v1/relationship-attention/{attentionId}/decisions"] = obj{"post": operation("Relationship Intelligence", "Decide attention item", "Acknowledges, snoozes, or dismisses at the expected optimistic version. Materially new evidence reopens the item.", "decideRelationshipAttention", bearer(), attentionParam, jsonRequest("Attention decision.", objectSchema("Attention decision request.", obj{
		"decision": stringEnum("Decision.", "acknowledge", "acknowledge", "snooze", "dismiss"), "reason": stringSchema("Decision reason.", documentedAttentionAcknowledgeReason), "expectedVersion": intSchema("Expected version.", 1), "snoozedUntil": stringSchema("Bounded future wake time.", "2026-08-07T14:00:00Z", obj{"format": "date-time"}, nullable()),
	}, "decision", "expectedVersion"), obj{"decision": "acknowledge", "reason": documentedAttentionAcknowledgeReason, "expectedVersion": 1}), obj{"200": jsonResponse("Updated attention item.", ref("RelationshipAttentionItem"), nil), "400": responseRef("400"), "401": responseRef("401"), "404": responseRef("404"), "409": responseRef("409")})}
	approveRecommendationParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Recommendation/action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedApprovedRecommendationID}}}
	paths["/v1/relationship-recommendations/{actionId}/approve"] = obj{"post": operation("Relationship Intelligence", "Approve", "Approve posts acceptRisk false. The stored recommendation is approved for its current revision, and the approval time is recorded. The queue stays open.", "approveRelationshipRecommendation", bearer(), approveRecommendationParam, jsonRequestOptional("Approval options.", objectSchema("Approve request.", obj{"acceptRisk": boolSchema("Explicitly accept a review-required decision.", false)}), obj{"acceptRisk": false}), obj{
		"200": jsonResponse("Approved recommendation.", ref("RevenueAction"), documentedApprovedRecommendation()),
		"401": responseRef("401"),
		"409": responseRef("409"),
	})}
	rejectRecommendationParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Recommendation/action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedRejectedRecommendationID}}}
	paths["/v1/relationship-recommendations/{actionId}/reject"] = obj{"post": operation("Relationship Intelligence", "Reject", "Reject posts Not the right next move. The stored recommendation is rejected, and it stays open in the queue.", "rejectRelationshipRecommendation", bearer(), rejectRecommendationParam, jsonRequest("Rejection.", objectSchema("Reject request.", obj{"reason": stringSchema("Rejection reason.", documentedRecommendationRejectReason)}, "reason"), obj{"reason": documentedRecommendationRejectReason}), obj{
		"200": jsonResponse("Rejected recommendation.", ref("RevenueAction"), documentedRejectedRecommendation()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"409": responseRef("409"),
	})}

	paths["/v1/revenue-actions"] = obj{
		"get": operation("Revenue", "Recovery", recoveryQueueDescription, "listRevenueActions", bearer(), []any{
			obj{"name": "queueStatus", "in": "query", "required": false, "description": "Queue status filter, or all.", "example": "open", "schema": obj{"type": "string", "enum": []any{"open", "snoozed", "dismissed", "handled", "all"}, "example": "open"}},
			obj{"name": "limit", "in": "query", "required": false, "description": "Page size (max 100). Recovery asks for 100.", "example": 100, "schema": obj{"type": "integer", "example": 100}},
			obj{"name": "offset", "in": "query", "required": false, "description": "How many actions to skip. Recovery does not send this on the first page.", "schema": obj{"type": "integer", "minimum": 0}},
			obj{"name": "surface", "in": "query", "required": false, "description": "recovery keeps every action that is not a follow-up task. task keeps follow-up tasks.", "example": "recovery", "schema": obj{"type": "string", "enum": []any{"recovery", "task"}, "example": "recovery"}},
		}, nil, obj{
			"200": jsonResponse("Queue page.", objectSchema("Action list. A full page is the end of the queue when hasMore is false.", obj{
				"actions": arraySchema("Actions.", ref("RevenueAction")),
				"hasMore": boolSchema("Another task or follow-up exists beyond this page.", false),
			}, "actions"), recoveryQueuePage()),
			"401": responseRef("401"),
		}),
		"post": operation("Revenue", "Create a manual action", "Proposes a manual queue action with revision 1 and an immutable revision snapshot. A duplicate dedupe key returns the existing item.", "createRevenueAction", bearer(), nil, jsonRequest("Action.", objectSchema("Create request.", obj{
			"relationshipId":     uuidSchema("Owning relationship id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
			"actionType":         stringEnum("Action type.", "follow_up_task", "warm_follow_up", "proposal_nudge", "referral_reconnect", "customer_risk", "meeting_follow_up", "meeting_recap", "crm_update", "follow_up_task", "calendar_hold", "commitment_rescue"),
			"channel":            stringEnum("Delivery channel.", "task", "email", "slack", "call", "crm_task", "crm", "task", "calendar"),
			"reason":             stringSchema("Evidence-backed reason.", documentedGraphFollowUpReason),
			"recipientEmail":     stringSchema("Recipient email.", "buyer@example.com"),
			"proposedSubject":    stringSchema("Proposed subject.", "Following up as promised"),
			"proposedMessage":    stringSchema("Proposed body.", documentedGraphFollowUpMessage),
			"senderAccountRef":   stringSchema("Sender account reference.", "gmail:me@company.com"),
			"executionMode":      stringEnum("Execution mode.", "draft", "draft", "send"),
			"priorityScore":      intSchema("Priority (0-100).", 80),
			"priorityComponents": freeFormSchema("Per-component priority breakdown."),
			"dueAt":              stringSchema("Due time.", "2026-07-15T00:00:00Z", obj{"format": "date-time"}, nullable()),
		}, "relationshipId", "actionType", "channel", "reason"), obj{
			"relationshipId":  "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
			"actionType":      "follow_up_task",
			"channel":         "task",
			"executionMode":   "draft",
			"reason":          documentedGraphFollowUpReason,
			"proposedMessage": documentedGraphFollowUpMessage,
		}), obj{
			"201": jsonResponse("Created action.", ref("RevenueAction"), nil),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
		}),
	}
	paths["/v1/revenue-actions/{actionId}"] = obj{"get": operation("Revenue", "Get an action", "Returns one action with relationship context.", "getRevenueAction", bearer(), actionParam, nil, obj{
		"200": jsonResponse("Action.", ref("RevenueAction"), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/revenue-actions/{actionId}/audit"] = obj{"get": operation("Revenue", "Get the audit chain", "Returns the full observe, decision, approval, execution, and outcome chain for one action.", "getRevenueActionAudit", bearer(), actionParam, nil, obj{
		"200": jsonResponse("Audit chain.", objectSchema("Audit chain.", obj{
			"action":    ref("RevenueAction"),
			"revisions": arraySchema("Immutable revision snapshots.", freeFormSchema("Revision snapshot.")),
			"decisions": arraySchema("Policy decision snapshots.", ref("RevenuePolicyDecision")),
			"outcomes":  arraySchema("Observed outcomes.", ref("RevenueOutcome")),
		}), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	recheckActionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedRecheckedActionID}}}
	paths["/v1/revenue-actions/{actionId}/evaluate"] = obj{"post": operation("Revenue", "Re-check policy", "Re-check policy posts no request body. The stored decision passed for the current revision, with no reason codes, and it expires the next day.", "evaluateRevenueAction", bearer(), recheckActionParam, nil, obj{
		"200": jsonResponse("Decision snapshot.", ref("RevenuePolicyDecision"), documentedPolicyRecheck()),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"503": problemResponse("Policy facade unavailable; the action stays pending.", ref("ErrorEnvelope"), problemExample(503, "Service Unavailable", "policy preflight unavailable; the action stays pending", "facade_unavailable")),
	})}
	editActionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedDraftActionID}}}
	paths["/v1/revenue-actions/{actionId}/edit"] = obj{"post": operation("Revenue", "Save draft", "Save draft posts the subject and message from the review sheet. The stored action moves to revision 2, and the previous sending check and approval no longer apply.", "editRevenueAction", bearer(), editActionParam, jsonRequest("Fields to change; omitted fields keep their value.", objectSchema("Edit request.", obj{
		"reason":           stringSchema("Reason.", "Updated context.", nullable()),
		"recipientEmail":   stringSchema("Recipient email.", "buyer@example.com", nullable()),
		"proposedSubject":  stringSchema("Proposed subject.", documentedDraftSubject, nullable()),
		"proposedMessage":  stringSchema("Proposed body.", documentedDraftMessage, nullable()),
		"senderAccountRef": stringSchema("Sender account reference.", "gmail:me@company.com", nullable()),
		"channel":          stringEnum("Channel.", "email", "email", "slack", "call", "crm_task"),
		"actionType":       stringEnum("Action type.", "warm_follow_up", "warm_follow_up", "proposal_nudge", "referral_reconnect", "customer_risk", "meeting_follow_up"),
		"executionMode":    stringEnum("Execution mode.", "draft", "draft", "send"),
	}), documentedDraftEditRequest()), obj{
		"200": jsonResponse("Action at its new revision.", ref("RevenueAction"), documentedSavedDraft()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": problemResponse("Execution already started; the action is immutable.", ref("ErrorEnvelope"), problemExample(409, "Conflict", "execution already started; the action is immutable", "not_editable")),
	})}
	snoozeActionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedSnoozeActionID}}}
	paths["/v1/revenue-actions/{actionId}/snooze"] = obj{"post": operation("Revenue", "Snooze", "Snooze posts a wake time seven days out. The stored action is snoozed until that time. The wake time has to be in the future and within 90 days.", "snoozeRevenueAction", bearer(), snoozeActionParam, jsonRequest("Wake time.", objectSchema("Snooze request.", obj{
		"until": stringSchema("Wake time seven days out.", documentedSnoozeWake, obj{"format": "date-time"}),
	}, "until"), obj{"until": documentedSnoozeWake}), obj{
		"200": jsonResponse("Snoozed action.", ref("RevenueAction"), documentedSnoozedAction()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/revenue-actions/{actionId}/dismiss"] = obj{"post": operation("Revenue", "Dismiss an action", "Dismisses the action with a reason label and records the dismissed outcome.", "dismissRevenueAction", bearer(), actionParam, jsonRequest("Dismissal reason.", objectSchema("Dismiss request.", obj{
		"reason": stringSchema("Reason label.", documentedQueueDismissReason),
	}), obj{"reason": documentedQueueDismissReason}), obj{
		"200": jsonResponse("Dismissed action.", ref("RevenueAction"), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	approveActionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedApprovedActionID}}}
	paths["/v1/revenue-actions/{actionId}/approve"] = obj{"post": operation("Revenue", "Approve", "Approve posts acceptRisk false. The stored action is approved for its current revision, and the approval time is recorded. Approve send uses this same call when the action is in send mode. A blocked action cannot be approved.", "approveRevenueAction", bearer(), approveActionParam, jsonRequestOptional("Approval options.", objectSchema("Approve request.", obj{
		"acceptRisk": boolSchema("Explicitly accept a review_required decision.", false),
	}), obj{"acceptRisk": false}), obj{
		"200": jsonResponse("Approved action.", ref("RevenueAction"), documentedApprovedAction()),
		"401": responseRef("401"),
		"402": problemResponse("Acting on actions requires a paid subscription.", ref("ErrorEnvelope"), problemExample(402, "Payment Required", "an active subscription is required to act on actions", "subscription_required")),
		"404": responseRef("404"),
		"409": problemResponse("Invariant violation: blocked, no decision, expired decision, or review required.", ref("ErrorEnvelope"), problemExample(409, "Conflict", "action is blocked by policy", "blocked")),
	})}
	paths["/v1/revenue-actions/{actionId}/reject"] = obj{"post": operation("Revenue", "Reject an action", "Rejects the current revision with a reason.", "rejectRevenueAction", bearer(), actionParam, jsonRequest("Rejection reason.", objectSchema("Reject request.", obj{
		"reason": stringSchema("Reason.", documentedRejectReason),
	}), obj{"reason": documentedRejectReason}), obj{
		"200": jsonResponse("Rejected action.", ref("RevenueAction"), nil),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})}
	executeActionParam := []any{obj{"name": "actionId", "in": "path", "required": true, "description": "Action id.", "schema": obj{"type": "string", "format": "uuid", "example": documentedDraftedActionID}}}
	paths["/v1/revenue-actions/{actionId}/execute"] = obj{"post": operation("Revenue", "Create provider draft", "Create provider draft posts no request body. The stored action is sent and handled, and the draft time is recorded. Send approved email uses this same call when the action is in send mode.", "executeRevenueAction", bearer(), executeActionParam, nil, obj{
		"200": jsonResponse("Provider draft created.", ref("RevenueAction"), documentedProviderDraft()),
		"401": responseRef("401"),
		"402": problemResponse("Acting on actions requires a paid subscription.", ref("ErrorEnvelope"), problemExample(402, "Payment Required", "an active subscription is required to act on actions", "subscription_required")),
		"404": responseRef("404"),
		"409": problemResponse("Invariant violation: not approved, blocked, expired decision, or workspace not linked for sends.", ref("ErrorEnvelope"), problemExample(409, "Conflict", "action is not approved for its current revision", "not_approved")),
	})}
	paths["/v1/revenue-actions/{actionId}/source-body"] = obj{"get": operation("Revenue", "View original email", "View original email loads the Gmail message behind this action. The request sends only the action id. The answer is that message as plain text in body, separate from the draft on the action.", "getRevenueActionSourceBody", bearer(), []any{obj{
		"name": "actionId", "in": "path", "required": true, "description": "Action id.",
		"schema": uuidSchema("Action id.", "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"),
	}}, nil, obj{
		"200": jsonResponse("The original email View original email shows.", objectSchema("Body.", obj{
			"body": stringSchema("Plain-text Gmail message.", originalEmailBody),
		}), obj{"body": originalEmailBody}),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/revenue-workspaces/current/communication-policy/{sourceAccountId}"] = obj{"get": operation("Relationship Intelligence", "Mailbox policy", "Email & Calendar privacy loads this mailbox policy after the mailbox account is entered. Metadata stays workspace-visible, subject lines are shared, and bodies and attachments stay private.", "getCommunicationPolicy", bearer(), []any{obj{
		"name": "sourceAccountId", "in": "path", "required": true, "description": "Mailbox account email.",
		"schema": stringSchema("Mailbox account email.", "you@company.com"),
	}}, nil, obj{
		"200": jsonResponse("Stored mailbox policy.", objectSchema("Mailbox policy.", obj{
			"id":                     uuidSchema("Policy id.", documentedMailboxPolicyID),
			"sourceAccountId":        stringSchema("Mailbox account email.", "you@company.com"),
			"metadataVisibility":     stringEnum("Who can see mailbox metadata.", "workspace", "private", "workspace"),
			"shareSubject":           boolSchema("Share subject lines by default.", true),
			"shareBody":              boolSchema("Share bodies by default.", false),
			"shareAttachments":       boolSchema("Share attachments by default.", false),
			"signatureEnrichment":    boolSchema("Read email signatures.", true),
			"modelContactExtraction": boolSchema("Extract contacts from mail.", true),
			"retentionDays":          intSchema("Days mailbox content is kept.", 540),
			"version":                intSchema("Policy version.", 1),
		}, "id", "sourceAccountId", "metadataVisibility", "shareSubject", "shareBody", "shareAttachments", "signatureEnrichment", "modelContactExtraction", "retentionDays", "version"), documentedMailboxPolicy()),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}

	paths["/v1/revenue-workspaces/current/communication-privacy-rules/{ruleId}"] = obj{"delete": operation("Relationship Intelligence", "Remove", "Remove deletes one protected or blocked address and returns no response body.", "deleteCommunicationPrivacyRule", bearer(), []any{
		obj{"name": "ruleId", "in": "path", "required": true, "description": "Privacy rule id.", "schema": obj{"type": "string", "format": "uuid", "example": "3b8dfa9b-a7b2-46ea-982c-622a914c00e5"}},
	}, nil, obj{
		"204": obj{"description": "Privacy rule removed."},
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/revenue-workspaces/current/communications/{interactionId}/body"] = obj{"get": operation("Relationship Intelligence", "Get authorized communication body", "Returns the plain-text body for one interaction when policy and grants allow it.", "getCommunicationInteractionBody", bearer(), []any{
		obj{"name": "interactionId", "in": "path", "required": true, "description": "Interaction id.", "schema": obj{"type": "string", "format": "uuid"}},
	}, nil, obj{
		"200": jsonResponse("Authorized body.", objectSchema("Body result.", obj{
			"body":   stringSchema("Plain-text body.", "Thanks for the update."),
			"access": ref("CommunicationAccess"),
		}), nil),
		"401": responseRef("401"), "403": responseRef("403"), "404": responseRef("404"),
	})}
	paths["/v1/revenue-workspaces/current/communications/attachments/{attachmentId}/content"] = obj{"get": operation("Relationship Intelligence", "Get authorized attachment content", "Returns one scanned text attachment when policy and grants allow it.", "getCommunicationAttachmentContent", bearer(), []any{
		obj{"name": "attachmentId", "in": "path", "required": true, "description": "Attachment id.", "schema": obj{"type": "string", "format": "uuid"}},
	}, nil, obj{
		"200": jsonResponse("Authorized attachment.", objectSchema("Attachment result.", obj{
			"filename":   stringSchema("Filename.", "notes.txt"),
			"mimeType":   stringSchema("MIME type.", "text/plain"),
			"content":    stringSchema("UTF-8 content.", "Quarterly plan"),
			"scanStatus": stringSchema("Scan status.", "clean"),
			"access":     ref("CommunicationAccess"),
		}), nil),
		"401": responseRef("401"), "403": responseRef("403"), "404": responseRef("404"),
	})}
	paths["/v1/revenue-actions/{actionId}/outcomes"] = obj{"post": operation("Revenue", "Log outcome", "Log outcome records They replied from the history sheet. The button sends source user and sourceEventId manual:replied plus the current time. Sending the same id again returns the stored row.", "recordRevenueActionOutcome", bearer(), actionParam, jsonRequest("Outcome.", objectSchema("Outcome request.", obj{
		"kind":          stringEnum("Outcome kind.", "replied", "sent", "delivered", "bounced", "replied", "meeting_booked", "won", "lost", "dismissed", "bad_recommendation"),
		"source":        stringEnum("Observing source. Log outcome sends user.", "user", "gmail", "calendar", "crm", "user", "outbound"),
		"sourceEventId": stringSchema("Source event id. Log outcome sends manual, the kind, and the current time.", "manual:replied:1783864800000"),
		"occurredAt":    stringSchema("When the outcome occurred. Log outcome leaves this empty and the server records the current time.", "2026-07-12T14:00:00Z", obj{"format": "date-time"}, nullable()),
		"metadata":      freeFormSchema("Bounded metadata."),
	}, "kind", "source", "sourceEventId"), obj{"kind": "replied", "source": "user", "sourceEventId": "manual:replied:1783864800000"}), obj{
		"201": jsonResponse("Recorded outcome.", ref("RevenueOutcome"), obj{
			"id":            "3c8dfa9b-a7b2-46ea-982c-622a914c00e5",
			"kind":          "replied",
			"source":        "user",
			"sourceEventId": "manual:replied:1783864800000",
			"occurredAt":    "2026-07-12T14:00:00Z",
		}),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})}
	paths["/v1/workspace-notes"] = obj{"get": operation("Relationship Intelligence", "Notes", notesPageDescription, "listWorkspaceNotes", bearer(), []any{
		obj{"name": "limit", "in": "query", "required": false, "description": "Page size (max 100). Notes asks for 50.", "example": 50, "schema": obj{"type": "integer", "minimum": 1, "maximum": 100, "example": 50}},
		obj{"name": "offset", "in": "query", "required": false, "description": "How many notes to skip. Notes does not send this on the first page.", "schema": obj{"type": "integer", "minimum": 0}},
	}, nil, obj{
		"200": jsonResponse("Collapsed workspace notes, newest first.", objectSchema("Workspace notes page.", obj{
			"notes": arraySchema("Latest note for each note id.", objectSchema("Workspace note.", obj{
				"externalId":       stringSchema("Stable note id.", "note-1"),
				"title":            stringSchema("Note title.", "Renewal context"),
				"body":             stringSchema("Plain note body.", "Use the updated terms."),
				"content":          freeFormSchema("Editor document, when one was saved."),
				"meetingLinked":    boolSchema("Whether the note is linked to a meeting.", false),
				"liveLinked":       boolSchema("Whether the note is linked to a live note.", false),
				"relationshipId":   uuidSchema("Company id.", "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"),
				"relationshipName": stringSchema("Company name.", "Cedar Notes"),
				"occurredAt":       stringSchema("When this copy was written.", "2026-09-01T12:00:00Z", obj{"format": "date-time"}),
				"eventType":        stringSchema("Stored event. Live notes are note.", "note"),
			}, "externalId", "title", "body", "meetingLinked", "liveLinked", "relationshipId", "relationshipName", "occurredAt", "eventType")),
			"hasMore": boolSchema("Whether another page of notes exists.", false),
		}, "notes", "hasMore"), notesPage()),
		"400": responseRef("400"),
		"401": responseRef("401"),
	})}
	paths["/v1/revenue-workspaces/current/communication-policy/{sourceAccountId}"] = obj{"put": operation("Relationship Intelligence", "Save mailbox policy", "Save mailbox policy sends the sharing choices already on screen and leaves out the policy id, the mailbox account, and the current version. The stored policy keeps those choices and advances the version.", "putCommunicationPolicy", bearer(), []any{obj{
		"name": "sourceAccountId", "in": "path", "required": true, "description": "Mailbox account email.",
		"schema": stringSchema("Mailbox account email.", "you@company.com"),
	}}, jsonRequest("Mailbox sharing choices.", objectSchema("Mailbox policy save.", obj{
		"metadataVisibility":     stringEnum("Who can see mailbox metadata.", "workspace", "private", "workspace"),
		"shareSubject":           boolSchema("Share subject lines by default.", true),
		"shareBody":              boolSchema("Share bodies by default.", false),
		"shareAttachments":       boolSchema("Share attachments by default.", false),
		"signatureEnrichment":    boolSchema("Read email signatures.", true),
		"modelContactExtraction": boolSchema("Extract contacts from mail.", true),
		"retentionDays":          intSchema("Days mailbox content is kept.", 540),
	}, "metadataVisibility", "shareSubject", "shareBody", "shareAttachments", "signatureEnrichment", "modelContactExtraction", "retentionDays"), savedMailboxPolicyRequest()), obj{
		"200": jsonResponse("Saved mailbox policy.", objectSchema("Saved mailbox policy.", obj{
			"id":                     uuidSchema("Policy id.", savedMailboxPolicyID),
			"sourceAccountId":        stringSchema("Mailbox account email.", "you@company.com"),
			"metadataVisibility":     stringEnum("Who can see mailbox metadata.", "workspace", "private", "workspace"),
			"shareSubject":           boolSchema("Share subject lines by default.", true),
			"shareBody":              boolSchema("Share bodies by default.", false),
			"shareAttachments":       boolSchema("Share attachments by default.", false),
			"signatureEnrichment":    boolSchema("Read email signatures.", true),
			"modelContactExtraction": boolSchema("Extract contacts from mail.", true),
			"retentionDays":          intSchema("Days mailbox content is kept.", 540),
			"version":                intSchema("Policy version.", 2),
		}, "id", "sourceAccountId", "metadataVisibility", "shareSubject", "shareBody", "shareAttachments", "signatureEnrichment", "modelContactExtraction", "retentionDays", "version"), savedMailboxPolicy()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
		"404": responseRef("404"),
	})}
}

const savedMailboxPolicyID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5"

func savedMailboxPolicyRequest() obj {
	return obj{
		"metadataVisibility":     "workspace",
		"shareSubject":           true,
		"shareBody":              false,
		"shareAttachments":       false,
		"signatureEnrichment":    true,
		"modelContactExtraction": true,
		"retentionDays":          540,
	}
}

func savedMailboxPolicy() obj {
	saved := savedMailboxPolicyRequest()
	saved["id"] = savedMailboxPolicyID
	saved["sourceAccountId"] = "you@company.com"
	saved["version"] = 2
	return saved
}

func withExample(schema obj, example any) obj {
	schema["example"] = example
	return schema
}

func documentedDisconnectedSource() obj {
	readScopes := []any{
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/calendar.events.readonly",
	}
	return obj{
		"connectionId":           "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"consentingActorId":      "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"source":                 "google",
		"sourceAccountId":        "me@company.com",
		"status":                 "disconnected",
		"backfillPhase":          "idle",
		"backfillCompleted":      250,
		"backfillTotal":          1000,
		"completeness":           "disconnected",
		"expectedCadenceSeconds": 900,
		"lagSeconds":             0,
		"requiredScopes":         readScopes,
		"grantedScopes":          readScopes,
		"missingScopes":          []any{},
		"retryCount":             0,
		"disconnectedAt":         "2026-07-31T14:00:00Z",
	}
}

const documentedRecheckedActionID = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"

func documentedPolicyRecheck() obj {
	return obj{
		"id":           "2b8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"revision":     1,
		"revisionHash": "sha256:ab12...",
		"status":       "passed",
		"reasonCodes":  []any{},
		"evaluatedAt":  "2026-07-12T12:00:00Z",
		"expiresAt":    "2026-07-13T12:00:00Z",
	}
}

const exportedCommitmentMarkdown = "# Commitment record\n\n**We promised:** Migration live by the 14th\n\n| Field | Value |\n|---|---|\n| Company | Acme |\n| State | At risk |\n| Due | 2026-09-14 |\n| Owner | alex@example.com |\n| Counterparty | jordan@example.com |\n| Record generated | 2026-09-09T12:00:00Z |\n\n## Evidence\n\n> We will have the migration live by the 14th.\n\n— Gmail, 2026-09-06T12:00:00Z · https://mail.google.com/thread-1\n\nContent hash `sha256:abc123`\n\n## History\n\n2. **Confirmed in this workspace** — 2026-09-07T09:00:00Z (Someone in this workspace, alex@example.com)\n"

// originalEmailBody is the plain-text Gmail message View original email shows
// for the documented follow-up. It is the July ask the draft answers, not the
// draft "Hi Jordan — you asked me to circle back this month...".
const originalEmailBody = "Could you circle back this month? July works for us."

const (
	linkedWorkspaceID         = "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	linkedOrganizationID      = "org_1"
	linkedSendingWorkspaceID  = "ws_1"
	linkedWorkspaceVerifiedAt = "2026-07-12T12:00:00Z"
)

func linkedWorkspaceRequest() obj {
	return obj{
		"outboundOrganizationId": linkedOrganizationID,
		"outboundWorkspaceId":    linkedSendingWorkspaceID,
	}
}

func linkedWorkspace() obj {
	saved := linkedWorkspaceRequest()
	saved["id"] = linkedWorkspaceID
	saved["mode"] = "linked"
	saved["status"] = "active"
	saved["lastVerifiedAt"] = linkedWorkspaceVerifiedAt
	saved["preflightAvailable"] = true
	return saved
}

const searchMailQuery = "launch promise"

func searchMailResponse() obj {
	return obj{
		"available": true,
		"matches": []any{
			searchMailMatch("tc", "Launch plan", "client@example.org", "other", "An explicit promise in this message needs confirmation.", 0.9130171833009648),
			searchMailMatch("tp", "SOW draft", "buyer@example.com", "deal", "You sent a proposal-stage message 10 days ago and there has been no reply.", 0.8497568598529869),
			searchMailMatch("tw", "Contract", "casey@corp.com", "client", "Casey Lee asked you something 6 days ago and is still waiting on a reply.", 0.848014789037389),
		},
	}
}

func searchMailMatch(threadID, subject, counterparty, class, summary string, score float64) obj {
	return obj{
		"threadId":       threadID,
		"subject":        subject,
		"counterparty":   counterparty,
		"classification": class,
		"summary":        summary,
		"score":          score,
	}
}

const peopleDirectoryPersonID = "ab8dfa9b-a7b2-46ea-982c-622a914c00e5"

func peopleDirectoryResponse() obj {
	return obj{
		"hasMore": false,
		"persons": []any{peopleDirectoryPerson()},
	}
}

func peopleDirectoryPerson() obj {
	return obj{
		"id":                 peopleDirectoryPersonID,
		"displayName":        "Sarah Chen",
		"aliases":            []any{},
		"primaryEmail":       "sarah@acme.example",
		"title":              "VP Engineering",
		"orgName":            "Acme",
		"orgDomain":          "acme.example",
		"status":             "active",
		"employmentStatus":   "unknown",
		"relationshipCount":  1,
		"participantRoles":   []any{"champion"},
		"firstInteractionAt": "2026-08-04T12:00:00Z",
		"lastInteractionAt":  "2026-08-04T12:00:00Z",
		"attributesVersion":  1,
	}
}

const (
	openPersonID       = "ab8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPersonAliasID  = "b18dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPersonNameID   = "b28dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPersonDomainID = "b38dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPersonOrgID    = "b48dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPersonTitleID  = "b58dfa9b-a7b2-46ea-982c-622a914c00e5"
)

func openPersonProfile() obj {
	return obj{"attributes": []any{
		openPersonDetail(openPersonAliasID, "alias", "Sarah Chen", "deterministic", "display_name_header", 0.5, "Every name we have seen for this person."),
		openPersonDetail(openPersonNameID, "display_name", "Sarah Chen", "source_fact", "display_name_header", 0.8, "Name as it appeared on the source record."),
		openPersonDetail(openPersonDomainID, "org_domain", "acme.example", "deterministic", "email_header", 0.6, "Derived from the participant's email domain."),
		openPersonDetail(openPersonOrgID, "org_name", "Acme", "deterministic", "display_name_header", 0.65, "Name of the company that owns this domain."),
		openPersonDetail(openPersonTitleID, "title", "VP Engineering", "source_fact", "crm_field", 0.7, "Title supplied by the source record."),
	}}
}

func openPersonDetail(id, dimension, value, sourceType, extractor string, confidence float64, reason string) obj {
	return obj{
		"id":         id,
		"dimension":  dimension,
		"value":      value,
		"sourceType": sourceType,
		"source":     "hubspot",
		"extractor":  extractor,
		"status":     "active",
		"confidence": confidence,
		"reason":     reason,
		"observedAt": "2026-08-04T12:00:00Z",
		"validFrom":  "2026-08-04T12:00:00Z",
	}
}

const (
	mailMeetingsRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mailMeetingsInteractionID  = "e18dfa9b-a7b2-46ea-982c-622a914c00e5"
	mailMeetingsOwnerID        = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mailMeetingsOccurredAt     = "2026-09-17T12:00:00Z"
)

func mailMeetingsPage() obj {
	return obj{
		"hasMore": false,
		"items":   []any{mailMeetingsItem()},
	}
}

func mailMeetingsItem() obj {
	return obj{
		"id":              mailMeetingsInteractionID,
		"source":          "gmail",
		"interactionType": "email",
		"direction":       "outbound",
		"subject":         "Follow up",
		"occurredAt":      mailMeetingsOccurredAt,
		"visibility":      "metadata",
		"ownerId":         mailMeetingsOwnerID,
		"bodyLocked":      false,
		"attachmentCount": 1,
		"access": obj{
			"metadata":      true,
			"subject":       true,
			"body":          true,
			"attachments":   true,
			"protected":     false,
			"reason":        "mailbox_owner",
			"policyVersion": 1,
		},
	}
}

const (
	activityRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	activitySlackID        = "f18dfa9b-a7b2-46ea-982c-622a914c00e5"
	activityCalendarID     = "f28dfa9b-a7b2-46ea-982c-622a914c00e5"
	activityGmailID        = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	activityHubSpotID      = "f48dfa9b-a7b2-46ea-982c-622a914c00e5"
	activityReceivedAt     = "2026-07-25T16:00:00Z"
)

func activityHistoryPage() obj {
	return obj{
		"hasMore": false,
		"observations": []any{
			activityObservation(activitySlackID, "slack", "acme-engagement", "engagement_declined", "2026-07-25T15:00:00Z", "No champion reply after pricing.", "dd678926df937610ecb0697421c89440d8fe69aa6769c440d53d538a59d3b864"),
			activityObservation(activityCalendarID, "calendar", "acme-security-meeting", "meeting_missing", "2026-07-23T15:00:00Z", "No security-review meeting was scheduled.", "00c3732fea559aee849682ce662c3066c1bdc3d30d695f6a48d38a4b3401da53"),
			activityObservation(activityGmailID, "gmail", "acme-security-promise", "commitment_created", "2026-07-18T15:00:00Z", "We promised the security packet by July 22.", "e57461826e791945b63630c2de4c026adb4459066470014cf50aadde9b6aafca"),
			activityObservation(activityHubSpotID, "hubspot", "acme-deal-stage", "deal_stage_changed", "2026-07-08T15:00:00Z", "Acme moved into evaluation.", "481faa42c6d60f434fc57540a21c1bee4a1dd745479fded5f6476080f9ebb3e7"),
		},
	}
}

func activityObservation(id, source, externalID, eventType, occurredAt, summary, contentHash string) obj {
	return obj{
		"id":              id,
		"source":          source,
		"externalId":      externalID,
		"sourceVersion":   "1",
		"eventType":       eventType,
		"occurredAt":      occurredAt,
		"receivedAt":      activityReceivedAt,
		"summary":         summary,
		"normalizedFacts": obj{"adapter": source},
		"contentHash":     contentHash,
	}
}

const (
	retrySyncConnectionID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	retrySyncAccount      = "owner@example.com"
	retrySyncStartedAt    = "2026-07-31T14:00:00Z"
	retrySyncAuthorizedAt = "2026-07-31T13:01:00Z"
)

func retrySyncStatus() obj {
	scopes := []any{
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/calendar.events.readonly",
	}
	return obj{
		"connectionId":           retrySyncConnectionID,
		"source":                 "google",
		"sourceAccountId":        retrySyncAccount,
		"status":                 "backfilling",
		"backfillPhase":          "queued",
		"backfillCompleted":      0,
		"backfillTotal":          0,
		"completeness":           "rebuilding",
		"expectedCadenceSeconds": 900,
		"lagSeconds":             0,
		"requiredScopes":         scopes,
		"grantedScopes":          scopes,
		"missingScopes":          []any{},
		"retryCount":             0,
		"authorizedAt":           retrySyncAuthorizedAt,
		"syncStartedAt":          retrySyncStartedAt,
	}
}

const (
	whatChangedRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	whatChangedSnapshotID     = "c18dfa9b-a7b2-46ea-982c-622a914c00e5"
	whatChangedLifecycleID    = "d18dfa9b-a7b2-46ea-982c-622a914c00e5"
	whatChangedEngagementID   = "e18dfa9b-a7b2-46ea-982c-622a914c00e5"
	whatChangedHealthID       = "a28dfa9b-a7b2-46ea-982c-622a914c00e5"
	whatChangedAt             = "2026-07-25T16:00:00Z"
	whatChangedHash           = "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887"
)

func whatChangedPage() obj {
	return obj{
		"hasMore": false,
		"snapshots": []any{obj{
			"id":               whatChangedSnapshotID,
			"version":          1,
			"state":            whatChangedState(),
			"stateHash":        whatChangedHash,
			"projectorVersion": 2,
			"evaluatedAt":      whatChangedAt,
			"changedDimensions": []any{
				"engagement",
				"health",
				"lifecycle",
			},
			"assertionIds": []any{
				whatChangedLifecycleID,
				whatChangedEngagementID,
				whatChangedHealthID,
			},
			"createdAt": whatChangedAt,
		}},
	}
}

func whatChangedState() obj {
	return obj{
		"lifecycle":    "evaluation",
		"engagement":   "declining",
		"sentiment":    "unknown",
		"health":       "needs_attention",
		"stateReason":  "Champion engagement declined after pricing. Security review has no meeting. CRM stage is evaluation.",
		"risks":        nil,
		"milestones":   nil,
		"stateVersion": 1,
	}
}

const (
	originalDetailRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	originalDetailEvidenceID     = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	originalDetailHash           = "e57461826e791945b63630c2de4c026adb4459066470014cf50aadde9b6aafca"
	originalDetailOccurredAt     = "2026-07-18T15:00:00Z"
	originalDetailReceivedAt     = "2026-07-25T16:00:00Z"
	originalDetailDescription    = "Open the original detail loads when an activity row opens. The request names that activity on Acme. The Gmail promise stores no provider body, and the response is that activity with a null payload."
)

func originalDetail() obj {
	return obj{
		"observation": obj{
			"id":              originalDetailEvidenceID,
			"source":          "gmail",
			"externalId":      "acme-security-promise",
			"sourceVersion":   "1",
			"eventType":       "commitment_created",
			"occurredAt":      originalDetailOccurredAt,
			"receivedAt":      originalDetailReceivedAt,
			"summary":         "We promised the security packet by July 22.",
			"normalizedFacts": obj{"adapter": "gmail"},
			"contentHash":     originalDetailHash,
		},
		"payload": nil,
	}
}

const (
	companyDirectoryID          = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	companyDirectoryHash        = "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887"
	companyDirectoryReason      = "Champion engagement declined after pricing. Security review has no meeting. CRM stage is evaluation."
	companyDirectoryTouchedAt   = "2026-07-25T15:00:00Z"
	companyDirectoryProjectedAt = "2026-07-25T16:00:00Z"
	companyDirectoryDescription = "All companies loads the directory. The request sends no search and no health, stage, or older-page offset. Acme is the one company: evaluation, declining engagement, and health that needs attention."
)

func companyDirectoryPage() obj {
	return obj{
		"hasMore": false,
		"relationships": []any{obj{
			"id":               companyDirectoryID,
			"kind":             "company",
			"displayName":      "Acme",
			"accountDomain":    "acme.com",
			"status":           "active",
			"lastTouchAt":      companyDirectoryTouchedAt,
			"peopleCount":      1,
			"emailThreadCount": 0,
			"commitmentCount":  0,
			"lifecycle":        "evaluation",
			"engagement":       "declining",
			"sentiment":        "unknown",
			"health":           "needs_attention",
			"stateReason":      companyDirectoryReason,
			"stateVersion":     1,
			"stateHash":        companyDirectoryHash,
			"projectorVersion": 2,
			"projectedAt":      companyDirectoryProjectedAt,
			"lastChangedAt":    companyDirectoryProjectedAt,
			"risks":            []any{},
			"milestones":       []any{},
			"resourceRefs":     []any{},
			"categories":       []any{},
		}},
	}
}

const recoveryQueueDescription = "Recovery loads the open queue. The request asks for open actions, one hundred at a time, on the recovery list, and it does not ask for an older page. Acme has no open recovery action, so the page is empty."

func recoveryQueuePage() obj {
	return obj{
		"actions": []any{},
		"hasMore": false,
	}
}

const impactCountsDescription = "Impact loads the home counts. The request sends no filter. Overdue promises, open recovery, and companies at risk are zero, and there is no reply rate or meeting rate yet."

func impactCounts() obj {
	return obj{
		"surfaced":              0,
		"open":                  0,
		"openTasks":             0,
		"handled":               0,
		"snoozed":               0,
		"dismissed":             0,
		"approved":              0,
		"executed":              0,
		"replied":               0,
		"meetingsBooked":        0,
		"won":                   0,
		"lost":                  0,
		"replyRate":             nil,
		"meetingRate":           nil,
		"outcomes":              obj{},
		"byDetector":            []any{},
		"relationships":         0,
		"atRiskRelationships":   0,
		"criticalRelationships": 0,
		"portfolioRiskScore":    0,
		"overdueCommitments":    0,
		"overdueByUs":           0,
		"overdueByThem":         0,
		"longestOverdueDays":    0,
		"riskReasons":           []any{},
	}
}

const notesPageDescription = "Notes loads the newest page. The request asks for 50 notes and does not ask for an older page. This workspace has no company note, so the page is empty."

func notesPage() obj {
	return obj{
		"hasMore": false,
		"notes":   []any{},
	}
}

const auditsPageDescription = "Audits loads the newest page. The request asks for 10 audits and does not ask for an older page. This workspace has no audit, so the page is empty."

func auditsPage() obj {
	return obj{
		"hasMore": false,
		"scans":   []any{},
	}
}

const pendingDuplicatesDescription = "Review possible duplicates loads the pending page. The request asks for pending duplicates, 50 at a time, and it does not ask for an older page. This workspace has no pending duplicate, so the page is empty."

func pendingDuplicatesPage() obj {
	return obj{
		"candidates": []any{},
		"hasMore":    false,
	}
}
