package openapidoc

const useThisValueDescription = "Use this value closes a disagreement on this company. It sends the evidence you picked and why, and the company comes back with that value current."

const (
	useThisValueRelationship   = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValueAssertion      = "7b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValueOtherAssertion = "7d8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValueResolution     = "7e8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValueCaseID         = "contradiction:d109218617da1fbea89bb5d6"
	useThisValueReason         = "You chose the value from Gmail."
	useThisValueStateReason    = "Security review was promised, but no owner or meeting exists."
	useThisValueClock          = "2026-07-25T16:00:00Z"
	useThisValueOpened         = "2026-07-20T16:00:00Z"
	useThisValueEarlier        = "2026-07-10T16:00:00Z"
	useThisValueEvidence       = "4b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValueMeeting        = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	useThisValuePolicyVersion  = "policy:9373cc30008dcb712c236fc9"
)

func useThisValueRequest() obj {
	return obj{
		"selectedAssertionId": useThisValueAssertion,
		"reason":              useThisValueReason,
	}
}

func useThisValueCompany() obj {
	return obj{
		"id":               useThisValueRelationship,
		"kind":             "company",
		"displayName":      "Acme",
		"status":           "active",
		"lifecycle":        "evaluation",
		"engagement":       "declining",
		"sentiment":        "mixed",
		"health":           "needs_attention",
		"stateReason":      useThisValueStateReason,
		"stateVersion":     5,
		"stateHash":        "sha256:ab12cd34",
		"projectorVersion": 2,
		"projectedAt":      useThisValueClock,
		"lastChangedAt":    useThisValueClock,
		"peopleCount":      0,
		"emailThreadCount": 0,
		"commitmentCount":  0,
		"risks":            []any{},
		"milestones":       []any{},
		"resourceRefs":     []any{},
		"categories":       []any{},
	}
}

func useThisValueSide(assertionID, sourceType, source, value, when, evidence string, confidence float64) obj {
	return obj{
		"assertionId":        assertionID,
		"sourceType":         sourceType,
		"source":             source,
		"value":              obj{"kind": "enum", "value": value},
		"validFrom":          when,
		"observedAt":         when,
		"evidenceRefs":       []any{"relationship-observation:" + evidence},
		"identityConfidence": confidence,
	}
}

func useThisValueCase() obj {
	return obj{
		"caseId":         useThisValueCaseID,
		"relationshipId": useThisValueRelationship,
		"subjectRef":     useThisValueRelationship,
		"dimension":      "health",
		"status":         "user_resolved",
		"reason":         useThisValueReason,
		"sides": []any{
			useThisValueSide(useThisValueAssertion, "source_fact", "gmail", "needs_attention", useThisValueOpened, useThisValueEvidence, 1),
			useThisValueSide(useThisValueOtherAssertion, "ai_inference", "meeting", "healthy", useThisValueEarlier, useThisValueMeeting, 0.5),
		},
		"openedAt":              useThisValueOpened,
		"resolvedAt":            useThisValueClock,
		"resolutionAssertionId": useThisValueResolution,
	}
}

func useThisValueIntelligence() obj {
	return obj{
		"claims":             []any{},
		"reviewItems":        []any{},
		"governanceReceipts": []any{},
		"delta": obj{
			"fromVersion": 4,
			"toVersion":   5,
			"changes": []any{obj{
				"dimension":    "health",
				"before":       "healthy",
				"after":        "needs_attention",
				"reason":       useThisValueStateReason,
				"assertionIds": []any{useThisValueResolution},
			}},
			"uncertainClaimIds": []any{},
			"contradictions": []any{obj{
				"dimension":               "health",
				"currentValue":            "needs_attention",
				"contradictedValue":       "healthy",
				"currentAssertionId":      useThisValueAssertion,
				"contradictedAssertionId": useThisValueOtherAssertion,
			}},
			"recommendationReason": useThisValueStateReason,
		},
		"liveCues":                  []any{},
		"contradictionCases":        []any{useThisValueCase()},
		"recoveryEvaluations":       []any{},
		"recommendationEvaluations": []any{},
		"mutualActionPlans":         []any{},
		"effectivePolicy": obj{
			"capture":          "require_consent",
			"modelRoute":       "hosted_allowed",
			"publishEvidence":  true,
			"externalShare":    true,
			"retentionDays":    30,
			"redactionClasses": []any{"credentials", "financial", "health", "personal_identifier"},
			"legalHold":        false,
			"policyVersion":    useThisValuePolicyVersion,
			"sourceLayerIds":   []any{"builtin:conversation-policy-v1"},
			"resolvedAt":       useThisValueClock,
		},
		"governanceDecisions": []any{},
		"deletionReceipts":    []any{},
	}
}

func useThisValueResponse() obj {
	return obj{
		"relationship": useThisValueCompany(),
		"intelligence": useThisValueIntelligence(),
	}
}

func useThisValueOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Use this value",
		useThisValueDescription,
		"resolveRelationshipContradiction",
		bearer(),
		[]any{
			pathParam("relationshipId", "Company this disagreement belongs to.", uuidSchema("Company id.", useThisValueRelationship)),
			pathParam("caseId", "Disagreement this button closes.", stringSchema("Disagreement id.", useThisValueCaseID)),
		},
		jsonRequest("Choice.", objectSchema("The value you picked.", obj{
			"selectedAssertionId": uuidSchema("Selected assertion id.", useThisValueAssertion),
			"reason":              stringSchema("Why this value is current.", useThisValueReason),
		}, "selectedAssertionId"), useThisValueRequest()),
		obj{
			"201": jsonResponse("Company after you pick the current value.", objectSchema("Company after the chosen value is current.", obj{
				"relationship": ref("RevenueRelationship"),
				"intelligence": ref("RelationshipIntelligence"),
			}, "relationship", "intelligence"), useThisValueResponse()),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
			"409": responseRef("409"),
		},
	)
}
