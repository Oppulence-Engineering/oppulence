package revenue

import (
	"strings"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/conversationintelligenceartifact"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueaction"
	"github.com/google/uuid"
)

func TestMutualActionPlanBindsAcceptedEvidenceAndExactShareRevision(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	f.svc.now = func() time.Time { return now }
	rel, row := recoveryCommitment(t, f, now)
	if _, err := f.svc.CreateMutualActionPlan(f.ctx, f.user, rel.ID, []uuid.UUID{row.ID}); err == nil {
		t.Fatal("internally confirmed commitment entered a bilateral plan before acceptance")
	}
	if _, err := f.svc.AppendCommitmentTransition(f.ctx, f.user, rel.ID, row.ID, CommitmentTransitionInput{
		Kind: "accepted", IdempotencyKey: "plan-acceptance-1", EvidenceRefs: []string{"counterparty:accepted"},
	}); err != nil {
		t.Fatal(err)
	}
	plan, err := f.svc.CreateMutualActionPlan(f.ctx, f.user, rel.ID, []uuid.UUID{row.ID})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Status != "draft" || len(plan.CurrentRevision.Items) != 1 ||
		len(plan.CurrentRevision.Items[0].EvidenceRefs) == 0 {
		t.Fatalf("unexpected evidence-backed plan: %#v", plan)
	}
	if plan.CurrentRevision.Items[0].ItemID != "item:"+row.ID.String() {
		t.Fatalf("plan item id: %q", plan.CurrentRevision.Items[0].ItemID)
	}
	items := append([]MutualActionPlanItem(nil), plan.CurrentRevision.Items...)
	items[0].Title = "Send the final security packet to owner@example.com"
	plan, err = f.svc.ReviseMutualActionPlan(f.ctx, f.user, rel.ID, plan.PlanID, items)
	if err != nil || plan.CurrentRevision.Version != 2 || plan.Status != "revised" {
		t.Fatalf("plan revision failed: %#v err=%v", plan, err)
	}
	plan, err = f.svc.ApproveMutualActionPlan(f.ctx, f.user, rel.ID, plan.PlanID)
	if err != nil || plan.Status != "internally_approved" {
		t.Fatalf("plan approval failed: %#v err=%v", plan, err)
	}
	plan, token, err := f.svc.ShareMutualActionPlan(f.ctx, f.user, rel.ID, plan.PlanID)
	if err != nil || plan.Status != "shared" || plan.TokenState != "active" || len(token) != 64 {
		t.Fatalf("revision-bound share failed: %#v token=%q err=%v", plan, token, err)
	}
	shared, err := f.client.RevenueAction.Query().Where(
		revenueaction.HasRelationshipWith(relationship.IDEQ(rel.ID)),
		revenueaction.DedupeKeyHasPrefix("mutual-action-plan:"),
	).Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if shared.Reason != "Draft an email to share this plan." {
		t.Fatalf("share reason: %q", shared.Reason)
	}
	if strings.Contains(shared.ProposedMessage, "sha256:") || strings.Contains(strings.ToLower(shared.ProposedMessage), "revision") {
		t.Fatalf("share draft leaks internal revision words: %q", shared.ProposedMessage)
	}
	if !strings.Contains(shared.ProposedMessage, "version 2") || !strings.Contains(shared.ProposedMessage, token) {
		t.Fatalf("share draft should name the version and include the response link: %q", shared.ProposedMessage)
	}
	latest, err := f.client.ConversationIntelligenceArtifact.Query().Where(
		conversationintelligenceartifact.KindEQ("mutual_action_plan"),
		conversationintelligenceartifact.StableIDEQ(plan.PlanID),
	).Order(ent.Desc(conversationintelligenceartifact.FieldVersion)).First(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(latest.PayloadJSON, token) || !strings.Contains(latest.PayloadJSON, "tokenHash") {
		t.Fatal("plan record must store only the scoped token hash")
	}
	public, err := f.svc.PublicMutualActionPlan(f.ctx, token)
	if err != nil || len(public.CurrentRevision.Items) != 1 ||
		len(public.CurrentRevision.Items[0].EvidenceRefs) != 0 || public.CurrentRevision.Items[0].CommitmentID != "" {
		t.Fatalf("public token escaped internal evidence scope: %#v err=%v", public, err)
	}
	if strings.Contains(public.CurrentRevision.Items[0].Title, "owner@example.com") ||
		!strings.Contains(public.CurrentRevision.Items[0].Title, "REDACTED_IDENTIFIER") {
		t.Fatalf("public plan did not apply effective redaction: %#v", public.CurrentRevision.Items[0])
	}
	responseID, err := f.svc.ReceiveMutualActionPlanResponse(f.ctx, token, PublicMutualActionPlanResponse{
		ResponseID: "counterparty-response-1", Kind: "blocked", ItemID: public.CurrentRevision.Items[0].ItemID,
		Comment: "Waiting on security counsel.",
	})
	if err != nil || responseID == "" {
		t.Fatalf("external response failed: id=%q err=%v", responseID, err)
	}
	unchanged, _ := f.client.Commitment.Get(f.ctx, row.ID)
	if unchanged.Status != "open" || unchanged.Blocker != "" {
		t.Fatalf("external response directly mutated canonical commitment: %#v", unchanged)
	}
	plans, err := mutualActionPlansFor(f.ctx, f.client, rel)
	if err != nil || len(plans) != 1 || plans[0].Status != "counterparty_responded" {
		t.Fatalf("plan did not enter response review state: %#v err=%v", plans, err)
	}
	if replayed, err := f.svc.ReceiveMutualActionPlanResponse(f.ctx, token, PublicMutualActionPlanResponse{
		ResponseID: "counterparty-response-1", Kind: "blocked", ItemID: public.CurrentRevision.Items[0].ItemID,
		Comment: "Waiting on security counsel.",
	}); err != nil || replayed != responseID {
		t.Fatalf("response replay was not idempotent: %q err=%v", replayed, err)
	}
	if _, err := f.svc.SaveConversationPolicyLayers(f.ctx, f.user, rel.ID, []ConversationPolicyLayer{{
		LayerID: "account:disable-plan-sharing", Scope: "account", Enforced: true,
		Capture: "require_consent", ModelRoute: "hosted_allowed", PublishEvidence: true,
		ExternalShare: false, RetentionDays: 30, RedactionClasses: []string{"personal_identifier"},
	}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.PublicMutualActionPlan(f.ctx, token); err == nil {
		t.Fatal("policy change did not revoke public plan access")
	}
	if _, err := f.svc.ReceiveMutualActionPlanResponse(f.ctx, token, PublicMutualActionPlanResponse{
		ResponseID: "counterparty-response-after-revocation", Kind: "comment", Comment: "Should be blocked.",
	}); err == nil {
		t.Fatal("policy change did not revoke public plan responses")
	}
}
