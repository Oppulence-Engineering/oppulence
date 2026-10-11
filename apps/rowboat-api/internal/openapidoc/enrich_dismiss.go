package openapidoc

const dismissDescription = "Dismiss removes this follow-up from the queue and stores the reason."

const (
	dismissActionID       = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	dismissRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	dismissReason         = "not_relevant"
)

func dismissParams() []any {
	return []any{obj{
		"name":        "actionId",
		"in":          "path",
		"required":    true,
		"description": "Action id.",
		"example":     dismissActionID,
		"schema":      uuidSchema("Action id.", dismissActionID),
	}}
}

func dismissedAction() obj {
	return obj{
		"id":               dismissActionID,
		"relationshipId":   dismissRelationshipID,
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "waiting_on_me",
		"revision":         1,
		"revisionHash":     "sha256:ab12cd34ef567890",
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  "Following up as promised",
		"priorityScore":    82,
		"queueStatus":      "dismissed",
		"policyStatus":     "pending",
		"approvalStatus":   "pending",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"dismissReason":    dismissReason,
		"createdAt":        "2026-07-12T12:00:00Z",
		"updatedAt":        "2026-07-15T16:05:00Z",
		"evidence": []any{obj{
			"id":                   "4b8dfa9b-a7b2-46ea-982c-622a914c00e5",
			"source":               "meeting",
			"sourceRecordId":       "oppulence:session-42:claim:claim-risk",
			"excerpt":              "We are concerned security could delay renewal.",
			"occurredAt":           "2026-07-31T14:00:00Z",
			"externalEvidenceRefs": []any{"timestamp:12000-16000"},
		}},
	}
}
