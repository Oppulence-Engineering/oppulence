package openapidoc

func sourceInventoryCard(
	source, displayName, explanation, connectPath, disconnectPath string,
	evidence, actions, readScopes, writeScopes []any,
	cadence int,
) obj {
	return obj{
		"source":                 source,
		"displayName":            displayName,
		"evidence":               evidence,
		"actions":                actions,
		"readScopes":             readScopes,
		"writeScopes":            writeScopes,
		"scopeExplanation":       explanation,
		"connectPath":            connectPath,
		"disconnectPath":         disconnectPath,
		"supportsReconnect":      true,
		"supportsResync":         true,
		"expectedCadenceSeconds": cadence,
		"accounts":               []any{},
	}
}

func sourceInventoryExample() obj {
	return obj{"sources": []any{
		sourceInventoryCard(
			"google",
			"Google Gmail & Calendar",
			"Read scopes build relationship history. Write scopes are requested progressively only when you enable an approval-gated action.",
			"/v1/google-oauth/start",
			"/v1/google-oauth",
			[]any{"email_threads", "replies", "meetings", "participants", "commitments"},
			[]any{"gmail_draft", "gmail_send", "calendar_event"},
			[]any{
				"https://www.googleapis.com/auth/gmail.readonly",
				"https://www.googleapis.com/auth/calendar.events.readonly",
			},
			[]any{
				"https://www.googleapis.com/auth/gmail.compose",
				"https://www.googleapis.com/auth/gmail.send",
				"https://www.googleapis.com/auth/calendar.events",
			},
			900,
		),
		sourceInventoryCard(
			"slack",
			"Slack",
			"Channel and user reads assemble shared account context. chat:write is used only after approval of an exact destination and message revision.",
			"/v1/slack-oauth/start",
			"/v1/slack-oauth/workspaces/{sourceAccountId}",
			[]any{"messages", "threads", "participants", "decisions", "commitments"},
			[]any{"slack_message"},
			[]any{"channels:history", "channels:read", "users:read"},
			[]any{"chat:write"},
			900,
		),
		sourceInventoryCard(
			"hubspot",
			"HubSpot",
			"CRM reads preserve HubSpot-owned lifecycle evidence. Progressive note/task scopes create only the exact revision-bound engagement a user approves; beta does not silently mutate CRM-owned fields.",
			"/v1/connections/hubspot/api-key",
			"/v1/connections/hubspot",
			[]any{"companies", "contacts", "deals", "activities", "pipeline_changes"},
			[]any{"crm_note", "crm_task"},
			[]any{"crm.objects.companies.read", "crm.objects.contacts.read", "crm.objects.deals.read"},
			[]any{"crm.objects.notes.write", "crm.objects.tasks.write"},
			1800,
		),
	}}
}

func sourceInventoryOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Sources to connect",
		"Sources to connect lists Google, Slack, and HubSpot. The page names each source and offers Connect for Google and HubSpot when no account is connected.",
		"getRelationshipSourceInventory",
		bearer(),
		nil,
		nil,
		obj{
			"200": jsonResponse("Sources to connect.", objectSchema("Source inventory.", obj{
				"sources": arraySchema("Source cards.", ref("RelationshipSourceInventoryItem")),
			}, "sources"), sourceInventoryExample()),
			"401": responseRef("401"),
		},
	)
}
