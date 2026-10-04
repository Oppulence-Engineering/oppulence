package revenue

import (
	"errors"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/conversationintelligenceartifact"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipstatesnapshot"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueevidence"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/google/uuid"
)

func TestConversationDeletionHonorsLegalHoldThenRemovesServerContentIdempotently(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	f.svc.now = func() time.Time { return now }
	results, err := f.svc.IngestRelationshipObservations(f.ctx, f.user, []RelationshipObservationInput{
		compiledConversationInput(now, "deletion-meeting-1", "v1"),
	})
	if err != nil {
		t.Fatal(err)
	}
	rel := results[0].Relationship
	viewer := newUser(t, f.client, "conversation-viewer@x.co", "conversation-viewer")
	if _, err := f.svc.UpsertWorkspaceMember(f.ctx, f.user, viewer.ID, "viewer"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.RequestConversationDeletion(auth.WithUser(f.ctx, viewer), viewer, rel.ID, "delete-viewer-1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer conversation deletion = %v, want ErrForbidden", err)
	}
	policy := ConversationPolicyLayer{
		LayerID: "account:deletion-test", Scope: "account", Enforced: true,
		Capture: "require_consent", ModelRoute: "hosted_allowed", PublishEvidence: true,
		ExternalShare: true, RetentionDays: 30,
		RedactionClasses: []string{"credentials", "personal_identifier"}, LegalHold: true,
	}
	if _, err := f.svc.SaveConversationPolicyLayers(f.ctx, f.user, rel.ID, []ConversationPolicyLayer{policy}); err != nil {
		t.Fatal(err)
	}
	blocked, err := f.svc.RequestConversationDeletion(f.ctx, f.user, rel.ID, "delete-held-1")
	if err != nil || blocked.Status != "blocked" || !blocked.LegalHold || blocked.Targets[0].ErrorCode != "legal_hold" {
		t.Fatalf("legal hold did not fail closed: %#v err=%v", blocked, err)
	}
	if count := f.client.RelationshipObservation.Query().Where(
		relationshipobservation.HasRelationshipWith(relationship.IDEQ(rel.ID)),
	).CountX(f.ctx); count == 0 {
		t.Fatal("legal hold removed conversation observations")
	}

	policy.LegalHold = false
	if _, err := f.svc.SaveConversationPolicyLayers(f.ctx, f.user, rel.ID, []ConversationPolicyLayer{policy}); err != nil {
		t.Fatal(err)
	}
	receipt, err := f.svc.RequestConversationDeletion(f.ctx, f.user, rel.ID, "delete-released-1")
	if err != nil || receipt.Status != "partial" || receipt.LegalHold {
		t.Fatalf("released deletion failed: %#v err=%v", receipt, err)
	}
	replay, err := f.svc.RequestConversationDeletion(f.ctx, f.user, rel.ID, "delete-released-1")
	if err != nil || replay.ReceiptID != receipt.ReceiptID || replay.RequestedAt != receipt.RequestedAt {
		t.Fatalf("deletion retry was not idempotent: %#v err=%v", replay, err)
	}
	otherRelationship := f.relationship(t)
	if _, err := f.svc.RequestConversationDeletion(f.ctx, f.user, otherRelationship.ID, "delete-released-1"); err == nil {
		t.Fatal("deletion request id was allowed to cross relationship scopes")
	}
	observations, err := f.client.RelationshipObservation.Query().Where(
		relationshipobservation.HasRelationshipWith(relationship.IDEQ(rel.ID)),
	).All(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, observation := range observations {
		if observation.Source == "meeting" && (observation.Summary != "" || observation.NormalizedFactsJSON != "{}" || len(observation.PayloadCiphertext) != 0) {
			t.Fatalf("deleted observation retained content: %#v", observation)
		}
	}
	evidences, err := f.client.RevenueEvidence.Query().Where(
		revenueevidence.HasRelationshipsWith(relationship.IDEQ(rel.ID)),
		revenueevidence.SourceEQ("meeting"),
	).All(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, evidence := range evidences {
		if evidence.Excerpt != "" || len(evidence.PayloadCiphertext) != 0 || evidence.SourceURI != "" {
			t.Fatalf("deleted evidence retained content: %#v", evidence)
		}
	}
	if count := f.client.ConversationIntelligenceArtifact.Query().Where(
		conversationintelligenceartifact.HasRelationshipWith(relationship.IDEQ(rel.ID)),
		conversationintelligenceartifact.KindIn(conversationArtifactContentKinds...),
	).CountX(f.ctx); count != 0 {
		t.Fatalf("deleted conversation artifacts remain: %d", count)
	}
	if count := f.client.ConversationIntelligenceArtifact.Query().Where(
		conversationintelligenceartifact.KindEQ("deletion_receipt"),
		conversationintelligenceartifact.StableIDEQ("delete-released-1"),
	).CountX(f.ctx); count != 1 {
		t.Fatalf("want one immutable deletion receipt, got %d", count)
	}
	assertMissionControlAfterConversationDeletion(t, f, rel.ID)
}

func TestConversationDeletionKeepsANotedCompanyReadable(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	f.svc.now = func() time.Time { return now }
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Sheet Co",
		PrimaryEmail: "hello@sheet.example", AccountDomain: "sheet.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(rel).
		SetSource("desktop_note").
		SetExternalID("sandbox-question").
		SetEventType("note").
		SetOccurredAt(now).
		SetReceivedAt(now).
		SetSummary("They asked about the sandbox.").
		SetNormalizedFactsJSON(`{"title":"Sandbox question"}`).
		SetContentHash("sandbox-question").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	receipt, err := f.svc.RequestConversationDeletion(f.ctx, f.user, rel.ID, "delete-note-1")
	if err != nil || receipt.Status != "partial" {
		t.Fatalf("note deletion failed: %#v err=%v", receipt, err)
	}
	observation, err := f.client.RelationshipObservation.Query().Where(
		relationshipobservation.HasRelationshipWith(relationship.IDEQ(rel.ID)),
		relationshipobservation.SourceEQ("desktop_note"),
	).Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if observation.Summary != "" || observation.NormalizedFactsJSON != "{}" {
		t.Fatalf("note content remained: summary=%q facts=%s", observation.Summary, observation.NormalizedFactsJSON)
	}
	assertMissionControlAfterConversationDeletion(t, f, rel.ID)
}

func assertMissionControlAfterConversationDeletion(t *testing.T, f *fixture, id uuid.UUID) {
	t.Helper()
	model, err := f.svc.MissionControl(f.ctx, f.user, id)
	if err != nil {
		t.Fatalf("company sheet after conversation deletion: %v", err)
	}
	if model.StateVersion < 1 {
		t.Fatalf("state version = %d, want a durable post-deletion version", model.StateVersion)
	}
	count, err := f.client.RelationshipStateSnapshot.Query().Where(
		relationshipstatesnapshot.HasRelationshipWith(relationship.IDEQ(id)),
		relationshipstatesnapshot.VersionEQ(model.StateVersion),
		relationshipstatesnapshot.StateHashEQ(model.StateHash),
	).Count(f.ctx)
	if err != nil || count != 1 {
		t.Fatalf("snapshot for version %d hash %s = %d, err=%v", model.StateVersion, model.StateHash, count, err)
	}
}
