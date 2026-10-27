package openapidoc

const configureAgentDescription = "Configure loads this agent's name, purpose, model, and tools."

const configureAgentReady = "The agent is ready to configure."

const configureAgentID = "acme-follow-up"

func addConfigureAgentPath(paths obj) {
	existing := asObj(paths["/v1/agents/{slug}"])
	if existing == nil {
		existing = obj{}
		paths["/v1/agents/{slug}"] = existing
	}
	existing["get"] = configureAgentOperation()
}

func configureAgentOperation() obj {
	return operation("Agents", "Configure", configureAgentDescription, "getAgent", bearer(), configureAgentParams(), nil, configureAgentResponses())
}

func configureAgentParams() []any {
	return []any{obj{
		"name":        "slug",
		"in":          "path",
		"required":    true,
		"description": "Agent id.",
		"example":     configureAgentID,
		"schema":      stringSchema("Agent id.", configureAgentID),
	}}
}

func configureAgentSchema() obj {
	return objectSchema("One agent the workspace can configure.", obj{
		"slug":         stringSchema("Agent id.", configureAgentID),
		"name":         stringSchema("Name on the agents page.", "Acme follow-up"),
		"source":       stringSchema("tenant means this workspace owns the agent.", "tenant"),
		"instructions": stringSchema("Purpose shown for this agent.", "Draft the next follow-up for Acme."),
		"model":        stringSchema("Model this agent uses.", "openai/gpt-4.1-mini"),
		"provider":     stringSchema("Where that model runs.", "openrouter"),
		"enabledTools": arraySchema("Tools this agent can use.", stringSchema("Tool id.", "relationship.read")),
	}, "slug", "name", "source", "enabledTools")
}

func configureAgentExample() obj {
	return obj{
		"slug":         configureAgentID,
		"name":         "Acme follow-up",
		"source":       "tenant",
		"instructions": "Draft the next follow-up for Acme.",
		"model":        "openai/gpt-4.1-mini",
		"provider":     "openrouter",
		"enabledTools": []any{"relationship.read"},
	}
}

func configureAgentResponses() obj {
	return obj{
		"200": jsonResponse(configureAgentReady, configureAgentSchema(), configureAgentExample()),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"500": responseRef("500"),
	}
}
