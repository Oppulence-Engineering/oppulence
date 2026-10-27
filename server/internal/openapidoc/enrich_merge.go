package openapidoc

const mergeDescription = "Merge combines this possible duplicate into the company that already exists. The extra company is archived."

const (
	mergeCandidateID    = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeProposedID     = "fa8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeExistingID     = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeDecisionID     = "aa8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeLineageID      = "ba8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeActorID        = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeIdempotencyKey = "cb8dfa9b-a7b2-46ea-982c-622a914c00e5"
	mergeReason         = "Reviewed in the identity inbox: merge."
	mergeDecidedAt      = "2026-07-31T14:00:00Z"
)

func mergeParams() []any {
	return []any{obj{
		"name":        "candidateId",
		"in":          "path",
		"required":    true,
		"description": "Identity candidate id.",
		"example":     mergeCandidateID,
		"schema":      uuidSchema("Identity candidate id.", mergeCandidateID),
	}}
}

func mergeCompany(id, name, status string) obj {
	return obj{
		"id":               id,
		"kind":             "company",
		"displayName":      name,
		"accountDomain":    "example.com",
		"status":           status,
		"peopleCount":      0,
		"emailThreadCount": 0,
		"commitmentCount":  0,
		"lifecycle":        "evaluation",
		"engagement":       "steady",
		"sentiment":        "mixed",
		"health":           "needs_attention",
		"stateVersion":     4,
		"projectorVersion": 2,
		"risks":            []any{},
		"milestones":       []any{},
		"resourceRefs":     []any{},
		"categories":       []any{},
	}
}

func mergedCandidate() obj {
	return obj{
		"id":                       mergeCandidateID,
		"status":                   "resolved",
		"candidateType":            "anchor_collision",
		"version":                  2,
		"proposedRelationship":     mergeCompany(mergeProposedID, "Acme Inc.", "archived"),
		"existingRelationship":     mergeCompany(mergeExistingID, "Acme", "active"),
		"anchorKind":               "provider_resource",
		"anchorProvider":           "hubspot",
		"anchorPreview":            "contact …123",
		"matchingAnchors":          []any{"hubspot:contact:123"},
		"conflictingAnchors":       []any{},
		"evidenceRefs":             []any{"relationship-observation:4b8dfa9b-a7b2-46ea-982c-622a914c00e5"},
		"evidenceCount":            1,
		"impact":                   obj{"evidence": 1},
		"recommendedDecision":      "merge",
		"recommendationConfidence": 0.5,
		"decision":                 "merge",
		"decisionReason":           mergeReason,
		"decisionActorId":          mergeActorID,
		"decidedAt":                mergeDecidedAt,
		"decisions": []any{obj{
			"id":               mergeDecisionID,
			"decision":         "merge",
			"candidateVersion": 2,
			"actorId":          mergeActorID,
			"reason":           mergeReason,
			"decidedAt":        mergeDecidedAt,
		}},
		"lineage": []any{obj{
			"id":                    mergeLineageID,
			"kind":                  "merged",
			"actorId":               mergeActorID,
			"reason":                mergeReason,
			"observationIds":        []any{},
			"identityIds":           []any{},
			"movedObjectRefs":       []any{},
			"beforeRelationshipIds": []any{mergeProposedID, mergeExistingID},
			"afterRelationshipIds":  []any{mergeExistingID},
			"occurredAt":            mergeDecidedAt,
		}},
	}
}
