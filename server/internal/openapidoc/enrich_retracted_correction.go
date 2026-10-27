package openapidoc

const retractedCorrectionDescription = "Confirm retraction ends a correction on this company. It sends the reason, and the company comes back without that correction."

const (
	retractedCorrectionRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	retractedCorrectionAssertion    = "7c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	retractedCorrectionReason       = "The correction was entered against the wrong customer call."
	retractedCorrectionClock        = "2026-07-25T16:00:00Z"
)

func retractedCorrectionRequest() obj {
	return obj{"reason": retractedCorrectionReason}
}

func retractedCorrectionCompany() obj {
	return obj{
		"id":               retractedCorrectionRelationship,
		"kind":             "company",
		"displayName":      "Acme",
		"status":           "active",
		"lifecycle":        "evaluation",
		"engagement":       "declining",
		"sentiment":        "mixed",
		"health":           "needs_attention",
		"stateReason":      "Security review was promised, but no owner or meeting exists.",
		"stateVersion":     5,
		"stateHash":        "sha256:ab12cd34",
		"projectorVersion": 2,
		"projectedAt":      retractedCorrectionClock,
		"lastChangedAt":    retractedCorrectionClock,
		"peopleCount":      0,
		"emailThreadCount": 0,
		"commitmentCount":  0,
		"risks":            []any{},
		"milestones":       []any{},
		"resourceRefs":     []any{},
		"categories":       []any{},
	}
}

func retractedCorrectionOperation() obj {
	return operation("Relationship Intelligence", "Confirm retraction", retractedCorrectionDescription, "retractRelationshipAssertion", bearer(), []any{
		pathParam("relationshipId", "Company this correction belongs to.", uuidSchema("Company id.", retractedCorrectionRelationship)),
		pathParam("assertionId", "Correction this button ends.", uuidSchema("Correction id.", retractedCorrectionAssertion)),
	}, jsonRequest("Retraction.", objectSchema("Correction retraction.", obj{
		"reason": stringSchema("Why this correction is no longer valid.", retractedCorrectionReason),
	}, "reason"), retractedCorrectionRequest()), obj{
		"200": jsonResponse("Company after the correction ends.", ref("RevenueRelationship"), retractedCorrectionCompany()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})
}
