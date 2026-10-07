package openapidoc

const (
	openedRunSlug = "oppulence-relationship-refresh"
	openedRunID   = "sched-temporal-77f5e632-a841-4557-a8e4-9b8f0d207ff4"
)

func openedRunPathParams() []any {
	return []any{
		obj{
			"name": "slug", "in": "path", "required": true,
			"description": "Workflow the opened run belongs to.",
			"example":     openedRunSlug,
			"schema":      obj{"type": "string", "example": openedRunSlug},
		},
		obj{
			"name": "runId", "in": "path", "required": true,
			"description": "Run the Runs page opens.",
			"example":     openedRunID,
			"schema":      obj{"type": "string", "example": openedRunID},
		},
	}
}

func openedCloudRunExample() obj {
	return obj{
		"id":              "77f5e632-a841-4557-a8e4-9b8f0d207ff4",
		"runId":           openedRunID,
		"slug":            openedRunSlug,
		"trigger":         "cron",
		"status":          "failed",
		"executor":        "api",
		"attempt":         1,
		"errorCode":       "llm_call_failed",
		"progressPercent": 10,
		"revision":        5,
	}
}
