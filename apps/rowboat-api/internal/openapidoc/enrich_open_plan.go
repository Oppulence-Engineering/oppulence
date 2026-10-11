package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/revenue"
)

const (
	openPlanRelationshipID = "9c8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanCommitmentID   = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanEvidenceID     = "4b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanID             = "plan:5e8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanRevisionID     = "revision:5e8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanCreatedBy      = "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPlanCreatedAt      = "2026-07-31T14:00:00Z"
	openPlanDueAt          = "2026-09-14T17:00:00Z"
	openPlanTitle          = "Migration live by the 14th"
)

// openPlanInternalItems is the revision the server hashes before it strips
// evidence, the commitment id, and the owner from the page response.
func openPlanInternalItems() []revenue.MutualActionPlanItem {
	return []revenue.MutualActionPlanItem{{
		ItemID:              "item:" + openPlanCommitmentID,
		CommitmentID:        openPlanCommitmentID,
		Title:               openPlanTitle,
		OwnerParticipantRef: "alex@example.com",
		DependencyItemIDs:   []string{},
		DueAt:               openPlanDueAt,
		Status:              "open",
		EvidenceRefs:        []string{"revenue-evidence:" + openPlanEvidenceID},
	}}
}

func openPlanRevisionHash() string {
	payload, err := json.Marshal(openPlanInternalItems())
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func openPlanExample() obj {
	return obj{"plan": obj{
		"planId":           openPlanID,
		"relationshipId":   openPlanRelationshipID,
		"internalOwnerRef": "internal-owner",
		"counterpartyRef":  "counterparty",
		"status":           "shared",
		"tokenState":       "active",
		"currentRevision": obj{
			"revisionId":   openPlanRevisionID,
			"planId":       openPlanID,
			"version":      1,
			"revisionHash": openPlanRevisionHash(),
			"createdAt":    openPlanCreatedAt,
			"createdBy":    openPlanCreatedBy,
			"items": []any{obj{
				"itemId":              "item:" + openPlanCommitmentID,
				"title":               openPlanTitle,
				"ownerParticipantRef": "plan-participant",
				"dependencyItemIds":   []any{},
				"dueAt":               openPlanDueAt,
				"status":              "open",
				"evidenceRefs":        nil,
			}},
		},
	}}
}

func openPlanOperation() obj {
	return operation(
		"Relationship Intelligence",
		"Review the shared plan",
		"Review the shared plan opens this plan. The page shows the version and each item title.",
		"getPublicMutualActionPlan",
		nil,
		[]any{obj{
			"name":        "X-Oppulence-Plan-Token",
			"in":          "header",
			"required":    true,
			"description": "Scoped plan response token. Never put this token in a URL or query parameter.",
			"schema":      obj{"type": "string"},
		}},
		nil,
		obj{
			"200": jsonResponse("The shared plan.", freeFormSchema("Public mutual action plan."), openPlanExample()),
			"404": responseRef("404"),
		},
	)
}
