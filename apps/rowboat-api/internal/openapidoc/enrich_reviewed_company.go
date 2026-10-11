package openapidoc

// Mark as reviewed sends the company id plus the state version and hash that
// company is showing. The relationship record publishes version 4 and the
// projector's state hash for that sample.

const (
	reviewedCompanyID         = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reviewedCompanyHash       = documentedRelationshipStateHash
	reviewedCompanyVersion    = 4
	reviewedAcknowledgementID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reviewedCompanyAt         = "2026-07-31T14:00:00Z"
)

func reviewedCompanyParams() []any {
	return []any{obj{
		"name":        "relationshipId",
		"in":          "path",
		"required":    true,
		"description": "Company marked reviewed.",
		"example":     reviewedCompanyID,
		"schema":      obj{"type": "string", "format": "uuid", "example": reviewedCompanyID},
	}}
}

func reviewedCompanyRequest() obj {
	return obj{
		"stateVersion": reviewedCompanyVersion,
		"stateHash":    reviewedCompanyHash,
	}
}

func reviewedCompanyResponse() obj {
	response := reviewedCompanyRequest()
	response["id"] = reviewedAcknowledgementID
	response["acknowledgedAt"] = reviewedCompanyAt
	return response
}
