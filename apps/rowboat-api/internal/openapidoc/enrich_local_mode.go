package openapidoc

const localModeDescription = "Local mode is the workspace Connected sources opens before a sending workspace is linked. It comes back local and active, and the sending check stays off."

const localModeWorkspaceID = "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"

func localModeWorkspace() obj {
	return obj{
		"id":                 localModeWorkspaceID,
		"mode":               "local",
		"status":             "active",
		"preflightAvailable": false,
	}
}

func localModeOperation() obj {
	return operation(
		"Revenue",
		"Local mode",
		localModeDescription,
		"getRevenueWorkspace",
		bearer(),
		nil,
		nil,
		obj{
			"200": jsonResponse("This workspace before it is linked.", ref("RevenueWorkspace"), localModeWorkspace()),
			"401": responseRef("401"),
		},
	)
}
