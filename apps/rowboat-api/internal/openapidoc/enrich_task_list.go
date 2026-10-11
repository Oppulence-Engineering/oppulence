package openapidoc

const taskListDescription = "Tasks loads open follow-ups with the soonest due date first. It asks for open tasks, one hundred at a time, and does not ask for an older page. The first task is Follow up on the proposal, due on July 15."

const (
	taskListID           = "3a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	taskListRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	taskListTitle        = "Follow up on the proposal"
	taskListDue          = "2026-07-15T17:00:00Z"
	taskListClock        = "2026-07-15T16:00:00Z"
	taskListRevision     = "sha256:ab12..."
)

func taskListQueryParam(name, description string, example any, schema obj) obj {
	param := obj{
		"name":        name,
		"in":          "query",
		"required":    false,
		"description": description,
		"schema":      schema,
	}
	if example != nil {
		param["example"] = example
		schema["example"] = example
	}
	return param
}

func taskListPage() obj {
	return obj{
		"actions": []any{obj{
			"id":               taskListID,
			"relationshipId":   taskListRelationship,
			"relationshipName": "Acme",
			"actionType":       "follow_up_task",
			"channel":          "task",
			"detector":         "manual",
			"revision":         1,
			"revisionHash":     taskListRevision,
			"reason":           taskListTitle,
			"priorityScore":    30,
			"queueStatus":      "open",
			"policyStatus":     "pending",
			"approvalStatus":   "pending",
			"executionStatus":  "pending",
			"executionOwner":   "rowboat",
			"executionMode":    "draft",
			"dueAt":            taskListDue,
			"createdAt":        taskListClock,
			"updatedAt":        taskListClock,
			"evidence":         []any{},
		}},
		"hasMore": false,
	}
}

func taskListOperation() obj {
	return operation("Revenue", "Tasks", taskListDescription, "listRevenueActions", bearer(), []any{
		taskListQueryParam("queueStatus", "Queue status filter, or all.", "open", obj{"type": "string", "enum": []any{"open", "snoozed", "dismissed", "handled", "all"}}),
		taskListQueryParam("limit", "Page size (max 100). Tasks asks for 100.", 100, obj{"type": "integer"}),
		taskListQueryParam("offset", "How many tasks to skip. Tasks does not send this on the first page.", nil, obj{"type": "integer", "minimum": 0}),
		taskListQueryParam("surface", "task keeps follow-up tasks. recovery keeps every other action.", "task", obj{"type": "string", "enum": []any{"task", "recovery"}}),
		taskListQueryParam("due", "Soonest due first is asc. Latest due is desc.", "asc", obj{"type": "string", "enum": []any{"asc", "desc"}}),
	}, nil, obj{
		"200": jsonResponse("Queue page.", objectSchema("Action list. A full page is the end of the queue when hasMore is false.", obj{
			"actions": arraySchema("Actions.", ref("RevenueAction")),
			"hasMore": boolSchema("Another task or follow-up exists beyond this page.", false),
		}, "actions"), taskListPage()),
		"401": responseRef("401"),
	})
}
