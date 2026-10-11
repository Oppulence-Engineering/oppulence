package openapidoc

const agentApprovalsDescription = "Agent approvals loads the pending queue. The request asks for pending proposals. This workspace has no pending proposal, so the page is empty."

func addActionPaths(paths obj) {
	status := queryParam("status", "pending is the queue. Agent approvals asks for pending.", false, stringSchema("pending is the queue. Agent approvals asks for pending.", "pending"))
	status["example"] = "pending"
	paths["/v1/action-proposals"] = obj{"get": operation("Revenue", "Agent approvals", agentApprovalsDescription, "listActionProposals", bearer(), []any{status}, nil, obj{
		"200": jsonResponse("Empty approval queue.", objectSchema("Pending proposals.", obj{
			"proposals": arraySchema("Proposals waiting for a decision.", objectSchema("One proposal.", nil)),
		}, "proposals"), agentApprovalsPage()),
		"401": responseRef("401"),
	})}
}

func agentApprovalsPage() obj {
	return obj{"proposals": []any{}}
}
