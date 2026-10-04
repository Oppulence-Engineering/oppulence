package revenue

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipidentitycandidate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueaction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/google/uuid"
)

func identityCollisionFixture(t *testing.T) (*fixture, *ent.Relationship, *ent.Relationship, *ent.RelationshipIdentityCandidate, *ent.RevenueAction) {
	t.Helper()
	f := newFixture(t)
	now := time.Date(2026, 7, 31, 17, 0, 0, 0, time.UTC)
	seed, err := f.svc.IngestRelationshipObservations(f.ctx, f.user, []RelationshipObservationInput{{
		DisplayName: "Canonical Acme", Source: "hubspot", ExternalID: "canonical-acme", EventType: "company.created",
		ResourceRefs: []string{"hubspot:company:identity-review"}, OccurredAt: now, ReceivedAt: now,
	}})
	if err != nil {
		t.Fatal(err)
	}
	existing := seed[0].Relationship
	proposed, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{Kind: "company", DisplayName: "Proposed Acme"})
	if err != nil {
		t.Fatal(err)
	}
	action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: proposed.ID, ActionType: "warm_follow_up", Channel: "email",
		Reason: "pre-existing proposed action", RecipientEmail: "buyer@acme.example",
		ProposedSubject: "Follow up", ProposedMessage: "Hello", ExecutionMode: ExecModeDraft,
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.svc.IngestRelationshipObservations(f.ctx, f.user, []RelationshipObservationInput{{
		RelationshipID: proposed.ID, DisplayName: "Proposed Acme", Source: "hubspot",
		ExternalID: "ambiguous-acme", EventType: "company.updated",
		ResourceRefs: []string{"hubspot:company:identity-review"}, OccurredAt: now.Add(time.Minute), ReceivedAt: now.Add(time.Minute),
		Assertions: []RelationshipAssertionInput{{
			Dimension: "summary", Value: "Ambiguous evidence", SourceType: "source_fact", Confidence: 1,
			Reason: "The provider anchor conflicts with an existing canonical relationship.",
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	candidate, err := f.client.RelationshipIdentityCandidate.Query().
		Where(relationshipidentitycandidate.StatusEQ(identityPending)).
		WithProposedRelationship().WithExistingRelationship().Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	return f, existing, proposed, candidate, action
}

func TestIdentityDeferMergeAndCompensatingSplitPreserveLineage(t *testing.T) {
	f, existing, proposed, candidate, action := identityCollisionFixture(t)

	deferred, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "defer", Reason: "need account owner review", ExpectedVersion: candidate.Version, IdempotencyKey: "identity-defer-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if deferred.Status != identityDeferred || deferred.Version != 2 {
		t.Fatalf("unexpected deferred candidate: status=%s version=%d", deferred.Status, deferred.Version)
	}
	// Deferred ambiguity is scoped: unrelated relationships continue normally.
	unrelated, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{Kind: "person", DisplayName: "Unrelated"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: unrelated.ID, ActionType: "warm_follow_up", Channel: "email", Reason: "unrelated",
		RecipientEmail: "unrelated@example.com", ProposedSubject: "Hello", ProposedMessage: "Hello",
	}); err != nil {
		t.Fatalf("deferred candidate blocked unrelated relationship: %v", err)
	}

	merged, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "merge", Reason: "provider record is the same account", ExpectedVersion: deferred.Version, IdempotencyKey: "identity-merge-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if merged.Status != identityResolved || merged.Version != 3 {
		t.Fatalf("merge projection: %+v", merged)
	}
	observation, err := f.client.RelationshipObservation.Query().Where(relationshipobservation.ExternalIDEQ("ambiguous-acme")).WithRelationship().Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	owner, _ := observation.Edges.RelationshipOrErr()
	if owner.ID != existing.ID {
		t.Fatalf("merge did not move observation: got %s", owner.ID)
	}
	movedAction, err := f.client.RevenueAction.Query().Where(revenueaction.IDEQ(action.ID)).WithRelationship().Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	actionOwner, _ := movedAction.Edges.RelationshipOrErr()
	if actionOwner.ID != existing.ID {
		t.Fatalf("merge did not move pending action: got %s", actionOwner.ID)
	}
	archived, err := f.client.Relationship.Get(f.ctx, proposed.ID)
	if err != nil || archived.Status != "archived" {
		t.Fatalf("proposed relationship not archived: %+v err=%v", archived, err)
	}

	split, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "split", Reason: "new evidence proved separate accounts", ExpectedVersion: merged.Version, IdempotencyKey: "identity-split-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if split.Status != identityUndone || split.Version != 4 {
		t.Fatalf("split projection: %+v", split)
	}
	observation, err = f.client.RelationshipObservation.Query().Where(relationshipobservation.ExternalIDEQ("ambiguous-acme")).WithRelationship().Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	owner, _ = observation.Edges.RelationshipOrErr()
	if owner.ID != proposed.ID {
		t.Fatalf("split did not restore observation: got %s", owner.ID)
	}
	restoredAction, err := f.client.RevenueAction.Query().Where(revenueaction.IDEQ(action.ID)).WithRelationship().Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	actionOwner, _ = restoredAction.Edges.RelationshipOrErr()
	if actionOwner.ID != proposed.ID {
		t.Fatalf("split did not restore pending action: got %s", actionOwner.ID)
	}
	restored, err := f.client.Relationship.Get(f.ctx, proposed.ID)
	if err != nil || restored.Status != "active" {
		t.Fatalf("proposed relationship not restored: %+v err=%v", restored, err)
	}

	loaded, err := f.svc.GetIdentityCandidate(f.ctx, f.user, candidate.ID)
	if err != nil {
		t.Fatal(err)
	}
	decisions, _ := loaded.Edges.DecisionsOrErr()
	lineage, _ := loaded.Edges.LineageEventsOrErr()
	if len(decisions) != 3 || len(lineage) != 4 {
		t.Fatalf("immutable audit history missing: decisions=%d lineage=%d", len(decisions), len(lineage))
	}
	if decisions[2].CompensatesDecisionID == nil {
		t.Fatal("split decision must identify the decision it compensates")
	}
}

func TestIdentityDecisionIdempotencyAndOptimisticConcurrency(t *testing.T) {
	f, _, _, candidate, _ := identityCollisionFixture(t)
	first, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "keep_separate", Reason: "verified distinct", ExpectedVersion: candidate.Version, IdempotencyKey: "keep-separate-once",
	})
	if err != nil {
		t.Fatal(err)
	}
	again, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "keep_separate", Reason: "ignored replay body", ExpectedVersion: candidate.Version, IdempotencyKey: "keep-separate-once",
	})
	if err != nil {
		t.Fatalf("idempotent replay: %v", err)
	}
	if again.ID != first.ID || again.Version != first.Version {
		t.Fatalf("idempotent replay changed candidate: first=%+v again=%+v", first, again)
	}
	if _, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "defer", ExpectedVersion: candidate.Version, IdempotencyKey: "stale-reviewer",
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale reviewer must lose optimistic CAS, got %v", err)
	}
}

func TestIdentityCandidateEvidenceWindowIsMonotonicForOutOfOrderEvidence(t *testing.T) {
	f, _, proposed, candidate, _ := identityCollisionFixture(t)
	if candidate.EvidenceFrom == nil || candidate.EvidenceTo == nil {
		t.Fatalf("candidate evidence window was not initialized: %+v", candidate)
	}
	latest := candidate.EvidenceTo.UTC()
	older := latest.Add(-2 * time.Hour)
	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user, []RelationshipObservationInput{{
		RelationshipID: proposed.ID, DisplayName: proposed.DisplayName, Source: "hubspot",
		ExternalID: "late-arriving-ambiguous-acme", EventType: "company.updated",
		OccurredAt: older, ReceivedAt: latest.Add(time.Minute),
	}}); err != nil {
		t.Fatal(err)
	}
	updated, err := f.client.RelationshipIdentityCandidate.Get(f.ctx, candidate.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.EvidenceFrom == nil || !updated.EvidenceFrom.Equal(older) {
		t.Fatalf("older evidence did not widen the lower boundary: %+v", updated)
	}
	if updated.EvidenceTo == nil || !updated.EvidenceTo.Equal(latest) {
		t.Fatalf("older evidence regressed the upper boundary: before=%s candidate=%+v", latest, updated)
	}
}

func TestConcurrentIdentityDecisionsResolveOnce(t *testing.T) {
	f, _, _, candidate, _ := identityCollisionFixture(t)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, decision := range []string{"merge", "keep_separate"} {
		wg.Add(1)
		go func(decision string) {
			defer wg.Done()
			<-start
			_, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
				Decision: decision, ExpectedVersion: candidate.Version, IdempotencyKey: "concurrent-" + decision,
			})
			errs <- err
		}(decision)
	}
	close(start)
	wg.Wait()
	close(errs)
	success, conflicts := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			success++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent decision error: %v", err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("decisions did not resolve once: success=%d conflict=%d", success, conflicts)
	}
	count, err := f.client.RelationshipIdentityDecision.Query().Count(f.ctx)
	if err != nil || count != 1 {
		t.Fatalf("immutable decisions=%d err=%v", count, err)
	}
}

func TestCompensationRefusesInFlightAction(t *testing.T) {
	f, _, _, candidate, _ := identityCollisionFixture(t)
	merged, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "merge", ExpectedVersion: candidate.Version, IdempotencyKey: "unsafe-merge",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RevenueAction.Update().Where(revenueaction.ExecutionStatusEQ(ExecPending)).SetExecutionStatus(ExecRequested).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.DecideIdentityCandidate(f.ctx, f.user, candidate.ID, IdentityDecisionInput{
		Decision: "undo", ExpectedVersion: merged.Version, IdempotencyKey: "unsafe-undo",
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("unsafe compensation must fail closed, got %v", err)
	}
	status, err := f.client.RelationshipIdentityCandidate.Query().Where(relationshipidentitycandidate.IDEQ(candidate.ID)).Only(f.ctx)
	if err != nil || status.Status != identityResolved {
		t.Fatalf("failed compensation changed candidate: status=%+v err=%v", status, err)
	}
}

func TestSameDomainPeopleRemainDistinctUnderIdentityReview(t *testing.T) {
	f := newFixture(t)
	avery, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{Kind: "person", DisplayName: "Avery", PrimaryEmail: "avery@acme.example", AccountDomain: "acme.example"})
	if err != nil {
		t.Fatal(err)
	}
	morgan, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{Kind: "person", DisplayName: "Morgan", PrimaryEmail: "morgan@acme.example", AccountDomain: "acme.example"})
	if err != nil {
		t.Fatal(err)
	}
	if avery.ID == morgan.ID {
		t.Fatal("same-domain people auto-merged")
	}
	count, err := f.client.Relationship.Query().Where(relationship.KindEQ("person")).Count(f.ctx)
	if err != nil || count != 2 {
		t.Fatalf("person count=%d err=%v", count, err)
	}
}

func TestListIdentityCandidatesOffsetSkipsTheNewest(t *testing.T) {
	f := newFixture(t)
	internal := auth.WithInternal(context.Background())
	workspace, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	existing := f.relationship(t)
	oldestRel := f.relationship(t)
	middleRel := f.relationship(t)
	newestRel := f.relationship(t)
	base := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	oldest := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(workspace).SetUser(f.user).
		SetProposedRelationship(oldestRel).SetExistingRelationship(existing).
		SetDedupeKey("oldest").SetAnchorKind("domain").SetAnchorKeyHash("hash-oldest").
		SetStatus("pending").SetCreatedAt(base).SaveX(internal)
	middle := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(workspace).SetUser(f.user).
		SetProposedRelationship(middleRel).SetExistingRelationship(existing).
		SetDedupeKey("middle").SetAnchorKind("domain").SetAnchorKeyHash("hash-middle").
		SetStatus("pending").SetCreatedAt(base.Add(time.Hour)).SaveX(internal)
	f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(workspace).SetUser(f.user).
		SetProposedRelationship(newestRel).SetExistingRelationship(existing).
		SetDedupeKey("newest").SetAnchorKind("domain").SetAnchorKeyHash("hash-newest").
		SetStatus("pending").SetCreatedAt(base.Add(2 * time.Hour)).SaveX(internal)

	page, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 1, Offset: 1,
	})
	if err != nil {
		t.Fatalf("offset page: %v", err)
	}
	if !page.HasMore || len(page.Candidates) != 1 || page.Candidates[0].ID != middle.ID {
		t.Fatalf("offset page = %+v, want the middle duplicate and another page", page)
	}
	rest, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 10, Offset: 2,
	})
	if err != nil {
		t.Fatalf("last page: %v", err)
	}
	if rest.HasMore || len(rest.Candidates) != 1 || rest.Candidates[0].ID != oldest.ID {
		t.Fatalf("last page = %+v, want the oldest duplicate", rest)
	}
	neg, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 10, Offset: -2,
	})
	if err != nil {
		t.Fatalf("negative offset: %v", err)
	}
	if neg.HasMore || len(neg.Candidates) != 3 || neg.Candidates[2].ID != oldest.ID {
		t.Fatalf("negative offset = %+v, want every duplicate newest first", neg)
	}
}

func TestListIdentityCandidatesExactPageIsNotAnotherPage(t *testing.T) {
	f := newFixture(t)
	internal := auth.WithInternal(context.Background())
	workspace, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	existing := f.relationship(t)
	when := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	oldest := uuid.MustParse("a1166000-0000-4000-8000-000000000001")
	for i := 1; i <= 50; i++ {
		f.client.RelationshipIdentityCandidate.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a1166000-0000-4000-8000-%012d", i))).
			SetWorkspace(workspace).SetUser(f.user).
			SetProposedRelationship(f.relationship(t)).SetExistingRelationship(existing).
			SetDedupeKey(fmt.Sprintf("exact-%d", i)).SetAnchorKind("domain").
			SetAnchorKeyHash(fmt.Sprintf("hash-%d", i)).
			SetStatus("pending").SetCreatedAt(when).SaveX(internal)
	}

	exact, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 50,
	})
	if err != nil {
		t.Fatalf("exact page: %v", err)
	}
	if exact.HasMore || len(exact.Candidates) != 50 {
		t.Fatalf("exact page hasMore=%v len=%d, want the fifty duplicates and no further page", exact.HasMore, len(exact.Candidates))
	}
	foundOldest := false
	for _, candidate := range exact.Candidates {
		if candidate.ID == oldest {
			foundOldest = true
		}
	}
	if !foundOldest {
		t.Fatal("exact page dropped the oldest duplicate")
	}

	f.client.RelationshipIdentityCandidate.Create().
		SetID(uuid.MustParse("a1166000-0000-4000-8000-000000000051")).
		SetWorkspace(workspace).SetUser(f.user).
		SetProposedRelationship(f.relationship(t)).SetExistingRelationship(existing).
		SetDedupeKey("exact-51").SetAnchorKind("domain").SetAnchorKeyHash("hash-51").
		SetStatus("pending").SetCreatedAt(when).SaveX(internal)

	first, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 50,
	})
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if !first.HasMore || len(first.Candidates) != 50 {
		t.Fatalf("first page hasMore=%v len=%d, want fifty duplicates and another page", first.HasMore, len(first.Candidates))
	}
	for _, candidate := range first.Candidates {
		if candidate.ID == oldest {
			t.Fatal("first page included the oldest duplicate")
		}
	}
	second, err := f.svc.ListIdentityCandidates(f.ctx, f.user, IdentityCandidateFilter{
		Status: "pending", Limit: 50, Offset: 50,
	})
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if second.HasMore || len(second.Candidates) != 1 || second.Candidates[0].ID != oldest {
		t.Fatalf("second page = %+v, want the oldest duplicate and no further page", second)
	}
}
