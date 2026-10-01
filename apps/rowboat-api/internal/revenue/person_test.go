package revenue

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/person"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personattribute"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personmergecandidate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
)

func personObservation(
	externalID, displayName, domain string, now time.Time, participants ...RelationshipParticipantInput,
) RelationshipObservationInput {
	return RelationshipObservationInput{
		DisplayName:   displayName,
		AccountDomain: domain,
		Source:        "hubspot",
		ExternalID:    externalID,
		EventType:     "company.updated",
		OccurredAt:    now,
		ReceivedAt:    now,
		Channel:       "email",
		Direction:     "inbound",
		Participants:  participants,
	}
}

func personsIn(t *testing.T, f *fixture) []*ent.Person {
	t.Helper()
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	rows, err := f.client.Person.Query().
		Where(person.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID))).
		Order(ent.Asc(person.FieldCreatedAt)).
		All(f.ctx)
	if err != nil {
		t.Fatalf("query persons: %v", err)
	}
	return rows
}

func TestIngestCreatesCanonicalPersonWithAnchors(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{
				DisplayName: "Sarah Chen",
				Email:       "sarah@acme.example",
				Role:        "champion",
				Title:       "VP Engineering",
			})},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	people := personsIn(t, f)
	if len(people) != 1 {
		t.Fatalf("expected 1 canonical person, got %d", len(people))
	}
	p := people[0]
	if p.DisplayName != "Sarah Chen" {
		t.Fatalf("display name = %q", p.DisplayName)
	}
	if p.Title != "VP Engineering" {
		t.Fatalf("title = %q, want the projected source_fact", p.Title)
	}
	if p.OrgDomain != "acme.example" {
		t.Fatalf("org domain = %q", p.OrgDomain)
	}
	if p.OrgName != "Acme" {
		t.Fatalf("org name = %q, want the company this domain belongs to", p.OrgName)
	}
	if p.ProjectedAt == nil {
		t.Fatal("person was never projected")
	}

	// The participant row is linked, and its role stays on the participant.
	participants, err := p.QueryParticipants().All(f.ctx)
	if err != nil {
		t.Fatalf("query participants: %v", err)
	}
	if len(participants) != 1 || participants[0].Role != "champion" {
		t.Fatalf("expected the champion participant linked to the person, got %+v", participants)
	}

	stats, err := p.QueryInteractionStats().All(f.ctx)
	if err != nil {
		t.Fatalf("query stats: %v", err)
	}
	if len(stats) != 1 || stats[0].InteractionCount != 1 || stats[0].InboundCount != 1 {
		t.Fatalf("expected one inbound interaction, got %+v", stats)
	}
}

// The same human on two accounts is one person with two role assertions.
func TestSamePersonAcrossTwoAccountsIsOnePerson(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	participant := RelationshipParticipantInput{
		DisplayName: "Sarah Chen",
		Email:       "sarah@acme.example",
	}
	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{
			personObservation("obs_1", "Acme", "acme.example", now,
				withRole(participant, "champion")),
		}); err != nil {
		t.Fatalf("first ingest: %v", err)
	}
	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{
			personObservation("obs_2", "Globex", "globex.example", now.Add(time.Hour),
				withRole(participant, "blocker")),
		}); err != nil {
		t.Fatalf("second ingest: %v", err)
	}

	people := personsIn(t, f)
	if len(people) != 1 {
		t.Fatalf("expected the email anchor to resolve to ONE person, got %d", len(people))
	}
	p := people[0]

	participants, err := p.QueryParticipants().All(f.ctx)
	if err != nil {
		t.Fatalf("query participants: %v", err)
	}
	if len(participants) != 2 {
		t.Fatalf("expected two role assertions, got %d", len(participants))
	}
	roles := map[string]bool{}
	for _, row := range participants {
		roles[row.Role] = true
	}
	// The whole reason role stays on the participant: one human, two roles.
	if !roles["champion"] || !roles["blocker"] {
		t.Fatalf("expected champion and blocker, got %v", roles)
	}

	stats, err := p.QueryInteractionStats().All(f.ctx)
	if err != nil {
		t.Fatalf("query stats: %v", err)
	}
	if len(stats) != 2 {
		t.Fatalf("expected per-account interaction stats, got %d", len(stats))
	}
	refreshed, err := f.client.Person.Get(f.ctx, p.ID)
	if err != nil {
		t.Fatalf("reload person: %v", err)
	}
	if refreshed.RelationshipCount != 2 {
		t.Fatalf("relationship_count = %d, want 2", refreshed.RelationshipCount)
	}
}

// Coworkers share a domain. If a domain were ever a person anchor they would
// collapse into one human, which is why PersonIdentity has no domain kind.
func TestCoworkersNeverCollapseIntoOnePerson(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{DisplayName: "Sarah Chen", Email: "sarah@acme.example"},
			RelationshipParticipantInput{DisplayName: "Dana Fox", Email: "dana@acme.example"},
		)},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	if got := len(personsIn(t, f)); got != 2 {
		t.Fatalf("expected 2 distinct people at one domain, got %d", got)
	}
}

// Two unrelated gmail.com people must not share an organization.
func TestPublicMailboxNeverBecomesOrgDomain(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{DisplayName: "Sarah Chen", Email: "sarah@gmail.com"},
		)},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	people := personsIn(t, f)
	if len(people) != 1 {
		t.Fatalf("expected 1 person, got %d", len(people))
	}
	if people[0].OrgDomain != "" {
		t.Fatalf("gmail.com must never project as an org domain, got %q", people[0].OrgDomain)
	}
	// The email anchor itself is still perfectly good.
	identities, err := people[0].QueryIdentities().All(f.ctx)
	if err != nil {
		t.Fatalf("query identities: %v", err)
	}
	if len(identities) != 1 || identities[0].Kind != "email" {
		t.Fatalf("expected one email anchor, got %+v", identities)
	}
}

// A no-reply address is a system, not a human.
func TestNoReplyAddressCreatesNoPerson(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{DisplayName: "Acme", Email: "noreply@acme.example"},
		)},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if got := len(personsIn(t, f)); got != 0 {
		t.Fatalf("expected no person for a no-reply address, got %d", got)
	}
}

// A user correction outranks a signature, regardless of confidence numbers.
func TestUserCorrectionOutranksDerivedTitle(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)

	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{
				DisplayName: "Sarah Chen", Email: "sarah@acme.example", Title: "Engineer",
			})},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}
	people := personsIn(t, f)
	p := people[0]
	if p.Title != "Engineer" {
		t.Fatalf("title = %q", p.Title)
	}

	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	// A deliberately *lower* confidence correction must still win.
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, p, nil, []PersonAttributeInput{{
		Dimension: "title", Value: "Head of Platform",
		SourceType: "user_correction", Source: "user", Extractor: "user_entry",
		Confidence: 0.1, ObservedAt: now.Add(-24 * time.Hour), ExternalID: "correction-1",
	}}); err != nil {
		t.Fatalf("correction: %v", err)
	}
	updated, err := projectPersonAttributes(f.ctx, f.client, p, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if updated.Title != "Head of Platform" {
		t.Fatalf("user correction must outrank a source fact, got %q", updated.Title)
	}

	// The superseded assertion is retained for audit, not deleted.
	count, err := f.client.PersonAttribute.Query().
		Where(
			personattribute.HasPersonWith(person.IDEQ(p.ID)),
			personattribute.DimensionEQ("title"),
		).Count(f.ctx)
	if err != nil {
		t.Fatalf("count attributes: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected both title assertions retained, got %d", count)
	}
}

// Replay must not fork a person or double-count an interaction.
func TestPersonProjectionIsIdempotent(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	input := personObservation("obs_1", "Acme", "acme.example", now,
		RelationshipParticipantInput{
			DisplayName: "Sarah Chen", Email: "sarah@acme.example", Title: "VP Engineering",
		})

	for round := 0; round < 3; round++ {
		if _, err := f.svc.IngestRelationshipObservations(
			f.ctx, f.user, []RelationshipObservationInput{input},
		); err != nil {
			t.Fatalf("ingest round %d: %v", round, err)
		}
	}

	people := personsIn(t, f)
	if len(people) != 1 {
		t.Fatalf("replay forked the person: got %d", len(people))
	}
	stats, err := people[0].QueryInteractionStats().All(f.ctx)
	if err != nil {
		t.Fatalf("query stats: %v", err)
	}
	// The observation dedupes upstream, so the interaction is counted once.
	if len(stats) != 1 || stats[0].InteractionCount != 1 {
		t.Fatalf("replay double-counted: %+v", stats)
	}
}

func TestPersonAttributesCollapseHistoricalDuplicateFact(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user,
		[]RelationshipObservationInput{personObservation("obs_1", "Acme", "acme.example", now,
			RelationshipParticipantInput{DisplayName: "Sarah Chen", Email: "sarah@acme.example"})},
	); err != nil {
		t.Fatalf("ingest: %v", err)
	}
	p := personsIn(t, f)[0]
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, p, nil, []PersonAttributeInput{{
		Dimension: "display_name", Value: "Sarah Chen", SourceType: "source_fact",
		Source: "hubspot", Extractor: "display_name_header", Confidence: 0.8,
		Reason: "Name as it appeared on the source record.", ObservedAt: now,
	}}); err != nil {
		t.Fatalf("legacy duplicate: %v", err)
	}

	raw := p.QueryAttributes().CountX(f.ctx)
	attributes, err := f.svc.PersonAttributes(f.ctx, f.user, p.ID)
	if err != nil {
		t.Fatalf("attributes: %v", err)
	}
	if raw != 5 || len(attributes) != 4 {
		t.Fatalf("raw attributes = %d, visible attributes = %d; want 5 and 4", raw, len(attributes))
	}
}

// Two anchors pointing at different existing people is a question, not an answer.
func TestPersonMultiMatchNeverMergesAutomatically(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 8, 4, 12, 0, 0, 0, time.UTC)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}

	// Two separately-known people, each anchored on a different identifier.
	first, err := resolvePerson(f.ctx, f.client, ws, f.user, PersonResolutionInput{
		DisplayName: "Sarah Chen", Email: "sarah@acme.example", Source: "gmail", ObservedAt: now,
	})
	if err != nil {
		t.Fatalf("first person: %v", err)
	}
	second, err := resolvePerson(f.ctx, f.client, ws, f.user, PersonResolutionInput{
		DisplayName: "S. Chen", ExternalRefs: []string{"hubspot:contact:99"},
		Source: "hubspot", ObservedAt: now,
	})
	if err != nil {
		t.Fatalf("second person: %v", err)
	}
	if first.ID == second.ID {
		t.Fatal("precondition: expected two distinct people")
	}

	// Now one observation claims both anchors belong to the same human.
	merged, err := resolvePerson(f.ctx, f.client, ws, f.user, PersonResolutionInput{
		DisplayName: "Sarah Chen", Email: "sarah@acme.example",
		ExternalRefs: []string{"hubspot:contact:99"},
		Source:       "hubspot", ObservedAt: now,
	})
	if err != nil {
		t.Fatalf("multi-match resolve: %v", err)
	}
	if merged.ID == first.ID || merged.ID == second.ID {
		t.Fatal("a multi-match must never pick a winner")
	}

	candidates, err := f.client.PersonMergeCandidate.Query().
		Where(personmergecandidate.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID))).
		All(f.ctx)
	if err != nil {
		t.Fatalf("query candidates: %v", err)
	}
	if len(candidates) != 2 {
		t.Fatalf("expected one reviewable candidate per colliding owner, got %d", len(candidates))
	}
	for _, candidate := range candidates {
		if candidate.Status != "pending" {
			t.Fatalf("candidate status = %q, want pending", candidate.Status)
		}
	}
}

func TestPersonSearchFindsTheCompanyTitle(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "dogfood-label.example", AccountDomain: "dogfood-label.example",
	}); err != nil {
		t.Fatal(err)
	}
	personRel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Ada", PrimaryEmail: "ada@dogfood-label.example", AccountDomain: "dogfood-label.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.IngestRelationshipObservations(f.ctx, f.user, []RelationshipObservationInput{{
		RelationshipID: personRel.ID,
		Source:         "user",
		ExternalID:     "person-added-ada-search",
		EventType:      "person_added",
		Summary:        "Ada added by the user",
		OccurredAt:     now,
		ReceivedAt:     now,
		Participants: []RelationshipParticipantInput{{
			DisplayName: "Ada", Email: "ada@dogfood-label.example", Role: "contact",
		}},
	}}); err != nil {
		t.Fatal(err)
	}

	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Dogfood Label"})
	if err != nil || len(found) != 1 || found[0].DisplayName != "Ada" {
		t.Fatalf("title search = %+v err=%v", found, err)
	}
	miss, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "zzzz-not-a-person"})
	if err != nil || len(miss) != 0 {
		t.Fatalf("unrelated search = %+v err=%v", miss, err)
	}
}

func TestListPersonsOffsetSkipsEarlierNames(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Ada Offset", "Bea Offset", "Cara Offset"} {
		if _, err := f.client.Person.Create().
			SetDisplayName(name).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	page, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 1, Offset: 1})
	if err != nil || len(page) != 1 || page[0].DisplayName != "Bea Offset" {
		t.Fatalf("offset page = %+v err=%v", page, err)
	}
	none, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 1, Offset: 3})
	if err != nil || len(none) != 0 {
		t.Fatalf("past the end = %d err=%v", len(none), err)
	}
	all, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 10, Offset: -2})
	if err != nil || len(all) != 3 || all[0].DisplayName != "Ada Offset" {
		t.Fatalf("negative offset = %+v err=%v", all, err)
	}
}

func TestListPersonsTiedNameUsesID(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	const total = 3
	for i := 1; i <= total; i++ {
		email := fmt.Sprintf("tied-%d@example.com", i)
		if i == total {
			email = "last@tied.example"
		}
		if _, err := f.client.Person.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a115e000-0000-4000-8000-%012x", i))).
			SetDisplayName("Tied Person").
			SetPrimaryEmail(email).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	first, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 2 {
		t.Fatalf("first page = %d", len(first))
	}
	for _, row := range first {
		if row.PrimaryEmail == "last@tied.example" {
			t.Fatal("the highest id was included beside lower ids with the same name")
		}
	}
	second, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2, Offset: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 1 || second[0].PrimaryEmail != "last@tied.example" {
		t.Fatalf("later id page = %+v", second)
	}
}

func TestPersonSearchSQLUsesPostgresPlaceholders(t *testing.T) {
	selector := sql.Dialect(dialect.Postgres).Select().From(sql.Table(person.Table))
	personNormalizedContains("Dogfood Label")(selector)
	query, args := selector.Query()
	if strings.Contains(query, "?") {
		t.Fatalf("postgres search still uses ?: %s", query)
	}
	if !strings.Contains(query, "ESCAPE '!'") || !strings.Contains(query, "$1") {
		t.Fatalf("postgres search = %s", query)
	}
	if len(args) != 4 || args[0] != "%dogfood label%" {
		t.Fatalf("args = %#v", args)
	}
}

func withRole(in RelationshipParticipantInput, role string) RelationshipParticipantInput {
	in.Role = role
	return in
}
