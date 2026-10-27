package revenue

import "testing"

func TestDocumentedRelationshipStateHashMatchesProjector(t *testing.T) {
	hash, ids, err := relationshipProjectionHash(RelationshipState{
		Lifecycle:  "evaluation",
		Engagement: "declining",
		Sentiment:  "mixed",
		Health:     "needs_attention",
		Summary:    "Asked for pricing in April; wants a follow-up in July.",
		NextAction: "Confirm the security review owner.",
		Risks:      []string{"Security review has no owner."},
		Milestones: []string{"Proposal shared."},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("winners: %v", ids)
	}
	const want = "sha256:454f195e2389d36fd49e5c9b9656b7b47a3629332a84eb570edf3fa5248851e1"
	if hash != want {
		t.Fatalf("state hash %s", hash)
	}
}
