package openapidoc

const removedWorkflowSlug = "follow-up-when-a-promise-slips"

func removeWorkflowParams() []any {
	return []any{
		obj{
			"name": "slug", "in": "path", "required": true,
			"description": "Workflow to remove.",
			"example":     removedWorkflowSlug,
			"schema":      obj{"type": "string", "example": removedWorkflowSlug},
		},
		obj{
			"name": "revision", "in": "query", "required": true,
			"description": "Revision the editor last read.",
			"example":     1,
			"schema":      obj{"type": "integer", "example": 1},
		},
	}
}
