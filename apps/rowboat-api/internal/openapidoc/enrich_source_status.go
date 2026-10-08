package openapidoc

const (
	sourceStatusConnectionID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	sourceStatusActorID      = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	sourceStatusAccount      = "me@company.com"
	sourceStatusSyncedAt     = "2026-07-31T14:00:00Z"
	gmailReadScope           = "https://www.googleapis.com/auth/gmail.readonly"
	calendarReadScope        = "https://www.googleapis.com/auth/calendar.events.readonly"
)

func sourceStatusExample() obj {
	scopes := []any{gmailReadScope, calendarReadScope}
	return obj{"sources": []any{obj{
		"connectionId":           sourceStatusConnectionID,
		"source":                 "google",
		"sourceAccountId":        sourceStatusAccount,
		"consentingActorId":      sourceStatusActorID,
		"status":                 "live",
		"backfillPhase":          "live",
		"backfillCompleted":      250,
		"backfillTotal":          1000,
		"completeness":           "partial",
		"expectedCadenceSeconds": 900,
		"lagSeconds":             42,
		"requiredScopes":         scopes,
		"grantedScopes":          scopes,
		"missingScopes":          []any{},
		"retryCount":             0,
		"lastSyncAt":             sourceStatusSyncedAt,
		"lastSuccessAt":          sourceStatusSyncedAt,
	}}}
}

func sourceStatusOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Connected sources",
		"Connected sources lists each account connected to this workspace. The page shows the account and whether its history is still syncing.",
		"getRelationshipSourceStatuses",
		bearer(),
		nil,
		nil,
		obj{
			"200": jsonResponse("Connected sources.", objectSchema("Source status list.", obj{
				"sources": arraySchema("Sources.", ref("RelationshipSourceStatus")),
			}), sourceStatusExample()),
			"401": responseRef("401"),
		},
	)
}
