package openapidoc

const earlierEvidenceDescription = "Show earlier evidence loads the next page of focused review. It skips the newest 200 conversations. This page has one speaker to resolve, and no older conversation after it."

const (
	earlierEvidenceRelationship = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	earlierEvidenceObservation  = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	earlierEvidenceOffset       = 200
)

func earlierEvidencePage() obj {
	return obj{
		"reviewItems": []any{obj{
			"id":             "review:ab12cd34ef567890",
			"kind":           "speaker",
			"label":          "Resolve the speaker for a material statement",
			"currentValue":   "Other",
			"confidence":     0.5,
			"observationId":  earlierEvidenceObservation,
			"claimId":        "claim:ab12",
			"stateDimension": "risk",
			"exactQuote":     "We are concerned security could delay the renewal.",
		}},
		"governanceReceipts": []any{obj{
			"receiptId":             "governance:ab12",
			"capturedAt":            "2026-07-10T16:00:00Z",
			"capturePolicy":         "manual_capture",
			"routing":               "local_transcription_to_oppulence",
			"region":                "local_device",
			"retention":             "untilTranscribed",
			"participantDisclosure": "not_recorded",
			"legalHold":             false,
			"deletionOutcome":       "scheduled_after_transcription",
			"evidenceClip":          "not_retained",
		}},
		"hasMore": false,
	}
}

func earlierEvidenceOperation() obj {
	offsetSchema := obj{"type": "integer", "minimum": 0, "example": earlierEvidenceOffset}
	return operation(
		"Relationship Intelligence",
		"Show earlier evidence",
		earlierEvidenceDescription,
		"getRelationshipConversationReview",
		bearer(),
		[]any{
			pathParam("relationshipId", "Company this review belongs to.", uuidSchema("Company id.", earlierEvidenceRelationship)),
			obj{
				"name":        "offset",
				"in":          "query",
				"required":    false,
				"description": "How many conversations to skip. Show earlier evidence skips the newest 200.",
				"example":     earlierEvidenceOffset,
				"schema":      offsetSchema,
			},
		},
		nil,
		obj{
			"200": jsonResponse("Older focused review.", objectSchema("Focused review from older conversations.", obj{
				"reviewItems":        arraySchema("Review items from this older page.", ref("ConversationReviewItem")),
				"governanceReceipts": arraySchema("Receipts from this older page.", ref("ConversationGovernanceReceipt")),
				"hasMore":            boolSchema("Another older conversation exists beyond this page.", false),
			}, "reviewItems", "governanceReceipts", "hasMore"), earlierEvidencePage()),
			"400": responseRef("400"),
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)
}
