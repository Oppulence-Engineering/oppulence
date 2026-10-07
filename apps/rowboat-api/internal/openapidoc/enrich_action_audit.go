package openapidoc

// Audit trail is the request the Agent approvals page opens for one object.
// It shows each proposal and a short prefix of the approval record. The one-time value is not included.
const actionAuditDescription = "Audit trail opens the chain for the object this action changes. It shows each proposal and a short prefix of the approval record. The one-time value is not included."

const (
	actionAuditProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionAuditTarget     = "conduit:invoice:inv_456"
	actionAuditParams     = `{"amount":100,"step":2}`
	actionAuditParamsHash = "1e750183c74a18b46e872244bea860113d34dd38a8c7a87192b41553be26941d"
	actionAuditHashPrefix = "c4e8a91b0d27"
	actionAuditResultRef  = "conduit:step:step_1"
	actionAuditReturnID   = "8d8dfa9b-a7b2-46ea-982c-622a914c00e5"
	actionAuditClock      = "2026-07-31T14:00:00Z"
	actionAuditExpires    = "2026-07-31T14:05:00Z"
	actionAuditResolved   = "2026-07-31T14:02:00Z"
	actionAuditStatus     = "executed"
)

func actionAuditProposal() obj {
	return obj{
		"id":            actionAuditProposalID,
		"target":        actionAuditTarget,
		"kind":          "conduit.dunning.advance",
		"paramsJson":    actionAuditParams,
		"financial":     false,
		"rationale":     "Acme is 14 days overdue",
		"status":        actionAuditStatus,
		"resultRef":     actionAuditResultRef,
		"returnEventId": actionAuditReturnID,
		"approvedAt":    actionAuditClock,
		"executedAt":    actionAuditClock,
		"resolvedAt":    actionAuditResolved,
		"createdAt":     actionAuditClock,
	}
}

func actionAuditRecord() obj {
	return obj{
		"hashPrefix": actionAuditHashPrefix,
		"paramsHash": actionAuditParamsHash,
		"stepUp":     false,
		"expiresAt":  actionAuditExpires,
		"consumed":   true,
		"consumedAt": actionAuditClock,
		"issuedAt":   actionAuditClock,
	}
}

func actionAuditExample() obj {
	return obj{
		"resourceRef": actionAuditTarget,
		"entries": []any{obj{
			"proposal": actionAuditProposal(),
			"tokens":   []any{actionAuditRecord()},
		}},
	}
}

func actionAuditPathParam() obj {
	return pathParam("resourceRef", "Object the action changes.", stringSchema("Object the action changes.", actionAuditTarget))
}

func actionAuditOperation() obj {
	return operation("Revenue", "Audit trail", actionAuditDescription, "getObjectActionAudit", bearer(), []any{actionAuditPathParam()}, nil, obj{
		"200": jsonResponse("Proposals and approval records for this object.", objectSchema("Audit trail.", obj{
			"resourceRef": stringSchema("Object the action changes.", actionAuditTarget),
			"entries": arraySchema("Newest proposal first.", objectSchema("One proposal and its approval records.", obj{
				"proposal": objectSchema("Proposal on this object.", obj{
					"id":            uuidSchema("Proposal id.", actionAuditProposalID),
					"target":        stringSchema("Object the action changes.", actionAuditTarget),
					"kind":          stringSchema("Action kind.", "conduit.dunning.advance"),
					"paramsJson":    stringSchema("JSON parameters.", actionAuditParams),
					"financial":     boolSchema("Whether money moves.", false),
					"rationale":     stringSchema("Why the action was proposed.", "Acme is 14 days overdue"),
					"status":        stringSchema("Executed, and the product confirmed the change.", actionAuditStatus),
					"resultRef":     stringSchema("Record the product wrote.", actionAuditResultRef),
					"returnEventId": uuidSchema("Event that closed the loop.", actionAuditReturnID),
					"approvedAt":    stringSchema("When the proposal was approved.", actionAuditClock, obj{"format": "date-time"}),
					"executedAt":    stringSchema("When the action ran.", actionAuditClock, obj{"format": "date-time"}),
					"resolvedAt":    stringSchema("When the product confirmed the change.", actionAuditResolved, obj{"format": "date-time"}),
					"createdAt":     stringSchema("When the proposal was created.", actionAuditClock, obj{"format": "date-time"}),
				}, "id", "target", "kind", "financial", "status", "createdAt"),
				"tokens": arraySchema("Approval records. The one-time value is not included.", objectSchema("Redacted approval record.", obj{
					"hashPrefix": stringSchema("First 12 characters of the approval-record hash.", actionAuditHashPrefix),
					"paramsHash": stringSchema("Hash of the parameters the approval was bound to.", actionAuditParamsHash),
					"stepUp":     boolSchema("Whether a recent sign-in was required.", false),
					"expiresAt":  stringSchema("When the approval record expires.", actionAuditExpires, obj{"format": "date-time"}),
					"consumed":   boolSchema("Whether the approval was used.", true),
					"consumedAt": stringSchema("When the approval was used.", actionAuditClock, obj{"format": "date-time"}),
					"issuedAt":   stringSchema("When the approval record was issued.", actionAuditClock, obj{"format": "date-time"}),
				}, "hashPrefix", "paramsHash", "stepUp", "expiresAt", "consumed", "issuedAt")),
			}, "proposal", "tokens")),
		}, "resourceRef", "entries"), actionAuditExample()),
		"400": responseRef("400"),
		"401": responseRef("401"),
	})
}

func addActionObjectAuditPath(paths obj) {
	paths["/v1/objects/{resourceRef}/audit"] = obj{"get": actionAuditOperation()}
}
