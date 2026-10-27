package openapidoc

// Create task is the request the task dialog saves.
// It sends the title, the company, the due time, and a priority of 30.
const createdTaskDescription = "Create task saves a follow-up on a company. It sends the title, the due time, and a priority of 30."

const (
	createdTaskID           = "3a8dfa9b-a7b2-46ea-982c-622a914c00e5"
	createdTaskRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	createdTaskTitle        = "Follow up on the proposal"
	createdTaskDue          = "2026-07-15T17:00:00Z"
	createdTaskClock        = "2026-07-15T16:00:00Z"
	createdTaskRevision     = "sha256:ab12..."
)

func createdTaskRequest() obj {
	return obj{
		"relationshipId": createdTaskRelationship,
		"actionType":     "follow_up_task",
		"channel":        "task",
		"reason":         createdTaskTitle,
		"dueAt":          createdTaskDue,
		"priorityScore":  30,
	}
}

func createdTaskResponse() obj {
	return obj{
		"id":               createdTaskID,
		"relationshipId":   createdTaskRelationship,
		"relationshipName": "Acme",
		"actionType":       "follow_up_task",
		"channel":          "task",
		"detector":         "manual",
		"revision":         1,
		"revisionHash":     createdTaskRevision,
		"reason":           createdTaskTitle,
		"priorityScore":    30,
		"queueStatus":      "open",
		"policyStatus":     "pending",
		"approvalStatus":   "pending",
		"executionStatus":  "pending",
		"executionOwner":   "rowboat",
		"executionMode":    "draft",
		"dueAt":            createdTaskDue,
		"createdAt":        createdTaskClock,
		"updatedAt":        createdTaskClock,
		"evidence":         []any{},
	}
}

func createdTaskOperation() obj {
	return operation("Revenue", "Create task", createdTaskDescription, "createRevenueAction", bearer(), nil, jsonRequest("Task.", objectSchema("Create request.", obj{
		"relationshipId":     uuidSchema("Company the task is for.", createdTaskRelationship),
		"actionType":         stringEnum("Action type.", "follow_up_task", "warm_follow_up", "proposal_nudge", "referral_reconnect", "customer_risk", "meeting_follow_up", "meeting_recap", "crm_update", "follow_up_task", "calendar_hold", "commitment_rescue"),
		"channel":            stringEnum("Delivery channel.", "task", "email", "slack", "call", "crm_task", "crm", "task", "calendar"),
		"reason":             stringSchema("Task title.", createdTaskTitle),
		"recipientEmail":     stringSchema("Recipient email.", "buyer@example.com"),
		"proposedSubject":    stringSchema("Proposed subject.", "Following up as promised"),
		"proposedMessage":    stringSchema("Proposed body.", documentedGraphFollowUpMessage),
		"senderAccountRef":   stringSchema("Sender account reference.", "gmail:me@company.com"),
		"executionMode":      stringEnum("Execution mode.", "draft", "draft", "send"),
		"priorityScore":      intSchema("Priority (0-100).", 30),
		"priorityComponents": freeFormSchema("Per-component priority breakdown."),
		"dueAt":              stringSchema("Due time.", createdTaskDue, obj{"format": "date-time"}, nullable()),
	}, "relationshipId", "actionType", "channel", "reason"), createdTaskRequest()), obj{
		"201": jsonResponse("Created task.", ref("RevenueAction"), createdTaskResponse()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
	})
}
