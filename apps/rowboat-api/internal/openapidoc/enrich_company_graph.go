package openapidoc

const companyGraphDescription = "Company graph loads the portfolio. The request asks for the portfolio at depth 2 and does not ask for an earlier moment or an older page. This workspace has no company, so the graph is empty."

func companyGraphPath() obj {
	scope := obj{"name": "scope", "in": "query", "required": false, "description": "portfolio is the whole workspace. Company graph asks for the portfolio.", "example": "portfolio", "schema": obj{"type": "string", "enum": []string{"portfolio", "relationship"}, "default": "portfolio", "example": "portfolio"}}
	depth := obj{"name": "depth", "in": "query", "required": false, "description": "How far the graph expands (1-3). Company graph asks for 2.", "example": 2, "schema": obj{"type": "integer", "minimum": 1, "maximum": 3, "default": 2, "example": 2}}
	return obj{"get": operation(
		"Relationship Intelligence",
		"Company graph",
		companyGraphDescription,
		"getRelationshipGraph",
		bearer(),
		[]any{
			scope,
			obj{"name": "relationshipId", "in": "query", "required": false, "description": "One company. Company graph does not send this for the portfolio.", "schema": obj{"type": "string", "format": "uuid"}},
			depth,
			obj{"name": "asOf", "in": "query", "required": false, "description": "An earlier moment. Company graph does not send this on the first load.", "schema": obj{"type": "string", "format": "date-time"}},
			obj{"name": "offset", "in": "query", "required": false, "description": "How many companies to skip. Company graph does not send this on the first page.", "schema": obj{"type": "integer", "minimum": 0}},
			obj{"name": "observationOffset", "in": "query", "required": false, "description": "How many conversations to skip. Company graph does not send this on the first page.", "schema": obj{"type": "integer", "minimum": 0}},
		},
		nil,
		obj{
			"200": jsonResponse("Empty company graph.", ref("RelationshipGraph"), companyGraphPage()),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)}
}

func companyGraphPage() obj {
	return obj{
		"asOf":            "2026-08-01T14:00:00Z",
		"contractVersion": "2026-08-01",
		"depth":           2,
		"edges":           []any{},
		"generatedAt":     "2026-08-01T14:00:00Z",
		"historical":      false,
		"nodes":           []any{},
		"permissions": obj{
			"canApprove":    true,
			"canContribute": true,
			"canExecute":    true,
			"canSaveViews":  true,
			"canView":       true,
		},
		"scope": "portfolio",
	}
}
