package openapidoc

// Approve and run is the Agent approvals button. It posts no body. The page
// keeps the returned proposal and uses the one-time value to run the action.
const actionApproveDescription = "Approve and run posts no body. The page receives the approved proposal and a one-time value, then runs the action."

const (
	actionApproveProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionApproveTarget     = "conduit:invoice:inv_456"
	actionApproveParams     = `{"amount":100,"step":2}`
	actionApproveClock      = "2026-07-31T14:00:00Z"
	actionApproveExpires    = "2026-07-31T14:05:00Z"
	// Not a signed approval. The live value uses a different prefix and is not stored.
	actionApproveSample = "example.not-a-live-approval"
)

func actionApproveExample() obj {
	return obj{
		"proposal": obj{
			"id":         actionApproveProposalID,
			"target":     actionApproveTarget,
			"kind":       "conduit.dunning.advance",
			"paramsJson": actionApproveParams,
			"financial":  false,
			"rationale":  "Acme is 14 days overdue",
			"status":     "approved",
			"createdAt":  actionApproveClock,
			"approvedAt": actionApproveClock,
		},
		"token":     actionApproveSample,
		"expiresAt": actionApproveExpires,
	}
}

func actionApproveParam() obj {
	return obj{
		"name":        "id",
		"in":          "path",
		"required":    true,
		"description": "Proposal id.",
		"example":     actionApproveProposalID,
		"schema":      uuidSchema("Proposal id.", actionApproveProposalID),
	}
}

func actionApproveOperation() obj {
	return operation("Revenue", "Approve and run", actionApproveDescription, "approveActionProposal", bearer(), []any{actionApproveParam()}, nil, obj{
		"200": jsonResponse("Approved proposal and one-time value.", objectSchema("Approve result.", obj{
			"proposal": objectSchema("Approved proposal.", obj{
				"id":         uuidSchema("Proposal id.", actionApproveProposalID),
				"target":     stringSchema("Object the action changes.", actionApproveTarget),
				"kind":       stringSchema("Action kind.", "conduit.dunning.advance"),
				"paramsJson": stringSchema("JSON parameters.", actionApproveParams),
				"financial":  boolSchema("Whether money moves.", false),
				"rationale":  stringSchema("Why the action was proposed.", "Acme is 14 days overdue"),
				"status":     stringSchema("Approved.", "approved"),
				"createdAt":  stringSchema("When the proposal was created.", actionApproveClock, obj{"format": "date-time"}),
				"approvedAt": stringSchema("When it was approved.", actionApproveClock, obj{"format": "date-time"}),
			}, "id", "target", "kind", "financial", "status", "createdAt", "approvedAt"),
			"token":     stringSchema("One-time value the page uses to run the action. This sample is not a live approval.", actionApproveSample),
			"expiresAt": stringSchema("When the one-time value stops working.", actionApproveExpires, obj{"format": "date-time"}),
		}, "proposal", "token", "expiresAt"), actionApproveExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
		"404": responseRef("404"),
		"409": responseRef("409"),
	})
}

func addActionApprovePath(paths obj) {
	paths["/v1/action-proposals/{id}/approve"] = obj{"post": actionApproveOperation()}
}
