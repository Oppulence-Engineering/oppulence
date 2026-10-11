package openapidoc

const reviewDescription = "Review records that this attention item was reviewed. It leaves the open queue."

const (
	reviewAttentionID = "da8dfa9b-a7b2-46ea-982c-622a914c00e5"
	reviewReason      = "Reviewed from the portfolio attention queue."
)

func reviewParams() []any {
	return []any{obj{
		"name":        "attentionId",
		"in":          "path",
		"required":    true,
		"description": "Attention item id.",
		"example":     reviewAttentionID,
		"schema":      uuidSchema("Attention item id.", reviewAttentionID),
	}}
}

// reviewedAttention is the item Review returns. The detector stores the
// relationship projector version, not the column default of 1.
func reviewedAttention() obj {
	return obj{
		"id":                       reviewAttentionID,
		"version":                  2,
		"relationshipId":           "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"relationshipName":         "Acme",
		"reasonCode":               "overdue_commitment",
		"explanation":              "A confirmed promise is overdue by two days.",
		"triggeringObjectRef":      "commitment:8b8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"evidenceRefs":             []any{"revenue-evidence:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
		"urgencyBand":              "high",
		"rankScore":                76,
		"rankFactors":              obj{"confirmed_commitment": 70, "overdue_days": 6},
		"sourceRequirements":       []any{"google"},
		"status":                   "acknowledged",
		"stateReason":              reviewReason,
		"detectorVersion":          1,
		"projectorVersion":         2,
		"relationshipStateVersion": 4,
		"acknowledgedBy":           "9c8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"acknowledgedAt":           "2026-07-31T14:00:00Z",
		"createdAt":                "2026-07-29T14:00:00Z",
		"updatedAt":                "2026-07-31T14:00:00Z",
	}
}
