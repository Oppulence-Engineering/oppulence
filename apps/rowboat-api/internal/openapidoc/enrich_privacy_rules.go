package openapidoc

const privacyAddressesDescription = "Protected or blocked addresses loads this workspace's list. The request sends no filter. This workspace has no protected or blocked address, so the list is empty."

func addPrivacyRulePaths(paths obj) {
	mergePath(paths, "/v1/revenue-workspaces/current/communication-privacy-rules", obj{"get": operation("Connectors", "Protected or blocked addresses", privacyAddressesDescription, "listCommunicationPrivacyRules", bearer(), nil, nil, obj{
		"200": jsonResponse("Empty address list.", objectSchema("Protected and blocked addresses.", obj{
			"rules": arraySchema("Addresses this workspace keeps private or leaves out.", objectSchema("One address rule.", nil)),
		}, "rules"), privacyAddressesPage()),
		"401": responseRef("401"),
	})})
}

func privacyAddressesPage() obj {
	return obj{"rules": []any{}}
}
