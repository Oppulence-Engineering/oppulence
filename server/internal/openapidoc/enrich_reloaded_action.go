package openapidoc

// Reload the checked action is the request the review sheet sends after Re-check policy.
// The sheet shows the company, the follow-up, and that the check passed.
const reloadedActionDescription = "Re-check policy reloads this action. The sheet shows the company, the follow-up, and that the check passed."

const (
	reloadedActionID           = "1a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reloadedActionRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reloadedActionEvidenceID   = "4b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reloadedActionRevision     = "sha256:ab12..."
	reloadedActionClock        = "2026-07-12T12:00:00Z"
	reloadedActionDue          = "2026-07-15T00:00:00Z"
	reloadedActionEvidenceTime = "2026-07-01T14:00:00Z"
)

func reloadedActionExample() obj {
	return obj{
		"id":               reloadedActionID,
		"relationshipId":   reloadedActionRelationship,
		"relationshipName": "Acme",
		"actionType":       "warm_follow_up",
		"channel":          "email",
		"detector":         "requested_follow_up_due",
		"revision":         1,
		"revisionHash":     reloadedActionRevision,
		"reason":           "They asked for a follow-up in July.",
		"recipientEmail":   "buyer@example.com",
		"proposedSubject":  "Following up as promised",
		"proposedMessage":  "Hi Jordan — you asked me to circle back this month...",
		"senderAccountRef": "gmail:me@company.com",
		"priorityScore":    82,
		"priorityComponents": obj{
			"commitment_urgency": 40,
			"recency_signal":     12,
			"relationship_value": 30,
		},
		"queueStatus":     "open",
		"policyStatus":    "passed",
		"approvalStatus":  "pending",
		"executionStatus": "pending",
		"executionOwner":  "rowboat",
		"executionMode":   "send",
		"dueAt":           reloadedActionDue,
		"createdAt":       reloadedActionClock,
		"updatedAt":       reloadedActionClock,
		"evidence": []any{obj{
			"id":                   reloadedActionEvidenceID,
			"source":               "gmail",
			"sourceRecordId":       "gmail:thread:thr_01",
			"excerpt":              "Can you circle back this month?",
			"occurredAt":           reloadedActionEvidenceTime,
			"externalEvidenceRefs": []any{"gmail:message:msg_01"},
		}},
	}
}

func reloadedActionParam() obj {
	return pathParam("actionId", "Action the sheet reloads.", uuidSchema("Action id.", reloadedActionID))
}

func reloadedActionOperation() obj {
	return operation("Revenue", "Reload the checked action", reloadedActionDescription, "getRevenueAction", bearer(), []any{reloadedActionParam()}, nil, obj{
		"200": jsonResponse("The action the sheet shows after the check.", ref("RevenueAction"), reloadedActionExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})
}
