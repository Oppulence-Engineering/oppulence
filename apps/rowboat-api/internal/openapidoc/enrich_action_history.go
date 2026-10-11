package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// History loads GET /v1/revenue-actions/{actionId}/audit. The published action
// is the warm follow-up for Jordan Buyer. Its revision hash is the canonical
// hash of that content, not the truncated schema placeholder.
const (
	actionHistoryActionID       = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionHistoryRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionHistoryDecisionID     = "2b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionHistoryOutcomeID      = "3c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionHistoryEvidenceID     = "4b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionHistoryName           = "Jordan Buyer"
	actionHistoryEmail          = "buyer@example.com"
	actionHistorySubject        = "Following up as promised"
	actionHistoryMessage        = "Hi Jordan — you asked me to circle back this month..."
	actionHistorySender         = "gmail:me@company.com"
	actionHistoryReason         = "They asked for a follow-up in July."
	actionHistoryCreatedAt      = "2026-07-12T12:00:00Z"
	actionHistoryOutcomeAt      = "2026-07-12T14:00:00Z"
	actionHistoryDueAt          = "2026-07-15T00:00:00Z"
	actionHistoryDecisionUntil  = "2026-07-13T12:00:00Z"
	actionHistorySourceEventID  = "manual:replied:1783864800000"
)

func actionHistoryRevisionHash() string {
	raw, err := json.Marshal(struct {
		ActionType       string `json:"actionType"`
		Channel          string `json:"channel"`
		RecipientEmail   string `json:"recipientEmail"`
		ProposedSubject  string `json:"proposedSubject"`
		ProposedMessage  string `json:"proposedMessage"`
		SenderAccountRef string `json:"senderAccountRef"`
		AssignedUserID   string `json:"assignedUserId"`
		ExecutionMode    string `json:"executionMode"`
	}{
		ActionType:       "warm_follow_up",
		Channel:          "email",
		RecipientEmail:   actionHistoryEmail,
		ProposedSubject:  actionHistorySubject,
		ProposedMessage:  actionHistoryMessage,
		SenderAccountRef: actionHistorySender,
		ExecutionMode:    "draft",
	})
	if err != nil {
		panic(err)
	}
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func actionHistoryParams() []any {
	return []any{obj{
		"name":        "actionId",
		"in":          "path",
		"required":    true,
		"description": "Action id.",
		"example":     actionHistoryActionID,
		"schema":      obj{"type": "string", "format": "uuid", "example": actionHistoryActionID},
	}}
}

func actionHistoryExample() obj {
	hash := actionHistoryRevisionHash()
	return obj{
		"action": obj{
			"id":               actionHistoryActionID,
			"relationshipId":   actionHistoryRelationshipID,
			"relationshipName": actionHistoryName,
			"actionType":       "warm_follow_up",
			"channel":          "email",
			"detector":         "manual",
			"revision":         1,
			"revisionHash":     hash,
			"reason":           actionHistoryReason,
			"recipientEmail":   actionHistoryEmail,
			"proposedSubject":  actionHistorySubject,
			"proposedMessage":  actionHistoryMessage,
			"senderAccountRef": actionHistorySender,
			"priorityScore":    82,
			"queueStatus":      "open",
			"policyStatus":     "passed",
			"approvalStatus":   "pending",
			"executionStatus":  "pending",
			"executionOwner":   "rowboat",
			"executionMode":    "draft",
			"dueAt":            actionHistoryDueAt,
			"createdAt":        actionHistoryCreatedAt,
			"updatedAt":        actionHistoryOutcomeAt,
			"evidence": []any{obj{
				"id":                   actionHistoryEvidenceID,
				"source":               "meeting",
				"sourceRecordId":       "oppulence:session-42:claim:claim-risk",
				"excerpt":              "We are concerned security could delay renewal.",
				"occurredAt":           "2026-07-31T14:00:00Z",
				"externalEvidenceRefs": []any{"timestamp:12000-16000"},
			}},
		},
		"revisions": []any{obj{
			"revision":     1,
			"revisionHash": hash,
			"actionType":   "warm_follow_up",
			"channel":      "email",
			"createdAt":    actionHistoryCreatedAt,
		}},
		"decisions": []any{obj{
			"id":           actionHistoryDecisionID,
			"revision":     1,
			"revisionHash": hash,
			"status":       "passed",
			"reasonCodes":  []any{},
			"evaluatedAt":  actionHistoryCreatedAt,
			"expiresAt":    actionHistoryDecisionUntil,
		}},
		"outcomes": []any{obj{
			"id":            actionHistoryOutcomeID,
			"kind":          "replied",
			"source":        "user",
			"sourceEventId": actionHistorySourceEventID,
			"occurredAt":    actionHistoryOutcomeAt,
		}},
	}
}
