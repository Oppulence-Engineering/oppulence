package revenue

import (
	"encoding/json"
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

func TestPeopleDirectoryListsTheProjectedPerson(t *testing.T) {
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
		t.Fatal(err)
	}
	page, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	out := make([]*personDTO, 0, len(page.Persons))
	for _, person := range page.Persons {
		out = append(out, personToDTO(person))
	}
	raw, err := json.Marshal(map[string]any{"persons": out, "hasMore": page.HasMore})
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	people, _ := body["persons"].([]any)
	if len(people) != 1 {
		t.Fatalf("people: %s", raw)
	}
	people[0].(map[string]any)["id"] = "ab8dfa9b-a7b2-46ea-982c-622a914c00e5"
	got, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"hasMore":false,"persons":[{"aliases":[],"attributesVersion":1,"displayName":"Sarah Chen","employmentStatus":"unknown","firstInteractionAt":"2026-08-04T12:00:00Z","id":"ab8dfa9b-a7b2-46ea-982c-622a914c00e5","lastInteractionAt":"2026-08-04T12:00:00Z","orgDomain":"acme.example","orgName":"Acme","participantRoles":["champion"],"primaryEmail":"sarah@acme.example","relationshipCount":1,"status":"active","title":"VP Engineering"}]}`
	if string(got) != want {
		t.Fatalf("people directory:\n%s", got)
	}
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
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Ada" {
		t.Fatalf("title search = %+v err=%v", found, err)
	}
	miss, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "zzzz-not-a-person"})
	if err != nil || miss == nil || len(miss.Persons) != 0 {
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
	if err != nil || page == nil || len(page.Persons) != 1 || !page.HasMore || page.Persons[0].DisplayName != "Bea Offset" {
		t.Fatalf("offset page = %+v err=%v", page, err)
	}
	none, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 1, Offset: 3})
	if err != nil || none == nil || len(none.Persons) != 0 || none.HasMore {
		count := -1
		if none != nil {
			count = len(none.Persons)
		}
		t.Fatalf("past the end = %d err=%v", count, err)
	}
	all, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 10, Offset: -2})
	if err != nil || all == nil || len(all.Persons) != 3 || all.HasMore || all.Persons[0].DisplayName != "Ada Offset" {
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
	if err != nil || first == nil {
		t.Fatal(err)
	}
	if len(first.Persons) != 2 || !first.HasMore {
		t.Fatalf("first page = %d hasMore=%v", len(first.Persons), first.HasMore)
	}
	for _, row := range first.Persons {
		if row.PrimaryEmail == "last@tied.example" {
			t.Fatal("the highest id was included beside lower ids with the same name")
		}
	}
	second, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2, Offset: 2})
	if err != nil || second == nil {
		t.Fatal(err)
	}
	if len(second.Persons) != 1 || second.HasMore || second.Persons[0].PrimaryEmail != "last@tied.example" {
		t.Fatalf("later id page = %+v", second)
	}
}

func TestListPersonsExactPageIsNotAnotherPage(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Ada Exact", "Bea Exact"} {
		if _, err := f.client.Person.Create().
			SetDisplayName(name).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	exact, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2})
	if err != nil || exact == nil || len(exact.Persons) != 2 || exact.HasMore {
		count := 0
		hasMore := false
		if exact != nil {
			count = len(exact.Persons)
			hasMore = exact.HasMore
		}
		t.Fatalf("exact page = %d hasMore=%v err=%v", count, hasMore, err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Cara Exact").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	first, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2})
	if err != nil || first == nil || len(first.Persons) != 2 || !first.HasMore {
		t.Fatalf("first page = %+v err=%v", first, err)
	}
	next, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Limit: 2, Offset: 2})
	if err != nil || next == nil || len(next.Persons) != 1 || next.HasMore || next.Persons[0].DisplayName != "Cara Exact" {
		t.Fatalf("next page = %+v err=%v", next, err)
	}
}

func TestPersonSearchFindsNextPeople(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name, status string) {
		t.Helper()
		if _, err := f.client.Person.Create().
			SetDisplayName(name).
			SetStatus(status).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= personDirectoryPage; i++ {
		create(fmt.Sprintf("Directory Leaf %03d", i), "active")
	}
	create("Merged Quiet", "merged")
	exact, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Show the next people", Limit: personDirectoryPage})
	if err != nil || exact == nil || exact.HasMore || len(exact.Persons) != 0 {
		t.Fatalf("full page = %d hasMore=%v err=%v", len(exact.Persons), exact != nil && exact.HasMore, err)
	}
	for _, query := range []string{"show", "next", "people", "person", "show the next"} {
		miss, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query, Limit: personDirectoryPage})
		if err != nil || miss == nil || miss.HasMore || len(miss.Persons) != 0 {
			count := 0
			if miss != nil {
				count = len(miss.Persons)
			}
			t.Fatalf("%q = %d err=%v", query, count, err)
		}
	}
	create("Zed Hidden", "active")
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Show the next people", Limit: personDirectoryPage})
	if err != nil || found == nil || !found.HasMore || len(found.Persons) != personDirectoryPage {
		t.Fatalf("next people = %d hasMore=%v err=%v", len(found.Persons), found != nil && found.HasMore, err)
	}
	for _, row := range found.Persons {
		if row.DisplayName == "Zed Hidden" {
			t.Fatal("the person behind the button was already on the first page")
		}
	}
	hidden, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{
		Query:  "Show the next people",
		Limit:  personDirectoryPage,
		Offset: personDirectoryPage,
	})
	if err != nil || hidden == nil || hidden.HasMore || len(hidden.Persons) != 1 || hidden.Persons[0].DisplayName != "Zed Hidden" {
		t.Fatalf("hidden person = %+v err=%v", hidden, err)
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
	if len(args) != len(personSearchColumns) || args[0] != "%dogfood label%" {
		t.Fatalf("args = %#v", args)
	}
}

func TestPersonSearchFindsVisibleRoleFacts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetPrimaryEmail("morgan@other.example").
		SetOrgName("Other Co").
		SetTitle("Revenue Operations Lead").
		SetDepartment("Customer Success").
		SetLocation("Austin Metro").
		SetSeniority("director").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		"Revenue Operations",
		"Customer Success",
		"Austin Metro",
		"director",
		"revenue_operations",
	} {
		found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query})
		if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Morgan Lee" {
			t.Fatalf("query %q = %+v err=%v", query, found, err)
		}
	}
}

func TestPersonSearchFindsThePrintedLabels(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string, apply func(*ent.PersonCreate)) {
		t.Helper()
		row := f.client.Person.Create().SetDisplayName(name).SetWorkspace(ws).SetUser(f.user)
		if apply != nil {
			apply(row)
		}
		if _, err := row.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	create("Casey Quinn", nil)
	create("Indira Cole", func(row *ent.PersonCreate) { row.SetSeniority("ic") })
	create("Link Rivera", func(row *ent.PersonCreate) {
		row.SetLinkedinURL("https://www.linkedin.com/in/link-rivera")
	})
	create("Morgan Lee", func(row *ent.PersonCreate) { row.SetTitle("Account Executive") })
	expect := map[string]string{
		"Not filled in":          "Casey Quinn",
		"Individual contributor": "Indira Cole",
		"View profile":           "Link Rivera",
	}
	for query, name := range expect {
		found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query})
		if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != name {
			got := []string{}
			if found != nil {
				for _, person := range found.Persons {
					got = append(got, person.DisplayName)
				}
			}
			t.Fatalf("query %q = %v err=%v", query, got, err)
		}
	}
	for _, query := range []string{"profile", "contributor", "filled"} {
		found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query})
		if err != nil || found == nil || len(found.Persons) != 0 {
			t.Fatalf("fragment %q = %+v err=%v", query, found, err)
		}
	}
}

func TestPersonSearchFindsNoEmail(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetPrimaryEmail("morgan@lumen.example").
		SetTitle("Account Executive").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "No email"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		got := []string{}
		if found != nil {
			for _, row := range found.Persons {
				got = append(got, row.DisplayName)
			}
		}
		t.Fatalf("no email = %v err=%v", got, err)
	}
	email, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "email"})
	if err != nil || email == nil || len(email.Persons) != 0 {
		t.Fatalf("email fragment = %+v err=%v", email, err)
	}
}

func TestPersonSearchFindsTheDetailCount(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetTitle("Account Executive").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetTitle("Account Executive").
		SetDepartment("Finance").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	one, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "1 detail filled in"})
	if err != nil || one == nil || len(one.Persons) != 1 || one.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("one detail = %+v err=%v", one, err)
	}
	two, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "2 details filled in"})
	if err != nil || two == nil || len(two.Persons) != 1 || two.Persons[0].DisplayName != "Morgan Lee" {
		t.Fatalf("two details = %+v err=%v", two, err)
	}
	// "filled" is inside both "Not filled in" and "1 detail filled in".
	filled, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "filled"})
	if err != nil {
		t.Fatal(err)
	}
	if len(filled.Persons) != 0 {
		t.Fatalf("filled = %+v", filled.Persons)
	}
	word, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "filled in"})
	if err != nil {
		t.Fatal(err)
	}
	if len(word.Persons) != 0 {
		t.Fatalf("filled in = %+v", word.Persons)
	}
}

func TestPersonSearchFindsTheAlias(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetAliases([]string{"Dee Cole"}).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Dee"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Indira Cole" {
		t.Fatalf("alias = %+v err=%v", found, err)
	}
	label, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Also known as"})
	if err != nil || label == nil || len(label.Persons) != 1 || label.Persons[0].DisplayName != "Indira Cole" {
		t.Fatalf("also known as = %+v err=%v", label, err)
	}
}

func TestPersonSearchIgnoresBlankPrintedFacts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string, apply func(*ent.PersonCreate)) {
		t.Helper()
		row := f.client.Person.Create().SetDisplayName(name).SetWorkspace(ws).SetUser(f.user)
		if apply != nil {
			apply(row)
		}
		if _, err := row.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	create("Blank Quinn", func(row *ent.PersonCreate) {
		row.SetTitle("   ").
			SetPrimaryEmail("   ").
			SetLinkedinURL("   ").
			SetAliases([]string{"  ", ""})
	})
	create("Indira Cole", func(row *ent.PersonCreate) {
		row.SetTitle("   ").SetSeniority(" ic ")
	})
	create("Link Rivera", func(row *ent.PersonCreate) {
		row.SetLinkedinURL("javascript:alert(1)")
	})
	create("Dee Cole", func(row *ent.PersonCreate) {
		row.SetAliases([]string{"Dee"})
	})
	create("Morgan Lee", func(row *ent.PersonCreate) {
		row.SetTitle("Account Executive").SetPrimaryEmail("morgan@lumen.example")
	})

	assertPeople := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := make([]string, 0, len(found.Persons))
		for _, row := range found.Persons {
			got = append(got, row.DisplayName)
		}
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			seen := false
			for _, gotName := range got {
				if gotName == name {
					seen = true
				}
			}
			if !seen {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertPeople("Not filled in", "Blank Quinn", "Dee Cole")
	assertPeople("1 detail filled in", "Indira Cole", "Link Rivera", "Morgan Lee")
	assertPeople("No email", "Blank Quinn", "Indira Cole", "Link Rivera", "Dee Cole")
	assertPeople("Also known as", "Dee Cole")
	assertPeople("Individual contributor", "Indira Cole")
	assertPeople("View profile")
}

func TestPersonSearchFindsTheTimezone(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetTimezone("America/Chicago").
		SetLocale("en-US").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetTimezone("America/Denver").
		SetLocale("fr-FR").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	chicago, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Chicago"})
	if err != nil || chicago == nil || len(chicago.Persons) != 1 || chicago.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("chicago = %+v err=%v", chicago, err)
	}
	french, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "fr-FR"})
	if err != nil || french == nil || len(french.Persons) != 1 || french.Persons[0].DisplayName != "Indira Cole" {
		t.Fatalf("locale = %+v err=%v", french, err)
	}
}

func TestPersonSearchFindsTheCompanyRole(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	company, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	maker, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	other, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationshipID(company.ID).
		SetPerson(maker).
		SetDisplayName("Casey Quinn").
		SetRole("decision_maker").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationshipID(company.ID).
		SetPerson(other).
		SetDisplayName("Indira Cole").
		SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Decision maker"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("decision maker = %+v err=%v", found, err)
	}
	if len(found.Persons[0].Edges.Participants) != 1 || found.Persons[0].Edges.Participants[0].Role != "decision_maker" {
		t.Fatalf("role edge = %+v", found.Persons[0].Edges.Participants)
	}
}

func TestPersonSearchFindsTheUnknownRole(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetTitle("   ").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	partial, err := f.client.Person.Create().
		SetDisplayName("Mina Holt").
		SetTitle("Finance lead").
		SetOrgName("Quill Atelier").
		SetOrgDomain("quill.example").
		SetSeniority("director").
		SetLocation("Austin").
		SetLinkedinURL("https://www.linkedin.com/in/mina").
		SetTimezone("America/Chicago").
		SetLastInteractionAt(time.Now().Add(-3 * time.Hour)).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if partial.Department != "" {
		t.Fatalf("department = %q", partial.Department)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetTitle("Finance lead").
		SetOrgName("Lumen Packet").
		SetOrgDomain("lumen.example").
		SetSeniority("director").
		SetDepartment("Finance").
		SetLocation("Denver").
		SetLinkedinURL("https://www.linkedin.com/in/indira").
		SetTimezone("America/Denver").
		SetLastInteractionAt(time.Now().Add(-3 * time.Hour)).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Not known"})
	if err != nil || found == nil {
		t.Fatalf("not known err=%v", err)
	}
	got := map[string]bool{}
	for _, row := range found.Persons {
		got[row.DisplayName] = true
	}
	if len(got) != 2 || !got["Casey Quinn"] || !got["Mina Holt"] || got["Indira Cole"] {
		t.Fatalf("not known = %v", got)
	}
}

func TestPersonSearchFindsWhoLeft(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetEmploymentStatus("departed").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetEmploymentStatus("active").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Left the company"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("left = %+v err=%v", found, err)
	}
	company, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "company"})
	if err != nil || company == nil || len(company.Persons) != 0 {
		t.Fatalf("company fragment = %+v err=%v", company, err)
	}
}

func TestPersonSearchFindsWhoIsCurrent(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetEmploymentStatus("active").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetEmploymentStatus("departed").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Current"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("current = %+v err=%v", found, err)
	}
	left, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "Left the company"})
	if err != nil || left == nil || len(left.Persons) != 1 || left.Persons[0].DisplayName != "Indira Cole" {
		t.Fatalf("left = %+v err=%v", left, err)
	}
}

func TestPersonSearchFindsTheCompanyCount(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Indira Cole").
		SetRelationshipCount(1).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetRelationshipCount(0).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	one, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "1"})
	if err != nil || one == nil || len(one.Persons) != 1 || one.Persons[0].DisplayName != "Indira Cole" {
		t.Fatalf("one company = %+v err=%v", one, err)
	}
	none, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "0"})
	if err != nil || none == nil || len(none.Persons) != 1 || none.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("zero companies = %+v err=%v", none, err)
	}
}

func TestPersonSearchFindsTheLastInteraction(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	recent := time.Now().Add(-3*24*time.Hour - time.Hour)
	older := time.Now().Add(-10 * 24 * time.Hour)
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetLastInteractionAt(recent).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetLastInteractionAt(older).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "3 days ago"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("3 days ago = %+v err=%v", found, err)
	}
}

func TestPersonSearchFindsAFutureLastInteraction(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	ahead := time.Now().Add(3*24*time.Hour + time.Hour)
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetLastInteractionAt(ahead).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetLastInteractionAt(time.Now().Add(-10 * 24 * time.Hour)).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: "3 days from now"})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("3 days from now = %+v err=%v", found, err)
	}
}

func TestPersonSearchFindsACalendarLastInteraction(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	datedAt := time.Now().Add(-45 * 24 * time.Hour)
	if _, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetLastInteractionAt(datedAt).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	recentAt := time.Now().Add(-10 * 24 * time.Hour)
	if _, err := f.client.Person.Create().
		SetDisplayName("Morgan Lee").
		SetLastInteractionAt(recentAt).
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	label := datedAt.Format("Jan 2, 2006")
	found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: label})
	if err != nil || found == nil || len(found.Persons) != 1 || found.Persons[0].DisplayName != "Casey Quinn" {
		t.Fatalf("%s = %+v err=%v", label, found, err)
	}
	inside, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: recentAt.Format("Jan 2, 2006")})
	if err != nil || inside == nil || len(inside.Persons) != 0 {
		t.Fatalf("recent calendar day = %+v err=%v", inside, err)
	}
}

func TestRelativeLabelWindowKeepsAFuturePhraseWithTheNextBucket(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	window, ok := relativeLabelWindow("3 days from now", now)
	if !ok {
		t.Fatal("3 days from now")
	}
	inside := now.Add(3*24*time.Hour + time.Hour)
	boundary := now.Add(3*24*time.Hour + 12*time.Hour)
	if !inside.After(window.after) || inside.After(window.until) {
		t.Fatalf("inside %s not in (%s, %s]", inside, window.after, window.until)
	}
	if !boundary.After(window.until) {
		t.Fatalf("3.5 days %s still in 3-day window until %s", boundary, window.until)
	}
	next, ok := relativeLabelWindow("4 days from now", now)
	if !ok {
		t.Fatal("4 days from now")
	}
	if !boundary.After(next.after) || boundary.After(next.until) {
		t.Fatalf("3.5 days %s not in 4-day window (%s, %s]", boundary, next.after, next.until)
	}
	ago, ok := relativeLabelWindow("3 days ago", now)
	if !ok || !inside.After(ago.until) {
		t.Fatalf("future instant matched ago window until %s ok=%v", ago.until, ok)
	}
}

func TestCalendarLabelWindowKeepsThePrintedDay(t *testing.T) {
	now := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	window, ok := calendarLabelWindow("sep 3, 2026", now)
	if !ok {
		t.Fatal("sep 3, 2026")
	}
	early := time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC)
	edge := now.Add(-30 * 24 * time.Hour)
	later := edge.Add(time.Second)
	if !early.After(window.after) || early.After(window.until) {
		t.Fatalf("start of day %s not in (%s, %s]", early, window.after, window.until)
	}
	if !edge.After(window.after) || edge.After(window.until) {
		t.Fatalf("30-day edge %s not in (%s, %s]", edge, window.after, window.until)
	}
	if !later.After(window.until) {
		t.Fatalf("relative instant %s still in calendar window until %s", later, window.until)
	}
	if _, ok := calendarLabelWindow("sep 20, 2026", now); ok {
		t.Fatal("a day inside 30 days still opened a calendar window")
	}
	ahead := now.Add(45 * 24 * time.Hour)
	future, ok := calendarLabelWindow(strings.ToLower(ahead.Format("Jan 2, 2006")), now)
	if !ok || !ahead.After(future.after) || ahead.After(future.until) {
		t.Fatalf("future day %s not in (%s, %s] ok=%v", ahead, future.after, future.until, ok)
	}
	if _, ok := parseCalendarLabel("not a date"); ok {
		t.Fatal("phrase parsed as a calendar day")
	}
}

func TestPersonSearchFindsTheSheetEvidence(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	create := func(name string) *ent.Person {
		t.Helper()
		row, err := f.client.Person.Create().
			SetDisplayName(name).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	casey := create("Casey Quinn")
	indira := create("Indira Cole")
	quill := create("Quill Morse")
	nia := create("Nia Holt")
	mira := create("Mira Chen")
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, casey, nil, []PersonAttributeInput{
		{
			Dimension: "display_name", Value: "Casey Quinn", SourceType: "user_correction",
			Source: "user", Extractor: "user_entry", Confidence: 1, ObservedAt: now,
			ExternalID: "casey-name",
		},
		{
			Dimension: "alias", Value: "Case", SourceType: "user_correction",
			Source: "user", Extractor: "user_entry", Confidence: 1, ObservedAt: now,
			ExternalID: "casey-alias",
		},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectPerson(f.ctx, f.user, indira.ID, PersonCorrectionInput{
		Dimension: "department", Value: "Finance",
	}); err != nil {
		t.Fatal(err)
	}
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, quill, nil, []PersonAttributeInput{{
		Dimension: "title", Value: "Designer", SourceType: "source_fact",
		Source: "gmail", Extractor: "email_signature", Confidence: 0.8, ObservedAt: now,
		ExternalID: "quill-title",
	}}); err != nil {
		t.Fatal(err)
	}
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, nia, nil, []PersonAttributeInput{{
		Dimension: "title", Value: "Writer", SourceType: "source_fact",
		Source: "gmail", Extractor: "unknown", Confidence: 0.6, ObservedAt: now,
		ExternalID: "nia-title",
	}}); err != nil {
		t.Fatal(err)
	}
	if err := upsertPersonAttributes(f.ctx, f.client, ws, f.user, mira, nil, []PersonAttributeInput{{
		Dimension: "department", Value: "Ops", SourceType: "source_fact",
		Source: "gmail", Extractor: "user_entry", Confidence: 0.9, ObservedAt: now,
		ExternalID: "mira-department",
	}}); err != nil {
		t.Fatal(err)
	}

	names := func(query string) []string {
		t.Helper()
		found, err := f.svc.ListPersons(f.ctx, f.user, PersonFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := []string{}
		for _, row := range found.Persons {
			got = append(got, row.DisplayName)
		}
		return got
	}
	one := func(query, want string) {
		t.Helper()
		got := names(query)
		if len(got) != 1 || got[0] != want {
			t.Fatalf("query %q = %v", query, got)
		}
	}
	one("No extra details yet", "Casey Quinn")
	one("extra details", "Casey Quinn")
	one("From their email signature", "Quill Morse")
	one("Gmail", "Nia Holt")
	added := names("Added by you")
	if len(added) != 2 || !containsAll(added, "Indira Cole", "Mira Chen") {
		t.Fatalf("added by you = %v", added)
	}
	for _, query := range []string{"details", "you", "yet"} {
		if got := names(query); len(got) != 0 {
			t.Fatalf("query %q = %v", query, got)
		}
	}

	attr, err := f.client.PersonAttribute.Query().
		Where(
			personattribute.HasPersonWith(person.IDEQ(quill.ID)),
			personattribute.DimensionEQ("title"),
		).Only(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.RetractPersonAttribute(f.ctx, f.user, quill.ID, attr.ID, "wrong title"); err != nil {
		t.Fatal(err)
	}
	if got := names("From their email signature"); len(got) != 0 {
		t.Fatalf("retracted signature = %v", got)
	}
	after := names("No extra details yet")
	if len(after) != 2 || !containsAll(after, "Casey Quinn", "Quill Morse") {
		t.Fatalf("after retract = %v", after)
	}
}

func containsAll(got []string, wants ...string) bool {
	seen := map[string]bool{}
	for _, name := range got {
		seen[name] = true
	}
	for _, want := range wants {
		if !seen[want] {
			return false
		}
	}
	return true
}

func withRole(in RelationshipParticipantInput, role string) RelationshipParticipantInput {
	in.Role = role
	return in
}
