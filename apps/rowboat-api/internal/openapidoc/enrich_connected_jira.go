package openapidoc

const connectedJiraDescription = "Connected lists the Jira account linked from More products."

const connectedJiraReady = "Jira is connected."

const connectedJiraConnectionID = "ca_8b8dfa9ba7b246ea982c622a914c00e5"

const connectedJiraAt = "2026-07-15T16:00:00Z"

func connectedJiraOperation() obj {
	return operation("Connectors", "Connected", connectedJiraDescription, "listComposioConnections", bearer(), nil, nil, connectedJiraResponses())
}

func connectedJiraAccountSchema() obj {
	return objectSchema("One linked product account.", obj{
		"id":        stringSchema("Connection id.", connectedJiraConnectionID),
		"toolkit":   stringSchema("Product id.", "jira"),
		"status":    stringSchema("ACTIVE shows Connected on the card.", "ACTIVE"),
		"createdAt": stringSchema("When the account was linked.", connectedJiraAt, obj{"format": "date-time"}),
	}, "id", "toolkit", "status")
}

func connectedJiraResponseSchema() obj {
	return objectSchema("Accounts linked from More products.", obj{
		"connections": arraySchema("Linked accounts.", connectedJiraAccountSchema()),
	}, "connections")
}

func connectedJiraResponseExample() obj {
	return obj{"connections": []any{obj{
		"id":        connectedJiraConnectionID,
		"toolkit":   "jira",
		"status":    "ACTIVE",
		"createdAt": connectedJiraAt,
	}}}
}

func connectedJiraResponses() obj {
	return obj{
		"200": jsonResponse(connectedJiraReady, connectedJiraResponseSchema(), connectedJiraResponseExample()),
		"401": responseRef("401"),
		"502": responseRef("502"),
		"503": responseRef("503"),
	}
}
