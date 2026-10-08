package openapidoc

import (
	"encoding/json"
	"os"
	"reflect"
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
}

func TestCommitmentEventNamesTheObservation(t *testing.T) {
	spec := obj{"components": obj{"schemas": obj{}}}
	Enrich(spec)
	assertEventObservation(t, asObj(asObj(spec["components"])["schemas"]))
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
