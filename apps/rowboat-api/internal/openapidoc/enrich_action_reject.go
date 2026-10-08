package openapidoc

// Reject is the Agent approvals button for a proposal that is still waiting.
// It posts a short reason. The page discards the action and keeps that reason on the audit trail.
const actionRejectDescription = "Reject posts a short reason. The page discards the action and keeps that reason on the audit trail."

const (
	actionRejectProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionRejectTarget     = "conduit:invoice:inv_456"
	actionRejectParams     = `{"amount":100,"step":2}`
	actionRejectClock      = "2026-07-31T14:00:00Z"
	actionRejectReason     = "Customer paid yesterday"
)

func actionRejectExample() obj {
	return obj{
		"id":         actionRejectProposalID,
		"target":     actionRejectTarget,
		"kind":       "conduit.dunning.advance",
		"paramsJson": actionRejectParams,
		"financial":  false,
		"rationale":  "Acme is 14 days overdue",
		"status":     "rejected",
		"reason":     actionRejectReason,
		"createdAt":  actionRejectClock,
	}
}

func actionRejectParam() obj {
	return obj{
		"name":        "id",
		"in":          "path",
		"required":    true,
		"description": "Proposal id.",
		"example":     actionRejectProposalID,
		"schema":      uuidSchema("Proposal id.", actionRejectProposalID),
	}
}

func actionRejectOperation() obj {
	return operation("Revenue", "Reject", actionRejectDescription, "rejectActionProposal", bearer(), []any{actionRejectParam()}, jsonRequest("Short reason for the audit trail.", objectSchema("Reject request.", obj{
		"reason": stringSchema("Why this action is being rejected.", actionRejectReason),
	}, "reason"), obj{"reason": actionRejectReason}), obj{
		"200": jsonResponse("Rejected proposal.", objectSchema("Rejected proposal.", obj{
			"id":         uuidSchema("Proposal id.", actionRejectProposalID),
			"target":     stringSchema("Object the action changes.", actionRejectTarget),
			"kind":       stringSchema("Action kind.", "conduit.dunning.advance"),
			"paramsJson": stringSchema("JSON parameters.", actionRejectParams),
			"financial":  boolSchema("Whether money moves.", false),
			"rationale":  stringSchema("Why the action was proposed.", "Acme is 14 days overdue"),
			"status":     stringSchema("Rejected.", "rejected"),
			"reason":     stringSchema("Why it was rejected.", actionRejectReason),
			"createdAt":  stringSchema("When the proposal was created.", actionRejectClock, obj{"format": "date-time"}),
		}, "id", "target", "kind", "financial", "status", "reason", "createdAt"), actionRejectExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})
}

func addActionRejectPath(paths obj) {
	paths["/v1/action-proposals/{id}/reject"] = obj{"post": actionRejectOperation()}
}
