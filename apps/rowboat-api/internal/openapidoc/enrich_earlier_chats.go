package openapidoc

const earlierChatsDescription = "Show earlier conversations loads the next page of History. It skips the newest 50 conversations. This page has one older conversation, and no conversation after it."

const (
	earlierChatsSessionID = "c8dfa9b6-a7b2-46ea-982c-622a914c00e5"
	earlierChatsOffset    = 50
	earlierChatsTitle     = "Review the Acme renewal"
)

func earlierChatsPage() obj {
	return obj{
		"sessions": []any{obj{
			"sessionId":         earlierChatsSessionID,
			"agent":             "assistant",
			"status":            "active",
			"channel":           "web",
			"title":             earlierChatsTitle,
			"turns":             2,
			"llmCalls":          3,
			"toolCalls":         1,
			"costUnits":         45,
			"continuationToken": "",
			"createdAt":         "2026-09-02T15:00:00Z",
			"lastActivityAt":    "2026-09-02T15:01:00Z",
		}},
		"hasMore": false,
	}
}

func earlierChatsOperation() obj {
	offsetSchema := obj{"type": "integer", "minimum": 0, "example": earlierChatsOffset}
	return operation("Agent Sessions", "Show earlier conversations", earlierChatsDescription, "listAgentSessions", bearer(), []any{
		obj{
			"name":        "offset",
			"in":          "query",
			"required":    false,
			"description": "How many conversations to skip. Show earlier conversations skips the newest 50.",
			"example":     earlierChatsOffset,
			"schema":      offsetSchema,
		},
	}, nil, obj{
		"200": jsonResponse("Older conversations from History.", ref("AgentSessionListResponse"), earlierChatsPage()),
		"401": responseRef("401"),
		"500": responseRef("500"),
	})
}
