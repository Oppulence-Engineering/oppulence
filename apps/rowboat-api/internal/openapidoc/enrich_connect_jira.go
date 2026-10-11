package openapidoc

const connectJiraDescription = "Connect opens the Jira sign-in page. The account is linked only after that page is finished."

const connectJiraRequestDescription = "The product Connect opens."

const connectJiraReady = "The Jira sign-in page is ready."

const connectJiraToolkit = "jira"

const connectJiraConnectionID = "ca_8b8dfa9ba7b246ea982c622a914c00e5"

const connectJiraRedirectURL = "https://connect.composio.dev/link/lk_8b8dfa9b"

const connectJiraExpiresAt = "2026-07-15T16:05:00Z"

func connectJiraOperation() obj {
	return operation("Connectors", "Connect", connectJiraDescription, "startComposioConnection", bearer(), nil, jsonRequest(connectJiraRequestDescription, objectSchema("Product to connect.", obj{
		"toolkit": stringSchema("Product name.", connectJiraToolkit),
	}, "toolkit"), connectJiraRequestExample()), connectJiraResponses())
}

func connectJiraRequestExample() obj {
	return obj{"toolkit": connectJiraToolkit}
}

func connectJiraResponseSchema() obj {
	return objectSchema("Hosted sign-in page for the product.", obj{
		"connectionId": stringSchema("The account this page will link.", connectJiraConnectionID),
		"redirectUrl":  stringSchema("Address of the sign-in page.", connectJiraRedirectURL),
		"expiresAt":    stringSchema("When the sign-in page stops working.", connectJiraExpiresAt, obj{"format": "date-time"}),
	}, "connectionId", "redirectUrl")
}

func connectJiraResponseExample() obj {
	return obj{
		"connectionId": connectJiraConnectionID,
		"redirectUrl":  connectJiraRedirectURL,
		"expiresAt":    connectJiraExpiresAt,
	}
}

func connectJiraResponses() obj {
	return obj{
		"200": jsonResponse(connectJiraReady, connectJiraResponseSchema(), connectJiraResponseExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"502": responseRef("502"),
		"503": responseRef("503"),
	}
}
