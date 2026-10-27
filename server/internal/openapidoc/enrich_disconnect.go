package openapidoc

const disconnectDescription = "Disconnect removes the HubSpot connection. Confirm sends no body."

const disconnectConnectorName = "hubspot"

const disconnectRemoved = "The HubSpot connection is removed."

func disconnectParams() []any {
	return []any{obj{
		"name":        "name",
		"in":          "path",
		"required":    true,
		"description": "Connection name.",
		"example":     disconnectConnectorName,
		"schema":      stringSchema("Connection name.", disconnectConnectorName),
	}}
}

func disconnectResponses() obj {
	return obj{
		"204": obj{"description": disconnectRemoved},
		"401": responseRef("401"),
		"429": responseRef("429"),
		"500": responseRef("500"),
		"503": responseRef("503"),
	}
}
