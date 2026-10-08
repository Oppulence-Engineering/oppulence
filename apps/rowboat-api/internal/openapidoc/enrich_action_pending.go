package openapidoc

// List pending approvals is the request the Agent approvals page loads.
// It asks for proposals that are still waiting and shows each one until you approve or reject it.
const actionPendingDescription = "The approvals page loads proposals that are still waiting. It sends status=pending and shows each one until you approve or reject it."

const (
	actionPendingProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionPendingTarget     = "conduit:invoice:inv_456"
	actionPendingParams     = `{"amount":100,"step":2}`
	actionPendingClock      = "2026-07-31T14:00:00Z"
	actionPendingStatus     = "pending"
)

func actionPendingProposal() obj {
	return obj{
		"id":         actionPendingProposalID,
		"target":     actionPendingTarget,
		"kind":       "conduit.dunning.advance",
		"paramsJson": actionPendingParams,
		"financial":  false,
		"rationale":  "Acme is 14 days overdue",
		"status":     actionPendingStatus,
		"createdAt":  actionPendingClock,
	}
}

func actionPendingExample() obj {
	return obj{"proposals": []any{actionPendingProposal()}}
}

func actionPendingQuery() obj {
	return queryParam("status", "The approvals page sends pending.", false, stringSchema("Waiting proposals.", actionPendingStatus))
}

func actionPendingOperation() obj {
	return operation("Revenue", "List pending approvals", actionPendingDescription, "listPendingActionProposals", bearer(), []any{actionPendingQuery()}, nil, obj{
		"200": jsonResponse("Proposals still waiting.", objectSchema("Pending approvals.", obj{
			"proposals": arraySchema("Proposals the page shows.", objectSchema("Pending proposal.", obj{
				"id":         uuidSchema("Proposal id.", actionPendingProposalID),
				"target":     stringSchema("Object the action changes.", actionPendingTarget),
				"kind":       stringSchema("Action kind.", "conduit.dunning.advance"),
				"paramsJson": stringSchema("JSON parameters.", actionPendingParams),
				"financial":  boolSchema("Whether money moves.", false),
				"rationale":  stringSchema("Why the action was proposed.", "Acme is 14 days overdue"),
				"status":     stringSchema("Waiting for approval.", actionPendingStatus),
				"createdAt":  stringSchema("When the proposal was created.", actionPendingClock, obj{"format": "date-time"}),
			}, "id", "target", "kind", "financial", "status", "createdAt")),
		}, "proposals"), actionPendingExample()),
		"401": responseRef("401"),
	})
}

func addActionPendingPath(paths obj) {
	paths["/v1/action-proposals"] = obj{"get": actionPendingOperation()}
}
