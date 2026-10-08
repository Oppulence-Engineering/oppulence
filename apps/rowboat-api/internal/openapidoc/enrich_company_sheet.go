package openapidoc

// The company sheet loads one company from All companies. The directory sample
// is Acme; opening it sends only that id. Counts on the company match the
// directory. Email threads are a separate list the sheet counts, and Acme has
// none.

const (
	openedCompanyID            = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyParticipantID = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyPersonID      = "aa8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyObservationID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openedCompanyHash          = "sha256:61dd3377d3854c6f9c104af050ad3f0f87ff6cdd1c3458c17541cbc1e87fc887"
	openedCompanyReason        = "Champion engagement declined after pricing. Security review has no meeting. CRM stage is evaluation."
	openedCompanyTouchedAt     = "2026-07-25T15:00:00Z"
	openedCompanyProjectedAt   = "2026-07-25T16:00:00Z"
	// The sheet's Description row prints this sentence.
	openedCompanyDescription = "Builds AI infrastructure for customer operations."
	// The sheet Email row prints this address. With it missing the row says Not filled in.
	openedCompanyEmail = "avery@acme.com"
	// The sheet Risks list prints this sentence. An empty list says None recorded.
	openedCompanyRisk = "Security review has no owner."
	// The sheet LinkedIn row opens this page. Without a saved page it searches for the company name.
	openedCompanyLinkedInURL = "https://www.linkedin.com/company/acme"
	// The sheet Category row prints this name. An empty list says Not filled in.
	openedCompanyCategory = "Artificial intelligence"
	// The sheet Milestones list prints this sentence. An empty list says None recorded.
	openedCompanyMilestone = "Proposal shared."
	// The sheet Source row opens this page. The link says Check the source.
	openedCompanySourceURL = "https://acme.example/team"
	openedCompanyTitle     = "VP Operations"
	// The sheet counts eight account details. Four have a source. With no
	// completed sync, the stored completeness sentence is this one, and the
	// sheet prints "4 account details still need a source."
	openedCompanyGapExplanation = "No source connection has completed its first useful sync."
)

const openedCompanyOperationDescription = "The company sheet loads one company. The request sends that company id and no query. Acme comes back with its people, email threads, and promises. The description says it builds AI infrastructure for customer operations. Each detail came from a connected source. The email is avery@acme.com. The risk is that the security review has no owner. The LinkedIn row opens the Acme company page. The category is Artificial intelligence. The milestone is that the proposal was shared. The headquarters is San Francisco, California, United States. The source row opens the Acme team page. Avery Chen's title is VP Operations. The sheet says 4 account details still need a source."

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
			"id":                    openedCompanyID,
			"kind":                  "company",
			"displayName":           "Acme",
			"accountDomain":         "acme.com",
			"status":                "active",
			"lastTouchAt":           openedCompanyTouchedAt,
			"peopleCount":           1,
			"emailThreadCount":      0,
			"commitmentCount":       0,
			"companyDescription":    openedCompanyDescription,
			"companyEnrichmentData": companyProfileFactsExample(),
			"companyEnrichmentRefs": obj{"headquarters": []any{openedCompanySourceURL}},
			"lifecycle":             "evaluation",
			"linkedinUrl":           openedCompanyLinkedInURL,
			"engagement":            "declining",
			"sentiment":             "unknown",
			"health":                "needs_attention",
			"stateReason":           openedCompanyReason,
			"stateVersion":          1,
			"stateHash":             openedCompanyHash,
			"projectorVersion":      2,
			"projectedAt":           openedCompanyProjectedAt,
			"lastChangedAt":         openedCompanyProjectedAt,
			"risks":                 []any{openedCompanyRisk},
			"milestones":            []any{openedCompanyMilestone},
			"resourceRefs":          empty,
			"categories":            []any{openedCompanyCategory},
			"primaryEmail":          openedCompanyEmail,
		},
		"actions":         empty,
		"recommendations": empty,
		"participants": []any{obj{
			"id":           openedCompanyParticipantID,
			"displayName":  "Avery Chen",
			"email":        openedCompanyEmail,
			"role":         "champion",
			"title":        openedCompanyTitle,
			"active":       true,
			"externalRefs": empty,
			"personId":     openedCompanyPersonID,
			"person":       openedCompanyPerson(),
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
			"lifecycle":   openedCompanyDimension("lifecycle", "evaluation"),
			"health":      openedCompanyDimension("health", "needs_attention"),
			"engagement":  openedCompanyDimension("engagement", "declining"),
			"sentiment":   openedCompanyDimension("sentiment", "unknown"),
			"summary":     openedCompanyMissingDimension("summary", ""),
			"next_action": openedCompanyMissingDimension("next_action", ""),
			"risk":        openedCompanyMissingDimension("risk", empty),
			"milestone":   openedCompanyMissingDimension("milestone", empty),
		},
		"completeness": obj{
			"status":                    "partial",
			"explanation":               openedCompanyGapExplanation,
			"externalActionSafe":        false,
			"unresolvedIdentityCount":   0,
			"missingMaterialDimensions": []any{"milestone", "next_action", "risk", "summary"},
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

func openedCompanyMissingDimension(dimension string, value any) obj {
	return obj{
		"dimension":     dimension,
		"value":         value,
		"supported":     false,
		"fresh":         true,
		"missingReason": "No active assertion supports this value at the response asOf boundary.",
		"evidence":      []any{},
	}
}

func openedCompanyDimension(dimension, value string) obj {
	return obj{
		"dimension": dimension,
		"value":     value,
		"supported": true,
		"fresh":     true,
		// The sheet badge says "From a connected source". A supported detail with no authority says "Not filled in yet".
		"authority": "source_fact",
		"evidence": []any{obj{
			"observationId": openedCompanyObservationID,
			"source":        "hubspot",
			"observedAt":    openedCompanyTouchedAt,
			"evidencePath":  "/v1/relationships/" + openedCompanyID + "/evidence/" + openedCompanyObservationID,
			"contentHash":   "sha256:ab12",
		}},
	}
}

func openedCompanyPerson() obj {
	return obj{
		"id":               openedCompanyPersonID,
		"displayName":      "Avery Chen",
		"primaryEmail":     "avery@acme.com",
		"title":            "VP Operations",
		"orgName":          "Acme",
		"orgDomain":        "acme.com",
		"seniority":        "vp",
		"location":         "San Francisco",
		"employmentStatus": "active",
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
