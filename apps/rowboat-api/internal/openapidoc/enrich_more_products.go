package openapidoc

const moreProductsDescription = "More products lists Jira and Asana. Gmail, Google Calendar, and HubSpot stay on their own cards."

const moreProductsReady = "Jira and Asana are available to connect."

func moreProductsOperation() obj {
	return operation("Connectors", "More products", moreProductsDescription, "listComposioToolkits", bearer(), nil, nil, moreProductsResponses())
}

func moreProductsToolkitSchema() obj {
	return objectSchema("One product on More products.", obj{
		"slug":        stringSchema("Product id.", "jira"),
		"name":        stringSchema("Name on the card.", "Jira"),
		"managedAuth": boolSchema("This product can be connected from More products.", true),
	}, "slug", "name", "managedAuth")
}

func moreProductsResponseSchema() obj {
	return objectSchema("Tools that can be connected from More products.", obj{
		"toolkits": arraySchema("Products offered here.", moreProductsToolkitSchema()),
	}, "toolkits")
}

func moreProductsResponseExample() obj {
	return obj{"toolkits": []any{
		obj{"slug": "jira", "name": "Jira", "managedAuth": true},
		obj{"slug": "asana", "name": "Asana", "managedAuth": true},
	}}
}

func moreProductsResponses() obj {
	return obj{
		"200": jsonResponse(moreProductsReady, moreProductsResponseSchema(), moreProductsResponseExample()),
		"401": responseRef("401"),
		"502": responseRef("502"),
		"503": responseRef("503"),
	}
}
