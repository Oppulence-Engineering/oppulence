package openapidoc

const sharePlanDescription = "Draft an email to share this plan marks that approved plan as shared and writes a draft email. The email is not sent."

const (
	sharePlanRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	sharePlanID             = "plan:f8dfa9b6-a7b2-46ea-982c-622a914c00e5"
	sharePlanResponseValue  = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
)

func sharePlanResult() obj {
	return obj{
		"plan": obj{
			"planId":           sharePlanID,
			"relationshipId":   sharePlanRelationshipID,
			"internalOwnerRef": "0c8dfa9b-a7b2-46ea-982c-622a914c00e5",
			"counterpartyRef":  "jordan@example.com",
			"status":           "shared",
			"currentRevision": obj{
				"revisionId":   "revision:d8dfa9b6-a7b2-46ea-982c-622a914c00e5",
				"planId":       sharePlanID,
				"version":      1,
				"revisionHash": "sha256:c7ba0b5e53805088b4435a27848fb9a5c899287b4aac146b86d4709eaef49dc0",
				"createdAt":    "2026-07-15T16:00:00Z",
				"createdBy":    "0c8dfa9b-a7b2-46ea-982c-622a914c00e5",
				"items": []any{obj{
					"itemId":              "item:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
					"commitmentId":        "8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
					"title":               "Follow up on the proposal",
					"ownerParticipantRef": "jordan@example.com",
					"dependencyItemIds":   []any{},
					"dueAt":               "2026-07-15T17:00:00Z",
					"status":              "open",
					"evidenceRefs":        []any{"revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
				}},
			},
			"sharePolicyDecisionId": "governance:ab12cd34ef56789012345678",
			"tokenState":            "active",
		},
		"responseToken": sharePlanResponseValue,
	}
}

func sharePlanOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Draft an email to share this plan",
		sharePlanDescription,
		"shareMutualActionPlan",
		bearer(),
		[]any{
			obj{
				"name":        "relationshipId",
				"in":          "path",
				"required":    true,
				"description": "Relationship id.",
				"example":     sharePlanRelationshipID,
				"schema":      uuidSchema("Relationship id.", sharePlanRelationshipID),
			},
			obj{
				"name":        "planId",
				"in":          "path",
				"required":    true,
				"description": "Mutual action plan id.",
				"example":     sharePlanID,
				"schema":      stringSchema("Mutual action plan id.", sharePlanID),
			},
		},
		jsonRequestOptional("Empty request.", objectSchema("Plan share request.", obj{}), obj{}),
		obj{
			"201": jsonResponse("The approved plan is shared, and a draft email is ready.", freeFormSchema("Shared plan and one-time value."), sharePlanResult()),
			"401": responseRef("401"),
			"404": responseRef("404"),
			"409": responseRef("409"),
		},
	)
}
