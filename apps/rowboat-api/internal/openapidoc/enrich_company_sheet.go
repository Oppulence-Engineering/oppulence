package openapidoc

// The company sheet loads one company from All companies. The directory sample
// is Acme; opening it sends only that id. Counts on the company match the
// directory. Email threads are a separate list the sheet counts, and Acme has
// none.

const (
	openedCompanyID            = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyParticipantID = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyObservationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyHash          = "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887"
	openedCompanyReason        = "Champion engagement declined after pricing. Security review has no meeting. CRM stage is evaluation."
	openedCompanyTouchedAt     = "2026-07-25T15:00:00Z"
	openedCompanyProjectedAt   = "2026-07-25T16:00:00Z"
	// The sheet Milestones list prints this sentence. An empty list says None recorded.
	openedCompanyMilestone = "Proposal shared."
)

func openedCompanyParams() []any {
	return []any{obj{
		"name":        "relationshipId",
		"in":          "path",
		"required":    true,
		"description": "Company the sheet opens.",
		"example":     openedCompanyID,
		"schema":      obj{"type": "string", "format": "uuid", "example": openedCompanyID},
	}}
}

func openedCompanySheetExample() obj {
	empty := []any{}
	return obj{
		"relationship": obj{
			"id":               openedCompanyID,
			"kind":             "company",
			"displayName":      "Acme",
			"accountDomain":    "acme.com",
			"status":           "active",
			"lastTouchAt":      openedCompanyTouchedAt,
			"peopleCount":      1,
			"emailThreadCount": 0,
			"commitmentCount":  0,
			"lifecycle":        "evaluation",
			"engagement":       "declining",
			"sentiment":        "unknown",
			"health":           "needs_attention",
			"stateReason":      openedCompanyReason,
			"stateVersion":     1,
			"stateHash":        openedCompanyHash,
			"projectorVersion": 2,
			"projectedAt":      openedCompanyProjectedAt,
			"lastChangedAt":    openedCompanyProjectedAt,
			"risks":            empty,
			"milestones":       []any{openedCompanyMilestone},
			"resourceRefs":     empty,
			"categories":       empty,
		},
		"actions":         empty,
		"recommendations": empty,
		"participants": []any{obj{
			"id":           openedCompanyParticipantID,
			"displayName":  "Avery Chen",
			"email":        "avery@acme.com",
			"role":         "champion",
			"active":       true,
			"externalRefs": empty,
		}},
		"emailThreads":           empty,
		"commitments":            empty,
		"commitmentDependencies": empty,
		"intelligence":           openedCompanyIntelligence(empty),
		"missionControl":         openedCompanyMissionControl(empty),
	}
}

func openedCompanyIntelligence(empty []any) obj {
	return obj{
		"claims":             empty,
		"reviewItems":        empty,
		"governanceReceipts": empty,
		"delta": obj{
			"fromVersion":       0,
			"toVersion":         1,
			"changes":           empty,
			"uncertainClaimIds": empty,
			"contradictions":    empty,
		},
		"liveCues":                  empty,
		"contradictionCases":        empty,
		"recoveryEvaluations":       empty,
		"recommendationEvaluations": empty,
		"mutualActionPlans":         empty,
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
			"resolvedAt":       openedCompanyProjectedAt,
		},
		"governanceDecisions":    empty,
		"deletionReceipts":       empty,
		"observationPageHasMore": false,
	}
}

func openedCompanyMissionControl(empty []any) obj {
	return obj{
		"contractVersion":              "tfa-r1.1-2026-08-26",
		"aggregateHash":                "sha256:cd34",
		"asOf":                         openedCompanyProjectedAt,
		"stateVersion":                 1,
		"stateHash":                    openedCompanyHash,
		"projectorVersion":             2,
		"detectorVersion":              1,
		"previousReviewedStateVersion": 0,
		"changedSinceReview":           false,
		"changes":                      empty,
		"evidence": obj{
			"lifecycle":  openedCompanyDimension("lifecycle", "evaluation"),
			"health":     openedCompanyDimension("health", "needs_attention"),
			"engagement": openedCompanyDimension("engagement", "declining"),
			"sentiment":  openedCompanyDimension("sentiment", "unknown"),
		},
		"completeness": obj{
			"status":                    "partial",
			"explanation":               openedCompanyReason,
			"externalActionSafe":        false,
			"unresolvedIdentityCount":   0,
			"missingMaterialDimensions": empty,
			"sources":                   empty,
		},
		"pending": obj{
			"corrections":    0,
			"identityReview": 0,
			"approval":       0,
			"execution":      0,
			"reconciliation": 0,
		},
		"capabilities": obj{},
	}
}

func openedCompanyDimension(dimension, value string) obj {
	return obj{
		"dimension": dimension,
		"value":     value,
		"supported": true,
		"fresh":     true,
		"evidence": []any{obj{
			"observationId": openedCompanyObservationID,
			"source":        "hubspot",
			"observedAt":    openedCompanyTouchedAt,
			"evidencePath":  "/v1/relationships/" + openedCompanyID + "/evidence/" + openedCompanyObservationID,
			"contentHash":   "sha256:ab12",
		}},
	}
}

func openedCompanyEmailThreadSchema() obj {
	return objectSchema("Email thread the company sheet lists.", obj{
		"id":                obj{"type": "string", "description": "Thread id."},
		"subject":           obj{"type": "string", "description": "Subject."},
		"counterpartyEmail": obj{"type": "string", "description": "Other person on the thread."},
		"replyState":        stringEnum("Whether a reply is owed.", "quiet", "needs_reply", "awaiting_reply", "quiet"),
		"lastDirection":     stringEnum("Who sent the latest message.", "inbound", "inbound", "outbound"),
		"lastActivityAt":    obj{"type": "string", "format": "date-time", "description": "Latest message time."},
		"messageCount":      obj{"type": "integer", "description": "Messages on the thread."},
	}, "id", "replyState", "messageCount")
}
