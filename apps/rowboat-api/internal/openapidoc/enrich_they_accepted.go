package openapidoc

const theyAcceptedDescription = "They accepted records that the other party accepted this promise. The promise stays open."

const (
	theyAcceptedRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	theyAcceptedCommitmentID   = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
)

func theyAcceptedParams() []any {
	return []any{
		obj{
			"name":        "relationshipId",
			"in":          "path",
			"required":    true,
			"description": "Relationship id.",
			"example":     theyAcceptedRelationshipID,
			"schema":      uuidSchema("Relationship id.", theyAcceptedRelationshipID),
		},
		obj{
			"name":        "commitmentId",
			"in":          "path",
			"required":    true,
			"description": "Commitment id.",
			"example":     theyAcceptedCommitmentID,
			"schema":      uuidSchema("Commitment id.", theyAcceptedCommitmentID),
		},
	}
}

func theyAcceptedCommitment() obj {
	return obj{
		"id":                         theyAcceptedCommitmentID,
		"direction":                  "promised_by_me",
		"text":                       "Send the security packet.",
		"status":                     "open",
		"dueAt":                      "2026-07-22T17:00:00Z",
		"confidence":                 0.94,
		"userConfirmed":              true,
		"ownerParticipantRef":        "alex@example.com",
		"counterpartyParticipantRef": "jordan@example.com",
		"beneficiaryParticipantRef":  "customer:acme",
		"sourcePhrase":               "I will send it by Friday.",
		"duePhrase":                  "by Friday",
		"dueTimezone":                "America/Los_Angeles",
		"acceptance":                 "accepted",
		"currentEventVersion":        4,
	}
}
