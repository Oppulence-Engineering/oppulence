package openapidoc

const correctDetailDescription = "Correct a detail replaces one field on this company. It sends the field, the new value, and why, and the company comes back with that value."

const (
	correctDetailRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	correctDetailReason       = "The review happened yesterday."
	correctDetailClock        = "2026-07-26T16:00:00Z"
)

func correctDetailRequest() obj {
	return obj{
		"dimension": "health",
		"value":     "healthy",
		"reason":    correctDetailReason,
	}
}

func correctDetailCompany() obj {
	return obj{
		"id":               correctDetailRelationship,
		"kind":             "company",
		"displayName":      "Acme",
		"status":           "active",
		"lifecycle":        "evaluation",
		"engagement":       "declining",
		"sentiment":        "mixed",
		"health":           "healthy",
		"stateReason":      correctDetailReason,
		"stateVersion":     5,
		"stateHash":        "sha256:ab12cd34",
		"projectorVersion": 2,
		"projectedAt":      correctDetailClock,
		"lastChangedAt":    correctDetailClock,
		"peopleCount":      0,
		"emailThreadCount": 0,
		"commitmentCount":  0,
		"risks":            []any{},
		"milestones":       []any{},
		"resourceRefs":     []any{},
		"categories":       []any{},
	}
}

func correctDetailOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Correct a detail",
		correctDetailDescription,
		"correctRelationship",
		bearer(),
		[]any{
			pathParam("relationshipId", "Company this detail belongs to.", uuidSchema("Company id.", correctDetailRelationship)),
		},
		jsonRequest("Correction.", objectSchema("Company detail correction.", obj{
			"dimension":             stringEnum("The detail this form corrects.", "health", "lifecycle", "engagement", "sentiment", "health", "summary", "next_action", "risk", "milestone"),
			"value":                 stringSchema("The value you chose.", "healthy"),
			"reason":                stringSchema("Why this is wrong.", correctDetailReason),
			"supersedesAssertionId": stringSchema("Earlier evidence on this same detail that this correction replaces.", correctDetailRelationship, obj{"format": "uuid"}),
			"validTo":               stringSchema("When a temporary correction stops applying.", "2026-08-31T17:00:00Z", obj{"format": "date-time"}, nullable()),
		}, "dimension", "value", "reason"), correctDetailRequest()),
		obj{
			"201": jsonResponse("Company after the detail is corrected.", ref("RevenueRelationship"), correctDetailCompany()),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)
}
