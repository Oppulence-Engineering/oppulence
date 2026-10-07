package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
)

// New person files one user observation after the person row is created.
// The content hash is summary bytes, then the JSON object for empty facts.
const (
	addedPersonRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	addedPersonObservationID  = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	addedPersonExternalID     = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	addedPersonName           = "Jordan Buyer"
	addedPersonEmail          = "buyer@example.com"
	addedPersonSummary        = "Jordan Buyer added by the user"
	addedPersonAt             = "2026-07-31T14:00:00Z"
)

func addedPersonContentHash() string {
	sum := sha256.Sum256(append([]byte(addedPersonSummary), []byte("{}")...))
	return hex.EncodeToString(sum[:])
}

func addedPersonRequest() obj {
	return obj{"observations": []any{obj{
		"relationshipId":  addedPersonRelationshipID,
		"source":          "user",
		"externalId":      addedPersonExternalID,
		"eventType":       "person_added",
		"occurredAt":      addedPersonAt,
		"summary":         addedPersonSummary,
		"normalizedFacts": obj{},
		"participants": []any{obj{
			"displayName": addedPersonName,
			"email":       addedPersonEmail,
			"role":        "contact",
		}},
	}}}
}

func addedPersonResponse() obj {
	return obj{"results": []any{obj{
		"duplicate":        false,
		"projectionStatus": "completed",
		"observation": obj{
			"id":              addedPersonObservationID,
			"source":          "user",
			"externalId":      addedPersonExternalID,
			"sourceVersion":   "1",
			"eventType":       "person_added",
			"occurredAt":      addedPersonAt,
			"receivedAt":      addedPersonAt,
			"summary":         addedPersonSummary,
			"normalizedFacts": obj{},
			"contentHash":     addedPersonContentHash(),
		},
		"relationship": obj{
			"id":               addedPersonRelationshipID,
			"kind":             "person",
			"displayName":      addedPersonName,
			"primaryEmail":     addedPersonEmail,
			"accountDomain":    "example.com",
			"summary":          "Asked for pricing in April; wants a follow-up in July.",
			"status":           "active",
			"lastTouchAt":      "2026-04-10T15:00:00Z",
			"nextActionAt":     "2026-07-01T00:00:00Z",
			"peopleCount":      3,
			"emailThreadCount": 12,
			"commitmentCount":  4,
			"nextAction":       "Confirm the security review owner.",
			"lifecycle":        "evaluation",
			"engagement":       "declining",
			"sentiment":        "mixed",
			"health":           "needs_attention",
			"stateReason":      "Security review was promised, but no owner or meeting exists.",
			"stateVersion":     4,
			"stateHash":        "sha256:ab12cd34",
			"projectorVersion": 2,
			"projectedAt":      "2026-07-25T16:00:00Z",
			"lastChangedAt":    "2026-07-25T16:00:00Z",
			"risks":            []any{"Security review has no owner."},
			"milestones":       []any{"Proposal shared."},
			"resourceRefs":     []any{"hubspot:company:123"},
			"categories":       []any{"Artificial intelligence"},
		},
	}}}
}
