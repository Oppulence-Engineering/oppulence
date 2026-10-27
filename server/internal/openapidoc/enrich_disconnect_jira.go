package openapidoc

const disconnectJiraDescription = "Disconnect Jira removes that connection. The request sends no body."

const disconnectJiraRemoved = "The Jira connection is removed."

const disconnectJiraConnectionID = "ca_8b8dfa9ba7b246ea982c622a914c00e5"

func disconnectJiraOperation() obj {
	return operation("Connectors", "Disconnect Jira", disconnectJiraDescription, "deleteComposioConnection", bearer(), disconnectJiraParams(), nil, disconnectJiraResponses())
}

func disconnectJiraParams() []any {
	return []any{obj{
		"name":        "connectionID",
		"in":          "path",
		"required":    true,
		"description": "Connection id.",
		"example":     disconnectJiraConnectionID,
		"schema":      stringSchema("Connection id.", disconnectJiraConnectionID),
	}}
}

func disconnectJiraResponses() obj {
	return obj{
		"204": obj{"description": disconnectJiraRemoved},
		"401": responseRef("401"),
		"404": responseRef("404"),
		"502": responseRef("502"),
		"503": responseRef("503"),
	}
}
