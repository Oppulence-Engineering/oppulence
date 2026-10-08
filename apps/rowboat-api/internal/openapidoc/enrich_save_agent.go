package openapidoc

const saveAgentDescription = "Save changes stores this agent's name, purpose, model, and tools."

const saveAgentRequestDescription = "The agent the editor is showing."

const saveAgentSaved = "The agent is saved."

const saveAgentCreated = "The agent was created."

const saveAgentID = "acme-follow-up"

const saveAgentName = "Acme follow-up"

const saveAgentPurpose = "Draft the next follow-up for Acme."

const saveAgentModel = "openai/gpt-4.1-mini"

const saveAgentProvider = "openrouter"

const saveAgentTool = "relationship.read"

const saveAgentVersion = "agent.rowboat.dev/v1"

func addSaveAgentPath(paths obj) {
	existing := asObj(paths["/v1/agents/{slug}"])
	if existing == nil {
		existing = obj{}
		paths["/v1/agents/{slug}"] = existing
	}
	existing["put"] = saveAgentOperation()
}

func saveAgentOperation() obj {
	return operation("Agents", "Save changes", saveAgentDescription, "putAgent", bearer(), saveAgentParams(), jsonRequest(saveAgentRequestDescription, saveAgentRequestSchema(), saveAgentRequestExample()), saveAgentResponses())
}

func saveAgentParams() []any {
	return []any{obj{
		"name":        "slug",
		"in":          "path",
		"required":    true,
		"description": "Agent id.",
		"example":     saveAgentID,
		"schema":      stringSchema("Agent id.", saveAgentID),
	}}
}

func saveAgentRequestSchema() obj {
	return objectSchema("Agent document from the editor.", obj{
		"apiVersion": stringSchema("Document version.", saveAgentVersion),
		"kind":       stringSchema("Document kind.", "Agent"),
		"metadata": objectSchema("Name and id.", obj{
			"slug": stringSchema("Agent id.", saveAgentID),
			"name": stringSchema("Name on the agents page.", saveAgentName),
		}, "slug", "name"),
		"spec": objectSchema("Purpose, model, and tools.", obj{
			"instructions": stringSchema("Purpose shown for this agent.", saveAgentPurpose),
			"model":        stringSchema("Model this agent uses.", saveAgentModel),
			"provider":     stringSchema("Where that model runs.", saveAgentProvider),
			"tools":        arraySchema("Tools this agent can use.", stringSchema("Tool id.", saveAgentTool)),
		}, "instructions", "tools"),
	}, "apiVersion", "kind", "metadata", "spec")
}

func saveAgentRequestExample() obj {
	return obj{
		"apiVersion": saveAgentVersion,
		"kind":       "Agent",
		"metadata":   obj{"slug": saveAgentID, "name": saveAgentName},
		"spec": obj{
			"instructions": saveAgentPurpose,
			"model":        saveAgentModel,
			"provider":     saveAgentProvider,
			"tools":        []any{saveAgentTool},
		},
	}
}

func saveAgentResponseSchema() obj {
	return objectSchema("The stored agent.", obj{
		"slug":         stringSchema("Agent id.", saveAgentID),
		"name":         stringSchema("Name on the agents page.", saveAgentName),
		"source":       stringSchema("tenant means this workspace owns the agent.", "tenant"),
		"instructions": stringSchema("Purpose shown for this agent.", saveAgentPurpose),
		"model":        stringSchema("Model this agent uses.", saveAgentModel),
		"provider":     stringSchema("Where that model runs.", saveAgentProvider),
		"enabledTools": arraySchema("Tools this agent can use.", stringSchema("Tool id.", saveAgentTool)),
	}, "slug", "name", "source", "enabledTools")
}

func saveAgentResponseExample() obj {
	return obj{
		"slug":         saveAgentID,
		"name":         saveAgentName,
		"source":       "tenant",
		"instructions": saveAgentPurpose,
		"model":        saveAgentModel,
		"provider":     saveAgentProvider,
		"enabledTools": []any{saveAgentTool},
	}
}

func saveAgentResponses() obj {
	body := saveAgentResponseSchema()
	example := saveAgentResponseExample()
	return obj{
		"200": jsonResponse(saveAgentSaved, body, example),
		"201": jsonResponse(saveAgentCreated, body, example),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"409": responseRef("409"),
		"500": responseRef("500"),
	}
}
