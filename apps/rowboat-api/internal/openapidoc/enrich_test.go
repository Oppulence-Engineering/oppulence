package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestEnrichDocumentsMountedRuntimeAPI(t *testing.T) {
	spec := obj{
		"openapi": "3.0.3",
		"info":    obj{"title": "Solomon AI API"},
		"paths": obj{
			"/credit-ledgers": obj{"get": obj{"summary": "generated but not mounted"}},
		},
		"components": obj{
			"schemas": obj{
				"CreditLedger": obj{"type": "object", "properties": obj{"delta": obj{"type": "integer"}}},
				"User":         obj{"type": "object", "properties": obj{"workos_user_id": obj{"type": "string"}}},
			},
		},
	}

	Enrich(spec)

	paths := asObj(spec["paths"])
	if asObj(paths["/v1/me"])["delete"] == nil {
		t.Fatal("DELETE /v1/me (account deletion) is not documented")
	}
	for _, path := range []string{
		"/healthz",
		"/readyz",
		"/openapi.json",
		"/v1/config",
		"/v1/auth/workos/login-url",
		"/v1/auth/workos/exchange",
		"/v1/auth/workos/refresh",
		"/v1/me",
		"/v1/console/preferences",
		"/v1/console/resources",
		"/v1/console/resources/{resourceId}",
		"/v1/background-task-templates",
		"/v1/background-task-templates/{templateSlug}",
		"/v1/background-task-templates/{templateSlug}/instantiate",
		"/v1/background-tasks",
		"/v1/background-tasks/first-party/ensure",
		"/v1/background-tasks/{slug}",
		"/v1/background-tasks/{slug}/artifact",
		"/v1/background-tasks/{slug}/runs",
		"/v1/background-tasks/{slug}/runs/{runId}",
		"/v1/background-tasks/{slug}/runs/{runId}/events",
		"/v1/background-tasks/{slug}/runs/{runId}/events/stream",
		"/v1/background-tasks/{slug}/trigger",
		"/v1/llm/models",
		"/v1/llm/chat/completions",
		"/v1/llm/completions",
		"/v1/llm/embeddings",
		"/v1/voice/text-to-speech/{voiceId}",
		"/v1/search/exa",
		"/v1/google-oauth/start",
		"/oauth/google/callback",
		"/v1/google-oauth/claim",
		"/v1/google-oauth/refresh",
		"/v1/slack-oauth/start",
		"/oauth/slack/callback",
		"/v1/slack-oauth/claim",
		"/v1/slack-oauth/workspaces",
		"/v1/slack-oauth/workspaces/{teamId}",
		"/v1/slack-oauth/thread/read",
		"/v1/slack-oauth/thread/post",
		"/v1/connectors",
		"/v1/connections/{name}/start",
		"/v1/connections/{name}/callback",
		"/v1/connections/{name}/claim",
		"/v1/connections/{name}/api-key",
		"/v1/connections/{name}/mcp-token",
		"/v1/connections/{name}",
		"/v1/events",
		"/v1/events/{eventId}",
		"/v1/events/{eventId}/runs",
		"/v1/webhooks/google",
		"/v1/webhooks/slack",
		"/v1/webhooks/events",
		"/v1/internal/events",
		"/v1/relationships/{relationshipId}/timeline",
		"/v1/relationships/{relationshipId}/changes",
		"/v1/relationships/{relationshipId}/evidence/{evidenceId}",
		"/v1/relationships/{relationshipId}/corrections",
		"/v1/relationships/{relationshipId}/conversation-corrections",
		"/v1/relationship-observations/batch",
		"/v1/workspace-notes",
		"/v1/relationship-sources/status",
		"/v1/relationship-recommendations/{actionId}/approve",
		"/v1/relationship-recommendations/{actionId}/reject",
		"/v1/entities",
		"/v1/entities/{id}",
		"/v1/entities/merge",
		"/oauth-hooks/pre-consent",
		"/v1/internal/connections/invalidate",
		"/v1/internal/connections/status",
		"/graphql",
	} {
		if paths[path] == nil {
			t.Fatalf("missing path %s", path)
		}
	}
	if paths["/credit-ledgers"] != nil {
		t.Fatal("unmounted generated entity CRUD path should not be documented")
	}
}

func TestEnrichDocumentsStrictConsoleContracts(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)

	schemas := asObj(asObj(spec["components"])["schemas"])
	for _, name := range []string{
		"ConsolePreferences",
		"ConsolePreferencesPatch",
		"ConsoleResource",
		"ConsoleResourceCreate",
		"ConsoleNoteTemplatePayload",
		"ConsoleNoteFavoritePayload",
		"ConsoleGraphSavedViewPayload",
	} {
		schema := asObj(schemas[name])
		if schema["additionalProperties"] != false {
			t.Fatalf("%s must reject unknown fields", name)
		}
	}

	paths := asObj(spec["paths"])
	resources := asObj(paths["/v1/console/resources"])
	if asObj(resources["get"])["security"] == nil || asObj(resources["post"])["security"] == nil {
		t.Fatal("console resource operations must require bearer authentication")
	}
	createResponses := asObj(asObj(resources["post"])["responses"])
	if createResponses["200"] == nil || createResponses["201"] == nil || createResponses["409"] == nil {
		t.Fatal("console create must document replay, create, and name-conflict outcomes")
	}
}

func TestEnrichDocumentsRevenueScanCoverage(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)

	schemas := asObj(asObj(spec["components"])["schemas"])
	properties := asObj(asObj(schemas["RevenueLeakScan"])["properties"])
	for _, field := range []string{
		"commitmentsCreated",
		"threadsDeepRead",
		"threadsSnippetOnly",
		"threadsSkipped",
	} {
		if properties[field] == nil {
			t.Fatalf("RevenueLeakScan must document %s returned by the API", field)
		}
	}
}

func TestEnrichRejectsInternalCredentialCustodyFromPublicSchemas(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{
		"ConnectorRevocationJob":        obj{"type": "object"},
		"ConnectorCredentialCleanupJob": obj{"type": "object"},
		"ConnectorCredentialRecovery":   obj{"type": "object"},
		"DeletedIdentity":               obj{"type": "object"},
		"BillingRetention":              obj{"type": "object"},
		"TermsAssent":                   obj{"type": "object"},
		"MCPConnection": obj{
			"type":       "object",
			"properties": obj{"connector": obj{"type": "string"}, "refresh_token_encrypted": obj{"type": "string"}, "api_key_encrypted": obj{"type": "string"}},
			"required":   []any{"connector", "refresh_token_encrypted", "api_key_encrypted"},
		},
	}}}

	Enrich(spec)
	schemas := asObj(asObj(spec["components"])["schemas"])
	for _, internal := range []string{"ConnectorRevocationJob", "ConnectorCredentialCleanupJob", "ConnectorCredentialRecovery", "DeletedIdentity", "BillingRetention", "TermsAssent"} {
		if schemas[internal] != nil {
			t.Fatalf("internal custody schema %s leaked into public OpenAPI", internal)
		}
	}
	connection := asObj(schemas["MCPConnection"])
	properties := asObj(connection["properties"])
	for _, secret := range []string{"refresh_token_encrypted", "api_key_encrypted"} {
		if properties[secret] != nil {
			t.Fatalf("encrypted credential field %s leaked into public OpenAPI", secret)
		}
	}
	for _, field := range connection["required"].([]any) {
		if field == "refresh_token_encrypted" || field == "api_key_encrypted" {
			t.Fatalf("encrypted credential field %s remained required", field)
		}
	}
}

func TestEnrichAddsSecuritySchemasAndEntityDetail(t *testing.T) {
	spec := obj{
		"components": obj{
			"schemas": obj{
				"CreditLedger":      obj{"type": "object", "properties": obj{"delta": obj{"type": "integer"}, "reason": obj{"type": "string"}}},
				"User":              obj{"type": "object", "properties": obj{"workos_user_id": obj{"type": "string"}}},
				"PersonSuppression": obj{"type": "object", "properties": obj{"reason": obj{"type": "string", "description": "Reason code for the ledger entry.", "enum": []any{"llm_settle"}, "example": "llm_settle"}}},
				"ActionProposal":    obj{"type": "object", "properties": obj{"reason": obj{"type": "string", "enum": []any{"llm_settle"}}}},
			},
		},
	}

	Enrich(spec)

	components := asObj(spec["components"])
	schemes := asObj(components["securitySchemes"])
	for _, name := range []string{"BearerAuth", "HookHMAC", "WebhookHMAC", "InternalSecret"} {
		if schemes[name] == nil {
			t.Fatalf("missing security scheme %s", name)
		}
	}

	schemas := asObj(components["schemas"])
	for _, name := range []string{"MeResponse", "BackgroundTask", "BackgroundTaskTemplate", "BackgroundTaskTemplatesResponse", "BackgroundTaskRun", "BackgroundTaskRunEventsAppendRequest", "RevisionConflictEnvelope", "LLMChatCompletionsRequest", "Connector", "IntegrationTemplateBlock", "ConnectionAPIKeyRequest", "ConnectionClaimRequest", "SlackWorkspace", "SlackWorkspacesResponse", "SlackThreadReadRequest", "SlackThreadReadResponse", "SlackThreadPostRequest", "SlackThreadPostResponse", "GraphQLRequest"} {
		if schemas[name] == nil {
			t.Fatalf("missing runtime schema %s", name)
		}
	}
	taskProperties := asObj(asObj(schemas["BackgroundTask"])["properties"])
	for _, field := range []string{"templateSlug", "templateVersion", "systemManaged", "scheduleSyncState"} {
		if taskProperties[field] == nil {
			t.Fatalf("BackgroundTask is missing %s", field)
		}
	}
	creditLedger := asObj(schemas["CreditLedger"])
	delta := asObj(asObj(creditLedger["properties"])["delta"])
	if delta["description"] != "Credit delta. Negative values consume/reserve credits; positive values grant or refund credits." || delta["example"] != -42 {
		t.Fatalf("CreditLedger.delta lost its credit contract: %#v", delta)
	}
	intelligenceDelta := asObj(asObj(asObj(schemas["RelationshipIntelligence"])["properties"])["delta"])
	if intelligenceDelta["type"] != "object" || intelligenceDelta["example"] != nil || intelligenceDelta["description"] != "Exact before/after values, uncertain claim ids, contradictions, and recommendation reason." {
		t.Fatalf("RelationshipIntelligence.delta was rewritten as a credit change: %#v", intelligenceDelta)
	}
	ledgerReason := asObj(asObj(creditLedger["properties"])["reason"])
	if ledgerReason["description"] != "Reason code for the ledger entry." || ledgerReason["example"] != "llm_settle" {
		t.Fatalf("CreditLedger.reason lost its ledger contract: %#v", ledgerReason)
	}
	ledgerEnum, _ := ledgerReason["enum"].([]any)
	if len(ledgerEnum) != 7 || ledgerEnum[2] != "llm_settle" {
		t.Fatalf("CreditLedger.reason enum is invalid: %#v", ledgerReason["enum"])
	}
	commitmentReason := asObj(asObj(asObj(schemas["CommitmentEvent"])["properties"])["reason"])
	if commitmentReason["description"] != "Transition rationale." || commitmentReason["example"] != "Counterparty accepted in writing." || commitmentReason["enum"] != nil {
		t.Fatalf("CommitmentEvent.reason was stamped with the credit ledger: %#v", commitmentReason)
	}
	removalReason := asObj(asObj(asObj(schemas["PersonSuppression"])["properties"])["reason"])
	removalEnum, _ := removalReason["enum"].([]any)
	if removalReason["description"] != "Why this person was removed. subject_request means they asked. user_action means the account holder removed them." || removalReason["example"] != "user_action" || len(removalEnum) != 2 || removalEnum[0] != "user_action" || removalEnum[1] != "subject_request" {
		t.Fatalf("PersonSuppression.reason was stamped with the credit ledger: %#v", removalReason)
	}
	proposalReason := asObj(asObj(asObj(schemas["ActionProposal"])["properties"])["reason"])
	if proposalReason["enum"] != nil || proposalReason["description"] != "Reason recorded when this proposal is rejected or fails." {
		t.Fatalf("ActionProposal.reason was stamped with the credit ledger: %#v", proposalReason)
	}
	for _, name := range []string{"MailThread", "MailBodyCache"} {
		provider := asObj(asObj(asObj(schemas[name])["properties"])["provider"])
		enum, _ := provider["enum"].([]any)
		if provider["description"] != "Mailbox this row came from. Only Gmail is stored." || provider["example"] != "gmail" || len(enum) != 1 || enum[0] != "gmail" {
			t.Fatalf("%s.provider was stamped as an LLM vendor: %#v", name, provider)
		}
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("BackgroundTask.provider lost its model example: %#v", taskProvider)
	}
	participantEmail := asObj(asObj(asObj(schemas["RelationshipParticipant"])["properties"])["email"])
	if participantEmail["description"] != "Normalized email." || participantEmail["example"] != "avery@acme.com" {
		t.Fatalf("RelationshipParticipant.email was rewritten as the signed-in user: %#v", participantEmail)
	}
	messageEmail := asObj(asObj(asObj(schemas["CommunicationParticipant"])["properties"])["email"])
	if messageEmail["description"] != "Address of someone on this message." || messageEmail["example"] != "avery@acme.com" {
		t.Fatalf("CommunicationParticipant.email was rewritten as the signed-in user: %#v", messageEmail)
	}
	userEmail := asObj(asObj(asObj(schemas["User"])["properties"])["email"])
	if userEmail["description"] != "Best-known WorkOS primary email for the user." || userEmail["example"] != "user@example.com" {
		t.Fatalf("User.email lost the signed-in address: %#v", userEmail)
	}
	templateProvider := asObj(asObj(asObj(schemas["BackgroundTaskTemplate"])["properties"])["provider"])
	if templateProvider["example"] != "openrouter" || templateProvider["description"] != "Default provider for tasks created from this template." {
		t.Fatalf("BackgroundTaskTemplate.provider sampled the wrong service: %#v", templateProvider)
	}
	instantiateProvider := asObj(asObj(asObj(schemas["BackgroundTaskTemplateInstantiateRequest"])["properties"])["provider"])
	if instantiateProvider["example"] != "openrouter" || instantiateProvider["description"] != "Provider override." {
		t.Fatalf("BackgroundTaskTemplateInstantiateRequest.provider sampled the wrong service: %#v", instantiateProvider)
	}
	if taskProvider := asObj(taskProperties["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("BackgroundTask.provider lost its example: %#v", taskProvider)
	}
	embeddingModel := asObj(asObj(asObj(schemas["LLMEmbeddingsRequest"])["properties"])["model"])
	if embeddingModel["example"] != "openai/text-embedding-3-small" || embeddingModel["description"] != "Desktop-facing embedding model id." {
		t.Fatalf("LLMEmbeddingsRequest.model sampled a chat model: %#v", embeddingModel)
	}
	if chatModel := asObj(asObj(asObj(schemas["LLMChatCompletionsRequest"])["properties"])["model"]); chatModel["example"] != "openai/gpt-4.1-mini" {
		t.Fatalf("LLMChatCompletionsRequest.model lost its chat example: %#v", chatModel)
	}
	assertNonUUIDIdentifiers(t, schemas)

	templateModel := asObj(asObj(asObj(schemas["BackgroundTaskTemplate"])["properties"])["model"])
	if templateModel["example"] != "anthropic/claude-sonnet-4-5" || templateModel["description"] != "Default model id for runs." {
		t.Fatalf("BackgroundTaskTemplate.model sampled the wrong model: %#v", templateModel)
	}
	instantiateModel := asObj(asObj(asObj(schemas["BackgroundTaskTemplateInstantiateRequest"])["properties"])["model"])
	if instantiateModel["example"] != "anthropic/claude-sonnet-4-5" || instantiateModel["description"] != "Model override." {
		t.Fatalf("BackgroundTaskTemplateInstantiateRequest.model sampled the wrong model: %#v", instantiateModel)
	}
	if chatModel := asObj(asObj(asObj(schemas["LLMChatCompletionsRequest"])["properties"])["model"]); chatModel["example"] != "openai/gpt-4.1-mini" {
		t.Fatalf("LLMChatCompletionsRequest.model lost its chat example: %#v", chatModel)
	}
	pendingProvider := asObj(asObj(asObj(schemas["OAuthPending"])["properties"])["provider"])
	if pendingProvider["example"] != "google" || pendingProvider["description"] != "Sign-in service for this handoff. google, canvas, corinthian, or wispr." {
		t.Fatalf("OAuthPending.provider sampled a model provider: %#v", pendingProvider)
	}
	connectionProvider := asObj(asObj(asObj(schemas["OAuthConnection"])["properties"])["provider"])
	if connectionProvider["example"] != "google" || connectionProvider["description"] != "Sign-in service for this connection." {
		t.Fatalf("OAuthConnection.provider sampled a model provider: %#v", connectionProvider)
	}
	historyProvider := asObj(asObj(asObj(schemas["OAuthConnectionHistory"])["properties"])["provider"])
	if historyProvider["example"] != "google" || historyProvider["description"] != "Sign-in service recorded for this connection." {
		t.Fatalf("OAuthConnectionHistory.provider sampled a model provider: %#v", historyProvider)
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("BackgroundTask.provider lost its model example: %#v", taskProvider)
	}
	identityDescription := "Tool this identity came from. For an external record it is the first part of that record, such as hubspot."
	for _, name := range []string{"PersonIdentity", "RelationshipIdentity"} {
		provider := asObj(asObj(asObj(schemas[name])["properties"])["provider"])
		if provider["example"] != "hubspot" || provider["description"] != identityDescription {
			t.Fatalf("%s.provider sampled a model provider: %#v", name, provider)
		}
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("BackgroundTask.provider lost its model example: %#v", taskProvider)
	}
	assertTokenAudiences(t, schemas)

	assertUnixTokenExpiry(t, schemas)

	assertGrantedScopes(t, schemas)

	assertConsentContext(t, schemas)

	assertVoiceKeyTimes(t, schemas)

	assertSlackMessageTime(t, schemas)

	assertSessionCost(t, schemas)

	assertPreviousRunID(t, schemas)

	assertDependencyEnds(t, schemas)
	assertDependencyRequest(t, spec)

	assertVoiceKeyPrefix(t, schemas)
	assertVoiceKeyCreateExample(t, spec)

	assertAttentionOwner(t, schemas)

	missionControlEvidence := asObj(schemas["MissionControlDimensionEvidence"])
	evidenceProperties := asObj(missionControlEvidence["properties"])
	reason := asObj(evidenceProperties["reason"])
	if reason["type"] != "string" || reason["description"] != "Evidence-backed explanation." || reason["enum"] != nil {
		t.Fatalf("MissionControlDimensionEvidence.reason was corrupted by generic entity metadata: %#v", reason)
	}
	snapshotState := asObj(asObj(asObj(schemas["RelationshipStateSnapshot"])["properties"])["state"])
	if snapshotState["description"] != "Projected state at this version." || snapshotState["type"] != "object" || snapshotState["example"] != nil {
		t.Fatalf("RelationshipStateSnapshot.state was rewritten as an OAuth ticket: %#v", snapshotState)
	}
	graphState := asObj(asObj(asObj(schemas["ConsoleGraphSavedViewPayload"])["properties"])["state"])
	if graphState["$ref"] != "#/components/schemas/ConsoleGraphSavedViewState" || graphState["description"] != nil || graphState["example"] != nil {
		t.Fatalf("ConsoleGraphSavedViewPayload.state was rewritten as an OAuth ticket: %#v", graphState)
	}
	oauthState := asObj(asObj(asObj(schemas["OAuthPending"])["properties"])["state"])
	if oauthState["description"] != "Opaque one-time OAuth state/session ticket." || oauthState["example"] != "state_abc123" {
		t.Fatalf("OAuthPending.state lost its handoff ticket: %#v", oauthState)
	}
	status := asObj(evidenceProperties["status"])
	if status["type"] != "string" || status["description"] != "Assertion lifecycle state." || status["example"] != "accepted" {
		t.Fatalf("MissionControlDimensionEvidence.status was corrupted by generic entity metadata: %#v", status)
	}
	value := asObj(evidenceProperties["value"])
	oneOf, ok := value["oneOf"].([]any)
	if !ok || len(oneOf) != 2 || value["nullable"] != true || asObj(oneOf[0])["type"] != "string" || asObj(oneOf[1])["type"] != "array" {
		t.Fatalf("MissionControlDimensionEvidence.value must allow scalar and list values: %#v", value)
	}
	relationshipProperties := asObj(asObj(schemas["RevenueRelationship"])["properties"])
	if relationshipProperties["resourceRefs"] == nil {
		t.Fatal("RevenueRelationship is missing runtime resourceRefs")
	}
	// List and detail DTOs always emit these counts. If they stay off the
	// contract, the web Orval strictObject rejects /relationships as a
	// "different versions" schema mismatch.
	for _, field := range []string{"peopleCount", "emailThreadCount", "commitmentCount"} {
		if relationshipProperties[field] == nil {
			t.Fatalf("RevenueRelationship is missing runtime %s", field)
		}
	}

	observationBatch := asObj(asObj(asObj(asObj(spec["paths"])["/v1/relationship-observations/batch"])["post"])["requestBody"])
	content := asObj(observationBatch["content"])
	bodySchema := asObj(asObj(content["application/json"])["schema"])
	observations := asObj(asObj(bodySchema["properties"])["observations"])
	observationInput := asObj(observations["items"])
	observationProperties := asObj(observationInput["properties"])
	for _, field := range []string{"relationshipId", "resourceRefs", "receivedAt", "participants", "assertions", "channel", "direction"} {
		if observationProperties[field] == nil {
			t.Fatalf("observation request is missing %s", field)
		}
	}
	assertionItems := asObj(asObj(observationProperties["assertions"])["items"])
	assertionProperties := asObj(assertionItems["properties"])
	for _, field := range []string{"valueSchemaVersion", "sourceType", "confidence", "reason", "validFrom", "validTo", "extractorVersion", "projectorCompatVersion", "userConfirmed"} {
		if assertionProperties[field] == nil {
			t.Fatalf("observation assertion request is missing %s", field)
		}
	}
	confidence := asObj(assertionProperties["confidence"])
	if confidence["minimum"] != 0 || confidence["maximum"] != 1 {
		t.Fatalf("observation assertion confidence bounds are invalid: %#v", confidence)
	}
	entityProjection := asObj(schemas["EntityProjection"])
	entityProperties := asObj(entityProjection["properties"])
	identifierItems := asObj(asObj(asObj(entityProperties["identifiers"])["additionalProperties"])["items"])
	if identifierItems["pattern"] != "^sha256:v1:[0-9a-f]{64}$" {
		t.Fatalf("entity identifier contract must reject raw PII: %#v", identifierItems)
	}
	resourceRefItems := asObj(asObj(entityProperties["resourceRefs"])["items"])
	if resourceRefItems["pattern"] == nil || asObj(entityProperties["resourceRefs"])["maxItems"] != 100 {
		t.Fatalf("entity resourceRef contract is unbounded: %#v", entityProperties["resourceRefs"])
	}
	entityID := asObj(entityProperties["id"])
	if entityID["description"] != "Optional body copy of the path ULID." || entityID["example"] != "01J9Z8Q5K3R7V2C4M6N8P0T1S3" {
		t.Fatalf("entity projection ULID metadata was overwritten: %#v", entityID)
	}
	entityStatus := asObj(asObj(asObj(schemas["EntitySpine"])["properties"])["status"])
	if entityStatus["description"] != "Lifecycle status." {
		t.Fatalf("entity lifecycle metadata was overwritten: %#v", entityStatus)
	}
	assertActorUsers(t, schemas)
}

func TestCheckedInOpenAPIJSONIsEnriched(t *testing.T) {
	raw, err := os.ReadFile("../../api/openapi.json")
	if err != nil {
		t.Fatalf("read checked-in openapi json: %v", err)
	}
	var spec obj
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse checked-in openapi json: %v", err)
	}
	paths := asObj(spec["paths"])
	if paths["/v1/me"] == nil || paths["/v1/background-task-templates"] == nil || paths["/v1/background-tasks"] == nil || paths["/v1/background-tasks/first-party/ensure"] == nil || paths["/v1/background-tasks/{slug}/runs/{runId}/events"] == nil || paths["/v1/background-tasks/{slug}/runs/{runId}/events/stream"] == nil || paths["/v1/llm/chat/completions"] == nil || paths["/v1/connectors"] == nil || paths["/v1/connections/{name}/api-key"] == nil || paths["/v1/slack-oauth/workspaces"] == nil || paths["/v1/slack-oauth/thread/read"] == nil || paths["/v1/entities"] == nil || paths["/v1/entities/{id}"] == nil || paths["/v1/entities/merge"] == nil {
		t.Fatal("checked-in openapi json is missing mounted runtime API paths")
	}
	if paths["/credit-ledgers"] != nil {
		t.Fatal("checked-in openapi json still contains unmounted ent CRUD paths")
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	assertBillingTrialStatus(t, paths, schemas)
	if schemas["LLMChatCompletionsRequest"] == nil || schemas["MeResponse"] == nil || schemas["BackgroundTask"] == nil || schemas["BackgroundTaskTemplate"] == nil || schemas["RevisionConflictEnvelope"] == nil || schemas["IntegrationTemplateBlock"] == nil || schemas["SlackWorkspacesResponse"] == nil || schemas["SlackThreadReadResponse"] == nil || schemas["EntityProjection"] == nil || schemas["EntitySpine"] == nil {
		t.Fatal("checked-in openapi json is missing enriched runtime schemas")
	}
	if schemas["ConnectorCredentialCleanupJob"] != nil || schemas["ConnectorCredentialRecovery"] != nil {
		t.Fatal("checked-in openapi json exposes internal credential cleanup or recovery state")
	}
	templateProvider := asObj(asObj(asObj(schemas["BackgroundTaskTemplate"])["properties"])["provider"])
	if templateProvider["example"] != "openrouter" || templateProvider["description"] != "Default provider for tasks created from this template." {
		t.Fatalf("checked-in BackgroundTaskTemplate.provider sampled the wrong service: %#v", templateProvider)
	}
	instantiateProvider := asObj(asObj(asObj(schemas["BackgroundTaskTemplateInstantiateRequest"])["properties"])["provider"])
	if instantiateProvider["example"] != "openrouter" || instantiateProvider["description"] != "Provider override." {
		t.Fatalf("checked-in BackgroundTaskTemplateInstantiateRequest.provider sampled the wrong service: %#v", instantiateProvider)
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("checked-in BackgroundTask.provider lost its example: %#v", taskProvider)
	}

	embeddingModel := asObj(asObj(asObj(schemas["LLMEmbeddingsRequest"])["properties"])["model"])
	if embeddingModel["example"] != "openai/text-embedding-3-small" || embeddingModel["description"] != "Desktop-facing embedding model id." {
		t.Fatalf("checked-in LLMEmbeddingsRequest.model sampled a chat model: %#v", embeddingModel)
	}
	if chatModel := asObj(asObj(asObj(schemas["LLMChatCompletionsRequest"])["properties"])["model"]); chatModel["example"] != "openai/gpt-4.1-mini" {
		t.Fatalf("checked-in LLMChatCompletionsRequest.model lost its chat example: %#v", chatModel)
	}

	assertNonUUIDIdentifiers(t, schemas)

	templateModel := asObj(asObj(asObj(schemas["BackgroundTaskTemplate"])["properties"])["model"])
	if templateModel["example"] != "anthropic/claude-sonnet-4-5" || templateModel["description"] != "Default model id for runs." {
		t.Fatalf("checked-in BackgroundTaskTemplate.model sampled the wrong model: %#v", templateModel)
	}
	instantiateModel := asObj(asObj(asObj(schemas["BackgroundTaskTemplateInstantiateRequest"])["properties"])["model"])
	if instantiateModel["example"] != "anthropic/claude-sonnet-4-5" || instantiateModel["description"] != "Model override." {
		t.Fatalf("checked-in BackgroundTaskTemplateInstantiateRequest.model sampled the wrong model: %#v", instantiateModel)
	}
	if chatModel := asObj(asObj(asObj(schemas["LLMChatCompletionsRequest"])["properties"])["model"]); chatModel["example"] != "openai/gpt-4.1-mini" {
		t.Fatalf("checked-in LLMChatCompletionsRequest.model lost its chat example: %#v", chatModel)
	}

	pendingProvider := asObj(asObj(asObj(schemas["OAuthPending"])["properties"])["provider"])
	if pendingProvider["example"] != "google" || pendingProvider["description"] != "Sign-in service for this handoff. google, canvas, corinthian, or wispr." {
		t.Fatalf("checked-in OAuthPending.provider sampled a model provider: %#v", pendingProvider)
	}
	connectionProvider := asObj(asObj(asObj(schemas["OAuthConnection"])["properties"])["provider"])
	if connectionProvider["example"] != "google" || connectionProvider["description"] != "Sign-in service for this connection." {
		t.Fatalf("checked-in OAuthConnection.provider sampled a model provider: %#v", connectionProvider)
	}
	historyProvider := asObj(asObj(asObj(schemas["OAuthConnectionHistory"])["properties"])["provider"])
	if historyProvider["example"] != "google" || historyProvider["description"] != "Sign-in service recorded for this connection." {
		t.Fatalf("checked-in OAuthConnectionHistory.provider sampled a model provider: %#v", historyProvider)
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("checked-in BackgroundTask.provider lost its model example: %#v", taskProvider)
	}

	identityDescription := "Tool this identity came from. For an external record it is the first part of that record, such as hubspot."
	for _, name := range []string{"PersonIdentity", "RelationshipIdentity"} {
		provider := asObj(asObj(asObj(schemas[name])["properties"])["provider"])
		if provider["example"] != "hubspot" || provider["description"] != identityDescription {
			t.Fatalf("checked-in %s.provider sampled a model provider: %#v", name, provider)
		}
	}
	if taskProvider := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["provider"]); taskProvider["example"] != "openai" {
		t.Fatalf("checked-in BackgroundTask.provider lost its model example: %#v", taskProvider)
	}

	assertTokenAudiences(t, schemas)

	assertUnixTokenExpiry(t, schemas)

	assertGrantedScopes(t, schemas)

	assertConsentContext(t, schemas)

	assertVoiceKeyTimes(t, schemas)

	assertSlackMessageTime(t, schemas)

	assertSessionCost(t, schemas)

	assertPreviousRunID(t, schemas)

	assertDependencyEnds(t, schemas)
	assertDependencyRequest(t, spec)

	assertVoiceKeyPrefix(t, schemas)
	assertVoiceKeyCreateExample(t, spec)

	assertAttentionOwner(t, schemas)
	evidenceProperties := asObj(asObj(schemas["MissionControlDimensionEvidence"])["properties"])
	if reason := asObj(evidenceProperties["reason"]); reason["type"] != "string" || reason["enum"] != nil {
		t.Fatalf("checked-in MissionControlDimensionEvidence.reason is invalid: %#v", reason)
	}
	removal := asObj(asObj(asObj(schemas["PersonSuppression"])["properties"])["reason"])
	removalEnum, _ := removal["enum"].([]any)
	if removal["example"] != "user_action" || len(removalEnum) != 2 || removalEnum[0] != "user_action" || removalEnum[1] != "subject_request" {
		t.Fatalf("checked-in PersonSuppression.reason is a credit-ledger code: %#v", removal)
	}
	commitment := asObj(asObj(asObj(schemas["CommitmentEvent"])["properties"])["reason"])
	if commitment["description"] != "Transition rationale." || commitment["enum"] != nil {
		t.Fatalf("checked-in CommitmentEvent.reason is a credit-ledger code: %#v", commitment)
	}
	if ledger := asObj(asObj(asObj(schemas["CreditLedger"])["properties"])["reason"]); ledger["example"] != "llm_settle" {
		t.Fatalf("checked-in CreditLedger.reason lost its ledger code: %#v", ledger)
	}

	snapshotState := asObj(asObj(asObj(schemas["RelationshipStateSnapshot"])["properties"])["state"])
	if snapshotState["description"] != "Projected state at this version." || snapshotState["example"] != nil {
		t.Fatalf("checked-in RelationshipStateSnapshot.state is an OAuth ticket: %#v", snapshotState)
	}
	graphState := asObj(asObj(asObj(schemas["ConsoleGraphSavedViewPayload"])["properties"])["state"])
	if graphState["$ref"] != "#/components/schemas/ConsoleGraphSavedViewState" || graphState["example"] != nil {
		t.Fatalf("checked-in ConsoleGraphSavedViewPayload.state is an OAuth ticket: %#v", graphState)
	}
	if oauth := asObj(asObj(asObj(schemas["OAuthPending"])["properties"])["state"]); oauth["example"] != "state_abc123" {
		t.Fatalf("checked-in OAuthPending.state lost its handoff ticket: %#v", oauth)
	}

	intelligenceDelta := asObj(asObj(asObj(schemas["RelationshipIntelligence"])["properties"])["delta"])
	if intelligenceDelta["description"] != "Exact before/after values, uncertain claim ids, contradictions, and recommendation reason." || intelligenceDelta["example"] != nil {
		t.Fatalf("checked-in RelationshipIntelligence.delta is a credit change: %#v", intelligenceDelta)
	}
	if ledgerDelta := asObj(asObj(asObj(schemas["CreditLedger"])["properties"])["delta"]); ledgerDelta["example"] != float64(-42) && ledgerDelta["example"] != -42 {
		t.Fatalf("checked-in CreditLedger.delta lost its credit example: %#v", ledgerDelta)
	}

	for _, name := range []string{"MailThread", "MailBodyCache"} {
		provider := asObj(asObj(asObj(schemas[name])["properties"])["provider"])
		enum, _ := provider["enum"].([]any)
		if provider["example"] != "gmail" || len(enum) != 1 || enum[0] != "gmail" {
			t.Fatalf("checked-in %s.provider is not Gmail: %#v", name, provider)
		}
	}

	participantEmail := asObj(asObj(asObj(schemas["RelationshipParticipant"])["properties"])["email"])
	if participantEmail["example"] != "avery@acme.com" || participantEmail["description"] != "Normalized email." {
		t.Fatalf("checked-in RelationshipParticipant.email is the signed-in user: %#v", participantEmail)
	}
	messageEmail := asObj(asObj(asObj(schemas["CommunicationParticipant"])["properties"])["email"])
	if messageEmail["example"] != "avery@acme.com" || messageEmail["description"] != "Address of someone on this message." {
		t.Fatalf("checked-in CommunicationParticipant.email is the signed-in user: %#v", messageEmail)
	}
	if userEmail := asObj(asObj(asObj(schemas["User"])["properties"])["email"]); userEmail["example"] != "user@example.com" {
		t.Fatalf("checked-in User.email lost the signed-in address: %#v", userEmail)
	}
	if value := asObj(evidenceProperties["value"]); value["oneOf"] == nil {
		t.Fatalf("checked-in MissionControlDimensionEvidence.value is invalid: %#v", value)
	}
	entityProperties := asObj(asObj(schemas["EntityProjection"])["properties"])
	if id := asObj(entityProperties["id"]); id["description"] != "Optional body copy of the path ULID." || id["example"] != "01J9Z8Q5K3R7V2C4M6N8P0T1S3" {
		t.Fatalf("checked-in entity projection ULID metadata is invalid: %#v", id)
	}
	assertEventObservation(t, schemas)
	assertGraphExecutionNeedsReconcile(t, schemas)

	assertEventParties(t, schemas)

	assertConversationReview(t, schemas)
}

func TestConversationReviewNamesTheItem(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertConversationReview(t, asObj(asObj(spec["components"])["schemas"]))
	raw, err := json.Marshal(spec)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	itemID := conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")
	if !strings.Contains(body, itemID) {
		t.Fatalf("review item id missing from enriched spec")
	}
	if strings.Contains(body, "review:ab12") || strings.Contains(body, "claim:ab12") {
		t.Fatal("review samples still use a short stub")
	}
}

func assertConversationReview(t *testing.T, schemas obj) {
	t.Helper()
	itemID := conversationReviewItemID(conversationObservationID, conversationClaimID, "speaker")
	batchID := conversationReviewBatchID(conversationExternalID, conversationSourceVersion)
	claim := asObj(asObj(schemas["ConversationClaim"])["properties"])
	if claim == nil {
		return
	}
	if asObj(claim["id"])["example"] != conversationClaimID || asObj(claim["id"])["description"] != "Stable claim id." {
		t.Fatalf("claim id: %#v", claim["id"])
	}
	review := asObj(asObj(schemas["ConversationReviewItem"])["properties"])
	if asObj(review["id"])["example"] != itemID || asObj(review["id"])["description"] != "Stable review item id." {
		t.Fatalf("review item id: %#v", review["id"])
	}
	if asObj(review["claimId"])["example"] != conversationClaimID || asObj(review["claimId"])["description"] != "Material claim id." {
		t.Fatalf("review claim id: %#v", review["claimId"])
	}
	if asObj(review["batchId"])["example"] != batchID || asObj(review["batchId"])["description"] != "Idempotent review batch id." {
		t.Fatalf("review batch id: %#v", review["batchId"])
	}
	if asObj(review["observationId"])["example"] != conversationObservationID || asObj(review["kind"])["example"] != "speaker" {
		t.Fatalf("review inputs changed: observation %#v kind %#v", review["observationId"], review["kind"])
	}
	if user := asObj(schemas["User"]); user != nil {
		if id := asObj(asObj(user["properties"])["id"]); id["example"] != nil && id["example"] != "123e4567-e89b-12d3-a456-426614174000" {
			t.Fatalf("user id changed: %#v", id)
		}
	}
}

func TestContradictionResolutionNamesTheAssertion(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSelectedAssertion(t, spec)
}

func assertSelectedAssertion(t *testing.T, spec obj) {
	t.Helper()
	const assertionID = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	paths := asObj(spec["paths"])
	if paths == nil {
		return
	}
	operation := asObj(asObj(paths["/v1/relationships/{relationshipId}/contradictions/{caseId}/resolve"])["post"])
	media := asObj(asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"]))
	example := asObj(media["example"])
	if example["selectedAssertionId"] != assertionID {
		t.Fatalf("resolution example: %#v", example)
	}
	selected := asObj(asObj(asObj(media["schema"])["properties"])["selectedAssertionId"])
	if selected["example"] != assertionID || selected["format"] != "uuid" || selected["description"] != "Selected assertion id." {
		t.Fatalf("selected assertion: %#v", selected)
	}
	evidence := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["MissionControlDimensionEvidence"])["properties"])
	if asObj(evidence["assertionId"])["example"] != assertionID {
		t.Fatalf("winning assertion changed: %#v", evidence["assertionId"])
	}
}

func TestConversationPolicyNamesTheBuiltinVersion(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertConversationPolicyVersion(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertConversationPolicyVersion(t *testing.T, schemas obj) {
	t.Helper()
	version := builtinConversationPolicyVersion()
	if version != "policy:9373cc30008dcb712c236fc9" {
		t.Fatalf("builtin policy version drifted: %s", version)
	}
	policy := asObj(asObj(schemas["ResolvedConversationPolicy"])["properties"])
	if policy == nil {
		return
	}
	if asObj(policy["policyVersion"])["example"] != version || asObj(policy["policyVersion"])["description"] != "Hash-bound effective policy version." {
		t.Fatalf("policy version: %#v", policy["policyVersion"])
	}
	if asObj(policy["modelRoute"])["example"] != "hosted_allowed" {
		t.Fatalf("model route: %#v", policy["modelRoute"])
	}
	layers := asObj(policy["sourceLayerIds"])
	if asObj(layers["items"])["example"] != "builtin:conversation-policy-v1" {
		t.Fatalf("source layer: %#v", layers)
	}
	access := asObj(asObj(schemas["CommunicationAccess"])["properties"])
	if access != nil && asObj(access["policyVersion"])["example"] != float64(1) && asObj(access["policyVersion"])["example"] != 1 {
		t.Fatalf("communication policy version changed: %#v", access["policyVersion"])
	}

	assertGovernanceReceipt(t, schemas)
}

func TestGovernanceReceiptNamesTheMeeting(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertGovernanceReceipt(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertGovernanceReceipt(t *testing.T, schemas obj) {
	t.Helper()
	receipt := asObj(asObj(schemas["ConversationGovernanceReceipt"])["properties"])
	if receipt == nil {
		return
	}
	capturedAt, _ := asObj(receipt["capturedAt"])["example"].(string)
	if capturedAt == "" {
		t.Fatal("capture time missing")
	}
	want := "governance:session-42:" + capturedAt
	if asObj(receipt["receiptId"])["example"] != want || asObj(receipt["receiptId"])["description"] != "Receipt id." {
		t.Fatalf("receipt id: %#v", receipt["receiptId"])
	}
}

func TestRelationshipStateHashMatchesTheProjector(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertDocumentedStateHash(t, spec)
}

func assertDocumentedStateHash(t *testing.T, spec obj) {
	t.Helper()
	const want = documentedRelationshipStateHash
	schemas := asObj(asObj(spec["components"])["schemas"])
	relationship := asObj(asObj(schemas["RevenueRelationship"])["properties"])
	if asObj(relationship["stateHash"])["example"] != want {
		t.Fatalf("relationship state hash: %#v", relationship["stateHash"])
	}
	snapshot := asObj(asObj(schemas["RelationshipStateSnapshot"])["properties"])
	if asObj(snapshot["stateHash"])["example"] != want {
		t.Fatalf("snapshot state hash: %#v", snapshot["stateHash"])
	}
	readModel := asObj(asObj(schemas["MissionControlReadModel"])["properties"])
	if asObj(readModel["stateHash"])["example"] != want {
		t.Fatalf("mission control state hash: %#v", readModel["stateHash"])
	}
	if asObj(readModel["aggregateHash"])["example"] != "sha256:cd34" {
		t.Fatalf("aggregate hash changed: %#v", readModel["aggregateHash"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["contentHash"])["example"] != "sha256:ab12" {
		t.Fatalf("content hash changed: %#v", evidence["contentHash"])
	}
	post := asObj(asObj(asObj(spec["paths"])["/v1/relationships/{relationshipId}/acknowledgements"])["post"])
	body := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	if asObj(body["example"])["stateHash"] != want {
		t.Fatalf("acknowledgement request: %#v", body["example"])
	}
	if asObj(asObj(asObj(body["schema"])["properties"])["stateHash"])["example"] != want {
		t.Fatalf("acknowledgement property: %#v", body["schema"])
	}
	response := asObj(asObj(asObj(asObj(asObj(post["responses"])["201"])["content"])["application/json"])["schema"])
	if asObj(asObj(response["properties"])["stateHash"])["example"] != want {
		t.Fatalf("acknowledgement response: %#v", response)
	}

	assertProjectorVersion(t, schemas)
}

func TestProjectorVersionMatchesTheRelationshipProjector(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertProjectorVersion(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertProjectorVersion(t *testing.T, schemas obj) {
	t.Helper()
	for _, schema := range []string{"RevenueRelationship", "RelationshipStateSnapshot", "RelationshipAttentionItem", "MissionControlReadModel"} {
		field := asObj(asObj(asObj(schemas[schema])["properties"])["projectorVersion"])
		if !exampleEquals(field["example"], 2) {
			t.Fatalf("%s projector version: %#v", schema, field)
		}
	}
	for _, schema := range []string{"RelationshipAttentionItem", "MissionControlReadModel"} {
		field := asObj(asObj(asObj(schemas[schema])["properties"])["detectorVersion"])
		if !exampleEquals(field["example"], 1) {
			t.Fatalf("%s detector version: %#v", schema, field)
		}
	}
}

func exampleEquals(value any, want int) bool {
	switch n := value.(type) {
	case int:
		return n == want
	case float64:
		return n == float64(want)
	default:
		return false
	}
}

func TestObservationContentHashMatchesTheGmailSample(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertObservationContentHash(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertObservationContentHash(t *testing.T, schemas obj) {
	t.Helper()
	const want = documentedObservationContentHash
	observation := asObj(asObj(schemas["RelationshipObservation"])["properties"])
	if asObj(observation["contentHash"])["example"] != want {
		t.Fatalf("observation content hash: %#v", observation["contentHash"])
	}
	if !reflect.DeepEqual(asObj(observation["normalizedFacts"])["example"], map[string]any{"adapter": "gmail"}) {
		t.Fatalf("observation facts: %#v", observation["normalizedFacts"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["contentHash"])["example"] != want {
		t.Fatalf("mission control content hash: %#v", evidence["contentHash"])
	}

	assertSupportRefs(t, schemas)
}

func TestSupportRefsMatchThePublishedWorkspace(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSupportRefs(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertSupportRefs(t *testing.T, schemas obj) {
	t.Helper()
	diagnostics := asObj(asObj(schemas["BetaDiagnostics"])["properties"])
	if asObj(diagnostics["workspaceRef"])["example"] != documentedWorkspaceSupportRef {
		t.Fatalf("workspace ref: %#v", diagnostics["workspaceRef"])
	}
	source := asObj(asObj(diagnostics["sources"])["items"])
	props := asObj(source["properties"])
	if asObj(props["connectionRef"])["example"] != documentedConnectionSupportRef {
		t.Fatalf("connection ref: %#v", props["connectionRef"])
	}
	if asObj(props["sourceAccountRef"])["example"] != documentedSourceAccountSupportRef {
		t.Fatalf("source account ref: %#v", props["sourceAccountRef"])
	}
	if asObj(props["source"])["example"] != "google" {
		t.Fatalf("source: %#v", props["source"])
	}

	assertDeletionVerificationHash(t, schemas)
}

func TestDeletionVerificationHashMatchesThePublishedTarget(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertDeletionVerificationHash(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertDeletionVerificationHash(t *testing.T, schemas obj) {
	t.Helper()
	receipt := asObj(asObj(schemas["ConversationDeletionReceipt"])["properties"])
	if asObj(receipt["receiptId"])["example"] != "delete:ab12" {
		t.Fatalf("receipt id: %#v", receipt["receiptId"])
	}
	target := asObj(asObj(receipt["targets"])["items"])
	props := asObj(target["properties"])
	if asObj(props["target"])["example"] != "api_evidence" {
		t.Fatalf("target: %#v", props["target"])
	}
	if asObj(props["verificationHash"])["example"] != documentedDeletionVerificationHash {
		t.Fatalf("verification hash: %#v", props["verificationHash"])
	}

	assertActionRevisionHash(t, schemas)
}

func TestActionRevisionHashMatchesThePublishedDraft(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertActionRevisionHash(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertActionRevisionHash(t *testing.T, schemas obj) {
	t.Helper()
	action := asObj(asObj(schemas["RevenueAction"])["properties"])
	if asObj(action["revisionHash"])["example"] != documentedActionRevisionHash {
		t.Fatalf("action revision hash: %#v", action["revisionHash"])
	}
	if asObj(action["actionType"])["example"] != "warm_follow_up" || asObj(action["executionMode"])["example"] != "draft" {
		t.Fatalf("action draft fields: %#v", action)
	}
	decision := asObj(asObj(schemas["RevenuePolicyDecision"])["properties"])
	if asObj(decision["revisionHash"])["example"] != documentedActionRevisionHash {
		t.Fatalf("decision revision hash: %#v", decision["revisionHash"])
	}
}

func TestQueueAcceptUsesTheRegisterKey(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertQueueAcceptTransition(t, spec)
}

func assertQueueAcceptTransition(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/relationships/{relationshipId}/commitments/{commitmentId}/transitions"])["post"])
	content := asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example["idempotencyKey"] != documentedQueueAcceptKey || example["kind"] != "accepted" || example["reason"] != documentedQueueAcceptReason {
		t.Fatalf("queue accept example: %#v", example)
	}
	if example["evidenceRefs"] != nil {
		t.Fatalf("queue accept sent evidence the register omits: %#v", example["evidenceRefs"])
	}
	props := asObj(asObj(content["schema"])["properties"])
	if asObj(props["idempotencyKey"])["example"] != documentedQueueAcceptKey {
		t.Fatalf("idempotency key: %#v", props["idempotencyKey"])
	}
	items := asObj(asObj(props["evidenceRefs"])["items"])
	if items["example"] != documentedQueueAcceptEvidence {
		t.Fatalf("stored transition evidence: %#v", items["example"])
	}

	assertIdentityDecisionRequest(t, spec)
}

func TestIdentityInboxSendsADecisionUUID(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertIdentityDecisionRequest(t, spec)
}

func assertIdentityDecisionRequest(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/relationship-identity-candidates/{candidateId}/decisions"])["post"])
	content := asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example["decision"] != "merge" || example["expectedVersion"] != 1 && example["expectedVersion"] != float64(1) {
		t.Fatalf("identity decision example: %#v", example)
	}
	if example["idempotencyKey"] != documentedIdentityDecisionKey || example["reason"] != documentedIdentityDecisionReason {
		t.Fatalf("identity inbox request: %#v", example)
	}
	props := asObj(asObj(content["schema"])["properties"])
	key := asObj(props["idempotencyKey"])
	if key["example"] != documentedIdentityDecisionKey || key["format"] != "uuid" {
		t.Fatalf("idempotency key: %#v", key)
	}
	if asObj(props["reason"])["example"] != documentedIdentityDecisionReason {
		t.Fatalf("reason: %#v", props["reason"])
	}
	if example["idempotencyKey"] == "identity-review:123" {
		t.Fatal("identity decision still samples identity-review:123")
	}

	assertPlanResponseRequest(t, spec)
}

func TestSharedPlanResponseUsesAUUID(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertPlanResponseRequest(t, spec)
}

func assertPlanResponseRequest(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/public/mutual-action-plan/responses"])["post"])
	content := asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example["kind"] != "confirm" || example["responseId"] != documentedPlanResponseID || example["comment"] != "" {
		t.Fatalf("plan response example: %#v", example)
	}
	props := asObj(asObj(content["schema"])["properties"])
	responseID := asObj(props["responseId"])
	if responseID["example"] != documentedPlanResponseID || responseID["format"] != "uuid" {
		t.Fatalf("response id: %#v", responseID)
	}
	if asObj(props["itemId"])["example"] != documentedPlanItemID {
		t.Fatalf("item id: %#v", props["itemId"])
	}
	if responseID["example"] == "response:ab12" || asObj(props["itemId"])["example"] == "item:ab12" {
		t.Fatal("plan response still shortens an id")
	}

	assertDeletionRequest(t, spec)
}

func TestDeletionRequestUsesThePageUUID(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertDeletionRequest(t, spec)
}

func assertDeletionRequest(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/relationships/{relationshipId}/conversation-deletion"])["post"])
	content := asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example["requestId"] != documentedDeletionRequestID {
		t.Fatalf("deletion request example: %#v", example)
	}
	requestID := asObj(asObj(asObj(content["schema"])["properties"])["requestId"])
	if requestID["example"] != documentedDeletionRequestID || requestID["format"] != "uuid" {
		t.Fatalf("request id: %#v", requestID)
	}
	receipt := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["ConversationDeletionReceipt"])["properties"])
	stored := asObj(receipt["receiptId"])
	if stored["example"] != documentedDeletionRequestID || stored["format"] != "uuid" {
		t.Fatalf("receipt id: %#v", stored)
	}
	if requestID["example"] == "delete:ab12" || stored["example"] == "delete:ab12" {
		t.Fatal("deletion still samples delete:ab12")
	}

	assertFocusedReviewReasons(t, spec)
}

func TestFocusedReviewSendsItsReasons(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertFocusedReviewReasons(t, spec)
}

func assertFocusedReviewReasons(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	correction := requestExample(t, paths, "/v1/relationships/{relationshipId}/conversation-corrections")
	if correction.example["reason"] != documentedConversationCorrectionReason || correction.reason["example"] != documentedConversationCorrectionReason {
		t.Fatalf("correction reason: %#v %#v", correction.example, correction.reason)
	}
	decision := requestExample(t, paths, "/v1/relationships/{relationshipId}/conversation-decisions")
	if decision.example["kind"] != "approve" || decision.example["reason"] != documentedConversationDecisionReason || decision.reason["example"] != documentedConversationDecisionReason {
		t.Fatalf("decision reason: %#v %#v", decision.example, decision.reason)
	}
}

type focusedReviewRequest struct {
	example obj
	reason  obj
}

func requestExample(t *testing.T, paths obj, path string) focusedReviewRequest {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(paths[path])["post"])["requestBody"])["content"])["application/json"])
	return focusedReviewRequest{
		example: asObj(content["example"]),
		reason:  asObj(asObj(asObj(content["schema"])["properties"])["reason"]),
	}
}

func TestGraphFollowUpSendsATask(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertGraphFollowUpRequest(t, spec)
}

func assertGraphFollowUpRequest(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions"])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example["relationshipId"] != "9c8dfa9b-a7b2-46ea-982c-622a914c00e5" ||
		example["actionType"] != "follow_up_task" ||
		example["channel"] != "task" ||
		example["executionMode"] != "draft" ||
		example["reason"] != documentedGraphFollowUpReason ||
		example["proposedMessage"] != documentedGraphFollowUpMessage {
		t.Fatalf("follow-up request: %#v", example)
	}
	props := asObj(asObj(content["schema"])["properties"])
	if asObj(props["actionType"])["example"] != "follow_up_task" || asObj(props["channel"])["example"] != "task" {
		t.Fatalf("follow-up fields: %#v", props)
	}
	if asObj(props["reason"])["example"] != documentedGraphFollowUpReason || asObj(props["proposedMessage"])["example"] != documentedGraphFollowUpMessage {
		t.Fatalf("follow-up copy: %#v", props)
	}
	relationship := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueRelationship"])["properties"])
	if asObj(relationship["summary"])["example"] != documentedGraphFollowUpMessage || asObj(relationship["displayName"])["example"] != "Jordan Buyer" {
		t.Fatalf("relationship copy: %#v", relationship)
	}

	assertQueueDismissReason(t, spec)
}

func TestQueueDismissSendsNotRelevant(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertQueueDismissReason(t, spec)
}

func assertQueueDismissReason(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/dismiss"])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	reason := asObj(asObj(asObj(content["schema"])["properties"])["reason"])
	if example["reason"] != documentedQueueDismissReason || reason["example"] != documentedQueueDismissReason {
		t.Fatalf("dismiss request: %#v %#v", example, reason)
	}
	stored := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])["dismissReason"])
	if stored["example"] != documentedQueueDismissReason {
		t.Fatalf("stored dismiss reason: %#v", stored)
	}
	if example["reason"] == "already_handled" || stored["example"] == "already_handled" {
		t.Fatal("dismiss still samples already_handled")
	}

	assertRejectReason(t, spec)
}

func TestConfirmRejectSendsNotAppropriate(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertRejectReason(t, spec)
}

func assertRejectReason(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/reject"])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	reason := asObj(asObj(asObj(content["schema"])["properties"])["reason"])
	if example["reason"] != documentedRejectReason || reason["example"] != documentedRejectReason {
		t.Fatalf("reject request: %#v %#v", example, reason)
	}
	if example["reason"] == "wrong_recipient" {
		t.Fatal("reject still samples wrong_recipient")
	}

	assertAttentionAcknowledgeReason(t, spec)
}

func TestPortfolioAttentionAcknowledgeSendsQueueReason(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertAttentionAcknowledgeReason(t, spec)
}

func assertAttentionAcknowledgeReason(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/relationship-attention/{attentionId}/decisions"])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	reason := asObj(asObj(asObj(content["schema"])["properties"])["reason"])
	versionOK := example["expectedVersion"] == 1 || example["expectedVersion"] == float64(1)
	if example["decision"] != "acknowledge" || example["reason"] != documentedAttentionAcknowledgeReason || !versionOK {
		t.Fatalf("attention decision example: %#v", example)
	}
	if reason["example"] != documentedAttentionAcknowledgeReason {
		t.Fatalf("attention decision reason: %#v", reason)
	}
	stateReason := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RelationshipAttentionItem"])["properties"])["stateReason"])
	if stateReason["example"] != documentedAttentionAcknowledgeReason {
		t.Fatalf("stored attention stateReason: %#v", stateReason)
	}

	assertPersonRemovalReason(t, spec)
}

func TestConfirmRemoveSendsUserAction(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertPersonRemovalReason(t, spec)
}

func assertPersonRemovalReason(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/relationship-persons/{personId}"])["delete"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	reason := asObj(asObj(asObj(content["schema"])["properties"])["reason"])
	if example["reason"] != documentedPersonRemovalReason || reason["example"] != documentedPersonRemovalReason {
		t.Fatalf("person removal request: %#v %#v", example, reason)
	}
	stored := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["PersonDeletionReceipt"])["properties"])["reason"])
	if stored["example"] != documentedPersonRemovalReason || stored["enum"] == nil {
		t.Fatalf("person removal receipt reason: %#v", stored)
	}

	assertResearchConsent(t, spec)
}

func TestAllowPublicResearchSendsConsent(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertResearchConsent(t, spec)
}

func assertResearchConsent(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/research/consent"])["put"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	consented := asObj(asObj(asObj(content["schema"])["properties"])["consented"])
	if example["consented"] != true || consented["example"] != true {
		t.Fatalf("research consent request: %#v %#v", example, consented)
	}
	stored := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["CloudResearchConsentState"])["properties"])["consented"])
	if stored["example"] != true {
		t.Fatalf("stored research consent: %#v", stored)
	}

	assertResearchFill(t, spec)
}

func TestFillInCompaniesAndPeopleSendsPendingIDs(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertResearchFill(t, spec)
}

func assertResearchFill(t *testing.T, spec obj) {
	t.Helper()
	companies := researchRequestExample(t, spec, "/v1/research/companies")
	companyIDs, _ := companies["relationshipIds"].([]any)
	if len(companyIDs) != 1 || companyIDs[0] != documentedResearchCompanyID {
		t.Fatalf("company research request: %#v", companies)
	}
	people := researchRequestExample(t, spec, "/v1/research/people")
	personIDs, _ := people["personIds"].([]any)
	if len(personIDs) != 1 || personIDs[0] != documentedResearchPersonID {
		t.Fatalf("person research request: %#v", people)
	}

	assertUpgradePlan(t, spec)
}

func TestUpgradeToProSendsPlanPro(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertUpgradePlan(t, spec)
}

func assertUpgradePlan(t *testing.T, spec obj) {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/billing/checkout-session"])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	plan := asObj(asObj(asObj(content["schema"])["properties"])["plan"])
	if example["plan"] != "pro" || plan["example"] != "pro" {
		t.Fatalf("checkout plan: %#v %#v", example, plan)
	}

	assertPrivacyRule(t, spec)
}

func TestAddRuleSendsProtectedAddress(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertPrivacyRule(t, spec)
}

func assertPrivacyRule(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-workspaces/current/communication-privacy-rules"])["post"])
	if op["summary"] != "Add rule" {
		t.Fatalf("summary: %#v", op["summary"])
	}
	content := asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	props := asObj(asObj(content["schema"])["properties"])
	kind := asObj(props["kind"])
	value := asObj(props["value"])
	if example["kind"] != "protected_address" || example["value"] != "buyer@example.com" {
		t.Fatalf("privacy rule request: %#v", example)
	}
	if kind["example"] != "protected_address" || value["example"] != "buyer@example.com" {
		t.Fatalf("privacy rule fields: %#v %#v", kind, value)
	}
	if !reflect.DeepEqual(kind["enum"], []any{"protected_address", "protected_domain", "blocked_address", "blocked_domain"}) {
		t.Fatalf("privacy rule kinds: %#v", kind["enum"])
	}
	sum := sha256.Sum256([]byte("buyer@example.com"))
	wantHash := "sha256:" + hex.EncodeToString(sum[:])
	stored := asObj(asObj(asObj(asObj(asObj(op["responses"])["201"])["content"])["application/json"])["example"])
	if stored["kind"] != "protected_address" || stored["value"] != "buyer@example.com" || stored["active"] != true || stored["valueHash"] != wantHash || stored["id"] != "3b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("stored privacy rule: %#v want hash %s", stored, wantHash)
	}

	assertResearchStatus(t, spec)
}

func TestCheckPublicResearchReportsConsentRequired(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertResearchStatus(t, spec)
}

func assertResearchStatus(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/research/status"])["get"])
	if op["summary"] != "Check public research" {
		t.Fatalf("summary: %#v", op["summary"])
	}
	content := asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])
	example := asObj(content["example"])
	consent := asObj(example["consent"])
	if example["available"] != true || example["allowed"] != false || example["reason"] != "consent_required" || example["requiredPlan"] != "intelligence" || consent["consented"] != false || consent["consentedAt"] != nil {
		t.Fatalf("research status: %#v", example)
	}
	props := asObj(asObj(content["schema"])["properties"])
	reason := asObj(props["reason"])
	if reason["example"] != "consent_required" || asObj(props["requiredPlan"])["example"] != "intelligence" {
		t.Fatalf("research status fields: %#v %#v", reason, props["requiredPlan"])
	}
	if !reflect.DeepEqual(reason["enum"], []any{"consent_required", "plan_required", "capability_disabled", "provider_unconfigured", "unavailable"}) {
		t.Fatalf("research status reasons: %#v", reason["enum"])
	}

	assertResearchEstimates(t, spec)
}

func TestResearchEstimatesPriceOneProRecord(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertResearchEstimates(t, spec)
}

func assertResearchEstimates(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	company := asObj(asObj(paths["/v1/research/companies/estimate"])["get"])
	people := asObj(asObj(paths["/v1/research/people/estimate"])["get"])
	if company["summary"] != "Estimate companies" || people["summary"] != "Estimate people" {
		t.Fatalf("summaries: %#v %#v", company["summary"], people["summary"])
	}
	companyExample := asObj(asObj(asObj(asObj(asObj(company["responses"])["200"])["content"])["application/json"])["example"])
	peopleExample := asObj(asObj(asObj(asObj(asObj(people["responses"])["200"])["content"])["application/json"])["example"])
	if companyExample["processor"] != "pro" || peopleExample["processor"] != "pro" {
		t.Fatalf("processors: %#v %#v", companyExample, peopleExample)
	}
	if !researchNumber(companyExample["companies"], 1) || companyExample["people"] != nil {
		t.Fatalf("company count: %#v", companyExample)
	}
	if !researchNumber(peopleExample["people"], 1) || peopleExample["companies"] != nil {
		t.Fatalf("people count: %#v", peopleExample)
	}
	for _, example := range []obj{companyExample, peopleExample} {
		if !researchNumber(example["credits"], 1000) || !researchNumber(example["usd"], 0.1) || !researchNumber(example["batchSize"], 25) {
			t.Fatalf("estimate price: %#v", example)
		}
	}
}

func researchNumber(got any, want float64) bool {
	switch n := got.(type) {
	case int:
		return float64(n) == want
	case int64:
		return float64(n) == want
	case float64:
		return n == want
	default:
		return false
	}
}

func TestFillReadsPendingResearchIds(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertResearchPending(t, spec)
}

func assertResearchPending(t *testing.T, spec obj) {
	t.Helper()
	const companyID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const personID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	paths := asObj(spec["paths"])
	companies := asObj(asObj(paths["/v1/research/companies/pending"])["get"])
	people := asObj(asObj(paths["/v1/research/people/pending"])["get"])
	if companies["summary"] != "Pending companies" || people["summary"] != "Pending people" {
		t.Fatalf("summaries: %#v %#v", companies["summary"], people["summary"])
	}
	companyExample := asObj(asObj(asObj(asObj(asObj(companies["responses"])["200"])["content"])["application/json"])["example"])
	peopleExample := asObj(asObj(asObj(asObj(asObj(people["responses"])["200"])["content"])["application/json"])["example"])
	if !reflect.DeepEqual(companyExample["relationshipIds"], []any{companyID}) || companyExample["personIds"] != nil {
		t.Fatalf("pending companies: %#v", companyExample)
	}
	if !reflect.DeepEqual(peopleExample["personIds"], []any{personID}) || peopleExample["relationshipIds"] != nil {
		t.Fatalf("pending people: %#v", peopleExample)
	}

	assertReconcileNow(t, spec)
}

func TestReconcileNowReturnsForgottenPromise(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertReconcileNow(t, spec)
}

func assertReconcileNow(t *testing.T, spec obj) {
	t.Helper()
	const commitmentID = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	sum := sha256.Sum256([]byte(commitmentID + ":3:2026-07-31:forgotten::commitment-recovery-v1"))
	wantID := "recovery:" + hex.EncodeToString(sum[:12])
	op := asObj(asObj(asObj(spec["paths"])["/v1/relationships/{relationshipId}/commitment-recovery/run"])["post"])
	if op["summary"] != "Reconcile now" {
		t.Fatalf("summary: %#v", op["summary"])
	}
	if asObj(op["responses"])["200"] != nil || asObj(op["responses"])["201"] == nil {
		t.Fatalf("recovery status: %#v", op["responses"])
	}
	content := asObj(asObj(asObj(asObj(op["responses"])["201"])["content"])["application/json"])
	request := asObj(asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])["example"])
	if len(request) != 0 {
		t.Fatalf("recovery request: %#v", request)
	}
	evaluations, _ := content["example"].(obj)["evaluations"].([]any)
	if len(evaluations) != 1 {
		example := asObj(content["example"])
		raw, _ := example["evaluations"].([]any)
		evaluations = raw
	}
	if len(evaluations) != 1 {
		t.Fatalf("evaluations: %#v", content["example"])
	}
	evaluation := asObj(evaluations[0])
	version, _ := evaluation["commitmentVersion"].(int)
	if version == 0 {
		if number, ok := evaluation["commitmentVersion"].(float64); ok {
			version = int(number)
		}
	}
	if evaluation["evaluationId"] != wantID || evaluation["commitmentId"] != commitmentID || version != 3 || evaluation["classification"] != "forgotten" || evaluation["proposedActionType"] != "reminder" || evaluation["requiresReview"] != true || evaluation["explanation"] != "This promise is past due and nothing newer has closed it." || evaluation["reconcilerVersion"] != "commitment-recovery-v1" || evaluation["staleSources"] != nil {
		t.Fatalf("forgotten promise: %#v want %s", evaluation, wantID)
	}
	if refs, ok := evaluation["evidenceRefs"].([]any); !ok || len(refs) != 0 {
		t.Fatalf("evidence refs: %#v", evaluation["evidenceRefs"])
	}

	assertAuditWindow(t, spec)
}

func TestAuditButtonSendsSixMonthWindow(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertAuditWindow(t, spec)
}

func assertAuditWindow(t *testing.T, spec obj) {
	t.Helper()
	post := asObj(asObj(asObj(spec["paths"])["/v1/revenue-leak-scans"])["post"])
	if post["summary"] != "Run Promise Leak Audit" {
		t.Fatalf("audit summary = %#v", post["summary"])
	}
	media := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	example := asObj(media["example"])
	if !auditDays(example["lookbackDays"], 180) {
		t.Fatalf("request lookback = %#v", example["lookbackDays"])
	}
	lookback := asObj(asObj(asObj(media["schema"])["properties"])["lookbackDays"])
	if lookback["description"] != "Historical lookback in days. Run Promise Leak Audit sends 180. Omitted values use 180. Maximum 365." {
		t.Fatalf("lookback description = %#v", lookback["description"])
	}
	started := asObj(asObj(asObj(asObj(asObj(post["responses"])["202"])["content"])["application/json"])["example"])
	if started["status"] != "running" || !auditDays(started["lookbackDays"], 180) || started["completedAt"] != nil || started["error"] != nil {
		t.Fatalf("started audit = %#v", started)
	}
	if !auditDays(started["threadsSeen"], 0) {
		t.Fatalf("started audit already counted threads: %#v", started["threadsSeen"])
	}
	status := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueLeakScan"])["properties"])["status"])
	if status["example"] != "running" || status["description"] != "Scan status." {
		t.Fatalf("scan status example = %#v", status)
	}
	report := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])["/v1/revenue-leak-scans/{scanId}/report"])["get"])["responses"])["200"])["content"])
	window := asObj(asObj(asObj(asObj(report["application/json"])["schema"])["properties"])["lookbackDays"])
	if !auditDays(window["example"], 180) {
		t.Fatalf("report window = %#v", window["example"])
	}
}

func auditDays(value any, want int) bool {
	switch days := value.(type) {
	case int:
		return days == want
	case float64:
		return days == float64(want)
	default:
		return false
	}
}

func TestLogOutcomeRecordsTheyReplied(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertLogOutcome(t, spec)
}

func assertLogOutcome(t *testing.T, spec obj) {
	t.Helper()
	const eventID = "manual:replied:1783864800000"
	post := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/outcomes"])["post"])
	if post["summary"] != "Log outcome" {
		t.Fatalf("outcome summary = %#v", post["summary"])
	}
	media := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	example := asObj(media["example"])
	if example["kind"] != "replied" || example["source"] != "user" || example["sourceEventId"] != eventID || example["occurredAt"] != nil {
		t.Fatalf("log outcome request = %#v", example)
	}
	recorded := asObj(asObj(asObj(asObj(asObj(post["responses"])["201"])["content"])["application/json"])["example"])
	if recorded["kind"] != "replied" || recorded["source"] != "user" || recorded["sourceEventId"] != eventID || recorded["occurredAt"] != "2026-07-12T14:00:00Z" {
		t.Fatalf("recorded outcome = %#v", recorded)
	}
	properties := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueOutcome"])["properties"]))
	if asObj(properties["source"])["example"] != "user" || asObj(properties["sourceEventId"])["example"] != eventID {
		t.Fatalf("outcome schema = %#v", properties)
	}

	assertApprovePlan(t, spec)

	assertMailboxPolicy(t, spec)

	assertCreatePlan(t, spec)

	assertDisconnectSource(t, spec)
}

func TestDisconnectSourceReturnsDisconnected(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertDisconnectSource(t, spec)

	assertRemoveRule(t, spec)
}

func TestRemoveRuleReturnsNoBody(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertRemoveRule(t, spec)

	assertSnoozeAction(t, spec)
}

func TestSnoozeActionStoresSevenDays(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSnoozeAction(t, spec)

	assertSaveDraft(t, spec)
}

func TestSaveDraftPostsSubjectAndMessage(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSaveDraft(t, spec)

	assertProviderDraft(t, spec)
}

func TestProviderDraftStoresSentHandled(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertProviderDraft(t, spec)

	assertApprovedAction(t, spec)
}

func TestApproveStoresApprovedRevision(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertApprovedAction(t, spec)
}

func assertApprovedAction(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/approve"])["post"])
	if op["summary"] != "Approve" || op["operationId"] != "approveRevenueAction" {
		t.Fatalf("approve operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "acceptRisk false") || !strings.Contains(description, "approval time") {
		t.Fatalf("approve description: %q", description)
	}
	request := asObj(asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])["example"])
	if request["acceptRisk"] != false {
		t.Fatalf("approve request: %#v", request)
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["approvalStatus"] != "approved" || example["approvedAt"] != "2026-07-12T12:05:00Z" || example["queueStatus"] != "open" || example["executionStatus"] != "pending" || example["executionMode"] != "draft" || !openAPIIntEqual(example["approvedRevision"], 1) || !openAPIIntEqual(example["revision"], 1) {
		t.Fatalf("approved action: %#v", example)
	}
	if _, ok := example["executedAt"]; ok {
		t.Fatalf("approve does not execute: %#v", example["executedAt"])
	}
	if _, ok := example["providerMessageId"]; ok {
		t.Fatalf("approve does not store a provider message: %#v", example["providerMessageId"])
	}
	props := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])
	if asObj(props["approvalStatus"])["example"] != "pending" || asObj(props["queueStatus"])["example"] != "open" {
		t.Fatalf("shared action examples changed: approval=%#v queue=%#v", props["approvalStatus"], props["queueStatus"])
	}
}

func openAPIIntEqual(value any, want int) bool {
	switch n := value.(type) {
	case int:
		return n == want
	case int64:
		return n == int64(want)
	case float64:
		return n == float64(want)
	default:
		return false
	}
}

func TestPolicyRecheckStoresPassedDecision(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertPolicyRecheck(t, spec)
}

func assertPolicyRecheck(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/evaluate"])["post"])
	if op["summary"] != "Re-check policy" || op["operationId"] != "evaluateRevenueAction" {
		t.Fatalf("recheck operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	if op["requestBody"] != nil {
		t.Fatalf("recheck sends no body: %#v", op["requestBody"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "no request body") || !strings.Contains(description, "no reason codes") {
		t.Fatalf("recheck description: %q", description)
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["status"] != "passed" || example["id"] != "2b8dfa9b-a7b2-46ea-982c-622a914c00e5" || example["expiresAt"] != "2026-07-13T12:00:00Z" || !openAPIIntEqual(example["revision"], 1) || !reflect.DeepEqual(example["reasonCodes"], []any{}) {
		t.Fatalf("recheck decision: %#v", example)
	}
	props := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenuePolicyDecision"])["properties"])
	status := asObj(props["status"])
	if status["example"] != "passed" || status["description"] != "Decision status." {
		t.Fatalf("shared decision status changed: %#v", status)
	}
	reasons := asObj(props["reasonCodes"])
	if asObj(reasons["items"])["example"] != "suppression.opted_out" {
		t.Fatalf("shared reason code changed: %#v", reasons["items"])
	}

	assertRecommendationReject(t, spec)
}

func TestRecommendationRejectStoresRejected(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertRecommendationReject(t, spec)
}

func assertRecommendationReject(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/relationship-recommendations/{actionId}/reject"])["post"])
	if op["summary"] != "Reject" || op["operationId"] != "rejectRelationshipRecommendation" {
		t.Fatalf("recommendation reject: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "Not the right next move") || !strings.Contains(description, "stays open") {
		t.Fatalf("recommendation reject description: %q", description)
	}
	request := asObj(asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])["example"])
	if request["reason"] != "Not the right next move" {
		t.Fatalf("recommendation reject request: %#v", request)
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["approvalStatus"] != "rejected" || example["queueStatus"] != "open" || example["reason"] != "They asked for a follow-up in July." || !openAPIIntEqual(example["revision"], 1) {
		t.Fatalf("rejected recommendation: %#v", example)
	}
	if _, ok := example["approvedAt"]; ok {
		t.Fatalf("reject does not approve: %#v", example["approvedAt"])
	}
	props := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])
	if asObj(props["approvalStatus"])["example"] != "pending" {
		t.Fatalf("shared approval example changed: %#v", props["approvalStatus"])
	}

	assertSavedNote(t, spec)
}

func TestSavedNoteStoresTheEditorNote(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSavedNote(t, spec)
}

func assertSavedNote(t *testing.T, spec obj) {
	t.Helper()
	post := asObj(asObj(asObj(spec["paths"])["/v1/relationship-observations/batch"])["post"])
	if post["summary"] != "Save a note" {
		t.Fatalf("summary: %v", post["summary"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])["example"]
	response := asObj(asObj(asObj(asObj(post["responses"])["201"])["content"])["application/json"])["example"]
	if got, want := mustJSON(request), mustJSON(documentedSavedNoteRequest()); got != want {
		t.Fatalf("request example:\n%s\nwant:\n%s", got, want)
	}
	if got, want := mustJSON(response), mustJSON(documentedSavedNoteResponse()); got != want {
		t.Fatalf("response example:\n%s\nwant:\n%s", got, want)
	}
	items := asObj(asObj(asObj(asObj(asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])["schema"])["properties"])["observations"])["items"])
	props := asObj(items["properties"])
	if asObj(props["eventType"])["example"] != "commitment_created" || asObj(props["source"])["example"] != "gmail" {
		t.Fatalf("shared observation examples changed: event %#v source %#v", asObj(props["eventType"])["example"], asObj(props["source"])["example"])
	}
}

func mustJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return err.Error()
	}
	return string(raw)
}

func TestRecommendationApproveStoresApprovedRevision(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertApprovedRecommendation(t, spec)
}

func assertApprovedRecommendation(t *testing.T, spec obj) {
	t.Helper()
	post := asObj(asObj(asObj(spec["paths"])["/v1/relationship-recommendations/{actionId}/approve"])["post"])
	if post["summary"] != "Approve" {
		t.Fatalf("summary: %v", post["summary"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])["example"]
	if got, want := mustJSON(request), mustJSON(obj{"acceptRisk": false}); got != want {
		t.Fatalf("request example:\n%s\nwant:\n%s", got, want)
	}
	response := asObj(asObj(asObj(asObj(post["responses"])["200"])["content"])["application/json"])["example"]
	if got, want := mustJSON(response), mustJSON(documentedApprovedRecommendation()); got != want {
		t.Fatalf("response example:\n%s\nwant:\n%s", got, want)
	}
	action := asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])
	if asObj(asObj(action["properties"])["approvalStatus"])["example"] != "pending" {
		t.Fatalf("shared approval status changed: %#v", asObj(action["properties"])["approvalStatus"])
	}

	assertSavedTemplate(t, spec)
}

func TestSavedTemplateStoresTheNoteTemplate(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSavedTemplate(t, spec)
}

func assertSavedTemplate(t *testing.T, spec obj) {
	t.Helper()
	post := asObj(asObj(asObj(spec["paths"])["/v1/console/resources"])["post"])
	if post["summary"] != "Save template" {
		t.Fatalf("summary: %v", post["summary"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])["example"]
	if got, want := mustJSON(request), mustJSON(documentedSavedTemplateRequest()); got != want {
		t.Fatalf("request example:\n%s\nwant:\n%s", got, want)
	}
	response := asObj(asObj(asObj(asObj(post["responses"])["201"])["content"])["application/json"])["example"]
	if got, want := mustJSON(response), mustJSON(documentedSavedTemplate()); got != want {
		t.Fatalf("response example:\n%s\nwant:\n%s", got, want)
	}
	kind := asObj(asObj(asObj(spec["components"])["schemas"])["ConsoleResourceKind"])
	if kind["example"] != "graph_saved_view" {
		t.Fatalf("shared resource kind changed: %#v", kind["example"])
	}

	assertEditedTemplate(t, spec)
}

func TestEditedTemplateStoresTheNoteTemplate(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertEditedTemplate(t, spec)
}

func assertEditedTemplate(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	patch := asObj(asObj(paths["/v1/console/resources/{resourceId}"])["patch"])
	if patch["summary"] != "Save template" {
		t.Fatalf("summary: %#v", patch["summary"])
	}
	const description = "Save template posts the name and payload of an existing note template. The name and the title are Weekly account review, and the body is Agenda. The stored template keeps that title and body, with sort order 0, and the update time is later."
	if patch["description"] != description {
		t.Fatalf("description: %#v", patch["description"])
	}
	request := asObj(asObj(asObj(patch["requestBody"])["content"])["application/json"])
	if mustJSON(request["example"]) != mustJSON(documentedEditedTemplateRequest()) {
		t.Fatalf("request example: %s", mustJSON(request["example"]))
	}
	response := asObj(asObj(patch["responses"])["200"])
	if response["description"] != "Stored template." {
		t.Fatalf("response description: %#v", response["description"])
	}
	body := asObj(asObj(response["content"])["application/json"])
	if mustJSON(body["example"]) != mustJSON(documentedEditedTemplate()) {
		t.Fatalf("response example: %s", mustJSON(body["example"]))
	}
	params, ok := patch["parameters"].([]any)
	if !ok || len(params) != 1 || asObj(asObj(params[0])["schema"])["example"] != documentedEditedTemplateID {
		t.Fatalf("path id: %#v", patch["parameters"])
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	if asObj(schemas["ConsoleResourceKind"])["example"] != "graph_saved_view" {
		t.Fatalf("kind example changed: %#v", asObj(schemas["ConsoleResourceKind"])["example"])
	}
	name := asObj(asObj(asObj(schemas["ConsoleResource"])["properties"])["name"])
	if name["example"] != "Renewal risk" {
		t.Fatalf("name example changed: %#v", name["example"])
	}
	postBody := asObj(asObj(asObj(asObj(asObj(paths["/v1/console/resources"])["post"])["requestBody"])["content"])["application/json"])
	if postBody["example"] != nil {
		t.Fatalf("create example changed: %s", mustJSON(postBody["example"]))
	}
	getBody := asObj(asObj(asObj(asObj(asObj(asObj(paths["/v1/console/resources/{resourceId}"])["get"])["responses"])["200"])["content"])["application/json"])
	if getBody["example"] != nil {
		t.Fatalf("get example changed: %s", mustJSON(getBody["example"]))
	}

	assertSavedProfile(t, spec)
}

func TestSavedProfileStoresTheDisplayName(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSavedProfile(t, spec)
}

func assertSavedProfile(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	preferences := asObj(paths["/v1/console/preferences"])
	patch := asObj(preferences["patch"])
	if patch["summary"] != "Save profile" {
		t.Fatalf("summary: %#v", patch["summary"])
	}
	const description = "Save profile posts the display name. The name is Ada Lovelace. The stored preferences keep that name, an empty default agent, usage sharing off, notifications off, model reasoning hidden, and the system theme."
	if patch["description"] != description {
		t.Fatalf("description: %#v", patch["description"])
	}
	request := asObj(asObj(asObj(patch["requestBody"])["content"])["application/json"])
	if mustJSON(request["example"]) != mustJSON(documentedSavedProfileRequest()) {
		t.Fatalf("request example: %s", mustJSON(request["example"]))
	}
	response := asObj(asObj(patch["responses"])["200"])
	if response["description"] != "Stored profile." {
		t.Fatalf("response description: %#v", response["description"])
	}
	body := asObj(asObj(response["content"])["application/json"])
	if mustJSON(body["example"]) != mustJSON(documentedSavedProfile()) {
		t.Fatalf("response example: %s", mustJSON(body["example"]))
	}
	getBody := asObj(asObj(asObj(asObj(asObj(preferences["get"])["responses"])["200"])["content"])["application/json"])
	if getBody["example"] != nil {
		t.Fatalf("get example changed: %s", mustJSON(getBody["example"]))
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	props := asObj(asObj(schemas["ConsolePreferences"])["properties"])
	if asObj(props["displayName"])["example"] != "Ada Lovelace" {
		t.Fatalf("display name example changed: %#v", props["displayName"])
	}
	if asObj(props["defaultAgentSlug"])["example"] != "assistant" {
		t.Fatalf("agent example changed: %#v", props["defaultAgentSlug"])
	}
	if asObj(props["shareUsageData"])["example"] != true {
		t.Fatalf("usage example changed: %#v", props["shareUsageData"])
	}
	if asObj(props["notificationLevel"])["example"] != "attention" {
		t.Fatalf("notification example changed: %#v", props["notificationLevel"])
	}

	assertCreatedWorkflow(t, spec)
}

func TestCreatedWorkflowStoresTheDraft(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertCreatedWorkflow(t, spec)
}

func assertCreatedWorkflow(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	post := asObj(asObj(paths["/v1/background-tasks"])["post"])
	if post["summary"] != "Create workflow" {
		t.Fatalf("summary: %#v", post["summary"])
	}
	const description = "Create workflow posts a draft named Follow up when a promise slips. It runs in the cloud, starts when a communication event matches, and stays inactive. The stored workflow keeps that name, the address follow-up-when-a-promise-slips, those instructions and triggers, cloud execution, revision 1, and schedule sync paused."
	if post["description"] != description {
		t.Fatalf("description: %#v", post["description"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	if mustJSON(request["example"]) != mustJSON(documentedCreatedWorkflowRequest()) {
		t.Fatalf("request example: %s", mustJSON(request["example"]))
	}
	response := asObj(asObj(post["responses"])["201"])
	if response["description"] != "Stored workflow." {
		t.Fatalf("response description: %#v", response["description"])
	}
	body := asObj(asObj(response["content"])["application/json"])
	if mustJSON(body["example"]) != mustJSON(documentedCreatedWorkflow()) {
		t.Fatalf("response example: %s", mustJSON(body["example"]))
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	props := asObj(asObj(schemas["BackgroundTask"])["properties"])
	if asObj(props["name"])["example"] != "Daily Account Summary" || asObj(props["executionTarget"])["example"] != "desktop" || asObj(props["active"])["example"] != true {
		t.Fatalf("shared task examples changed: name %#v target %#v active %#v", props["name"], props["executionTarget"], props["active"])
	}
	listExample := asObj(asObj(asObj(asObj(asObj(asObj(paths["/v1/background-tasks"])["get"])["responses"])["200"])["content"])["application/json"])["example"]
	tasks, ok := asObj(listExample)["tasks"].([]any)
	if !ok || len(tasks) != 1 || asObj(tasks[0])["slug"] != "daily-summary" || asObj(tasks[0])["executionTarget"] != "desktop" {
		t.Fatalf("list example changed: %s", mustJSON(listExample))
	}

	assertUsedInbox(t, spec)
}

func TestUsedInboxStoresTheTemplate(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertUsedInbox(t, spec)
}

func assertUsedInbox(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	post := asObj(asObj(paths["/v1/background-task-templates/{templateSlug}/instantiate"])["post"])
	if post["summary"] != "Use Inbox Digest" {
		t.Fatalf("summary: %#v", post["summary"])
	}
	const description = "Use Inbox Digest posts an empty body. The stored workflow is named Inbox Digest, stays active, and runs in the cloud. It starts at 8:00 on weekdays in America/New_York, keeps the template instructions, model, and provider, and records revision 1 with schedule sync paused."
	if post["description"] != description {
		t.Fatalf("description: %#v", post["description"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	if mustJSON(request["example"]) != mustJSON(documentedUsedInboxRequest()) {
		t.Fatalf("request example: %s", mustJSON(request["example"]))
	}
	response := asObj(asObj(post["responses"])["201"])
	if response["description"] != "Stored workflow." {
		t.Fatalf("response description: %#v", response["description"])
	}
	body := asObj(asObj(response["content"])["application/json"])
	if mustJSON(body["example"]) != mustJSON(documentedUsedInbox()) {
		t.Fatalf("response example: %s", mustJSON(body["example"]))
	}
	params, ok := post["parameters"].([]any)
	if !ok || len(params) != 1 || asObj(asObj(params[0])["schema"])["example"] != "inbox-digest" {
		t.Fatalf("path template: %#v", post["parameters"])
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	template := asObj(asObj(schemas["BackgroundTaskTemplate"])["properties"])
	if asObj(template["instructions"])["example"] != "Review recent important Gmail messages and produce a markdown digest." {
		t.Fatalf("template instructions example changed: %#v", template["instructions"])
	}
	if asObj(template["name"])["example"] != "Inbox Digest" || asObj(template["firstParty"])["example"] != false {
		t.Fatalf("template identity changed: %#v", template)
	}
	create := asObj(asObj(asObj(asObj(asObj(paths["/v1/background-tasks"])["post"])["requestBody"])["content"])["application/json"])
	if asObj(create["example"])["slug"] != "daily-summary" {
		t.Fatalf("create workflow example changed: %s", mustJSON(create["example"]))
	}

	assertRunNow(t, spec)
}

func TestRunNowStoresTheEditorNote(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertRunNow(t, spec)
}

func assertRunNow(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	post := asObj(asObj(paths["/v1/background-tasks/{slug}/trigger"])["post"])
	if post["summary"] != "Run now" {
		t.Fatalf("summary: %#v", post["summary"])
	}
	const description = "Run now posts a manual start from the visual workflow editor. The stored cloud run stays queued, keeps the note Started from the visual workflow editor, uses cloud execution, and records revision 2."
	if post["description"] != description {
		t.Fatalf("description: %#v", post["description"])
	}
	request := asObj(asObj(asObj(post["requestBody"])["content"])["application/json"])
	if mustJSON(request["example"]) != mustJSON(documentedRunNowRequest()) {
		t.Fatalf("request example: %s", mustJSON(request["example"]))
	}
	response := asObj(asObj(post["responses"])["202"])
	if response["description"] != "Stored run." {
		t.Fatalf("response description: %#v", response["description"])
	}
	body := asObj(asObj(response["content"])["application/json"])
	if mustJSON(body["example"]) != mustJSON(documentedRunNow()) {
		t.Fatalf("response example: %s", mustJSON(body["example"]))
	}
	params, ok := post["parameters"].([]any)
	if !ok || len(params) != 1 || asObj(asObj(params[0])["schema"])["example"] != "follow-up-when-a-promise-slips" {
		t.Fatalf("path workflow: %#v", post["parameters"])
	}
	schemas := asObj(asObj(spec["components"])["schemas"])
	triggerProps := asObj(asObj(schemas["BackgroundTaskTriggerRequest"])["properties"])
	if asObj(triggerProps["context"])["example"] != "Run this now and focus on high-risk accounts." {
		t.Fatalf("trigger context example changed: %#v", triggerProps["context"])
	}
	runProps := asObj(asObj(schemas["BackgroundTaskRun"])["properties"])
	if asObj(runProps["requestedContext"])["example"] != "Run this now and focus on high-risk accounts." || asObj(runProps["slug"])["example"] != "daily-summary" {
		t.Fatalf("shared run example changed: %#v", runProps)
	}
	create := asObj(asObj(asObj(asObj(asObj(paths["/v1/background-tasks"])["post"])["requestBody"])["content"])["application/json"])
	if asObj(create["example"])["slug"] != "daily-summary" {
		t.Fatalf("create workflow example changed: %s", mustJSON(create["example"]))
	}
}

func TestCommitmentEventNamesTheObservation(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertEventObservation(t, asObj(asObj(spec["components"])["schemas"]))
}

func TestCommitmentEventNamesTheParties(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertEventParties(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertEventParties(t *testing.T, schemas obj) {
	t.Helper()
	event := asObj(schemas["CommitmentEvent"])
	if event == nil {
		return
	}
	props := asObj(event["properties"])
	owner := asObj(props["ownerParticipantRef"])
	if owner["example"] != "alex@example.com" || owner["description"] != "Promise owner." {
		t.Fatalf("event owner: %#v", owner)
	}
	counterparty := asObj(props["counterpartyParticipantRef"])
	if counterparty["example"] != "jordan@example.com" || counterparty["description"] != "Promise counterparty." {
		t.Fatalf("event counterparty: %#v", counterparty)
	}
	beneficiary := asObj(props["beneficiaryParticipantRef"])
	if beneficiary["example"] != "customer:acme" || beneficiary["description"] != "Promise beneficiary." {
		t.Fatalf("event beneficiary: %#v", beneficiary)
	}
	commitment := asObj(asObj(schemas["RelationshipCommitment"])["properties"])
	if asObj(commitment["ownerParticipantRef"])["example"] != "alex@example.com" {
		t.Fatalf("commitment owner changed: %#v", commitment["ownerParticipantRef"])
	}
	if asObj(props["actorRef"])["example"] == "alex@example.com" {
		t.Fatalf("actor ref was replaced with the promise owner: %#v", props["actorRef"])
	}
}

func assertEventObservation(t *testing.T, schemas obj) {
	t.Helper()
	event := asObj(schemas["CommitmentEvent"])
	if event == nil {
		return
	}
	const observationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const evidenceRef = "relationship-observation:" + observationID
	props := asObj(event["properties"])
	source := asObj(props["sourceObservationId"])
	if source["example"] != observationID || source["description"] != "Source observation id." {
		t.Fatalf("source observation: %#v", source)
	}
	refs := asObj(props["evidenceRefs"])
	if !reflect.DeepEqual(refs["example"], []any{evidenceRef}) || refs["description"] != "Exact evidence references." {
		t.Fatalf("event evidence refs: %#v", refs)
	}
	if asObj(refs["items"])["example"] != evidenceRef {
		t.Fatalf("event evidence item: %#v", refs["items"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["observationId"])["example"] != observationID {
		t.Fatalf("mission control observation id changed: %#v", evidence["observationId"])
	}
}

func TestBillingTrialStatus(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertBillingTrialStatus(t, asObj(spec["paths"]), asObj(asObj(spec["components"])["schemas"]))
}

func assertBillingTrialStatus(t *testing.T, paths obj, schemas obj) {
	t.Helper()
	status := asObj(asObj(asObj(schemas["BillingState"])["properties"])["status"])
	if status["example"] != billingTrialStatusExample || status["description"] != billingTrialStatusDescription {
		t.Fatalf("billing trial status: %#v", status)
	}
	enum, ok := status["enum"].([]any)
	if !ok || len(enum) != 4 || enum[0] != "active" || enum[1] != billingTrialStatusExample || enum[2] != "past_due" || enum[3] != "canceled" {
		t.Fatalf("billing status enum: %#v", status["enum"])
	}
	if subscription := asObj(schemas["Subscription"]); subscription != nil {
		kept := asObj(asObj(subscription["properties"])["status"])
		if kept["example"] != "active" {
			t.Fatalf("subscription status changed: %#v", kept)
		}
	}
	run := asObj(asObj(asObj(schemas["BackgroundTaskRun"])["properties"])["status"])
	if run["example"] != "succeeded" {
		t.Fatalf("run status changed: %#v", run)
	}
	me := asObj(asObj(asObj(asObj(asObj(asObj(paths["/v1/me"])["get"])["responses"])["200"])["content"])["application/json"])
	billing := asObj(asObj(me["example"])["billing"])
	if billing["status"] != billingTrialStatusExample || billing["trialExpiresAt"] != billingTrialExpiresAtExample {
		t.Fatalf("current user billing sample: %#v", billing)
	}
}

func assertNonUUIDIdentifiers(t *testing.T, schemas obj) {
	t.Helper()
	for _, item := range []struct {
		schema, description, example string
	}{
		{"LLMModel", "Model id accepted by the model gateway.", "openai/gpt-4.1-mini"},
		{"IntegrationTemplateBlock", "Stable block id within the connector.", "invoice-context"},
		{"HubSpotSearchObject", "HubSpot record id.", "101"},
		{"ConsentClientIdentity", "Hydra client id.", "rowboat-desktop"},
		{"ConsentConnectorIdentity", "Connector slug.", "canvas"},
		{"ConversationClaim", "Stable claim id.", "claim:ab12"},
		{"ConversationReviewItem", "Stable review item id.", "review:ab12"},
		{"RelationshipGraphNode", "Stable node id.", "relationship:9c8dfa9b-a7b2-46ea-982c-622a914c00e5"},
		{"RelationshipGraphEdge", "Stable edge id.", "edge:ab12cd34"},
	} {
		id := asObj(asObj(asObj(schemas[item.schema])["properties"])["id"])
		if id["description"] != item.description || id["example"] != item.example {
			t.Fatalf("%s.id sampled a UUID: %#v", item.schema, id)
		}
	}
	taskID := asObj(asObj(asObj(schemas["BackgroundTask"])["properties"])["id"])
	if taskID["example"] != "123e4567-e89b-12d3-a456-426614174000" || taskID["format"] != "uuid" {
		t.Fatalf("BackgroundTask.id lost its UUID: %#v", taskID)
	}
}

func assertTokenAudiences(t *testing.T, schemas obj) {
	t.Helper()
	want := map[string]string{
		"ConnectionConnectedResponse":     "Audience accepted by the product resource server.",
		"MCPTokenResponse":                "Exact product resource-server audience.",
		"MCPTokenRequest":                 "Must exactly match the connector and stored connection audience.",
		"ConsentConnectorIdentity":        "Audience bound to any resulting resource token.",
		"InternalConnectionStatusRequest": "Exact product resource audience.",
		"ConsentAuditRequest":             "Bound connector audience.",
	}
	for name, description := range want {
		audience := asObj(asObj(asObj(schemas[name])["properties"])["audience"])
		if audience["example"] != "mcp:canvas" || audience["description"] != description {
			t.Fatalf("%s.audience sampled the catalog audience: %#v", name, audience)
		}
	}
	request := asObj(asObj(asObj(schemas["MCPTokenRequest"])["properties"])["audience"])
	if request["nullable"] != true {
		t.Fatalf("MCPTokenRequest.audience must stay optional: %#v", request)
	}
	connector := asObj(asObj(asObj(schemas["Connector"])["properties"])["audience"])
	if connector["example"] != "canvas-api" {
		t.Fatalf("Connector.audience example changed: %#v", connector)
	}
}

func unixExpiryExample(value any) bool {
	switch n := value.(type) {
	case int64:
		return n == 1790784000
	case int:
		return n == 1790784000
	case float64:
		return n == 1790784000
	default:
		return false
	}
}

func assertUnixTokenExpiry(t *testing.T, schemas obj) {
	t.Helper()
	want := map[string]string{
		"WorkOSTokenBundle": "Unix timestamp in seconds when the access token expires.",
		"OAuthTokenBundle":  "Unix timestamp in seconds when the access token expires.",
		"MCPTokenResponse":  "Unix expiry timestamp in seconds.",
	}
	for name, description := range want {
		field := asObj(asObj(asObj(schemas[name])["properties"])["expires_at"])
		if field["type"] != "integer" || field["format"] != "int64" || field["description"] != description || !unixExpiryExample(field["example"]) {
			t.Fatalf("%s.expires_at sampled a timestamp string: %#v", name, field)
		}
	}
	pending := asObj(asObj(asObj(schemas["ConnectionStartResponse"])["properties"])["expires_at"])
	if _, ok := pending["example"].(string); !ok {
		t.Fatalf("ConnectionStartResponse.expires_at should stay a timestamp: %#v", pending)
	}
}

func scopeExamples(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok {
			return nil
		}
		out = append(out, text)
	}
	return out
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range want {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func assertGrantedScopes(t *testing.T, schemas obj) {
	t.Helper()
	want := map[string]struct {
		description string
		example     []string
	}{
		"GoogleConnectionAccount":     {"Granted Google OAuth scopes.", []string{"https://www.googleapis.com/auth/gmail.readonly"}},
		"OAuthConnection":             {"Scopes granted on this connection.", []string{"https://www.googleapis.com/auth/gmail.readonly"}},
		"OAuthConnectionHistory":      {"Scopes recorded for this connection.", []string{"https://www.googleapis.com/auth/gmail.readonly"}},
		"SlackWorkspace":              {"Granted bot scopes.", []string{"channels:history", "chat:write"}},
		"VoiceAPIKey":                 {"Granted scopes.", []string{"notes:read"}},
		"VoiceAPIKeyCreateRequest":    {"Granted scopes.", []string{"notes:read"}},
		"ConnectionConnectedResponse": {"Scopes granted by the completed consent flow.", []string{"canvas:invoices.read"}},
		"MCPTokenResponse":            {"Validated minted scope subset.", []string{"canvas:invoices.read"}},
		"ConsentAuditRequest":         {"Shown or granted scope set.", []string{"canvas:invoices.read"}},
		"MCPConnection":               {"Scopes granted for this connector.", []string{"canvas:invoices.read"}},
		"MCPConnectionHistory":        {"Scopes recorded for this connector.", []string{"canvas:invoices.read"}},
	}
	for name, item := range want {
		scopes := asObj(asObj(asObj(schemas[name])["properties"])["scopes"])
		if scopes["description"] != item.description || !sameStrings(scopeExamples(scopes["example"]), item.example) {
			t.Fatalf("%s.scopes sampled invoice scopes: %#v", name, scopes)
		}
	}
	pre := asObj(asObj(asObj(schemas["PreConsentResponse"])["properties"])["scopes"])
	if pre["description"] != "Exact catalog scope definitions." {
		t.Fatalf("PreConsentResponse.scopes description: %#v", pre)
	}
	examples, _ := pre["example"].([]any)
	if len(examples) != 1 || asObj(examples[0])["name"] != "canvas:invoices.read" {
		t.Fatalf("PreConsentResponse.scopes sampled strings: %#v", pre["example"])
	}
}

func assertConsentContext(t *testing.T, schemas obj) {
	t.Helper()
	requestID := asObj(asObj(asObj(schemas["PreConsentResponse"])["properties"])["request_id"])
	if requestID["example"] != "ctx_01HABCDEF" || requestID["description"] != "Deterministic context request id bound to the challenge." {
		t.Fatalf("PreConsentResponse.request_id sampled a metered request: %#v", requestID)
	}
	connector := asObj(asObj(asObj(schemas["PreConsentResponse"])["properties"])["connector"])
	if connector["$ref"] != "#/components/schemas/ConsentConnectorIdentity" || connector["example"] != nil {
		t.Fatalf("PreConsentResponse.connector sampled a string: %#v", connector)
	}
	ledger := asObj(asObj(asObj(schemas["CreditLedger"])["properties"])["request_id"])
	if ledger["example"] != "9e2fb15a-936d-4f39-9372-73cfe0476ca8" {
		t.Fatalf("CreditLedger.request_id lost its metered example: %#v", ledger)
	}
}

func assertVoiceKeyTimes(t *testing.T, schemas obj) {
	t.Helper()
	voice := asObj(asObj(schemas["VoiceAPIKey"])["properties"])
	lastUsed := asObj(voice["last_used_at"])
	if lastUsed["description"] != "Last-use time." || lastUsed["example"] != "2026-08-21T23:00:00Z" || lastUsed["nullable"] != true {
		t.Fatalf("VoiceAPIKey.last_used_at sampled a connector credential: %#v", lastUsed)
	}
	expires := asObj(voice["expires_at"])
	if expires["description"] != "Expiry time." || expires["example"] != "2026-09-20T23:00:00Z" || expires["nullable"] != true {
		t.Fatalf("VoiceAPIKey.expires_at sampled a one-time ticket: %#v", expires)
	}
	if mcp := asObj(schemas["MCPConnection"]); mcp != nil {
		connectorUse := asObj(asObj(mcp["properties"])["last_used_at"])
		if connectorUse["description"] != "Timestamp when the connector credential was last minted or used." || connectorUse["example"] != "2026-06-04T20:45:00Z" {
			t.Fatalf("MCPConnection.last_used_at changed: %#v", connectorUse)
		}
	}
}

func assertSlackMessageTime(t *testing.T, schemas obj) {
	t.Helper()
	message := asObj(asObj(schemas["SlackThreadMessage"])["properties"])
	ts := asObj(message["ts"])
	if ts["description"] != "Slack message timestamp." || ts["example"] != "1700000000.000100" || ts["nullable"] != true {
		t.Fatalf("SlackThreadMessage.ts sampled a ledger time: %#v", ts)
	}
	user := asObj(message["user"])
	if user["description"] != "Slack user id when present." || user["example"] != "U01234567" || user["nullable"] != true {
		t.Fatalf("SlackThreadMessage.user sampled a row owner: %#v", user)
	}
	if ledger := asObj(schemas["CreditLedger"]); ledger != nil {
		if properties := asObj(ledger["properties"]); properties != nil {
			if ledgerTS := asObj(properties["ts"]); ledgerTS != nil {
				if ledgerTS["example"] != "2026-06-04T20:38:00Z" || ledgerTS["description"] != "Usage or ledger event timestamp." {
					t.Fatalf("CreditLedger.ts changed: %#v", ledgerTS)
				}
			}
		}
	}
}

func assertSessionCost(t *testing.T, schemas obj) {
	t.Helper()
	sessionCost := asObj(asObj(asObj(schemas["AgentSession"])["properties"])["cost_units"])
	if sessionCost["description"] != "Credits used across this session." || !sameNumber(sessionCost["example"], 8) {
		t.Fatalf("AgentSession.cost_units sampled a single request: %#v", sessionCost)
	}
	turnCost := asObj(asObj(asObj(schemas["AgentTurn"])["properties"])["cost_units"])
	if turnCost["description"] != "Credits used during this turn." || !sameNumber(turnCost["example"], 8) {
		t.Fatalf("AgentTurn.cost_units sampled a single request: %#v", turnCost)
	}
	for _, name := range []string{"LLMUsage", "LLMUsageHistory"} {
		record := asObj(schemas[name])
		if record == nil {
			continue
		}
		properties := asObj(record["properties"])
		if properties == nil {
			continue
		}
		usageCost := asObj(properties["cost_units"])
		if usageCost == nil {
			continue
		}
		if usageCost["description"] != "Settled credit cost for the request." || !sameNumber(usageCost["example"], 8) {
			t.Fatalf("%s.cost_units changed: %#v", name, usageCost)
		}
	}
}

func sameNumber(value any, want int) bool {
	switch n := value.(type) {
	case int:
		return n == want
	case int64:
		return n == int64(want)
	case float64:
		return n == float64(want)
	default:
		return false
	}
}

func assertPreviousRunID(t *testing.T, schemas obj) {
	t.Helper()
	run := asObj(asObj(schemas["BackgroundTaskRun"])["properties"])
	previous := asObj(run["previousRunId"])
	current := asObj(run["runId"])
	if previous["example"] != "run-20260604-205000" || current["example"] != "run-20260604-210000" {
		t.Fatalf("previous run id sampled this run: previous=%#v run=%#v", previous["example"], current["example"])
	}
	for _, name := range []string{"BackgroundTaskRunCreateRequest", "BackgroundTaskRunPatchRequest"} {
		record := asObj(schemas[name])
		if record == nil {
			continue
		}
		properties := asObj(record["properties"])
		if properties == nil {
			continue
		}
		field := asObj(properties["previousRunId"])
		if field != nil && field["example"] != "run-20260604-205000" {
			t.Fatalf("%s.previousRunId changed: %#v", name, field["example"])
		}
	}
}

func assertDependencyRequest(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	operation := asObj(asObj(paths["/v1/relationships/{relationshipId}/commitment-dependencies"])["post"])
	content := asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])
	properties := asObj(asObj(content["schema"])["properties"])
	from := asObj(properties["fromCommitmentId"])["example"]
	to := asObj(properties["toCommitmentId"])["example"]
	if from != "8b8dfa9b-a7b2-46ea-982c-622a914c00e5" || to != "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51" || from == to {
		t.Fatalf("dependency request sampled one commitment: from=%#v to=%#v", from, to)
	}
	example := asObj(content["example"])
	if example != nil && example["toCommitmentId"] != "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51" {
		t.Fatalf("dependency request body changed: %#v", example["toCommitmentId"])
	}
}

func assertDependencyEnds(t *testing.T, schemas obj) {
	t.Helper()
	properties := asObj(asObj(schemas["CommitmentDependency"])["properties"])
	dependency := asObj(properties["dependencyId"])["example"]
	relationship := asObj(properties["relationshipId"])["example"]
	from := asObj(properties["fromCommitmentId"])["example"]
	to := asObj(properties["toCommitmentId"])["example"]
	if from != "8b8dfa9b-a7b2-46ea-982c-622a914c00e5" || to != "26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51" || from == to {
		t.Fatalf("dependency ends sampled one commitment: from=%#v to=%#v", from, to)
	}
	if relationship != "9c8dfa9b-a7b2-46ea-982c-622a914c00e5" || relationship == from || relationship == to {
		t.Fatalf("dependency relationship sampled a commitment: %#v", relationship)
	}
	if dependency == from || dependency == to || dependency == relationship || dependency != "3b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("dependency id sampled an endpoint: %#v", dependency)
	}
}

func assertVoiceKeyPrefix(t *testing.T, schemas obj) {
	t.Helper()
	properties := asObj(asObj(schemas["VoiceAPIKey"])["properties"])
	secret := asObj(properties["key"])
	prefix := asObj(properties["key_prefix"])
	secretExample, _ := secret["example"].(string)
	prefixExample, _ := prefix["example"].(string)
	if prefixExample != "opv_live_example" || len(prefixExample) != 16 || secretExample == prefixExample || len(secretExample) < 17 || secretExample[:16] != prefixExample {
		t.Fatalf("voice key prefix sampled the whole secret: prefix=%#v secret=%#v", prefix["example"], secret["example"])
	}
	if prefix["description"] != "First 16 characters of the secret. Safe to display." {
		t.Fatalf("voice key prefix description: %#v", prefix["description"])
	}
}

func assertVoiceKeyCreateExample(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	operation := asObj(asObj(paths["/api/v1/keys/create"])["post"])
	response := asObj(asObj(operation["responses"])["201"])
	body := asObj(asObj(asObj(response["content"])["application/json"])["example"])
	data := asObj(body["data"])
	if data["key"] != "opv_live_exampleAbCdEfGhIjKlMnOpQrStUvWxYz0123456789" {
		t.Fatalf("created voice key sampled the display prefix: %#v", data["key"])
	}
}

func assertAttentionOwner(t *testing.T, schemas obj) {
	t.Helper()
	properties := asObj(asObj(schemas["RelationshipAttentionItem"])["properties"])
	owner := asObj(properties["ownerId"])
	relationship := asObj(properties["relationshipId"])["example"]
	if owner["description"] != "Assigned user id." || owner["example"] != "a8dfa9b6-a7b2-46ea-982c-622a914c00e5" || owner["example"] == relationship {
		t.Fatalf("attention owner sampled the relationship: owner=%#v relationship=%#v", owner["example"], relationship)
	}
	if relationship != "9c8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("attention relationship changed: %#v", relationship)
	}
	for _, name := range []string{"acknowledgedBy", "acknowledgedAt", "dismissedBy", "dismissedAt"} {
		field := asObj(properties[name])
		if _, ok := field["example"]; ok {
			t.Fatalf("%s sampled a decision on an open attention item: %#v", name, field["example"])
		}
	}

	assertActorUsers(t, schemas)
}

func assertActorUsers(t *testing.T, schemas obj) {
	t.Helper()
	const userID = "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"
	const relationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	checks := []struct {
		schema, field, description string
	}{
		{"RelationshipIdentityDecision", "actorId", "User who made this decision."},
		{"RelationshipIdentityLineage", "actorId", "User who recorded this change."},
		{"RelationshipIdentityCandidate", "decisionActorId", "User who resolved this review."},
		{"RelationshipSourceStatus", "consentingActorId", "User who connected this source."},
		{"MissionControlDimensionEvidence", "reviewerId", "User who reviewed this value."},
	}
	for _, check := range checks {
		schema := asObj(schemas[check.schema])
		if schema == nil {
			t.Fatalf("missing schema %s", check.schema)
		}
		field := asObj(asObj(schema["properties"])[check.field])
		if field == nil {
			t.Fatalf("%s.%s missing", check.schema, check.field)
		}
		if field["example"] != userID || field["description"] != check.description {
			t.Fatalf("%s.%s sampled the relationship instead of the user: %#v", check.schema, check.field, field)
		}
	}
	relationship := asObj(asObj(asObj(schemas["RelationshipAttentionItem"])["properties"])["relationshipId"])
	if relationship["example"] != relationshipID {
		t.Fatalf("relationship id sample changed: %#v", relationship)
	}

	assertHistoryRowIDs(t, schemas)
}

func TestHistoryRowIDIsNotTheSourceRow(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{
		"User": obj{"type": "object", "properties": obj{
			"id": obj{"type": "string", "format": "uuid"},
		}},
		"UserHistory": obj{"type": "object", "properties": obj{
			"id":  obj{"type": "string", "format": "uuid"},
			"ref": obj{"type": "string", "format": "uuid"},
		}},
	}}}
	Enrich(spec)
	assertHistoryRowIDs(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertHistoryRowIDs(t *testing.T, schemas obj) {
	t.Helper()
	const historyID = "223e4567-e89b-12d3-a456-426614174000"
	const sourceID = "123e4567-e89b-12d3-a456-426614174000"
	for _, name := range []string{
		"AgentDefinitionHistory",
		"LLMUsageHistory",
		"MCPConnectionHistory",
		"OAuthConnectionHistory",
		"SubscriptionHistory",
		"UserHistory",
	} {
		schema := asObj(schemas[name])
		if schema == nil {
			continue
		}
		props := asObj(schema["properties"])
		id := asObj(props["id"])
		ref := asObj(props["ref"])
		if id["example"] != historyID || id["description"] != "Id of this history row." {
			t.Fatalf("%s.id still samples the source row: %#v", name, id)
		}
		if ref["example"] != sourceID || ref["description"] != "UUID of the source row represented by a history row." {
			t.Fatalf("%s.ref should stay the source row: %#v", name, ref)
		}
	}
	user := asObj(schemas["User"])
	if user != nil {
		if id := asObj(asObj(user["properties"])["id"]); id["example"] != sourceID {
			t.Fatalf("source user id changed: %#v", id)
		}
	}

	assertCommitmentEventActor(t, schemas)
}

func TestCommitmentEventActorIsNotTheOwner(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertCommitmentEventActor(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertCommitmentEventActor(t *testing.T, schemas obj) {
	t.Helper()
	const userID = "a8dfa9b6-a7b2-46ea-982c-622a914c00e5"
	event := asObj(schemas["CommitmentEvent"])
	if event == nil {
		return
	}
	props := asObj(event["properties"])
	actor := asObj(props["actorRef"])
	owner := asObj(props["ownerParticipantRef"])
	counterparty := asObj(props["counterpartyParticipantRef"])
	beneficiary := asObj(props["beneficiaryParticipantRef"])
	if actor["example"] != userID || actor["description"] != "User who recorded this change." {
		t.Fatalf("commitment event actor sampled the promise owner: %#v", actor)
	}
	if owner["example"] != "alex@example.com" || counterparty["example"] != "jordan@example.com" || beneficiary["example"] != "customer:acme" {
		t.Fatalf("commitment event participants drifted: owner %#v counterparty %#v beneficiary %#v", owner, counterparty, beneficiary)
	}
	commitment := asObj(asObj(asObj(schemas["RelationshipCommitment"])["properties"])["ownerParticipantRef"])
	if commitment["example"] != "alex@example.com" {
		t.Fatalf("promise owner changed: %#v", commitment)
	}

	assertGraphEdgeNodes(t, schemas)
}

func TestGraphEdgeUsesCommitmentNodeIDs(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertGraphEdgeNodes(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertGraphEdgeNodes(t *testing.T, schemas obj) {
	t.Helper()
	edge := asObj(schemas["RelationshipGraphEdge"])
	if edge == nil {
		return
	}
	props := asObj(edge["properties"])
	source := asObj(props["source"])
	target := asObj(props["target"])
	const from = "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const to = "commitment:26cdbdc9-d0fc-4f8c-8660-2f0d62cfef51"
	if source["example"] != from || source["description"] != "Source node id." {
		t.Fatalf("graph edge source is not a commitment node: %#v", source)
	}
	if target["example"] != to || target["description"] != "Target node id." {
		t.Fatalf("graph edge target is not the other commitment: %#v", target)
	}
	if source["example"] == target["example"] {
		t.Fatalf("graph edge connects a node to itself: %#v", source)
	}

	assertSelectedGraphNode(t, schemas)
}

func TestSavedGraphNodeUsesTheRelationshipID(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSelectedGraphNode(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertSelectedGraphNode(t *testing.T, schemas obj) {
	t.Helper()
	state := asObj(schemas["ConsoleGraphSavedViewState"])
	if state == nil {
		return
	}
	props := asObj(state["properties"])
	selected := asObj(props["selectedNodeId"])
	relationship := asObj(props["relationshipId"])
	const relationshipID = "3a196c5e-b10e-46cb-a177-7c001f7be573"
	if selected["example"] != "relationship:"+relationshipID || selected["description"] != "Optional selected graph node." {
		t.Fatalf("selected graph node is not that relationship: %#v", selected)
	}
	if relationship["example"] != relationshipID {
		t.Fatalf("saved view relationship id changed: %#v", relationship)
	}

	assertTriggeringCommitment(t, schemas)
}

func TestAttentionTriggerNamesTheCommitment(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertTriggeringCommitment(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertTriggeringCommitment(t *testing.T, schemas obj) {
	t.Helper()
	item := asObj(schemas["RelationshipAttentionItem"])
	if item == nil {
		return
	}
	props := asObj(item["properties"])
	trigger := asObj(props["triggeringObjectRef"])
	const commitment = "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	if trigger["example"] != commitment || trigger["description"] != "Triggering object." {
		t.Fatalf("attention trigger is not the commitment: %#v", trigger)
	}
	reason := asObj(props["reasonCode"])
	if reason["example"] != "overdue_commitment" {
		t.Fatalf("attention reason changed: %#v", reason)
	}

	assertLineageAccounts(t, schemas)
}

func TestLineageNamesTheMergedAccounts(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertLineageAccounts(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertLineageAccounts(t *testing.T, schemas obj) {
	t.Helper()
	lineage := asObj(schemas["RelationshipIdentityLineage"])
	if lineage == nil {
		return
	}
	props := asObj(lineage["properties"])
	const proposed = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	const existing = "3a196c5e-b10e-46cb-a177-7c001f7be573"
	before := asObj(props["beforeRelationshipIds"])
	after := asObj(props["afterRelationshipIds"])
	if !reflect.DeepEqual(before["example"], []any{proposed, existing}) {
		t.Fatalf("before relationship ids: %#v", before["example"])
	}
	if !reflect.DeepEqual(after["example"], []any{existing}) {
		t.Fatalf("after relationship ids: %#v", after["example"])
	}
	if asObj(before["items"])["example"] != proposed || asObj(after["items"])["example"] != existing {
		t.Fatalf("relationship id items: before %#v after %#v", before["items"], after["items"])
	}
	if before["description"] != "Relationship ids before." || after["description"] != "Relationship ids after." {
		t.Fatalf("lineage descriptions changed: %#v %#v", before["description"], after["description"])
	}

	assertSnapshotAssertionID(t, schemas)
}

func TestSnapshotNamesTheWinningAssertion(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertSnapshotAssertionID(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertSnapshotAssertionID(t *testing.T, schemas obj) {
	t.Helper()
	snapshot := asObj(schemas["RelationshipStateSnapshot"])
	if snapshot == nil {
		return
	}
	props := asObj(snapshot["properties"])
	const assertionID = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	ids := asObj(props["assertionIds"])
	if !reflect.DeepEqual(ids["example"], []any{assertionID}) {
		t.Fatalf("snapshot assertion ids: %#v", ids["example"])
	}
	if asObj(ids["items"])["example"] != assertionID {
		t.Fatalf("assertion id item: %#v", ids["items"])
	}
	if ids["description"] != "Assertions selected by deterministic precedence." {
		t.Fatalf("assertion description changed: %#v", ids["description"])
	}
	if id := asObj(props["id"]); id["example"] == assertionID {
		t.Fatalf("snapshot id reused the assertion id: %#v", id["example"])
	}

	assertMovedObservationID(t, schemas)
}

func TestLineageNamesTheMovedObservation(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertMovedObservationID(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertMovedObservationID(t *testing.T, schemas obj) {
	t.Helper()
	lineage := asObj(schemas["RelationshipIdentityLineage"])
	if lineage == nil {
		return
	}
	props := asObj(lineage["properties"])
	const observationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	ids := asObj(props["observationIds"])
	if !reflect.DeepEqual(ids["example"], []any{observationID}) {
		t.Fatalf("moved observation ids: %#v", ids["example"])
	}
	if asObj(ids["items"])["example"] != observationID {
		t.Fatalf("observation id item: %#v", ids["items"])
	}
	if ids["description"] != "Moved observation ids." {
		t.Fatalf("observation description changed: %#v", ids["description"])
	}
	if id := asObj(props["id"]); id["example"] == observationID {
		t.Fatalf("lineage id reused the observation id: %#v", id["example"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["observationId"])["example"] != observationID {
		t.Fatalf("mission control observation id changed: %#v", evidence["observationId"])
	}

	assertMovedObjectRef(t, schemas)
}

func TestLineageNamesTheMovedObject(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertMovedObjectRef(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertMovedObjectRef(t *testing.T, schemas obj) {
	t.Helper()
	lineage := asObj(schemas["RelationshipIdentityLineage"])
	if lineage == nil {
		return
	}
	props := asObj(lineage["properties"])
	const objectRef = "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	refs := asObj(props["movedObjectRefs"])
	if !reflect.DeepEqual(refs["example"], []any{objectRef}) {
		t.Fatalf("moved object refs: %#v", refs["example"])
	}
	if asObj(refs["items"])["example"] != objectRef {
		t.Fatalf("object ref item: %#v", refs["items"])
	}
	if refs["description"] != "All moved graph objects." {
		t.Fatalf("object ref description changed: %#v", refs["description"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["observationId"])["example"] != "6b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("mission control observation id changed: %#v", evidence["observationId"])
	}

	assertLineageIdentity(t, schemas)
}

func TestLineageNamesTheIdentity(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{
		"RelationshipIdentity": obj{"type": "object", "properties": obj{
			"id": obj{"type": "string", "format": "uuid", "description": "Stable UUID primary key.", "example": "123e4567-e89b-12d3-a456-426614174000"},
		}},
	}}}
	Enrich(spec)
	assertLineageIdentity(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertLineageIdentity(t *testing.T, schemas obj) {
	t.Helper()
	lineage := asObj(schemas["RelationshipIdentityLineage"])
	if lineage == nil {
		return
	}
	const identityID = "1b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	props := asObj(lineage["properties"])
	ids := asObj(props["identityIds"])
	if !reflect.DeepEqual(ids["example"], []any{identityID}) {
		t.Fatalf("identity ids: %#v", ids["example"])
	}
	if asObj(ids["items"])["example"] != identityID {
		t.Fatalf("identity id item: %#v", ids["items"])
	}
	if ids["description"] != "Affected identity ids." {
		t.Fatalf("identity description changed: %#v", ids["description"])
	}
	if id := asObj(props["id"]); id["example"] == identityID {
		t.Fatalf("lineage id reused the identity id: %#v", id["example"])
	}
	identity := asObj(schemas["RelationshipIdentity"])
	if identity == nil {
		t.Fatal("relationship identity schema missing")
	}
	if asObj(asObj(identity["properties"])["id"])["example"] != identityID {
		t.Fatalf("relationship identity id: %#v", asObj(identity["properties"])["id"])
	}

	assertAttentionEvidence(t, schemas)
}

func TestAttentionEvidenceNamesThePromiseEvidence(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertAttentionEvidence(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertAttentionEvidence(t *testing.T, schemas obj) {
	t.Helper()
	item := asObj(schemas["RelationshipAttentionItem"])
	if item == nil {
		return
	}
	const evidenceRef = "revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	props := asObj(item["properties"])
	refs := asObj(props["evidenceRefs"])
	if !reflect.DeepEqual(refs["example"], []any{evidenceRef}) {
		t.Fatalf("attention evidence refs: %#v", refs["example"])
	}
	if asObj(refs["items"])["example"] != evidenceRef {
		t.Fatalf("attention evidence item: %#v", refs["items"])
	}
	if refs["description"] != "Evidence refs." {
		t.Fatalf("attention evidence description changed: %#v", refs["description"])
	}
	if asObj(props["reasonCode"])["example"] != "overdue_commitment" {
		t.Fatalf("attention reason changed: %#v", props["reasonCode"])
	}
	action := asObj(schemas["RevenueAction"])
	evidence := asObj(asObj(asObj(asObj(action["properties"])["evidence"])["items"])["properties"])
	if asObj(evidence["id"])["example"] != "4b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("action evidence id changed: %#v", evidence["id"])
	}

	assertReviewEvidence(t, schemas)
}

func TestReviewEvidenceNamesTheObservation(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertReviewEvidence(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertReviewEvidence(t *testing.T, schemas obj) {
	t.Helper()
	candidate := asObj(schemas["RelationshipIdentityCandidate"])
	if candidate == nil {
		return
	}
	const evidenceRef = "relationship-observation:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	props := asObj(candidate["properties"])
	refs := asObj(props["evidenceRefs"])
	if !reflect.DeepEqual(refs["example"], []any{evidenceRef}) {
		t.Fatalf("review evidence refs: %#v", refs["example"])
	}
	if asObj(refs["items"])["example"] != evidenceRef {
		t.Fatalf("review evidence item: %#v", refs["items"])
	}
	if refs["description"] != "Evidence references." {
		t.Fatalf("review evidence description changed: %#v", refs["description"])
	}
	evidence := asObj(asObj(schemas["MissionControlEvidenceReference"])["properties"])
	if asObj(evidence["observationId"])["example"] != "6b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("mission control observation id changed: %#v", evidence["observationId"])
	}
}

func TestApprovePlanReturnsInternallyApproved(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertApprovePlan(t, spec)
}

func assertApprovePlan(t *testing.T, spec obj) {
	t.Helper()
	paths := asObj(spec["paths"])
	approve := asObj(asObj(paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/approve"])["post"])
	if approve["summary"] != "Approve this plan" {
		t.Fatalf("approve summary: %#v", approve["summary"])
	}
	if approve["operationId"] != "approveMutualActionPlan" {
		t.Fatalf("approve operation: %#v", approve["operationId"])
	}
	approveResponses := asObj(approve["responses"])
	if approveResponses["200"] != nil || approveResponses["201"] == nil {
		t.Fatalf("approve status: %#v", approveResponses)
	}
	if len(mediaExample(t, approve["requestBody"])) != 0 {
		t.Fatalf("approve request: %#v", mediaExample(t, approve["requestBody"]))
	}
	approved := mediaExample(t, approveResponses["201"])
	if approved["status"] != "internally_approved" || approved["tokenState"] != "not_issued" {
		t.Fatalf("approve body: %#v", approved)
	}
	if _, ok := approved["sharePolicyDecisionId"]; ok {
		t.Fatalf("approve body includes a share decision: %#v", approved["sharePolicyDecisionId"])
	}
	assertPlanRevision(t, approved)

	share := asObj(asObj(paths["/v1/relationships/{relationshipId}/mutual-action-plans/{planId}/share"])["post"])
	if share["summary"] != "Draft an email to share this plan" {
		t.Fatalf("share summary: %#v", share["summary"])
	}
	if share["operationId"] != "shareMutualActionPlan" {
		t.Fatalf("share operation: %#v", share["operationId"])
	}
	shareResponses := asObj(share["responses"])
	if shareResponses["200"] != nil || shareResponses["201"] == nil {
		t.Fatalf("share status: %#v", shareResponses)
	}
	if len(mediaExample(t, share["requestBody"])) != 0 {
		t.Fatalf("share request: %#v", mediaExample(t, share["requestBody"]))
	}
	shared := mediaExample(t, shareResponses["201"])
	plan := asObj(shared["plan"])
	if plan["status"] != "shared" || plan["tokenState"] != "active" || plan["sharePolicyDecisionId"] != documentedPlanDecisionID {
		t.Fatalf("share plan: %#v", plan)
	}
	token, _ := shared["responseToken"].(string)
	if token != documentedPlanResponseToken || len(token) != 64 {
		t.Fatalf("response token: %#v", shared["responseToken"])
	}
	assertPlanRevision(t, plan)
}

func assertPlanRevision(t *testing.T, plan obj) {
	t.Helper()
	revision := asObj(plan["currentRevision"])
	if revision["revisionId"] != documentedPlanRevisionID || revision["revisionHash"] != documentedPlanRevisionHash {
		t.Fatalf("revision: %#v", revision)
	}
	version, ok := revision["version"].(int)
	if !ok {
		if number, isFloat := revision["version"].(float64); isFloat {
			version, ok = int(number), true
		}
	}
	if !ok || version != 1 {
		t.Fatalf("revision version: %#v", revision["version"])
	}
	raw, err := json.Marshal([]planItemSample{{
		ItemID:              "item:" + documentedPlanCommitmentID,
		CommitmentID:        documentedPlanCommitmentID,
		Title:               "Send the security packet.",
		OwnerParticipantRef: "alex@example.com",
		DependencyItemIDs:   []string{},
		DueAt:               "2026-09-14T17:00:00Z",
		Status:              "open",
		EvidenceRefs:        []string{"revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	if got := "sha256:" + hex.EncodeToString(sum[:]); got != documentedPlanRevisionHash {
		t.Fatalf("revision hash %s from %s", got, raw)
	}
}

type planItemSample struct {
	ItemID              string   `json:"itemId"`
	CommitmentID        string   `json:"commitmentId,omitempty"`
	MilestoneRef        string   `json:"milestoneRef,omitempty"`
	Title               string   `json:"title"`
	OwnerParticipantRef string   `json:"ownerParticipantRef"`
	DependencyItemIDs   []string `json:"dependencyItemIds"`
	DueAt               string   `json:"dueAt,omitempty"`
	Status              string   `json:"status"`
	EvidenceRefs        []string `json:"evidenceRefs"`
}

func mediaExample(t *testing.T, body any) obj {
	t.Helper()
	content := asObj(asObj(body)["content"])
	media := asObj(content["application/json"])
	example := asObj(media["example"])
	if example == nil {
		t.Fatalf("missing example: %#v", body)
	}
	return example
}

func TestMailboxPolicyLoadsStoredDefaults(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertMailboxPolicy(t, spec)
}

func assertMailboxPolicy(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/revenue-workspaces/current/communication-policy/{sourceAccountId}"])["get"])
	if operation["summary"] != "Mailbox policy" || operation["operationId"] != "getCommunicationPolicy" {
		t.Fatalf("mailbox policy operation: %#v", operation["summary"])
	}
	if operation["requestBody"] != nil {
		t.Fatal("mailbox policy load sends no body")
	}
	params, _ := operation["parameters"].([]any)
	if len(params) != 1 || asObj(asObj(params[0])["schema"])["example"] != "you@company.com" {
		t.Fatalf("mailbox account param: %#v", operation["parameters"])
	}
	responses := asObj(operation["responses"])
	if responses["200"] == nil || responses["404"] == nil {
		t.Fatalf("mailbox policy statuses: %#v", responses)
	}
	policy := asObj(asObj(asObj(asObj(responses["200"])["content"])["application/json"])["example"])
	retention, retentionOK := jsonInt(policy["retentionDays"])
	version, versionOK := jsonInt(policy["version"])
	if policy["id"] != documentedMailboxPolicyID || policy["sourceAccountId"] != "you@company.com" ||
		policy["metadataVisibility"] != "workspace" || policy["shareSubject"] != true ||
		policy["shareBody"] != false || policy["shareAttachments"] != false ||
		policy["signatureEnrichment"] != true || policy["modelContactExtraction"] != true ||
		!retentionOK || retention != 540 || !versionOK || version != 1 {
		t.Fatalf("mailbox policy: %#v", policy)
	}
}

func jsonInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

func TestCreatePlanReturnsDraft(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertCreatePlan(t, spec)
}

func assertCreatePlan(t *testing.T, spec obj) {
	t.Helper()
	operation := asObj(asObj(asObj(spec["paths"])["/v1/relationships/{relationshipId}/mutual-action-plans"])["post"])
	if operation["summary"] != "Create from promises they accepted" || operation["operationId"] != "createMutualActionPlan" {
		t.Fatalf("create plan operation: %#v", operation["summary"])
	}
	request := asObj(asObj(asObj(asObj(operation["requestBody"])["content"])["application/json"])["example"])
	ids, _ := request["commitmentIds"].([]any)
	if len(ids) != 1 || ids[0] != documentedDraftCommitmentID {
		t.Fatalf("create plan request: %#v", request)
	}
	responses := asObj(operation["responses"])
	if responses["200"] != nil || responses["201"] == nil {
		t.Fatalf("create plan statuses: %#v", responses)
	}
	plan := asObj(asObj(asObj(asObj(responses["201"])["content"])["application/json"])["example"])
	if plan["status"] != "draft" || plan["tokenState"] != "not_issued" || plan["planId"] != documentedDraftPlanID {
		t.Fatalf("draft plan: %#v", plan)
	}
	if _, ok := plan["sharePolicyDecisionId"]; ok {
		t.Fatal("draft plan includes a share decision")
	}
	revision := asObj(plan["currentRevision"])
	version, versionOK := jsonInt(revision["version"])
	if revision["revisionHash"] != documentedDraftRevisionHash || !versionOK || version != 1 {
		t.Fatalf("draft revision: %#v", revision)
	}
	raw, err := json.Marshal([]draftPlanItemSample{{
		ItemID:              "item:" + documentedDraftCommitmentID,
		CommitmentID:        documentedDraftCommitmentID,
		Title:               "Send the security packet.",
		OwnerParticipantRef: "alex@example.com",
		DependencyItemIDs:   []string{},
		DueAt:               "2026-07-22T17:00:00Z",
		Status:              "open",
		EvidenceRefs:        []string{"revenue-evidence:6b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	if got := "sha256:" + hex.EncodeToString(sum[:]); got != documentedDraftRevisionHash {
		t.Fatalf("revision hash %s from %s", got, raw)
	}
}

type draftPlanItemSample struct {
	ItemID              string   `json:"itemId"`
	CommitmentID        string   `json:"commitmentId,omitempty"`
	MilestoneRef        string   `json:"milestoneRef,omitempty"`
	Title               string   `json:"title"`
	OwnerParticipantRef string   `json:"ownerParticipantRef"`
	DependencyItemIDs   []string `json:"dependencyItemIds"`
	DueAt               string   `json:"dueAt,omitempty"`
	Status              string   `json:"status"`
	EvidenceRefs        []string `json:"evidenceRefs"`
}

func assertDisconnectSource(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/relationship-sources/{source}/{sourceAccountId}/disconnect"])["post"])
	if op["summary"] != "Disconnect" || op["operationId"] != "disconnectRelationshipSource" {
		t.Fatalf("disconnect operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	if op["requestBody"] != nil {
		t.Fatalf("disconnect sends no body: %#v", op["requestBody"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "posts no request body") || !strings.Contains(description, "backfill returns to idle") {
		t.Fatalf("disconnect description: %q", description)
	}
	params, _ := op["parameters"].([]any)
	if len(params) != 2 {
		t.Fatalf("disconnect parameters: %#v", op["parameters"])
	}
	sourceSchema := asObj(asObj(params[0])["schema"])
	accountSchema := asObj(asObj(params[1])["schema"])
	if sourceSchema["example"] != "google" || accountSchema["example"] != "me@company.com" {
		t.Fatalf("disconnect path examples: %#v %#v", sourceSchema, accountSchema)
	}
	media := asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])
	example := asObj(media["example"])
	if example["status"] != "disconnected" || example["backfillPhase"] != "idle" || example["completeness"] != "disconnected" {
		t.Fatalf("disconnected source: %#v", example)
	}
	if example["source"] != "google" || example["sourceAccountId"] != "me@company.com" || example["disconnectedAt"] != "2026-07-31T14:00:00Z" {
		t.Fatalf("disconnected identity: %#v", example)
	}
	if !openAPIIntEqual(example["lagSeconds"], 0) || !openAPIIntEqual(example["retryCount"], 0) || !openAPIIntEqual(example["backfillCompleted"], 250) || !openAPIIntEqual(example["expectedCadenceSeconds"], 900) {
		t.Fatalf("disconnected counts: lag=%#v retry=%#v completed=%#v cadence=%#v", example["lagSeconds"], example["retryCount"], example["backfillCompleted"], example["expectedCadenceSeconds"])
	}
	if _, ok := example["nextRetryAt"]; ok {
		t.Fatalf("disconnect clears nextRetryAt: %#v", example["nextRetryAt"])
	}
	scopes := []any{
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/calendar.events.readonly",
	}
	if !reflect.DeepEqual(example["requiredScopes"], scopes) || !reflect.DeepEqual(example["grantedScopes"], scopes) {
		t.Fatalf("disconnect keeps read scopes: %#v", example)
	}
	missing, _ := example["missingScopes"].([]any)
	if len(missing) != 0 {
		t.Fatalf("disconnect missing scopes: %#v", example["missingScopes"])
	}
	status := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RelationshipSourceStatus"])["properties"])["status"])
	if status["example"] != "live" {
		t.Fatalf("source health status example changed: %#v", status)
	}
}

func assertRemoveRule(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-workspaces/current/communication-privacy-rules/{ruleId}"])["delete"])
	if op["summary"] != "Remove" || op["operationId"] != "deleteCommunicationPrivacyRule" {
		t.Fatalf("remove rule operation: %#v", op)
	}
	if op["requestBody"] != nil {
		t.Fatalf("remove sends no body: %#v", op["requestBody"])
	}
	responses := asObj(op["responses"])
	if responses["204"] == nil || responses["200"] != nil {
		t.Fatalf("remove responses: %#v", responses)
	}
	params, _ := op["parameters"].([]any)
	if len(params) != 1 || asObj(asObj(params[0])["schema"])["example"] != "3b8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("remove rule id: %#v", op["parameters"])
	}
}

func assertSnoozeAction(t *testing.T, spec obj) {
	t.Helper()
	const wake = "2026-08-07T14:00:00Z"
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/snooze"])["post"])
	if op["summary"] != "Snooze" || op["operationId"] != "snoozeRevenueAction" {
		t.Fatalf("snooze operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "seven days") {
		t.Fatalf("snooze description: %q", description)
	}
	request := asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])
	if asObj(request["example"])["until"] != wake {
		t.Fatalf("snooze request: %#v", request["example"])
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["queueStatus"] != "snoozed" || example["snoozedUntil"] != wake || example["id"] != "1a8dfa9b-a7b2-46ea-982c-622a914c00e5" {
		t.Fatalf("snoozed action: %#v", example)
	}
	if _, ok := example["dismissReason"]; ok {
		t.Fatalf("snooze stores no dismiss reason: %#v", example["dismissReason"])
	}
	queue := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])["queueStatus"])
	if queue["example"] != "open" {
		t.Fatalf("queue status example changed: %#v", queue)
	}
}

func assertSaveDraft(t *testing.T, spec obj) {
	t.Helper()
	const (
		subject = "Following up as promised"
		message = "Hi Jordan — circling back as promised."
		hash    = "sha256:35a77a7dc38e7b2d73e06e754a8a5767b3b8af2234f5caeeb532c63e488b2925"
	)
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/edit"])["post"])
	if op["summary"] != "Save draft" || op["operationId"] != "editRevenueAction" {
		t.Fatalf("save draft operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "subject and message") {
		t.Fatalf("save draft description: %q", description)
	}
	request := asObj(asObj(asObj(asObj(op["requestBody"])["content"])["application/json"])["example"])
	if len(request) != 2 || request["proposedSubject"] != subject || request["proposedMessage"] != message {
		t.Fatalf("save draft request: %#v", request)
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["proposedSubject"] != subject || example["proposedMessage"] != message || example["revisionHash"] != hash || example["policyStatus"] != "pending" || example["approvalStatus"] != "pending" {
		t.Fatalf("saved draft: %#v", example)
	}
	if !openAPIIntEqual(example["revision"], 2) {
		t.Fatalf("saved revision: %#v", example["revision"])
	}
	if _, ok := example["approvedAt"]; ok {
		t.Fatalf("save draft clears approval: %#v", example["approvedAt"])
	}
	revision := asObj(asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])["revision"])
	if !openAPIIntEqual(revision["example"], 1) {
		t.Fatalf("shared revision example changed: %#v", revision)
	}
}

func assertProviderDraft(t *testing.T, spec obj) {
	t.Helper()
	op := asObj(asObj(asObj(spec["paths"])["/v1/revenue-actions/{actionId}/execute"])["post"])
	if op["summary"] != "Create provider draft" || op["operationId"] != "executeRevenueAction" {
		t.Fatalf("provider draft operation: summary=%#v id=%#v", op["summary"], op["operationId"])
	}
	if op["requestBody"] != nil {
		t.Fatalf("provider draft sends no body: %#v", op["requestBody"])
	}
	description, _ := op["description"].(string)
	if !strings.Contains(description, "no request body") || !strings.Contains(description, "sent and handled") {
		t.Fatalf("provider draft description: %q", description)
	}
	example := asObj(asObj(asObj(asObj(asObj(op["responses"])["200"])["content"])["application/json"])["example"])
	if example["executionStatus"] != "sent" || example["queueStatus"] != "handled" || example["executionMode"] != "draft" || example["providerMessageId"] != "draft_1" || example["executedAt"] != "2026-07-12T12:06:00Z" {
		t.Fatalf("provider draft: %#v", example)
	}
	if _, ok := example["executionError"]; ok {
		t.Fatalf("provider draft clears the error: %#v", example["executionError"])
	}
	props := asObj(asObj(asObj(asObj(spec["components"])["schemas"])["RevenueAction"])["properties"])
	if asObj(props["executionStatus"])["example"] != "pending" || asObj(props["queueStatus"])["example"] != "open" {
		t.Fatalf("shared action examples changed: execution=%#v queue=%#v", props["executionStatus"], props["queueStatus"])
	}
}

func TestConnectorContractsDocumentLifecycleAndRateLimitResponses(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	paths := asObj(spec["paths"])
	for _, path := range []string{"/v1/connections/{name}/start", "/v1/connectors/{name}/start", "/v1/connections/{name}/callback", "/v1/connectors/{name}/callback", "/v1/connections/{name}/mcp-token", "/v1/connectors/{name}/resource-token", "/v1/connections/{name}", "/v1/connectors/{name}/connections/{connectionID}"} {
		item := asObj(paths[path])
		var operation obj
		for _, method := range []string{"get", "post", "delete"} {
			if candidate := asObj(item[method]); candidate != nil {
				operation = candidate
				break
			}
		}
		responses := asObj(operation["responses"])
		if responses["429"] == nil {
			t.Fatalf("%s does not document 429", path)
		}
	}
	token := asObj(asObj(paths["/v1/connections/{name}/mcp-token"])["post"])
	if required, ok := asObj(token["requestBody"])["required"].(bool); !ok || required {
		t.Fatalf("MCP token body must be optional: %#v", token["requestBody"])
	}
	for _, status := range []string{"403", "409", "410", "429"} {
		if asObj(token["responses"])[status] == nil {
			t.Fatalf("MCP token missing %s", status)
		}
	}
}

func TestGraphExecutionNeedsReconcile(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertGraphExecutionNeedsReconcile(t, asObj(asObj(spec["components"])["schemas"]))
}

func assertGraphExecutionNeedsReconcile(t *testing.T, schemas obj) {
	t.Helper()
	status := asObj(asObj(asObj(schemas["RelationshipGraphNode"])["properties"])["executionStatus"])
	if status["example"] != graphExecutionStatusExample || status["description"] != graphExecutionStatusDescription {
		t.Fatalf("graph execution: %#v", status)
	}
	action := asObj(asObj(asObj(schemas["RevenueAction"])["properties"])["executionStatus"])
	if action["example"] != "pending" {
		t.Fatalf("revenue action execution example changed: %#v", action)
	}
}

func researchRequestExample(t *testing.T, spec obj, path string) obj {
	t.Helper()
	content := asObj(asObj(asObj(asObj(asObj(asObj(spec["paths"])[path])["post"])["requestBody"])["content"])["application/json"])
	example := asObj(content["example"])
	if example == nil {
		t.Fatalf("%s request example missing", path)
	}
	return example
}
