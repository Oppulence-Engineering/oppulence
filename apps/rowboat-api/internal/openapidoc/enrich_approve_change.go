package openapidoc

const approveChangeDescription = "Approve accepts this proposed conversation change. The company and its review queue refresh."

const approveChangeRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"

func approveChangeParams() []any {
	return []any{obj{
		"name":        "relationshipId",
		"in":          "path",
		"required":    true,
		"description": "Relationship id.",
		"example":     approveChangeRelationshipID,
		"schema":      uuidSchema("Relationship id.", approveChangeRelationshipID),
	}}
}

func approveChangeResult() obj {
	return obj{
		"relationship": approveChangeRelationship(),
		"intelligence": approveChangeIntelligence(),
	}
}

func approveChangeRelationship() obj {
	return obj{
		"id":               approveChangeRelationshipID,
		"kind":             "company",
		"displayName":      "Acme",
		"accountDomain":    "example.com",
		"summary":          "Asked for pricing in April; wants a follow-up in July.",
		"status":           "active",
		"peopleCount":      3,
		"emailThreadCount": 12,
		"commitmentCount":  4,
		"nextAction":       "Confirm the security review owner.",
		"lifecycle":        "evaluation",
		"engagement":       "steady",
		"sentiment":        "mixed",
		"health":           "needs_attention",
		"stateReason":      "The proposed conversation change was accepted.",
		"stateVersion":     5,
		"stateHash":        "sha256:ab12cd34",
		"projectorVersion": 2,
		"projectedAt":      "2026-07-25T16:00:00Z",
		"lastChangedAt":    "2026-07-25T16:00:00Z",
		"risks":            []any{"Security review has no owner."},
		"milestones":       []any{"Proposal shared."},
		"resourceRefs":     []any{"hubspot:company:123"},
		"categories":       []any{"Artificial intelligence"},
	}
}

func approveChangeIntelligence() obj {
	return obj{
		"claims": []any{obj{
			"id":                "claim:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
			"kind":              "risk",
			"value":             "Security review may delay renewal.",
			"exactQuote":        "We are concerned security could delay the renewal.",
			"startMs":           12000,
			"endMs":             16000,
			"speakerId":         "anonymous:remote-channel",
			"speakerLabel":      "Other",
			"speakerConfidence": 0.5,
			"confidence":        0.5,
			"captureCaveats":    []any{"Remote channel may contain multiple speakers."},
			"material":          true,
			"stateDimension":    "risk",
			"observationId":     "6b8dfa9b-a7b2-46ea-982c-622a914c00e5",
		}},
		"reviewItems":        []any{},
		"governanceReceipts": []any{},
		"delta": obj{
			"fromVersion":       4,
			"toVersion":         5,
			"changes":           []any{},
			"uncertainClaimIds": []any{},
			"contradictions":    []any{},
		},
		"liveCues":                  []any{},
		"contradictionCases":        []any{},
		"recoveryEvaluations":       []any{},
		"recommendationEvaluations": []any{},
		"mutualActionPlans":         []any{},
		"effectivePolicy": obj{
			"capture":          "require_consent",
			"modelRoute":       "local_only",
			"publishEvidence":  true,
			"externalShare":    true,
			"retentionDays":    30,
			"redactionClasses": []any{"personal_identifier"},
			"legalHold":        false,
			"policyVersion":    "policy:9373cc30008dcb712c236fc9",
			"sourceLayerIds":   []any{"workspace:default"},
			"resolvedAt":       "2026-07-31T14:00:00Z",
		},
		"governanceDecisions": []any{},
		"deletionReceipts":    []any{},
	}
}
