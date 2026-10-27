package openapidoc

const newPersonDescription = "New person saves the name and email. The person comes back with that name, and People can open them."

const (
	newPersonID     = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	newPersonName   = "Jordan Buyer"
	newPersonEmail  = "buyer@example.com"
	newPersonDomain = "example.com"
)

func newPersonRequest() obj {
	return obj{
		"kind":          "person",
		"displayName":   newPersonName,
		"primaryEmail":  newPersonEmail,
		"accountDomain": newPersonDomain,
	}
}

func newPerson() obj {
	return obj{
		"id":               newPersonID,
		"kind":             "person",
		"displayName":      newPersonName,
		"primaryEmail":     newPersonEmail,
		"accountDomain":    newPersonDomain,
		"status":           "active",
		"lifecycle":        "prospect",
		"engagement":       "unknown",
		"sentiment":        "unknown",
		"health":           "unknown",
		"stateVersion":     0,
		"projectorVersion": 1,
		"peopleCount":      0,
		"emailThreadCount": 0,
		"commitmentCount":  0,
		"risks":            []any{},
		"milestones":       []any{},
		"resourceRefs":     []any{},
		"categories":       []any{},
	}
}

func newPersonOperation() obj {
	return operation("Relationship Intelligence", "New person", newPersonDescription, "createRelationship", bearer(), nil, jsonRequest("Name and email.", objectSchema("Person to save.", obj{
		"kind":          stringEnum("Person or company.", "person", "person", "company", "customer", "opportunity", "referral", "partner"),
		"displayName":   stringSchema("Full name.", newPersonName),
		"primaryEmail":  stringSchema("Email address.", newPersonEmail),
		"accountDomain": stringSchema("Domain from the email address.", newPersonDomain),
		"summary":       stringSchema("Notes.", "Warm lead from the April demo."),
	}, "kind", "displayName"), newPersonRequest()), obj{
		"201": jsonResponse("The person New person saves.", ref("RevenueRelationship"), newPerson()),
		"400": responseRef("400"),
		"401": responseRef("401"),
	})
}
