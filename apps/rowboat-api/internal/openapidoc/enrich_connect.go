package openapidoc

const connectDescription = "Connect starts sign-in for Canvas. It sends the required permissions and the address that brings you back to Connections."

const connectConnectorName = "canvas"

const connectReturnAddress = "https://oppulence.io/api/connectors/oauth/callback"

const connectRequestDescription = "Required Canvas permissions and the address that brings you back to Connections."

func connectParams() []any {
	return []any{obj{
		"name":        "name",
		"in":          "path",
		"required":    true,
		"description": "Connection name.",
		"example":     connectConnectorName,
		"schema":      stringSchema("Connection name.", connectConnectorName),
	}}
}

func connectRequestExample() obj {
	return obj{
		"requestedScopes": []any{"canvas:invoices.read", "canvas:customers.read"},
		"redirectTarget":  connectReturnAddress,
	}
}

func connectResponses() obj {
	return obj{
		"200": jsonResponse("Connector authorize URL.", ref("ConnectionStartResponse"), obj{
			"authorization_url": "https://oauth.solomon-ai.co/oauth2/auth?client_id=rowboat-api&state=...",
			"authorize_url":     "https://oauth.solomon-ai.co/oauth2/auth?client_id=rowboat-api&state=...",
			"expires_at":        "2026-08-27T20:20:00Z",
		}),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
		"404": responseRef("404"),
		"409": responseRef("409"),
		"429": responseRef("429"),
		"500": responseRef("500"),
		"503": responseRef("503"),
	}
}
