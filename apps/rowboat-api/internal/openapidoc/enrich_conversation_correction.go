package openapidoc

const (
	conversationCorrectionCompanyID     = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	conversationCorrectionObservationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	conversationCorrectionClaimID       = conversationClaimID
	conversationCorrectionValue         = "Avery Chen"
	conversationCorrectionReason        = "User corrected conversation evidence during focused review."
	conversationCorrectionStateReason   = "Security review was promised, but no owner or meeting exists."
)

func conversationCorrectionReviewID() string {
	return conversationReviewItemID(conversationCorrectionObservationID, conversationCorrectionClaimID, "speaker")
}

func conversationCorrectionClaimReviewID() string {
	return conversationReviewItemID(conversationCorrectionObservationID, conversationCorrectionClaimID, "claim")
}

func conversationCorrectionParams() []any {
	return []any{obj{
		"name": "relationshipId", "in": "path", "required": true,
		"description": "Relationship id.",
		"example":     conversationCorrectionCompanyID,
		"schema":      obj{"type": "string", "format": "uuid", "example": conversationCorrectionCompanyID},
	}}
}

func conversationCorrectionRequest() obj {
	return obj{
		"reviewItemId":   conversationCorrectionReviewID(),
		"correctedValue": conversationCorrectionValue,
		"reason":         conversationCorrectionReason,
	}
}

func conversationCorrectionResponse() obj {
	return obj{
		"relationship": conversationCorrectionRelationship(),
		"intelligence": conversationCorrectionIntelligence(),
	}
}

func conversationCorrectionRelationship() obj {
	return obj{
		"id":                 conversationCorrectionCompanyID,
		"kind":               "person",
		"displayName":        "Jordan Buyer",
		"primaryEmail":       "buyer@example.com",
		"accountDomain":      "example.com",
		"summary":            "Asked for pricing in April; wants a follow-up in July.",
		"status":             "active",
		"lastTouchAt":        "2026-04-10T15:00:00Z",
		"nextActionAt":       "2026-07-01T00:00:00Z",
		"peopleCount":        3,
		"emailThreadCount":   12,
		"commitmentCount":    4,
		"nextAction":         "Confirm the security review owner.",
		"lifecycle":          "evaluation",
		"engagement":         "declining",
		"sentiment":          "mixed",
		"health":             "needs_attention",
		"stateReason":        conversationCorrectionStateReason,
		"stateVersion":       4,
		"stateHash":          "sha256:ab12cd34",
		"projectorVersion":   2,
		"projectedAt":        "2026-07-25T16:00:00Z",
		"lastChangedAt":      "2026-07-25T16:00:00Z",
		"risks":              []any{"Security review has no owner."},
		"milestones":         []any{"Proposal shared."},
		"resourceRefs":       []any{"hubspot:company:123"},
		"categories":         []any{"Artificial intelligence"},
		"companyDescription": "Builds AI infrastructure for customer operations.",
		"linkedinUrl":        "https://www.linkedin.com/company/acme",
		"companyEnrichedAt":  "2026-09-06T08:00:00Z",
	}
}

func conversationCorrectionIntelligence() obj {
	return obj{
		"claims": []any{obj{
			"id":                conversationCorrectionClaimID,
			"kind":              "risk",
			"value":             "Security review may delay renewal.",
			"exactQuote":        "We are concerned security could delay the renewal.",
			"startMs":           12000,
			"endMs":             16000,
			"speakerId":         "anonymous:remote-channel",
			"speakerLabel":      conversationCorrectionValue,
			"speakerConfidence": 1,
			"confidence":        0.72,
			"captureCaveats":    []any{"Remote channel may contain multiple speakers."},
			"material":          true,
			"stateDimension":    "risk",
			"observationId":     conversationCorrectionObservationID,
		}},
		"reviewItems": []any{obj{
			"id":             conversationCorrectionClaimReviewID(),
			"kind":           "claim",
			"label":          "Low-confidence material claim",
			"currentValue":   "Security review may delay renewal.",
			"confidence":     0.72,
			"observationId":  conversationCorrectionObservationID,
			"claimId":        conversationCorrectionClaimID,
			"stateDimension": "risk",
			"exactQuote":     "We are concerned security could delay the renewal.",
		}},
		"governanceReceipts": []any{},
		"delta": obj{
			"fromVersion":          0,
			"toVersion":            4,
			"changes":              []any{},
			"uncertainClaimIds":    []any{conversationCorrectionClaimID},
			"contradictions":       []any{},
			"recommendationReason": conversationCorrectionStateReason,
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
			"policyVersion":    "policy:ab12",
			"sourceLayerIds":   []any{"workspace:default"},
			"resolvedAt":       "2026-07-31T14:00:00Z",
		},
		"governanceDecisions":    []any{},
		"deletionReceipts":       []any{},
		"observationPageHasMore": false,
	}
}
