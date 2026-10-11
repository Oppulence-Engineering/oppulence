package openapidoc

// The Runs page loads this list with limit=50 and no status, executor, cursor,
// or workflow filter. Every run on that page failed in the cloud on a schedule.
const workflowRunsDescription = "The Runs page loads the first 50 cloud runs. Each run on that page failed on a schedule."

func workflowRunsQueryParams() []any {
	return []any{
		obj{
			"name":        "limit",
			"in":          "query",
			"required":    false,
			"description": "How many runs to return. The Runs page asks for 50.",
			"example":     50,
			"schema":      obj{"type": "integer", "minimum": 1, "maximum": 500, "example": 50},
		},
		// Strings without an example stay out of the sample request. An enum
		// would put the first value into the curl even though this page sends none.
		queryParam("status", "Optional run status filter.", false, obj{"type": "string"}),
		queryParam("executor", "Optional cloud or desktop filter.", false, obj{"type": "string"}),
		queryParam("cursor", "Cursor from a previous page.", false, obj{"type": "string"}),
		queryParam("slug", "Optional workflow filter.", false, obj{"type": "string"}),
	}
}

func workflowRunsExample() obj {
	return obj{
		"runs": []any{obj{
			"id":              "77f5e632-a841-4557-a8e4-9b8f0d207ff4",
			"runId":           "sched-temporal-77f5e632-a841-4557-a8e4-9b8f0d207ff4",
			"slug":            "oppulence-relationship-refresh",
			"trigger":         "cron",
			"status":          "failed",
			"executor":        "api",
			"attempt":         1,
			"errorCode":       "llm_call_failed",
			"progressPercent": 10,
			"revision":        5,
		}},
	}
}
