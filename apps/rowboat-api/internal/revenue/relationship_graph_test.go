package revenue

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
)

func TestRelationshipGraphReturnsVersionedGovernedProjection(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: "email",
		Reason: "A reviewed graph action", RecipientEmail: "buyer@example.com",
		ProposedSubject: "Following up", ProposedMessage: "A governed draft.",
		ExecutionMode: ExecModeDraft, PriorityScore: 80,
	})
	if err != nil {
		t.Fatalf("action: %v", err)
	}

	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope:          "relationship",
		RelationshipID: &rel.ID,
		Depth:          2,
		AsOf:           f.svc.now(),
	})
	if err != nil {
		t.Fatalf("relationship graph: %v", err)
	}
	dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
	if dto.ContractVersion != relationshipGraphContractVersion {
		t.Fatalf("contract version = %q", dto.ContractVersion)
	}
	if dto.Scope != "relationship" || dto.RelationshipID != rel.ID.String() {
		t.Fatalf("unexpected relationship scope: %#v", dto)
	}
	if !dto.Permissions.CanApprove || !dto.Permissions.CanExecute {
		t.Fatalf("owner must retain governed-action permissions: %#v", dto.Permissions)
	}

	kinds := map[string]int{}
	var graphAction relationshipGraphNodeDTO
	for _, node := range dto.Nodes {
		kinds[node.Kind]++
		if node.ID == "action:"+action.ID.String() {
			graphAction = node
		}
	}
	if kinds["relationship"] != 1 || kinds["action"] != 1 {
		t.Fatalf("expected relationship and action nodes, got %#v", kinds)
	}
	if graphAction.ApprovalStatus != ApprovalPending || graphAction.ResourceRef != action.ID.String() {
		t.Fatalf("action governance was not projected: %#v", graphAction)
	}
	if graphAction.Label != "Warm follow-up" {
		t.Fatalf("action label = %q, want Warm follow-up", graphAction.Label)
	}
	if len(dto.Edges) == 0 || dto.Edges[0].Label == "" || !dto.Edges[0].Directed {
		t.Fatalf("typed directional edge missing: %#v", dto.Edges)
	}
}

func TestRelationshipGraphSourceUsesSourceFreshness(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	past := f.svc.now().UTC().Add(-2 * time.Hour)
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("meeting").SetSourceAccountID("default").
		SetStatus("live").SetCompleteness("complete").
		SetExpectedCadenceSeconds(60).
		SetLastSuccessAt(past).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
		SetSource("meeting").SetExternalID("graph-stale-source").
		SetEventType("note").SetOccurredAt(past).
		SetReceivedAt(past).
		SetSummary("A meeting note").SetContentHash("graph-stale-source").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	asOf := f.svc.now().UTC()
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, asOf)
	for _, node := range dto.Nodes {
		if node.Kind != "source" {
			continue
		}
		if node.Status != "stale" {
			t.Fatalf("source status = %q, want stale", node.Status)
		}
		return
	}
	t.Fatal("meeting source missing from the graph")
}

func TestRelationshipGraphRejectsFutureHistoricalBoundary(t *testing.T) {
	f := newFixture(t)
	_, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "portfolio",
		Depth: 2,
		AsOf:  f.svc.now().Add(2 * time.Minute),
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("future asOf: want ErrInvalidInput, got %v", err)
	}
}

func TestRelationshipGraphNamesAConfirmedPromiseOnce(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	const sentence = "Send the quay detail"
	if _, err := f.client.Commitment.Create().SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
		SetDirection("promised_by_them").SetText(sentence).SetConfidence(1).
		SetAcceptance("internally_confirmed").SetCurrentEventVersion(2).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	occurred := f.svc.now().Add(-time.Minute)
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
		SetSource("meeting").SetExternalID("commitment:promised_by_them:quay-detail").
		SetEventType("commitment_confirmed").SetOccurredAt(occurred).SetReceivedAt(occurred).
		SetSummary(sentence).SetContentHash("quay-detail-confirmed").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	asOf := f.svc.now()
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, asOf)
	var promise, activity relationshipGraphNodeDTO
	for _, node := range dto.Nodes {
		if node.Kind == "commitment" && node.Label == sentence {
			promise = node
		}
		if node.Kind == "evidence" && node.Status == "Promise confirmed" {
			activity = node
		}
	}
	if promise.ID == "" {
		t.Fatal("promise node missing")
	}
	if activity.Label != "Promise confirmed" || activity.Summary != sentence {
		t.Fatalf("confirmed activity = label %q summary %q", activity.Label, activity.Summary)
	}
	noteLabel, noteDetail := graphObservationPresentation("note", "Graph evidence 101")
	if noteLabel != "Graph evidence 101" || noteDetail != "" {
		t.Fatalf("note activity = label %q detail %q", noteLabel, noteDetail)
	}
}

func TestRelationshipGraphProjectsAPromiseLikeTheRegister(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	soon, err := f.client.Commitment.Create().SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
		SetDirection("promised_by_me").SetText("  Send the harbor note.  ").SetConfidence(1).
		SetAcceptance("accepted").SetDueAt(time.Now().UTC().Add(24 * time.Hour)).SetCurrentEventVersion(1).Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	kept, err := f.client.Commitment.Create().SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the kept note").SetStatus("fulfilled").
		SetConfidence(1).SetAcceptance("accepted").SetCurrentEventVersion(1).Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	guessed, err := f.client.Commitment.Create().SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the guessed note").SetConfidence(0.4).
		SetAcceptance("candidate").SetDueAt(time.Now().UTC().Add(24 * time.Hour)).SetCurrentEventVersion(1).Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	asOf := f.svc.now()
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 1, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, asOf)
	seen := map[string]relationshipGraphNodeDTO{}
	for _, node := range dto.Nodes {
		if node.Kind == "commitment" {
			seen[node.ID] = node
		}
	}
	risk := seen["commitment:"+soon.ID.String()]
	if risk.Status != RegisterAtRisk || risk.Label != "Send the harbor note." {
		t.Fatalf("due-soon promise = status %q label %q", risk.Status, risk.Label)
	}
	met := seen["commitment:"+kept.ID.String()]
	if met.Status != RegisterMet || met.Label != "Send the kept note" {
		t.Fatalf("kept promise = status %q label %q", met.Status, met.Label)
	}
	review := seen["commitment:"+guessed.ID.String()]
	if review.Status != "review" || review.Label != "Send the guessed note" {
		t.Fatalf("unconfirmed promise = status %q label %q", review.Status, review.Label)
	}
	var promiseEdge string
	for _, edge := range dto.Edges {
		if edge.Kind == "has_commitment" && edge.Target == "commitment:"+soon.ID.String() {
			promiseEdge = edge.Label
		}
	}
	if promiseEdge != "has promise" {
		t.Fatalf("promise edge = %q", promiseEdge)
	}
	if graphDependencyLabel("supersedes") != "replaces" || graphDependencyLabel("blocks") != "blocks" {
		t.Fatal("a promise link should say what it does")
	}
}

func TestRelationshipGraphCommitmentCarriesQueueMetadata(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	row, err := f.client.Commitment.Create().SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
		SetDirection("promised_by_me").SetText("Send the security packet").SetConfidence(1).
		SetOwnerParticipantRef("owner@example.com").SetCounterpartyParticipantRef("buyer@example.com").
		SetBeneficiaryParticipantRef("buyer@example.com").SetDuePhrase("Friday").
		SetDueTimezone("America/New_York").SetCurrentEventVersion(3).Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 1, AsOf: f.svc.now(),
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
	for _, node := range dto.Nodes {
		if node.ID != "commitment:"+row.ID.String() {
			continue
		}
		if node.Metadata["counterpartyParticipantRef"] != "buyer@example.com" ||
			node.Metadata["currentEventVersion"] != 3 {
			t.Fatalf("commitment queue metadata missing: %#v", node.Metadata)
		}
		return
	}
	t.Fatal("commitment node missing")
}

func TestRelationshipGraphHistoricalBoundaryUsesEligibleActionRevision(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: "email",
		Reason: "Original evidence-backed reason", RecipientEmail: "buyer@example.com",
		ProposedSubject: "Original subject", ProposedMessage: "Original message.",
		ExecutionMode: ExecModeDraft, PriorityScore: 80,
	})
	if err != nil {
		t.Fatalf("action: %v", err)
	}

	// Capture a boundary after revision 1, then create revision 2. The service
	// clock is advanced independently so the read is unambiguously historical.
	asOf := time.Now().UTC()
	time.Sleep(2 * time.Millisecond)
	revisedType := "meeting_follow_up"
	revisedReason := "Later reason that must not cross the boundary"
	if _, err := f.svc.EditAction(f.ctx, f.user, action.ID, EditInput{
		ActionType: &revisedType,
		Reason:     &revisedReason,
	}); err != nil {
		t.Fatalf("edit action: %v", err)
	}
	f.svc.now = func() time.Time { return asOf.Add(2 * time.Second) }

	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf,
	})
	if err != nil {
		t.Fatalf("historical graph: %v", err)
	}
	dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
	var graphAction relationshipGraphNodeDTO
	for _, node := range dto.Nodes {
		if node.ID == "action:"+action.ID.String() {
			graphAction = node
			break
		}
	}
	if graphAction.ID == "" {
		t.Fatal("historical action node missing")
	}
	if graphAction.Label != "Warm follow-up" || graphAction.Summary != "Original evidence-backed reason" {
		t.Fatalf("later action revision leaked across asOf: %#v", graphAction)
	}
	if graphAction.Metadata["revision"] != 1 {
		t.Fatalf("historical action revision = %#v, want 1", graphAction.Metadata["revision"])
	}
}

func TestGraphActionLabelUsesTheProductTitle(t *testing.T) {
	if got := graphActionLabel("follow_up_task"); got != "Follow-up task" {
		t.Fatalf("follow_up_task label = %q", got)
	}
	if got := graphActionLabel("commitment_rescue"); got != "Promise follow-up" {
		t.Fatalf("commitment_rescue label = %q", got)
	}
	if got := graphActionLabel("custom_signal"); got != "custom signal" {
		t.Fatalf("unknown action label = %q", got)
	}
}

func TestGraphSourceLabelUsesTheProductTitle(t *testing.T) {
	if got := graphSourceLabel("desktop_note"); got != "A note" {
		t.Fatalf("desktop_note label = %q", got)
	}
	if got := graphSourceLabel("gmail"); got != "Gmail" {
		t.Fatalf("gmail label = %q", got)
	}
	if got := graphSourceLabel("custom_feed"); got != "Custom Feed" {
		t.Fatalf("unknown source label = %q", got)
	}
	if got := graphEventLabel("thread.updated"); got != "Mail updated" {
		t.Fatalf("thread.updated label = %q", got)
	}
	if got := graphEventLabel("custom.event_name"); got != "Custom Event Name" {
		t.Fatalf("unknown event label = %q", got)
	}
}

func TestRelationshipGraphPagesPastTheNewestCompanies(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	asOf := f.svc.now().UTC()
	const total = relationshipListLimit + 1
	for i := 1; i <= total; i++ {
		if _, err := f.client.Relationship.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetKind("company").
			SetDisplayName(fmt.Sprintf("Graph Page %03d", i)).
			SetResourceRefs([]string{}).
			SetRisks([]string{}).
			SetMilestones([]string{}).
			SetCreatedAt(asOf.Add(-48 * time.Hour)).
			SetUpdatedAt(asOf.Add(-time.Duration(i) * time.Second)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	first, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "portfolio", Depth: 1, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !first.HasMore || len(first.Relationships) != relationshipListLimit {
		t.Fatalf("newest page = %d hasMore=%v", len(first.Relationships), first.HasMore)
	}
	for _, rel := range first.Relationships {
		if rel.DisplayName == "Graph Page 201" {
			t.Fatal("the oldest company was included in the newest page")
		}
	}
	second, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "portfolio", Depth: 1, AsOf: asOf, Offset: relationshipListLimit,
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.HasMore {
		t.Fatal("the page after the newest 200 still claimed another page")
	}
	found := false
	for _, rel := range second.Relationships {
		if rel.DisplayName == "Graph Page 201" {
			found = true
		}
	}
	if !found {
		t.Fatalf("older page missing Graph Page 201: %d companies", len(second.Relationships))
	}
	clamped, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "portfolio", Depth: 1, AsOf: asOf, Offset: -3,
	})
	if err != nil || !clamped.HasMore || len(clamped.Relationships) != relationshipListLimit {
		t.Fatalf("negative offset should match the newest page: %d hasMore=%v err=%v", len(clamped.Relationships), clamped.HasMore, err)
	}
}

func TestRelationshipGraphPagesPastTheNewestEvidence(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	asOf := f.svc.now().UTC()
	rel, err := f.client.Relationship.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetKind("company").
		SetDisplayName("Evidence Graph Co").
		SetResourceRefs([]string{}).
		SetRisks([]string{}).
		SetMilestones([]string{}).
		SetCreatedAt(asOf.Add(-48 * time.Hour)).
		SetUpdatedAt(asOf.Add(-time.Minute)).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	const total = 101
	for i := 1; i <= total; i++ {
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(rel).
			SetSource("meeting").
			SetExternalID(fmt.Sprintf("graph-evidence-%03d", i)).
			SetEventType("note").
			SetOccurredAt(asOf.Add(-time.Duration(i) * time.Second)).
			SetReceivedAt(asOf.Add(-time.Duration(i) * time.Second)).
			SetSummary(fmt.Sprintf("Graph evidence %03d", i)).
			SetContentHash(fmt.Sprintf("graph-evidence-hash-%03d", i)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	first, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !first.ObservationHasMore || len(first.Relationships[0].Edges.Observations) != 100 {
		t.Fatalf("newest evidence = %d hasMore=%v", len(first.Relationships[0].Edges.Observations), first.ObservationHasMore)
	}
	for _, observation := range first.Relationships[0].Edges.Observations {
		if observation.Summary == "Graph evidence 101" {
			t.Fatal("the oldest conversation was included in the newest page")
		}
	}
	second, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf, ObservationOffset: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.ObservationHasMore {
		t.Fatal("the page after the newest 100 still claimed another page")
	}
	found := false
	for _, observation := range second.Relationships[0].Edges.Observations {
		if observation.Summary == "Graph evidence 101" {
			found = true
		}
	}
	if !found {
		t.Fatalf("older page missing Graph evidence 101: %d conversations", len(second.Relationships[0].Edges.Observations))
	}
	dto := buildRelationshipGraphDTO(second, asOf)
	if dto.ObservationHasMore {
		t.Fatal("dto kept observationHasMore after the last page")
	}
	labeled := false
	for _, node := range dto.Nodes {
		if node.Kind == "evidence" && node.Label == "Graph evidence 101" {
			labeled = true
		}
	}
	if !labeled {
		t.Fatal("older evidence did not become a graph node")
	}
	clamped, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 2, AsOf: asOf, ObservationOffset: -3,
	})
	if err != nil || !clamped.ObservationHasMore || len(clamped.Relationships[0].Edges.Observations) != 100 {
		t.Fatalf("negative evidence offset should match the newest page: err=%v", err)
	}
}

func TestRelationshipGraphNamesACompanyLikeTheDirectory(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	harbor, err := f.client.Relationship.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetKind("company").
		SetDisplayName("   ").
		SetAccountDomain("harbor-blank.example").
		SetResourceRefs([]string{}).
		SetRisks([]string{}).
		SetMilestones([]string{}).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	nameless, err := f.client.Relationship.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetKind("company").
		SetDisplayName("   ").
		SetResourceRefs([]string{}).
		SetRisks([]string{}).
		SetMilestones([]string{}).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	domain, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "dogfood-label.example", AccountDomain: "dogfood-label.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	typed, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Billing @ Northwind", AccountDomain: "northwind.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		harbor.ID.String():   "Harbor Blank",
		nameless.ID.String(): "Unknown company",
		domain.ID.String():   "Dogfood Label",
		typed.ID.String():    "Billing @ Northwind",
	}
	for id, title := range want {
		relID := mustParseUUID(t, id)
		aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
			Scope: "relationship", RelationshipID: &relID, Depth: 1, AsOf: f.svc.now(),
		})
		if err != nil {
			t.Fatalf("graph %s: %v", title, err)
		}
		dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
		var got string
		for _, node := range dto.Nodes {
			if node.Kind == "relationship" && node.RelationshipID == id {
				got = node.Label
			}
		}
		if got != title {
			t.Fatalf("graph label for %s = %q, want %q", title, got, title)
		}
	}
}

func TestRelationshipGraphNamesBlankEvidenceLikeTheSheet(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: "email",
		Reason: "Send the harbor note", ExecutionMode: ExecModeDraft, PriorityScore: 40,
	})
	if err != nil {
		t.Fatal(err)
	}
	blank, err := f.client.RevenueEvidence.Create().
		SetWorkspace(ws).AddRelationships(rel).SetUser(f.user).
		SetSource("gmail").SetSourceRecordID("graph-blank-excerpt").
		SetContentHash("sha256:graph-blank-excerpt").SetExcerpt("   ").
		SetOccurredAt(f.svc.now()).SetObservedAt(f.svc.now()).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	quoted, err := f.client.RevenueEvidence.Create().
		SetWorkspace(ws).AddRelationships(rel).SetUser(f.user).
		SetSource("gmail").SetSourceRecordID("graph-real-excerpt").
		SetContentHash("sha256:graph-real-excerpt").SetExcerpt("  The harbor sentence.  ").
		SetOccurredAt(f.svc.now()).SetObservedAt(f.svc.now()).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := action.Update().AddEvidences(blank, quoted).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 1, AsOf: f.svc.now(),
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
	got := map[string]bool{}
	for _, node := range dto.Nodes {
		if node.Kind == "evidence" {
			got[node.Label] = true
		}
	}
	if !got["Evidence excerpt unavailable"] || !got["The harbor sentence."] || got["   "] {
		t.Fatalf("evidence labels = %#v", got)
	}
}

func TestRelationshipGraphNamesAPersonLikeTheDirectory(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	company, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Person",
	})
	if err != nil {
		t.Fatal(err)
	}
	ada, err := f.client.Person.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetDisplayName("Ada Harbor").
		SetPrimaryEmail("ada@harbor-person.example").
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(company).
		SetPerson(ada).
		SetDisplayName("A. Harbor").
		SetEmail("ada@harbor-person.example").
		SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(company).
		SetPerson(ada).
		SetDisplayName("Ada H").
		SetEmail("ada.h@harbor-person.example").
		SetRole("champion").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(company).
		SetDisplayName("   ").
		SetEmail("bea@harbor-person.example").
		SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(company).
		SetDisplayName("Bea Cole").
		SetEmail("cole@harbor-person.example").
		SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &company.ID, Depth: 1, AsOf: f.svc.now(),
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, f.svc.now())
	got := map[string]int{}
	for _, node := range dto.Nodes {
		if node.Kind == "person" {
			got[node.Label]++
		}
	}
	if got["Ada Harbor"] != 1 || got["A. Harbor"] != 0 || got["Ada H"] != 0 {
		t.Fatalf("directory name should be the only Ada node: %+v", got)
	}
	if got["bea@harbor-person.example"] != 1 {
		t.Fatalf("blank header should use the address: %+v", got)
	}
	if got["Bea Cole"] != 1 {
		t.Fatalf("typed header should stay: %+v", got)
	}
}

func TestRelationshipGraphStageRequiresSupport(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	bare := f.company(t, "Bare Stage", "bare@stage.example")
	stored, err := f.client.Relationship.Get(f.ctx, bare.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Lifecycle != "prospect" {
		t.Fatalf("stored lifecycle = %q, want the prospect default", stored.Lifecycle)
	}
	bareNode := graphCompanyNode(t, f, bare)
	if bareNode.Lifecycle != "unknown" || bareNode.Engagement != "unknown" || bareNode.Sentiment != "unknown" || bareNode.Health != "unknown" {
		t.Fatalf("unsupported company stages = lifecycle %q engagement %q sentiment %q health %q",
			bareNode.Lifecycle, bareNode.Engagement, bareNode.Sentiment, bareNode.Health)
	}

	supported := f.company(t, "Supported Stage", "supported@stage.example")
	obs, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(supported).
		SetSource("meeting").SetExternalID("stage-eval").
		SetEventType("note").SetOccurredAt(supported.CreatedAt).SetReceivedAt(supported.CreatedAt).
		SetSummary("Moved to evaluation").SetContentHash("stage-eval").
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	factRank, ok := relationshipAssertionAuthorityRank("source_fact")
	if !ok {
		t.Fatal("source_fact rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(supported).SetObservation(obs).
		SetDimension("lifecycle").SetValue("evaluation").
		SetSourceType("source_fact").SetAuthorityRank(factRank).
		SetValidFrom(supported.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if got := graphCompanyNode(t, f, supported).Lifecycle; got != "evaluation" {
		t.Fatalf("supported lifecycle = %q, want evaluation", got)
	}

	cited := f.company(t, "Cited Stage", "cited@stage.example")
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(cited).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("source_fact").SetAuthorityRank(factRank).
		SetValidFrom(cited.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{"obs-cited"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if got := graphCompanyNode(t, f, cited).Lifecycle; got != "prospect" {
		t.Fatalf("cited lifecycle = %q, want prospect", got)
	}

	corrected := f.company(t, "Corrected Stage", "corrected@stage.example")
	correctionRank, ok := relationshipAssertionAuthorityRank("user_correction")
	if !ok {
		t.Fatal("user_correction rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(corrected).
		SetDimension("lifecycle").SetValue("active_customer").
		SetSourceType("user_correction").SetAuthorityRank(correctionRank).
		SetValidFrom(corrected.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if got := graphCompanyNode(t, f, corrected).Lifecycle; got != "active_customer" {
		t.Fatalf("corrected lifecycle = %q, want active_customer", got)
	}

	orphan := f.company(t, "Orphan Stage", "orphan@stage.example")
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(orphan).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("source_fact").SetAuthorityRank(factRank).
		SetValidFrom(orphan.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if got := graphCompanyNode(t, f, orphan).Lifecycle; got != "unknown" {
		t.Fatalf("assertion without evidence = %q, want unknown", got)
	}
}

func TestRelationshipStageFilterRequiresSupport(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	bare := f.company(t, "Bare Filter", "bare@filter.example")
	if bare.Lifecycle != "prospect" {
		t.Fatalf("stored lifecycle = %q, want the prospect default", bare.Lifecycle)
	}
	prospects, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Lifecycle: "prospect"})
	if err != nil {
		t.Fatal(err)
	}
	if hasName(namesOf(prospects.Relationships), "Bare Filter") {
		t.Fatal("an unsupported default must stay out of the Prospect stage")
	}

	corrected := f.company(t, "Corrected Filter", "corrected@filter.example")
	rank, ok := relationshipAssertionAuthorityRank("user_correction")
	if !ok {
		t.Fatal("user_correction rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(corrected).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("user_correction").SetAuthorityRank(rank).
		SetValidFrom(corrected.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	prospects, err = f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Lifecycle: "prospect"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(prospects.Relationships); !hasName(got, "Corrected Filter") || hasName(got, "Bare Filter") {
		t.Fatalf("prospect = %v", got)
	}

	evaluated := f.company(t, "Evaluated Filter", "evaluated@filter.example")
	if _, err := f.client.Relationship.UpdateOneID(evaluated.ID).SetLifecycle("evaluation").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	obs, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(evaluated).
		SetSource("meeting").SetExternalID("stage-filter").
		SetEventType("note").SetOccurredAt(evaluated.CreatedAt).SetReceivedAt(evaluated.CreatedAt).
		SetSummary("Moved to evaluation").SetContentHash("stage-filter").
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	factRank, ok := relationshipAssertionAuthorityRank("source_fact")
	if !ok {
		t.Fatal("source_fact rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(evaluated).SetObservation(obs).
		SetDimension("lifecycle").SetValue("evaluation").
		SetSourceType("source_fact").SetAuthorityRank(factRank).
		SetValidFrom(evaluated.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	evaluations, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Lifecycle: "evaluation"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(evaluations.Relationships); len(got) != 1 || got[0] != "Evaluated Filter" {
		t.Fatalf("evaluation = %v", got)
	}
}

func (f *fixture) company(t *testing.T, name, email string) *ent.Relationship {
	t.Helper()
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: name, PrimaryEmail: email,
	})
	if err != nil {
		t.Fatalf("company %s: %v", name, err)
	}
	return rel
}

func graphCompanyNode(t *testing.T, f *fixture, rel *ent.Relationship) relationshipGraphNodeDTO {
	t.Helper()
	asOf := f.svc.now()
	aggregate, err := f.svc.RelationshipGraph(f.ctx, f.user, RelationshipGraphFilter{
		Scope: "relationship", RelationshipID: &rel.ID, Depth: 1, AsOf: asOf,
	})
	if err != nil {
		t.Fatal(err)
	}
	dto := buildRelationshipGraphDTO(aggregate, asOf)
	for _, node := range dto.Nodes {
		if node.Kind == "relationship" {
			return node
		}
	}
	t.Fatal("relationship node missing")
	return relationshipGraphNodeDTO{}
}
