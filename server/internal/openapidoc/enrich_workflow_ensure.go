package openapidoc

// workflowEnsureExample is the body POST /v1/background-tasks/first-party/ensure
// returns when the Workflows page installs the maintained workflows. Order
// follows the built-in templates. Revisions and clocks move, so they are omitted.
func workflowEnsureExample() obj {
	return obj{"tasks": []any{
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0006",
			"oppulence-relationship-refresh",
			"Relationship Refresh",
			"relationship-refresh",
			"Use relationship.read with view=portfolio and run_history.read. Compare current versioned relationship state with the prior run, identify only material changes, cite relationship and evidence references returned by the tool, and write a concise markdown portfolio refresh. Never invent evidence or execute an external action.",
			obj{"cronExpr": "*/15 * * * *", "timezone": "UTC"},
		),
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0001",
			"oppulence-attention-monitor",
			"Attention Monitor",
			"attention-monitor",
			"Use relationship.read with view=attention and run_history.read. Rank open attention items by urgency and score, explain the deterministic reason and freshness, cite every triggering object and evidence reference, and write an operator-ready markdown brief. Recommend review actions only; do not perform external actions.",
			obj{"cronExpr": "0 8 * * *", "timezone": "America/New_York"},
		),
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0003",
			"oppulence-meeting-pre-brief",
			"Meeting Pre-Brief",
			"meeting-pre-brief",
			"Use connector.read.calendar for upcoming meetings, relationship.read with view=portfolio for matching customer context, and run_history.read. For meetings in the next 24 hours, write a concise brief with participants, relationship health, open commitments, risks, last material change, desired outcome, and evidence references. If no relevant meeting exists, record that clearly. Do not contact participants.",
			obj{"cronExpr": "*/30 * * * *", "timezone": "UTC"},
		),
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0004",
			"oppulence-post-meeting-processor",
			"Post-Meeting Processor",
			"post-meeting-processor",
			"Use event.read when event-triggered, connector.read.calendar for recently completed meetings, relationship.read with view=portfolio, and run_history.read. Produce a markdown meeting record containing decisions, commitments with owners and dates, risks, unresolved questions, relationship changes, and draft follow-up recommendations. Cite source references. Any outward action must remain a proposal requiring human approval.",
			obj{
				"cronExpr": "*/15 * * * *",
				"timezone": "UTC",
				"events": obj{
					"sources":    []any{"google"},
					"eventTypes": []any{"resource.exists", "resource.update"},
				},
			},
		),
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0005",
			"oppulence-recommendation-review",
			"Recommendation Review",
			"recommendation-review",
			"Use relationship.read with view=recommendations and run_history.read. Group pending recommendations by relationship, show priority, reason, revision, policy and approval state, flag stale or conflicting evidence, and write a review brief. Never approve, reject, or execute on the user's behalf.",
			obj{"cronExpr": "0 9 * * 1-5", "timezone": "America/New_York"},
		),
		workflowEnsureTask(
			"b8dfa9b6-a7b2-46ea-982c-622a914c0002",
			"oppulence-connector-health-repair",
			"Connector Health and Repair",
			"connector-health-repair",
			"Use relationship.read with view=sources and run_history.read. Report each connector's authorization, freshness, completeness, missing scopes, retry state, lag, and backfill progress. Separate transient retries from reconnect-required failures and write safe operator repair steps. Never request or expose secrets and never reconnect a provider automatically.",
			obj{
				"cronExpr": "*/30 * * * *",
				"timezone": "UTC",
				"events": obj{
					"sources":    []any{"google", "slack", "hubspot"},
					"eventTypes": []any{"*"},
				},
			},
		),
	}}
}

func workflowEnsureTask(id, slug, name, templateSlug, instructions string, triggers obj) obj {
	return obj{
		"id":                id,
		"slug":              slug,
		"name":              name,
		"instructions":      instructions,
		"active":            true,
		"triggers":          triggers,
		"executionTarget":   "api",
		"templateSlug":      templateSlug,
		"templateVersion":   1,
		"systemManaged":     true,
		"scheduleSyncState": "current",
	}
}
