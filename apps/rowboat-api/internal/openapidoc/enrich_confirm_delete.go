package openapidoc

const confirmDeleteDescription = "Confirm delete removes this company's conversation evidence from Oppulence. Copies on this device and at the mailbox stay until they are checked."

const (
	confirmDeleteRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	confirmDeleteReceiptID      = "delete:ab12"
)

func confirmDeleteParams() []any {
	return []any{obj{
		"name":        "relationshipId",
		"in":          "path",
		"required":    true,
		"description": "Relationship id.",
		"example":     confirmDeleteRelationshipID,
		"schema":      uuidSchema("Relationship id.", confirmDeleteRelationshipID),
	}}
}

func confirmDeleteReceipt() obj {
	return obj{
		"receiptId":   confirmDeleteReceiptID,
		"requestedAt": "2026-07-31T14:00:00Z",
		"scopeRef":    confirmDeleteRelationshipID,
		"legalHold":   false,
		"status":      "partial",
		"targets": []any{
			obj{"target": "local_recording", "status": "pending", "attempts": 0},
			obj{"target": "local_note", "status": "pending", "attempts": 0},
			obj{"target": "outbox", "status": "not_found", "verificationHash": "sha256:72a0d4998415278ba8231bc4d13ec4fd9de6cb620395d3bf33d1655078836ab6", "attempts": 1},
			obj{"target": "api_evidence", "status": "deleted", "verificationHash": "sha256:78de8eebd548d26e7a0e5d8444016899d995ababc2e0f58d6e38586017df69ae", "attempts": 1},
			obj{"target": "embedding", "status": "not_found", "verificationHash": "sha256:436ec9c35d2e6b7c1663caaf6933892865df01d599138b640447bd5211d3b7ea", "attempts": 1},
			obj{"target": "plan_share", "status": "not_found", "verificationHash": "sha256:d55b014616776abb8ea3e9fc743a4a4b5692507a962914ce476624c7aba2e4de", "attempts": 1},
			obj{"target": "provider", "status": "pending", "attempts": 0},
		},
	}
}
