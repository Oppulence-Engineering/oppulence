package openapidoc

// Execute is the Agent approvals button for an approval that is already stored.
// It posts the one-time value Approve and run returned.
const actionExecuteDescription = "Execute posts the one-time value Approve and run returned. The page shows the result while it waits for the product to confirm the change."

const (
	actionExecuteProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionExecuteTarget     = "conduit:invoice:inv_456"
	actionExecuteParams     = `{"amount":100,"step":2}`
	actionExecuteResult     = "conduit:step:step_1"
	actionExecuteClock      = "2026-07-31T14:00:00Z"
	// Not a signed approval. The live value uses a different prefix and is not stored.
	actionExecuteSample = "example.not-a-live-approval"
)

func actionExecuteExample() obj {
	return obj{
		"id":         actionExecuteProposalID,
		"target":     actionExecuteTarget,
		"kind":       "conduit.dunning.advance",
		"paramsJson": actionExecuteParams,
		"financial":  false,
		"rationale":  "Acme is 14 days overdue",
		"status":     "executed",
		"resultRef":  actionExecuteResult,
		"createdAt":  actionExecuteClock,
		"approvedAt": actionExecuteClock,
		"executedAt": actionExecuteClock,
	}
}

func actionExecuteParam() obj {
	return obj{
		"name":        "id",
		"in":          "path",
		"required":    true,
		"description": "Proposal id.",
		"example":     actionExecuteProposalID,
		"schema":      uuidSchema("Proposal id.", actionExecuteProposalID),
	}
}

func actionExecuteOperation() obj {
	return operation("Revenue", "Execute", actionExecuteDescription, "executeActionProposal", bearer(), []any{actionExecuteParam()}, jsonRequest("One-time value.", objectSchema("Execute request.", obj{
		"token": stringSchema("One-time value from Approve and run. This sample is not a live approval.", actionExecuteSample),
	}, "token"), obj{"token": actionExecuteSample}), obj{
		"200": jsonResponse("Executed proposal.", objectSchema("Executed proposal.", obj{
			"id":         uuidSchema("Proposal id.", actionExecuteProposalID),
			"target":     stringSchema("Object the action changes.", actionExecuteTarget),
			"kind":       stringSchema("Action kind.", "conduit.dunning.advance"),
			"paramsJson": stringSchema("JSON parameters.", actionExecuteParams),
			"financial":  boolSchema("Whether money moves.", false),
			"rationale":  stringSchema("Why the action was proposed.", "Acme is 14 days overdue"),
			"status":     stringSchema("Executed.", "executed"),
			"resultRef":  stringSchema("Result the page shows.", actionExecuteResult),
			"createdAt":  stringSchema("When the proposal was created.", actionExecuteClock, obj{"format": "date-time"}),
			"approvedAt": stringSchema("When it was approved.", actionExecuteClock, obj{"format": "date-time"}),
			"executedAt": stringSchema("When it ran.", actionExecuteClock, obj{"format": "date-time"}),
		}, "id", "target", "kind", "financial", "status", "createdAt", "approvedAt", "executedAt"), actionExecuteExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
		"404": responseRef("404"),
		"409": responseRef("409"),
		"503": responseRef("503"),
	})
}

func addActionExecutePath(paths obj) {
	paths["/v1/action-proposals/{id}/execute"] = obj{"post": actionExecuteOperation()}
}
