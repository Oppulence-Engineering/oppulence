package openapidoc

import "github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/actions"

const objectAuditDescription = "Audit trail opens this object's proposal, approval, and execution. The page shows the proposal kind, the approval prefix, and the execution result."

const (
	objectAuditTarget     = "conduit:invoice:inv_456"
	objectAuditProposalID = "5f8dfa9b-a7b2-46ea-982c-622a914c00e5"
	objectAuditParams     = `{"amount":100,"step":2}`
	objectAuditClock      = "2026-07-31T14:00:00Z"
	objectAuditExpires    = "2026-07-31T14:05:00Z"
	// Ledger preimage for the redacted approval prefix. It is not an approval token.
	objectAuditLedger = "documented-audit-ledger"
)

func objectAuditParamsHash() string {
	hash, err := actions.ParamsHash(objectAuditParams)
	if err != nil {
		panic(err)
	}
	return hash
}

func objectAuditHashPrefix() string {
	return actions.Hash(objectAuditLedger)[:12]
}

func objectAuditExample() obj {
	return obj{
		"resourceRef": objectAuditTarget,
		"entries": []any{obj{
			"proposal": obj{
				"id":         objectAuditProposalID,
				"target":     objectAuditTarget,
				"kind":       "conduit.dunning.advance",
				"paramsJson": objectAuditParams,
				"financial":  false,
				"rationale":  "Acme is 14 days overdue",
				"status":     "executed",
				"resultRef":  "conduit:step:step_1",
				"approvedAt": objectAuditClock,
				"executedAt": objectAuditClock,
				"createdAt":  objectAuditClock,
			},
			"tokens": []any{obj{
				"hashPrefix": objectAuditHashPrefix(),
				"paramsHash": objectAuditParamsHash(),
				"stepUp":     false,
				"expiresAt":  objectAuditExpires,
				"consumed":   true,
				"consumedAt": objectAuditClock,
				"issuedAt":   objectAuditClock,
			}},
		}},
	}
}

func objectAuditParam() obj {
	param := pathParam(
		"resourceRef",
		"The object Audit trail opens. Agent approvals sends the proposal target.",
		stringSchema("Proposal target.", objectAuditTarget),
	)
	param["example"] = objectAuditTarget
	return param
}

func objectAuditOperation() obj {
	return operation(
		"Revenue",
		"Audit trail",
		objectAuditDescription,
		"getObjectAudit",
		bearer(),
		[]any{objectAuditParam()},
		nil,
		obj{
			"200": jsonResponse("Audit trail.", freeFormSchema("Audit trail."), objectAuditExample()),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
			"500": responseRef("500"),
		},
	)
}

func addObjectAuditPath(paths obj) {
	paths["/v1/objects/{resourceRef}/audit"] = obj{"get": objectAuditOperation()}
}
