package openapidoc

const localWorkspaceDescription = "Connected sources loads this workspace. The request sends no filter. This workspace is local, active, and the sending check is off, so the organization and sending workspace are omitted."

func localWorkspaceExample() obj {
	return obj{
		"id":                 "0b8dfa9b-a7b2-46ea-982c-622a914c00e5",
		"mode":               "local",
		"status":             "active",
		"preflightAvailable": false,
	}
}

func localWorkspacePath() obj {
	return obj{"get": operation(
		"Revenue",
		"Workspace",
		localWorkspaceDescription,
		"getRevenueWorkspace",
		bearer(),
		nil,
		nil,
		obj{
			"200": jsonResponse("Local workspace.", ref("RevenueWorkspace"), localWorkspaceExample()),
			"401": responseRef("401"),
		},
	)}
}
