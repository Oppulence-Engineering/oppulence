package revenue

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/commitment"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationinteraction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationparticipant"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipidentity"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueaction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
)

func TestNormalizeEmailKeepsTheAddress(t *testing.T) {
	cases := map[string]string{
		"":                                   "",
		"  Ada@Northwind.Example ":           "ada@northwind.example",
		"Ada <ada@northwind.example>":        "ada@northwind.example",
		"mailto:ada@northwind.example":       "ada@northwind.example",
		"MAILTO:Ada <ada@northwind.example>": "ada@northwind.example",
		"Ada <mailto:ada@northwind.example>": "ada@northwind.example",
	}
	for raw, want := range cases {
		if got := normalizeEmail(raw); got != want {
			t.Errorf("normalizeEmail(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestCompanyAccountDomainKeepsATypedHost(t *testing.T) {
	cases := map[string]string{
		"":                      "",
		"  Northwind.Example. ": "northwind.example",
		"https://www.northwind.example/pricing?q=1": "northwind.example",
		"HTTP://WWW.Northwind.Example":              "northwind.example",
		"northwind.example/about":                   "northwind.example",
		"hello@northwind.example":                   "northwind.example",
		"Ada <hello@northwind.example>":             "northwind.example",
		"www.northwind.example":                     "northwind.example",
		"app.northwind.example":                     "app.northwind.example",
		"northwind.example:443":                     "northwind.example",
		"example.com":                               "example.com",
		"acme":                                      "acme",
		"https://":                                  "",
		"www.com":                                   "www.com",
	}
	for raw, want := range cases {
		if got := companyAccountDomain(raw); got != want {
			t.Errorf("companyAccountDomain(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestCreateRelationshipStoresAHostFromAPastedSite(t *testing.T) {
	f := newFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind:          "company",
		DisplayName:   "Northwind",
		PrimaryEmail:  "hello@northwind.example",
		AccountDomain: "https://www.northwind.example/pricing",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if rel.AccountDomain != "northwind.example" {
		t.Fatalf("account domain = %q", rel.AccountDomain)
	}
	anchor, err := f.client.RelationshipIdentity.Query().
		Where(relationshipidentity.KindEQ("domain")).
		Only(f.ctx)
	if err != nil {
		t.Fatalf("domain anchor: %v", err)
	}
	if anchor.NormalizedValue != "northwind.example" {
		t.Fatalf("domain anchor = %q", anchor.NormalizedValue)
	}
}

func TestCreateRelationshipStoresAPlainEmail(t *testing.T) {
	f := newFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind:          "company",
		DisplayName:   "Northwind Mail",
		PrimaryEmail:  "mailto:Hello <Hello@Northwind.Example>",
		AccountDomain: "northwind.example>",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if rel.PrimaryEmail != "hello@northwind.example" {
		t.Fatalf("email = %q", rel.PrimaryEmail)
	}
	if rel.AccountDomain != "northwind.example" {
		t.Fatalf("account domain = %q", rel.AccountDomain)
	}
	anchor, err := f.client.RelationshipIdentity.Query().
		Where(relationshipidentity.KindEQ("email")).
		Only(f.ctx)
	if err != nil {
		t.Fatalf("email anchor: %v", err)
	}
	if anchor.NormalizedValue != "hello@northwind.example" {
		t.Fatalf("email anchor = %q", anchor.NormalizedValue)
	}
}

func TestRelationshipSearchFindsTheCompanyTitle(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "dogfood-label.example", AccountDomain: "dogfood-label.example",
	}); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Dogfood Label"})
	if err != nil || len(found.Relationships) != 1 || found.Relationships[0].AccountDomain != "dogfood-label.example" {
		t.Fatalf("title search = %+v err=%v", found, err)
	}
	miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "zzzz-not-a-company"})
	if err != nil || len(miss.Relationships) != 0 {
		t.Fatalf("unrelated search = %+v err=%v", miss, err)
	}
}

func TestRelationshipSearchFindsABlankCompanyName(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	save := func(name, domain string) *ent.Relationship {
		t.Helper()
		create := f.client.Relationship.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetKind("company").
			SetDisplayName(name).
			SetResourceRefs([]string{}).
			SetRisks([]string{}).
			SetMilestones([]string{})
		if domain != "" {
			create.SetAccountDomain(domain)
		}
		row, err := create.Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	harbor := save("   ", "harbor-blank.example")
	nameless := save("   ", "")
	save("Northwind", "northwind.example")
	if reportAccountTitle(harbor) != "Harbor Blank" || reportAccountTitle(nameless) != "Unknown company" {
		t.Fatalf("titles harbor=%q nameless=%q", reportAccountTitle(harbor), reportAccountTitle(nameless))
	}

	byTitle, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Harbor Blank"})
	if err != nil || len(byTitle.Relationships) != 1 || byTitle.Relationships[0].ID != harbor.ID {
		t.Fatalf("domain title search = %v err=%v", namesOf(byTitle.Relationships), err)
	}
	byFallback, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Unknown company"})
	if err != nil || len(byFallback.Relationships) != 1 || byFallback.Relationships[0].ID != nameless.ID {
		t.Fatalf("unknown company search = %v err=%v", namesOf(byFallback.Relationships), err)
	}
	miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "zzzz-not-a-company"})
	if err != nil || len(miss.Relationships) != 0 {
		t.Fatalf("unrelated search = %v err=%v", namesOf(miss.Relationships), err)
	}
}

func TestRecoveryNamesACompanyLikeTheDirectory(t *testing.T) {
	f := newFixture(t)
	domain, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "harbor-graph.example", AccountDomain: "harbor-graph.example",
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
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	blank, err := f.client.Relationship.Create().
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
	want := map[uuid.UUID]string{
		domain.ID: "Harbor Graph",
		typed.ID:  "Billing @ Northwind",
		blank.ID:  "Unknown company",
	}
	for id, title := range want {
		action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
			RelationshipID: id, ActionType: "warm_follow_up", Channel: "email",
			Reason: "Send the harbor note", ExecutionMode: ExecModeDraft, PriorityScore: 30,
		})
		if err != nil {
			t.Fatalf("action %s: %v", title, err)
		}
		loaded, err := f.client.RevenueAction.Query().
			Where(revenueaction.IDEQ(action.ID)).
			WithRelationship().
			Only(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		if got := actionToDTO(loaded).RelationshipName; got != title {
			t.Fatalf("recovery name = %q, want %q", got, title)
		}
		row, err := f.client.Commitment.Create().
			SetWorkspace(ws).
			SetRelationshipID(id).
			SetUser(f.user).
			SetDirection("promised_by_me").
			SetText("Send the harbor note").
			SetConfidence(1).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		record, err := f.svc.ExportCommitment(f.ctx, f.user, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		if record.Account != title {
			t.Fatalf("exported account = %q, want %q", record.Account, title)
		}
	}
}

func TestRelationshipSearchFindsBlankActivityWords(t *testing.T) {
	f := newFixture(t)
	blank, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Blank Summary Harbor", AccountDomain: "blank-summary.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	written, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Written Summary Harbor", AccountDomain: "written-summary.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	quiet, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quiet Mail Harbor", AccountDomain: "quiet-mail.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	if _, err := f.svc.IngestRelationshipObservationCandidates(f.ctx, f.user, []RelationshipObservationInput{
		{
			RelationshipID: blank.ID, Source: "desktop_note", ExternalID: "blank-summary",
			EventType: "note", OccurredAt: at, Summary: "   ",
			Facts: map[string]any{"noteId": "blank-summary"},
		},
		{
			RelationshipID: written.ID, Source: "desktop_note", ExternalID: "written-summary",
			EventType: "note", OccurredAt: at, Summary: "The harbor packet arrived",
			Facts: map[string]any{"noteId": "written-summary"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	if _, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(quiet.ID).
		SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID("blank-subject").
		SetInteractionType("email").SetDirection("inbound").SetSubject("   ").
		SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
		SetContentHash("sha256:blank-subject").SetMetadataJSON(`{}`).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(written.ID).
		SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID("written-subject").
		SetInteractionType("email").SetDirection("inbound").SetSubject("Invoice packet").
		SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
		SetContentHash("sha256:written-subject").SetMetadataJSON(`{}`).
		Save(internal); err != nil {
		t.Fatal(err)
	}

	openSource, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Open the source"})
	if err != nil || len(openSource.Relationships) != 1 || openSource.Relationships[0].ID != blank.ID {
		t.Fatalf("open the source = %v err=%v", namesOf(openSource.Relationships), err)
	}
	preview, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "No message preview"})
	if err != nil || len(preview.Relationships) != 1 || preview.Relationships[0].ID != quiet.ID {
		t.Fatalf("no message preview = %v err=%v", namesOf(preview.Relationships), err)
	}
	miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "zzzz-not-a-company"})
	if err != nil || len(miss.Relationships) != 0 {
		t.Fatalf("unrelated search = %v err=%v", namesOf(miss.Relationships), err)
	}
}

func TestListRelationshipsOffsetSkipsTheNewestRows(t *testing.T) {
	f := newFixture(t)
	names := []string{"Oldest Co", "Middle Co", "Newest Co"}
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for i, name := range names {
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.Relationship.UpdateOneID(rel.ID).
			SetUpdatedAt(base.Add(time.Duration(i) * time.Hour)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	page, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Offset: 1})
	if err != nil {
		t.Fatal(err)
	}
	if page.HasMore || len(page.Relationships) != 2 || page.Relationships[0].DisplayName != "Middle Co" || page.Relationships[1].DisplayName != "Oldest Co" {
		t.Fatalf("offset page = %v hasMore=%v", namesOf(page.Relationships), page.HasMore)
	}
	none, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Offset: 3})
	if err != nil || none.HasMore || len(none.Relationships) != 0 {
		t.Fatalf("past the end = %v hasMore=%v err=%v", namesOf(none.Relationships), none.HasMore, err)
	}
	all, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Offset: -4})
	if err != nil || all.HasMore || len(all.Relationships) != 3 || all.Relationships[0].DisplayName != "Newest Co" {
		t.Fatalf("negative offset = %v hasMore=%v err=%v", namesOf(all.Relationships), all.HasMore, err)
	}
}

func TestListRelationshipsRecentTouchPrecedesANewerEdit(t *testing.T) {
	f := newFixture(t)
	talked, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Talk",
	})
	if err != nil {
		t.Fatal(err)
	}
	edited, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Edited",
	})
	if err != nil {
		t.Fatal(err)
	}
	yesterday := time.Now().UTC().Add(-24 * time.Hour)
	if _, err := f.client.Relationship.UpdateOneID(talked.ID).
		SetLastTouchAt(yesterday).
		SetUpdatedAt(yesterday.Add(-30 * 24 * time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(edited.ID).
		SetUpdatedAt(time.Now().UTC()).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	page, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{})
	if err != nil || len(page.Relationships) < 2 || page.Relationships[0].DisplayName != "Cedar Talk" {
		t.Fatalf("directory = %v err=%v", namesOf(page.Relationships), err)
	}
}

func TestListRelationshipsTiedUpdatedAtUsesID(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	touched := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	const total = relationshipListLimit + 1
	for i := 1; i <= total; i++ {
		name := "Tied Co"
		if i == 1 {
			name = "Tied Co Last"
		}
		if _, err := f.client.Relationship.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a115c000-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetUser(f.user).
			SetKind("company").
			SetDisplayName(name).
			SetResourceRefs([]string{}).
			SetRisks([]string{}).
			SetMilestones([]string{}).
			SetCreatedAt(touched.Add(-48 * time.Hour)).
			SetUpdatedAt(touched).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	first, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if !first.HasMore || len(first.Relationships) != relationshipListLimit {
		t.Fatalf("newest page = %d hasMore=%v", len(first.Relationships), first.HasMore)
	}
	for _, rel := range first.Relationships {
		if rel.DisplayName == "Tied Co Last" {
			t.Fatal("the lowest id was included beside newer ids with the same touch time")
		}
	}
	second, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Offset: relationshipListLimit})
	if err != nil {
		t.Fatal(err)
	}
	if second.HasMore || len(second.Relationships) != 1 || second.Relationships[0].DisplayName != "Tied Co Last" {
		t.Fatalf("older id page = %v hasMore=%v", namesOf(second.Relationships), second.HasMore)
	}
	seen := map[string]bool{}
	for _, rel := range append(first.Relationships, second.Relationships...) {
		if seen[rel.ID.String()] {
			t.Fatalf("company %s appeared on both pages", rel.DisplayName)
		}
		seen[rel.ID.String()] = true
	}
}

func TestRelationshipSearchFindsNextCompanies(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	touched := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	create := func(i int, name string) {
		t.Helper()
		if _, err := f.client.Relationship.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a116c000-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetUser(f.user).
			SetKind("company").
			SetDisplayName(name).
			SetResourceRefs([]string{}).
			SetRisks([]string{}).
			SetMilestones([]string{}).
			SetCreatedAt(touched).
			SetUpdatedAt(touched).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= relationshipListLimit; i++ {
		name := "Directory Leaf"
		if i == 1 {
			name = "Past Directory"
		}
		create(i, name)
	}
	exact, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next companies"})
	if err != nil {
		t.Fatal(err)
	}
	if exact.HasMore || len(exact.Relationships) != 0 {
		t.Fatalf("full page = %d hasMore=%v", len(exact.Relationships), exact.HasMore)
	}
	for _, query := range []string{"show", "next", "companies", "the next", "show the next"} {
		miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		if miss.HasMore || len(miss.Relationships) != 0 {
			t.Fatalf("%q = %d hasMore=%v", query, len(miss.Relationships), miss.HasMore)
		}
	}
	create(relationshipListLimit+1, "Directory Leaf")
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next companies"})
	if err != nil {
		t.Fatal(err)
	}
	if !found.HasMore || len(found.Relationships) != relationshipListLimit {
		t.Fatalf("next page search = %d hasMore=%v", len(found.Relationships), found.HasMore)
	}
	for _, rel := range found.Relationships {
		if rel.DisplayName == "Past Directory" {
			t.Fatal("the company behind the button was already on the first page")
		}
	}
	hidden, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{
		Query:  "Show the next companies",
		Offset: relationshipListLimit,
	})
	if err != nil {
		t.Fatal(err)
	}
	if hidden.HasMore || len(hidden.Relationships) != 1 || hidden.Relationships[0].DisplayName != "Past Directory" {
		t.Fatalf("hidden company = %v hasMore=%v", namesOf(hidden.Relationships), hidden.HasMore)
	}
}

func TestRelationshipSearchFindsHiddenConnections(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	company := func(name string) *ent.Relationship {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return rel
	}
	people := func(rel *ent.Relationship, n int) {
		t.Helper()
		for i := 1; i <= n; i++ {
			if _, err := f.client.RelationshipParticipant.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
				SetDisplayName(fmt.Sprintf("%s person %d", rel.DisplayName, i)).
				SetRole("contact").
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	quill := company("Quill North")
	people(quill, graphConnectionPage+1)
	cedar := company("Cedar Slide")
	people(cedar, graphConnectionPage)
	aspen := company("Aspen Ridge")
	people(aspen, graphConnectionPage+2)
	birch := company("Birch Quiet")
	people(birch, graphConnectionPage)
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(birch).
		SetSource("user").SetExternalID("birch-note").
		SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A note").SetContentHash("birch-note").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	risks := make([]string, graphConnectionPage+1)
	for i := range risks {
		risks[i] = fmt.Sprintf("slip %d", i+1)
	}
	maple := company("Maple Kept")
	if _, err := f.client.Relationship.UpdateOne(maple).SetRisks(risks).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	company("Harbor Quiet")

	want := func(query string, names ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		if found.HasMore {
			t.Fatalf("%q has more pages", query)
		}
		got := map[string]bool{}
		for _, rel := range found.Relationships {
			got[rel.DisplayName] = true
		}
		if len(got) != len(names) {
			t.Fatalf("%q = %v, want %v", query, namesOf(found.Relationships), names)
		}
		for _, name := range names {
			if !got[name] {
				t.Fatalf("%q = %v, missing %s", query, namesOf(found.Relationships), name)
			}
		}
	}
	want("Show the other 1 connection", "Quill North", "Birch Quiet", "Maple Kept")
	want("Show the other 2 connections", "Aspen Ridge")
	for _, query := range []string{
		"Show the other 1 connections",
		"show the other",
		"connection",
		"connections",
	} {
		want(query)
	}

	raw, err := f.svc.RelationshipGraphPayload(f.ctx, f.user, RelationshipGraphFilter{Scope: "portfolio", Depth: 2})
	if err != nil {
		t.Fatal(err)
	}
	var graph struct {
		Edges []struct {
			Source string `json:"source"`
			Target string `json:"target"`
		} `json:"edges"`
	}
	if err := json.Unmarshal(raw, &graph); err != nil {
		t.Fatal(err)
	}
	node := "relationship:" + quill.ID.String()
	touches := 0
	for _, edge := range graph.Edges {
		if edge.Source == node || edge.Target == node {
			touches++
		}
	}
	if touches != graphConnectionPage+1 {
		t.Fatalf("quill graph connections = %d", touches)
	}
}

func TestRelationshipSearchFindsNextSavedViews(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide",
	}); err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	const payload = `{"state":{"scope":"portfolio","query":"","layout":"force","density":1,"hideIsolated":false,"focusDepth":0,"changedSinceReview":false}}`
	save := func(owner *ent.User, kind, name string) {
		t.Helper()
		if _, err := f.client.ConsoleResource.Create().
			SetWorkspace(ws).SetUser(owner).
			SetKind(kind).SetName(name).SetNameKey(name).
			SetPayloadJSON(payload).SetSortOrder(0).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= consoleResourcePage; i++ {
		save(f.user, "graph_saved_view", fmt.Sprintf("Kept View %03d", i))
	}
	save(f.user, "note_favorite", "A favorite")
	other := newUser(t, f.client, "views@example.com", "user_saved_views")
	save(other, "graph_saved_view", "Someone else's view")
	exact, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next saved views"})
	if err != nil {
		t.Fatal(err)
	}
	if exact.HasMore || len(exact.Relationships) != 0 {
		t.Fatalf("full page = %v hasMore=%v", namesOf(exact.Relationships), exact.HasMore)
	}
	for _, query := range []string{"show", "next", "saved", "views", "show the next"} {
		miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		if miss.HasMore || len(miss.Relationships) != 0 {
			t.Fatalf("%q = %v", query, namesOf(miss.Relationships))
		}
	}
	save(f.user, "graph_saved_view", "Past View")
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next saved views"})
	if err != nil {
		t.Fatal(err)
	}
	if found.HasMore || len(found.Relationships) != 2 {
		t.Fatalf("next views = %v hasMore=%v", namesOf(found.Relationships), found.HasMore)
	}
	got := map[string]bool{}
	for _, rel := range found.Relationships {
		got[rel.DisplayName] = true
	}
	if !got["Quill North"] || !got["Cedar Slide"] {
		t.Fatalf("next views = %v", namesOf(found.Relationships))
	}
}

func namesOf(rows []*ent.Relationship) []string {
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.DisplayName)
	}
	return names
}

func TestRelationshipSearchSQLUsesPostgresPlaceholders(t *testing.T) {
	selector := sql.Dialect(dialect.Postgres).Select().From(sql.Table(relationship.Table))
	relationshipNormalizedContains("Dogfood Label")(selector)
	query, args := selector.Query()
	if strings.Contains(query, "?") {
		t.Fatalf("postgres search still uses ?: %s", query)
	}
	if !strings.Contains(query, "ESCAPE '!'") || !strings.Contains(query, "$1") {
		t.Fatalf("postgres search = %s", query)
	}
	if len(args) != len(relationshipSearchColumns) || args[0] != "%dogfood label%" {
		t.Fatalf("args = %#v", args)
	}
}

func TestRelationshipSearchFindsTheRowFacts(t *testing.T) {
	f := newFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind Quiet", AccountDomain: "northwind-quiet.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(rel.ID).
		SetNextAction("Send the security packet").
		SetSummary("Quiet renewal notes").
		SetCompanyDescription("Builds precision actuators").
		SetCompanyCategories([]string{"Industrial Robotics"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Plain Supplies",
	}); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		"security packet",
		"Quiet renewal",
		"precision actuators",
		"Industrial Robotics",
	} {
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		names := []string{}
		if found != nil {
			names = namesOf(found.Relationships)
		}
		if err != nil || len(names) != 1 || names[0] != "Northwind Quiet" {
			t.Fatalf("query %q = %v err=%v", query, names, err)
		}
	}
}

func TestRelationshipSearchFindsNextFollowUps(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North", AccountDomain: "quill-north.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide", AccountDomain: "cedar-slide.example",
	}); err != nil {
		t.Fatal(err)
	}
	touched := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	create := func(i int, reason, actionType, channel, status string) {
		t.Helper()
		row := f.client.RevenueAction.Create().
			SetID(uuid.MustParse(fmt.Sprintf("36000001-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(quill).
			SetActionType(actionType).
			SetChannel(channel).
			SetDetector("manual").
			SetDedupeKey(fmt.Sprintf("next-follow-%03d", i)).
			SetRevisionHash(fmt.Sprintf("next-follow-hash-%03d", i)).
			SetReason(reason).
			SetPriorityScore(40).
			SetQueueStatus(status).
			SetCreatedAt(touched).
			SetUpdatedAt(touched)
		if _, err := row.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= recoveryQueuePage; i++ {
		create(i, fmt.Sprintf("Directory Leaf %03d", i), "warm_follow_up", "email", "open")
	}
	create(recoveryQueuePage+2, "Task Quiet", "follow_up_task", "task", "open")
	create(recoveryQueuePage+3, "Dismissed Quiet", "warm_follow_up", "email", "dismissed")
	for _, query := range []string{
		"Show the next follow-ups",
		"show",
		"next",
		"follow",
		"ups",
		"follow-ups",
		"the next",
		"show the next",
	} {
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		names := []string{}
		if found != nil {
			names = namesOf(found.Relationships)
		}
		if err != nil || len(names) != 0 {
			t.Fatalf("query %q = %v err=%v", query, names, err)
		}
	}
	create(recoveryQueuePage+1, "Zed Hidden", "warm_follow_up", "email", "open")
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next follow-ups"})
	names := map[string]bool{}
	if found != nil {
		for _, name := range namesOf(found.Relationships) {
			names[name] = true
		}
	}
	if err != nil || len(names) != 2 || !names["Quill North"] || !names["Cedar Slide"] {
		t.Fatalf("next follow-ups = %v err=%v", names, err)
	}
	page, err := f.svc.ListActionPage(f.ctx, f.user, ListFilter{
		QueueStatus: QueueOpen, Limit: recoveryQueuePage, Surface: "recovery",
	})
	if err != nil || page == nil || len(page.Actions) != recoveryQueuePage || !page.HasMore {
		t.Fatalf("recovery page = %d hasMore=%v err=%v", len(page.Actions), page != nil && page.HasMore, err)
	}
	for _, action := range page.Actions {
		if action.Reason == "Zed Hidden" {
			t.Fatal("hidden follow-up is on the first page")
		}
	}
	rest, err := f.svc.ListActionPage(f.ctx, f.user, ListFilter{
		QueueStatus: QueueOpen, Limit: recoveryQueuePage, Offset: recoveryQueuePage, Surface: "recovery",
	})
	if err != nil || rest == nil || rest.HasMore || len(rest.Actions) != 1 || rest.Actions[0].Reason != "Zed Hidden" {
		got := ""
		if rest != nil && len(rest.Actions) == 1 {
			got = rest.Actions[0].Reason
		}
		t.Fatalf("next page = %q hasMore=%v err=%v", got, rest != nil && rest.HasMore, err)
	}
}

func TestRelationshipSearchFindsNextTasks(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North", AccountDomain: "quill-north.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide", AccountDomain: "cedar-slide.example",
	}); err != nil {
		t.Fatal(err)
	}
	touched := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	create := func(i int, reason, actionType, channel, status string) {
		t.Helper()
		if _, err := f.client.RevenueAction.Create().
			SetID(uuid.MustParse(fmt.Sprintf("37000001-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(quill).
			SetActionType(actionType).
			SetChannel(channel).
			SetDetector("manual").
			SetDedupeKey(fmt.Sprintf("next-task-%03d", i)).
			SetRevisionHash(fmt.Sprintf("next-task-hash-%03d", i)).
			SetReason(reason).
			SetPriorityScore(40).
			SetQueueStatus(status).
			SetCreatedAt(touched).
			SetUpdatedAt(touched).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= taskQueuePage; i++ {
		create(i, fmt.Sprintf("Directory Leaf %03d", i), "follow_up_task", "task", "open")
	}
	create(taskQueuePage+2, "Follow Quiet", "warm_follow_up", "email", "open")
	create(taskQueuePage+3, "Dismissed Quiet", "follow_up_task", "task", "dismissed")
	for _, query := range []string{
		"Show the next tasks",
		"show",
		"next",
		"task",
		"tasks",
		"the next",
		"show the next",
	} {
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		names := []string{}
		if found != nil {
			names = namesOf(found.Relationships)
		}
		if err != nil || len(names) != 0 {
			t.Fatalf("query %q = %v err=%v", query, names, err)
		}
	}
	create(taskQueuePage+1, "Zed Hidden", "follow_up_task", "task", "open")
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next tasks"})
	names := map[string]bool{}
	if found != nil {
		for _, name := range namesOf(found.Relationships) {
			names[name] = true
		}
	}
	if err != nil || len(names) != 2 || !names["Quill North"] || !names["Cedar Slide"] {
		t.Fatalf("next tasks = %v err=%v", names, err)
	}
	page, err := f.svc.ListActionPage(f.ctx, f.user, ListFilter{
		QueueStatus: QueueOpen, Limit: taskQueuePage, Surface: "task", DueOrder: "asc",
	})
	if err != nil || page == nil || len(page.Actions) != taskQueuePage || !page.HasMore {
		t.Fatalf("task page = %d hasMore=%v err=%v", len(page.Actions), page != nil && page.HasMore, err)
	}
	for _, action := range page.Actions {
		if action.Reason == "Zed Hidden" {
			t.Fatal("hidden task is on the first page")
		}
	}
	rest, err := f.svc.ListActionPage(f.ctx, f.user, ListFilter{
		QueueStatus: QueueOpen, Limit: taskQueuePage, Offset: taskQueuePage, Surface: "task", DueOrder: "asc",
	})
	if err != nil || rest == nil || rest.HasMore || len(rest.Actions) != 1 || rest.Actions[0].Reason != "Zed Hidden" {
		got := ""
		if rest != nil && len(rest.Actions) == 1 {
			got = rest.Actions[0].Reason
		}
		t.Fatalf("next page = %q hasMore=%v err=%v", got, rest != nil && rest.HasMore, err)
	}
}

func TestRelationshipSearchFindsNextPromises(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North", AccountDomain: "quill-north.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide", AccountDomain: "cedar-slide.example",
	}); err != nil {
		t.Fatal(err)
	}
	touched := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	due := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	create := func(i int, text, direction, status, acceptance string, at time.Time) {
		t.Helper()
		if _, err := f.client.Commitment.Create().
			SetID(uuid.MustParse(fmt.Sprintf("38000001-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(quill).
			SetDirection(direction).
			SetText(text).
			SetStatus(status).
			SetAcceptance(acceptance).
			SetConfidence(1).
			SetDueAt(at).
			SetCreatedAt(touched).
			SetUpdatedAt(touched).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= promiseRegisterPage; i++ {
		create(i, fmt.Sprintf("Directory Leaf %03d", i), "promised_by_me", "open", "accepted", due)
	}
	create(promiseRegisterPage+2, "They Quiet", "promised_by_them", "open", "accepted", due.AddDate(0, 6, 0))
	create(promiseRegisterPage+3, "Finished Quiet", "promised_by_me", "fulfilled", "accepted", due)
	create(promiseRegisterPage+4, "Candidate Quiet", "promised_by_me", "open", "candidate", due)
	create(promiseRegisterPage+5, "Disputed Quiet", "promised_by_me", "open", "disputed", due)
	for _, query := range []string{
		"Show the next promises",
		"show",
		"next",
		"promise",
		"the next",
		"show the next",
	} {
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		names := []string{}
		if found != nil {
			names = namesOf(found.Relationships)
		}
		if err != nil || len(names) != 0 {
			t.Fatalf("query %q = %v err=%v", query, names, err)
		}
	}
	create(promiseRegisterPage+1, "Zed Hidden", "promised_by_me", "open", "accepted", due.AddDate(0, 5, 0))
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Show the next promises"})
	names := map[string]bool{}
	if found != nil {
		for _, name := range namesOf(found.Relationships) {
			names[name] = true
		}
	}
	if err != nil || len(names) != 2 || !names["Quill North"] || !names["Cedar Slide"] {
		t.Fatalf("next promises = %v err=%v", names, err)
	}
	page, err := f.svc.ListCommitmentPage(f.ctx, f.user, CommitmentFilter{
		Direction: "promised_by_me",
		States:    []string{RegisterOpen, RegisterAtRisk},
		Limit:     promiseRegisterPage,
	})
	if err != nil || page == nil || len(page.Commitments) != promiseRegisterPage || !page.HasMore {
		t.Fatalf("promise page = %d hasMore=%v err=%v", len(page.Commitments), page != nil && page.HasMore, err)
	}
	for _, row := range page.Commitments {
		if row.Text == "Zed Hidden" {
			t.Fatal("hidden promise is on the first page")
		}
	}
	rest, err := f.svc.ListCommitmentPage(f.ctx, f.user, CommitmentFilter{
		Direction: "promised_by_me",
		States:    []string{RegisterOpen, RegisterAtRisk},
		Limit:     promiseRegisterPage,
		Offset:    promiseRegisterPage,
	})
	if err != nil || rest == nil || rest.HasMore || len(rest.Commitments) != 1 || rest.Commitments[0].Text != "Zed Hidden" {
		got := ""
		if rest != nil && len(rest.Commitments) == 1 {
			got = rest.Commitments[0].Text
		}
		t.Fatalf("next page = %q hasMore=%v err=%v", got, rest != nil && rest.HasMore, err)
	}
}

func TestRelationshipSearchFindsTheLinkedInLabel(t *testing.T) {
	f := newFixture(t)
	saved, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(saved.ID).
		SetLinkedinURL("https://www.linkedin.com/company/quill-atelier").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Ref Ledger", ResourceRefs: []string{"linkedin:company:ref-ledger"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	}); err != nil {
		t.Fatal(err)
	}
	view, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "View profile"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(view.Relationships); len(got) != 2 || !hasName(got, "Quill Atelier") || !hasName(got, "Ref Ledger") || hasName(got, "Lumen Packet") {
		t.Fatalf("view profile = %v", got)
	}
	find, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Find profile"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(find.Relationships); len(got) != 1 || got[0] != "Lumen Packet" {
		t.Fatalf("find profile = %v", got)
	}
	// "profile" is inside both labels. It must not return every company.
	fragment, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "profile"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(fragment.Relationships); len(got) != 0 {
		t.Fatalf("profile = %v", got)
	}
}

func TestRelationshipSearchFindsTheEmailThreadLabel(t *testing.T) {
	f := newFixture(t)
	one, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("quill-thread").
		SetRelationship(one).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	}); err != nil {
		t.Fatal(err)
	}
	single, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "1 email thread"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(single.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("1 email thread = %v", got)
	}
	none, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "0 email threads"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(none.Relationships); len(got) != 1 || got[0] != "Lumen Packet" {
		t.Fatalf("0 email threads = %v", got)
	}
	// "email" is inside both the singular and the plural label. Matching both
	// used to return every company.
	fragment, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "email"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(fragment.Relationships); len(got) != 0 {
		t.Fatalf("email = %v", got)
	}
}

func TestRelationshipSearchFindsTheSheetMailWords(t *testing.T) {
	f := newFixture(t)
	quiet, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	}); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	when := time.Now().Add(-2 * time.Hour)
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("quill-quiet").
		SetSubject("The quill invoice").
		SetMessageCount(1).
		SetLastActivityAt(when).
		SetReplyState("quiet").
		SetRelationship(quiet).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("harbor-blank").
		SetSubject("   ").
		SetCounterpartyEmail("   ").
		SetReplyState("needs_reply").
		SetRelationship(harbor).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	waiting, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("northwind-wait").
		SetSubject("The northwind note").
		SetCounterpartyEmail("ada@northwind.example").
		SetMessageCount(2).
		SetLastActivityAt(when).
		SetReplyState("awaiting_reply").
		SetRelationship(waiting).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	addressed, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mark",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("cedar-address").
		SetSubject("The cedar note").
		SetCounterpartyEmail("blair@quay.example").
		SetMessageCount(1).
		SetLastActivityAt(when).
		SetReplyState("quiet").
		SetRelationship(addressed).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("No Gmail threads linked yet", "Lumen Packet")
	assertCompanyQuery("Unknown date", "Harbor Ledger")
	assertCompanyQuery("Email conversation", "Harbor Ledger")
	assertCompanyQuery("Needs a reply", "Harbor Ledger")
	assertCompanyQuery("Waiting on them", "Northwind Ledger")
	assertCompanyQuery("Quiet", "Quill Atelier", "Cedar Mark")
	assertCompanyQuery("gmail", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("the quill invoice", "Quill Atelier")
	assertCompanyQuery("quill invoice", "Quill Atelier")
	assertCompanyQuery("ada@northwind.example", "Northwind Ledger")
	assertCompanyQuery("1 message", "Quill Atelier", "Cedar Mark")
	assertCompanyQuery("2 messages", "Northwind Ledger")
	assertCompanyQuery("0 messages", "Harbor Ledger")
	assertCompanyQuery("Gmail · 1 message", "Quill Atelier")
	assertCompanyQuery("Gmail · 0 messages", "Harbor Ledger")
	assertCompanyQuery("Gmail · 2 messages")
	assertCompanyQuery("which companies have gmail · 1 message", "Quill Atelier")

	assertCompanyQuery("blair@quay.example · 1 message", "Cedar Mark")
	assertCompanyQuery("ada@northwind.example · 2 messages", "Northwind Ledger")
	assertCompanyQuery("ada@northwind.example · 1 message")
	assertCompanyQuery("blair@quay.example · 2 messages")
	assertCompanyQuery("which companies have blair@quay.example · 1 message", "Cedar Mark")
	assertCompanyQuery("date")
}

func TestRelationshipSearchFindsGmailLinkedDetails(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	addThread := func(rel *ent.Relationship, id string) {
		t.Helper()
		if _, err := f.client.MailThread.Create().
			SetUser(f.user).SetProviderThreadID(id).
			SetSubject("Harbor note").SetMessageCount(1).
			SetRelationship(rel).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Link Quiet")
	one := makeCompany("Link One")
	two := makeCompany("Link Two")
	three := makeCompany("Link Three")
	sourced := makeCompany("Link Sourced")
	_ = quiet
	addThread(one, "link-one")
	addThread(two, "link-two-a")
	addThread(two, "link-two-b")
	addThread(three, "link-three-a")
	addThread(three, "link-three-b")
	addThread(three, "link-three-c")
	addThread(sourced, "link-sourced")
	obs, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(sourced).
		SetSource("desktop_note").SetExternalID("link-sourced-obs").
		SetEventType("note").SetOccurredAt(now).SetReceivedAt(now).
		SetContentHash("link-sourced-obs").
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(sourced).SetObservation(obs).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("source_fact").SetValidFrom(now).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery(
		"1 Gmail thread is linked. Health and status still need a clearer source.",
		"Link One",
	)
	assertCompanyQuery(
		"2 Gmail threads are linked. Health and status still need a clearer source.",
		"Link Two",
	)
	assertCompanyQuery(
		"3 Gmail threads are linked. Health and status still need a clearer source.",
		"Link Three",
	)
	assertCompanyQuery(
		"Health and status still need a clearer source.",
		"Link One", "Link Two", "Link Three",
	)
	assertCompanyQuery("Gmail thread is linked", "Link One")
	assertCompanyQuery("Gmail threads are linked", "Link Two", "Link Three")
	assertCompanyQuery("clearer")
	assertCompanyQuery("linked")
}

func TestRelationshipSearchFindsTheMeetingNote(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	note := func(rel *ent.Relationship, externalID, facts string) {
		t.Helper()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(externalID).
			SetEventType("note").SetOccurredAt(now).SetReceivedAt(now).
			SetSummary("Harbor title").SetContentHash(externalID).
			SetNormalizedFactsJSON(facts).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Note Quiet")
	plain := makeCompany("Note Plain")
	linked := makeCompany("Note Linked")
	text := makeCompany("Note Text")
	live := makeCompany("Note Live")
	_ = quiet
	note(plain, "note-plain", `{"title":"Harbor title","meetingLinked":false}`)
	note(linked, "note-linked", `{"title":"Harbor title","meetingLinked":true}`)
	note(text, "note-text", `{"title":"Harbor title","meetingLinked":"true"}`)
	note(live, "note-live", `{"title":"Harbor title","liveLinked":true}`)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Marked as a meeting note.", "Note Linked")
	assertCompanyQuery("which activity is marked as a meeting note", "Note Linked")
	assertCompanyQuery("meeting")
	assertCompanyQuery("marked")
}

func TestRelationshipSearchFindsTheEmptySheetSentences(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	empty := makeCompany("Quay Empty")
	meet := makeCompany("Quay Meet")
	note := makeCompany("Quay Note")
	inbox := makeCompany("Quay Inbox")
	promise := makeCompany("Quay Promise")
	changed := makeCompany("Quay Changed")
	deleted := makeCompany("Quay Deleted")
	calendar := makeCompany("Quay Calendar")
	observed := makeCompany("Quay Observed")
	_ = empty

	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	observe := func(rel *ent.Relationship, source, externalID string) {
		t.Helper()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource(source).SetExternalID(externalID).
			SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
			SetSummary("A note").SetContentHash(externalID).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	observe(meet, "meeting", "quay-meet")
	observe(note, "desktop_note", "quay-note")
	observe(calendar, "calendar", "quay-calendar")
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(observed).
		SetSource("user").SetExternalID("quay-observed").
		SetEventType("relationship.observed").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A recorded row").SetContentHash("quay-observed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	internal := auth.WithInternal(context.Background())
	writeMail := func(rel *ent.Relationship, objectID string, removed bool) {
		t.Helper()
		if _, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
			SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID(objectID).
			SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
			SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
			SetContentHash("sha256:" + objectID).SetMetadataJSON(`{}`).SetDeleted(removed).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	writeMail(inbox, "quay-inbox", false)
	writeMail(deleted, "quay-deleted", true)
	writeMail(calendar, "quay-calendar-mail", false)

	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(promise).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the quay packet").
		SetStatus("open").SetConfidence(1).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(promise).
		SetSource("user").SetExternalID("quay-promise-observed").
		SetEventType("relationship.observed").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A recorded promise").SetContentHash("quay-promise-observed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipStateSnapshot.Create().
		SetWorkspace(ws).SetRelationship(changed).SetUser(f.user).
		SetVersion(1).SetStateJSON(`{}`).SetStateHash("quay-changed").
		SetEvaluatedAt(at).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Nothing recorded yet.", "Quay Empty", "Quay Inbox", "Quay Changed", "Quay Deleted")
	assertCompanyQuery("which companies have nothing recorded yet", "Quay Empty", "Quay Inbox", "Quay Changed", "Quay Deleted")
	assertCompanyQuery(
		"No commitments recorded for this company yet.",
		"Quay Empty", "Quay Inbox", "Quay Changed", "Quay Deleted", "Quay Note", "Quay Meet", "Quay Calendar", "Quay Observed",
	)
	assertCompanyQuery("No Gmail or calendar events yet.", "Quay Empty", "Quay Note", "Quay Promise", "Quay Changed", "Quay Deleted", "Quay Observed")
	assertCompanyQuery(
		"No Gmail or calendar events yet. Confirmed meetings are in Activity.",
		"Quay Meet",
	)
	assertCompanyQuery("calendar", "Quay Calendar")
	assertCompanyQuery("events yet")
	assertCompanyQuery("No account details have changed yet.", "Quay Empty", "Quay Inbox", "Quay Deleted")
	assertCompanyQuery(
		"No account details have changed yet. Promises and meetings are in the sections below.",
		"Quay Meet", "Quay Note", "Quay Promise", "Quay Calendar", "Quay Observed",
	)
	assertCompanyQuery("have changed yet")
	assertCompanyQuery("No Gmail threads linked yet", "Quay Empty", "Quay Note", "Quay Inbox", "Quay Promise", "Quay Changed", "Quay Deleted", "Quay Calendar", "Quay Observed")
	assertCompanyQuery("No Gmail threads linked yet. Confirmed meetings are in Activity.", "Quay Meet")
}

func TestRelationshipSearchFindsDeletionAndChangeHeadings(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	at := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	quiet := makeCompany("Sheet Quiet")
	mail := makeCompany("Sheet Mail")
	note := makeCompany("Sheet Note")
	promise := makeCompany("Sheet Promise")
	calendar := makeCompany("Sheet Calendar")
	removed := makeCompany("Sheet Removed")
	one := makeCompany("Sheet One")
	two := makeCompany("Sheet Two")
	more := makeCompany("Sheet More")
	_ = quiet
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).SetProviderThreadID("sheet-mail").
		SetSubject("The sheet note").SetMessageCount(1).
		SetRelationship(mail).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(note).
		SetSource("desktop_note").SetExternalID("sheet-note").
		SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A note").SetContentHash("sheet-note").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(promise).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the sheet packet").
		SetStatus("open").SetConfidence(1).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(calendar).
		SetSource("calendar").SetExternalID("sheet-calendar").
		SetEventType("event.updated").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A calendar event").SetContentHash("sheet-calendar").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	if _, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(removed.ID).
		SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID("sheet-removed").
		SetInteractionType("email").SetDirection("inbound").SetSubject("Removed").
		SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
		SetContentHash("sha256:sheet-removed").SetMetadataJSON(`{}`).SetDeleted(true).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	saveSnapshot := func(rel *ent.Relationship, version int) {
		t.Helper()
		if _, err := f.client.RelationshipStateSnapshot.Create().
			SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
			SetVersion(version).SetStateJSON(`{}`).SetStateHash(rel.DisplayName + "-" + strconv.Itoa(version)).
			SetEvaluatedAt(at).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveSnapshot(one, 1)
	saveSnapshot(two, 1)
	saveSnapshot(two, 2)
	saveSnapshot(more, 1)
	saveSnapshot(more, 2)
	saveSnapshot(more, 3)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Delete conversation data", "Sheet Mail", "Sheet Note", "Sheet Promise")
	assertCompanyQuery(
		"No mail or meeting data to delete.",
		"Sheet Quiet", "Sheet Calendar", "Sheet Removed", "Sheet One", "Sheet Two", "Sheet More",
	)
	assertCompanyQuery(
		"What changed (0)",
		"Sheet Quiet", "Sheet Mail", "Sheet Note", "Sheet Promise", "Sheet Calendar", "Sheet Removed",
	)
	assertCompanyQuery("What changed (1)", "Sheet One")
	assertCompanyQuery("What changed (2)", "Sheet Two")
	assertCompanyQuery("What changed (2+)", "Sheet More")
	assertCompanyQuery("Show earlier changes", "Sheet More")
	assertCompanyQuery("What changed (3)", "Sheet More")
	assertCompanyQuery("What changed (1+)")
	assertCompanyQuery("What changed (4)")
}

func TestRelationshipSearchFindsTimelineHeadings(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	at := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	quiet := makeCompany("Pace Quiet")
	one := makeCompany("Pace One")
	mail := makeCompany("Pace Mail")
	removed := makeCompany("Pace Removed")
	long := makeCompany("Pace Long")
	mailLong := makeCompany("Pace Mail Long")
	_ = quiet
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(one).
		SetSource("desktop_note").SetExternalID("pace-one").
		SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A note").SetContentHash("pace-one").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	writeMail := func(rel *ent.Relationship, objectID string, deleted bool) {
		t.Helper()
		if _, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
			SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID(objectID).
			SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
			SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
			SetContentHash("sha256:" + objectID).SetMetadataJSON(`{}`).SetDeleted(deleted).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	writeMail(mail, "pace-mail", false)
	writeMail(removed, "pace-removed", true)
	for i := 0; i < 51; i++ {
		externalID := fmt.Sprintf("pace-long-%d", i)
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(long).
			SetSource("desktop_note").SetExternalID(externalID).
			SetEventType("note").SetOccurredAt(at.Add(time.Duration(i) * time.Second)).SetReceivedAt(at).
			SetSummary("A note").SetContentHash(externalID).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
		writeMail(mailLong, fmt.Sprintf("pace-mail-long-%d", i), false)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Activity history (0)", "Pace Quiet", "Pace Mail", "Pace Removed", "Pace Mail Long")
	assertCompanyQuery("Activity history (1)", "Pace One")
	assertCompanyQuery("Activity history (50)")
	assertCompanyQuery("Activity history (50+)", "Pace Long")
	assertCompanyQuery("Activity history (51)", "Pace Long")
	assertCompanyQuery("Show earlier activity", "Pace Long")
	assertCompanyQuery("Email & meeting timeline (0)", "Pace Quiet", "Pace One", "Pace Removed", "Pace Long")
	assertCompanyQuery("Email & meeting timeline (1)", "Pace Mail")
	assertCompanyQuery("Email & meeting timeline (50+)", "Pace Mail Long")
	assertCompanyQuery("Email & meeting timeline (51)", "Pace Mail Long")
	assertCompanyQuery("Show earlier mail and meetings", "Pace Mail Long")
	assertCompanyQuery("Activity history (49+)")
	assertCompanyQuery("Email & meeting timeline (2)")
}

func TestRelationshipSearchFindsSectionCounts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	quiet := makeCompany("Count Quiet")
	mail := makeCompany("Count Mail")
	person := makeCompany("Count Person")
	promise := makeCompany("Count Promise")
	draft := makeCompany("Count Draft")
	dismissed := makeCompany("Count Dismissed")
	_ = quiet
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).SetProviderThreadID("count-mail").
		SetSubject("The count note").SetMessageCount(1).
		SetRelationship(mail).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(person).
		SetDisplayName("Ada Count").SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(promise).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the count packet").
		SetStatus("fulfilled").SetConfidence(1).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	saveAction := func(rel *ent.Relationship, key, status string) {
		t.Helper()
		create := f.client.RevenueAction.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetActionType("follow_up_task").SetChannel("task").SetDetector("manual").
			SetDedupeKey(key).SetRevisionHash(key).SetReason("Mail the count excerpt").
			SetPriorityScore(40).SetQueueStatus(status)
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveAction(draft, "count-draft", "open")
	saveAction(dismissed, "count-dismissed", QueueDismissed)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Email activity (0)", "Count Quiet", "Count Person", "Count Promise", "Count Draft", "Count Dismissed")
	assertCompanyQuery("Email activity (1)", "Count Mail")
	assertCompanyQuery("People (0)", "Count Quiet", "Count Mail", "Count Promise", "Count Draft", "Count Dismissed")
	assertCompanyQuery("People (1)", "Count Person")
	assertCompanyQuery("Promises (0)", "Count Quiet", "Count Mail", "Count Person", "Count Draft", "Count Dismissed")
	assertCompanyQuery("Promises (1)", "Count Promise")
	assertCompanyQuery("Recommendations (0)", "Count Quiet", "Count Mail", "Count Person", "Count Promise")
	assertCompanyQuery("Recommendations (1)", "Count Draft", "Count Dismissed")
	assertCompanyQuery("1 open action", "Count Draft")
	assertCompanyQuery("Email activity (2)")
	assertCompanyQuery("People (1+)")
}

func TestRelationshipSearchFindsRecommendationReasons(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Reason Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	health, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Reason Health",
	})
	if err != nil {
		t.Fatal(err)
	}
	health, err = f.svc.CorrectRelationship(f.ctx, f.user, health.ID, RelationshipCorrectionInput{
		Dimension: "health", Value: "healthy", Reason: "The account is healthy.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if health.StateReason != "The account is healthy." {
		t.Fatalf("health reason = %q", health.StateReason)
	}
	slow, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Reason Slow",
	})
	if err != nil {
		t.Fatal(err)
	}
	slow, err = f.svc.CorrectRelationship(f.ctx, f.user, slow.ID, RelationshipCorrectionInput{
		Dimension: "engagement", Value: "declining", Reason: "Replies have slowed.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if slow.StateReason != "Replies have slowed." {
		t.Fatalf("slow reason = %q", slow.StateReason)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Why the recommendation changed", "Reason Health", "Reason Slow")
	assertCompanyQuery("Why the recommendation changed:", "Reason Health", "Reason Slow")
	assertCompanyQuery("Why the recommendation changed: The account is healthy.", "Reason Health")
	assertCompanyQuery("Why the recommendation changed: Replies have slowed.", "Reason Slow")
	assertCompanyQuery("Why the recommendation changed: Supporting evidence changed.")
}

func TestRelationshipSearchFindsUnavailableEvidenceExcerpts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveAction := func(rel *ent.Relationship, key string) *ent.RevenueAction {
		t.Helper()
		action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
			RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: "email",
			DedupeKey: key, Reason: "Mail the ledger note", ExecutionMode: ExecModeDraft, PriorityScore: 40,
		})
		if err != nil {
			t.Fatal(err)
		}
		return action
	}
	saveEvidence := func(rel *ent.Relationship, record, excerpt string) *ent.RevenueEvidence {
		t.Helper()
		create := f.client.RevenueEvidence.Create().
			SetWorkspace(ws).AddRelationships(rel).SetUser(f.user).
			SetSource("gmail").SetSourceRecordID(record).
			SetContentHash("sha256:" + record).
			SetOccurredAt(f.svc.now()).SetObservedAt(f.svc.now())
		if excerpt != "" || record == "excerpt-blank" {
			create.SetExcerpt(excerpt)
		}
		row, err := create.Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	quiet := makeCompany("Excerpt Quiet")
	quoted := makeCompany("Excerpt Quoted")
	blank := makeCompany("Excerpt Blank")
	missing := makeCompany("Excerpt Missing")
	promise := makeCompany("Excerpt Promise")
	_ = quiet
	if _, err := saveAction(quoted, "excerpt-quoted").Update().
		AddEvidences(saveEvidence(quoted, "excerpt-quoted", "The harbor sentence.")).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := saveAction(blank, "excerpt-blank").Update().
		AddEvidences(saveEvidence(blank, "excerpt-blank", "   ")).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := saveAction(missing, "excerpt-missing").Update().
		AddEvidences(saveEvidence(missing, "excerpt-missing", "")).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	promised, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(promise).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the excerpt packet").
		SetConfidence(1).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := promised.Update().
		AddEvidences(saveEvidence(promise, "excerpt-promise", "   ")).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Evidence excerpt unavailable", "Excerpt Blank", "Excerpt Missing")
	assertCompanyQuery("“Evidence excerpt unavailable”", "Excerpt Blank", "Excerpt Missing")
	assertCompanyQuery("The harbor sentence.", "Excerpt Quoted")
	assertCompanyQuery("“The harbor sentence.”", "Excerpt Quoted")
	assertCompanyQuery("harbor")
}

func TestRelationshipSearchFindsTheUnsupportedStateAnswer(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, lumen.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "healthy",
		Reason:    "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("No supported answer yet", "Quill Atelier")
	assertCompanyQuery("supported", "Quill Atelier")
	assertCompanyQuery("answer")
	assertCompanyQuery("0 of 8 account details have a source", "Quill Atelier")
	assertCompanyQuery("1 of 8 account details have a source", "Lumen Packet")
	assertCompanyQuery("0 of 8 account details come from a source you can open.", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("1 of 8 account details come from a source you can open.")
	assertCompanyQuery("2 of 8 account details have a source")
	// The tail sits in the empty heading and in every count. It must not
	// also return the company whose badge says one detail has a source.
	assertCompanyQuery("details have a source", "Quill Atelier")
	assertCompanyQuery("No account details have a source yet", "Quill Atelier")
	assertCompanyQuery("Some details are still missing", "Lumen Packet")
}

func TestRelationshipSearchSkipsASupportedEngagementAnswer(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	slide, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Slide",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, slide.ID, RelationshipCorrectionInput{
		Dimension: "engagement", Value: "declining", Reason: "Replies have slowed.",
	}); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "No supported answer yet"})
	if err != nil {
		t.Fatal(err)
	}
	got := namesOf(found.Relationships)
	if len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("no supported answer = %v", got)
	}
}

func TestRelationshipSearchTreatsAnOpenPromiseAsTheTruthLine(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	owe, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Owe",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, owe, "promised_by_them", "Send the quay review", "", nil)
	risk, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Risk",
	})
	if err != nil {
		t.Fatal(err)
	}
	soon := time.Now().Add(24 * time.Hour)
	seedCommitment(t, f, risk, "promised_by_them", "Send the quay risk", "", &soon)
	guess, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Guess",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, guess, "promised_by_them", "Send the guessed note", "", nil)
	if _, err := f.client.Commitment.Update().
		Where(commitment.HasRelationshipWith(relationship.IDEQ(guess.ID))).
		SetAcceptance("candidate").
		SetUserConfirmed(false).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("No supported answer yet", "Quill Atelier", "Harbor Guess")
	assertCompanyQuery("No action is currently recommended", "Quill Atelier", "Harbor Guess")
	assertCompanyQuery("Open promise", "Harbor Owe")
	assertCompanyQuery("Open promises", "Harbor Owe", "Harbor Risk")
	assertCompanyQuery("Open promise: Send the quay review", "Harbor Owe")
	assertCompanyQuery("Send the quay review", "Harbor Owe")
	assertCompanyQuery("No follow-up is drafted", "Harbor Owe", "Harbor Risk")
	assertCompanyQuery("At risk promise", "Harbor Risk")
	assertCompanyQuery("At risk promise: Send the quay risk", "Harbor Risk")
	assertCompanyQuery("Open promise: Send the quay review. No follow-up is drafted.", "Harbor Owe")
}

func TestRelationshipSearchFindsWhoOwesThePromise(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	them, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Them",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, them, "promised_by_them", "Send the quay review", "", nil)
	us, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Us",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, us, "promised_by_me", "Send the quay packet", "", nil)
	both, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Both",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, both, "mutual", "Send the quay note", "", nil)
	soonCompany, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Soon",
	})
	if err != nil {
		t.Fatal(err)
	}
	soon := time.Now().Add(24 * time.Hour)
	seedCommitment(t, f, soonCompany, "promised_by_them", "Send the quay risk", "", &soon)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("They owe us", "Harbor Them", "Harbor Soon")
	assertCompanyQuery("What they owe us", "Harbor Them", "Harbor Soon")
	assertCompanyQuery("We owe them", "Harbor Us")
	assertCompanyQuery("We both owe", "Harbor Both")
	assertCompanyQuery("At risk", "Harbor Soon")
	assertCompanyQuery("At risk promise", "Harbor Soon")
}

func TestRelationshipSearchFindsTheActivitySubject(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Thread Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Thread Login", "Gmail thread observed: Sandbox login", `{"subject":"Sandbox login"}`, nil)
	saveNote("Thread Kickoff", "Gmail thread observed: Kickoff notes", `{"subject":"Kickoff notes"}`, []byte{1, 2, 3})
	saveNote("Thread Echo", "Sandbox login", `{"subject":"Sandbox login"}`, nil)
	saveNote("Thread Mine", "Gmail thread observed: local-user", `{"subject":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Subject: Sandbox login", "Thread Login")
	assertCompanyQuery("which activity says subject: Sandbox login", "Thread Login")
	assertCompanyQuery("Subject: Kickoff notes", "Thread Kickoff")
	assertCompanyQuery("Subject: local-user")
	assertCompanyQuery("Sandbox login")
	assertCompanyQuery("subject")
}

func TestRelationshipSearchFindsTheActivityDirection(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary("Quiet note").
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Side Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Side Packet", `{"commitment_direction":"promised_by_me"}`, nil)
	saveNote("Side Reply", `{"commitment_direction":"promised_by_them"}`, nil)
	saveNote("Side Joint", `{"commitment_direction":"mutual"}`, nil)
	saveNote("Side Padded", `{"commitment_direction":" promised_by_me "}`, nil)
	saveNote("Side Mixed", `{"commitment_direction":"Promised_By_Me"}`, nil)
	saveNote("Side Other", `{"commitment_direction":"local-user"}`, nil)
	saveNote("Side Sealed", `{"commitment_direction":"promised_by_me"}`, []byte{1, 2, 3})
	card, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Side Card",
	})
	if err != nil {
		t.Fatal(err)
	}
	seedCommitment(t, f, card, "promised_by_me", "Send the quay packet", "", nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Direction: We owe them", "Side Packet", "Side Padded", "Side Card")
	assertCompanyQuery("We owe them", "Side Packet", "Side Padded", "Side Card")
	assertCompanyQuery("which activity says direction: we owe them", "Side Packet", "Side Padded", "Side Card")
	assertCompanyQuery("Direction: They owe us", "Side Reply")
	assertCompanyQuery("They owe us", "Side Reply")
	assertCompanyQuery("Direction: We both owe", "Side Joint")
	assertCompanyQuery("We both owe", "Side Joint")
	assertCompanyQuery("direction")
	assertCompanyQuery("owed")
}

func TestRelationshipSearchFindsTheActivityDueDay(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary("Quiet note").
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Day Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Day Third", `{"commitment_due_at":"2026-10-03T15:00:00Z"}`, nil)
	saveNote("Day Early", `{"commitment_due_at":"2026-10-03T00:30:00Z"}`, nil)
	saveNote("Day Late", `{"commitment_due_at":"2026-10-03T23:30:00Z"}`, nil)
	saveNote("Day Fourth", `{"commitment_due_at":"2026-10-04T00:30:00Z"}`, nil)
	saveNote("Day Junk", `{"commitment_due_at":"next week"}`, nil)
	saveNote("Day Sealed", `{"commitment_due_at":"2026-10-03T15:00:00Z"}`, []byte{1, 2, 3})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Due: Oct 3, 2026", "Day Third", "Day Early", "Day Late")
	assertCompanyQuery("which activity says due: Oct 3, 2026", "Day Third", "Day Early", "Day Late")
	assertCompanyQuery("Due: Oct 4, 2026", "Day Fourth")
	assertCompanyQuery("Due: Oct 32, 2026")
	assertCompanyQuery("Oct 3, 2026")
	assertCompanyQuery("due")
}

func TestRelationshipSearchFindsTheActivityQuote(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Line Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Line Heard", "Quiet note", `{"commitment_text":"Send the proposal","evidence_quote":"I will send the proposal."}`, nil)
	saveNote("Line Same", "Quiet note", `{"commitment_text":"Send the quay note","evidence_quote":"Send the quay note"}`, nil)
	saveNote("Line Asked", "Quiet note", `{"evidence_quote":"Ask about the sandbox."}`, nil)
	saveNote("Line Echo", "Harbor sentence", `{"commitment_text":"Send the packet","evidence_quote":"Harbor sentence"}`, nil)
	saveNote("Line Sealed", "Quiet note", `{"commitment_text":"Send the proposal","evidence_quote":"I will send the proposal."}`, []byte{1, 2, 3})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Quote: I will send the proposal.", "Line Heard")
	assertCompanyQuery("which activity says quote: I will send the proposal", "Line Heard")
	assertCompanyQuery("Quote: Ask about the sandbox.", "Line Asked")
	assertCompanyQuery("Quote: Send the quay note")
	assertCompanyQuery("Quote: Harbor sentence")
	assertCompanyQuery("I will send the proposal")
	assertCompanyQuery("quote")
}

func TestRelationshipSearchFindsTheActivityPromise(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Word Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Word Packet", "Quiet note", `{"commitment_text":"Send the proposal"}`, nil)
	saveNote("Word Echo", "Send the proposal", `{"commitment_text":"Send the proposal"}`, nil)
	saveNote("Word Mine", "Quiet note", `{"commitment_text":"local-user"}`, nil)
	saveNote("Word Slug", "Quiet note", `{"commitment_text":"send_the_proposal"}`, nil)
	saveNote("Word Sealed", "Quiet note", `{"commitment_text":"Send the proposal"}`, []byte{1, 2, 3})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Promise: Send the proposal", "Word Packet", "Word Slug")
	assertCompanyQuery("which activity says promise: Send the proposal", "Word Packet", "Word Slug")
	assertCompanyQuery("Promise: local-user")
	assertCompanyQuery("Send the proposal")
	assertCompanyQuery("promise")
}

func TestRelationshipSearchFindsTheActivityNote(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Ink Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Ink Body", "Harbor title", `{"title":"Harbor title","body":"Ask about the sandbox."}`, nil)
	saveNote("Ink Slate", "Harbor title", `{"content":[{"type":"p","children":[{"text":"Body lives in the editor."}]}]}`, nil)
	saveNote("Ink Both", "Harbor title", `{"body":"Ask about the sandbox.","content":[{"type":"p","children":[{"text":"Body lives in the editor."}]}]}`, nil)
	saveNote("Ink Parts", "Harbor title", `{"content":[{"type":"p","children":[{"text":"Hello"},{"text":"there"}]}]}`, nil)
	saveNote("Ink Echo", "Ask about the sandbox.", `{"body":"Ask about the sandbox."}`, nil)
	saveNote("Ink Skip", "Harbor title", `{"body":"local-user","content":"Kept the real sentence."}`, nil)
	saveNote("Ink Sealed", "Harbor title", `{"body":"Ask about the sandbox."}`, []byte{1, 2, 3})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Note: Ask about the sandbox.", "Ink Body", "Ink Both")
	assertCompanyQuery("which activity says note: Ask about the sandbox", "Ink Body", "Ink Both")
	assertCompanyQuery("Note: Body lives in the editor.", "Ink Slate")
	assertCompanyQuery("Note: Hello there", "Ink Parts")
	assertCompanyQuery("Note: Kept the real sentence.", "Ink Skip")
	assertCompanyQuery("Ask about the sandbox")
	assertCompanyQuery("note")
}

func TestRelationshipSearchFindsTheActivityPerson(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Palm Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Palm Ada", "Quiet note", `{"owner_participant_ref":"Ada Harbor"}`, nil)
	saveNote("Palm Blair", "Quiet note", `{"counterparty_participant_ref":"Blair Quinn"}`, nil)
	saveNote("Palm Casey", "Quiet note", `{"beneficiary_participant_ref":"Casey Lane"}`, nil)
	saveNote("Palm Token", "Quiet note", `{"owner_participant_ref":"local-user","counterparty_participant_ref":"meeting-counterparty"}`, nil)
	saveNote("Palm Slug", "Quiet note", `{"owner_participant_ref":"ada-harbor"}`, nil)
	saveNote("Palm Ident", "Quiet note", `{"owner_participant_ref":"14000001-0000-4000-8000-000000000011"}`, nil)
	saveNote("Palm Echo", "Ada Harbor", `{"owner_participant_ref":"Ada Harbor"}`, nil)
	saveNote("Palm Sealed", "Quiet note", `{"owner_participant_ref":"Ada Harbor"}`, []byte{1, 2, 3})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("From: Ada Harbor", "Palm Ada")
	assertCompanyQuery("which activity says from: Ada Harbor", "Palm Ada")
	assertCompanyQuery("To: Blair Quinn", "Palm Blair")
	assertCompanyQuery("For: Casey Lane", "Palm Casey")
	assertCompanyQuery("From: local-user")
	assertCompanyQuery("Ada Harbor")
	assertCompanyQuery("from")
}

func TestRelationshipSearchFindsTheActivityTitle(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Ask about the sandbox", `{"title":"Harbor follow-up"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"title":"Kickoff notes"}`, []byte{1, 2, 3})
	saveNote("Cedar Echo", "Harbor follow-up", `{"title":"Harbor follow-up"}`, nil)
	saveNote("Cedar Mine", "A saved note", `{"title":"local-user"}`, nil)
	saveNote("Cedar Token", "sandbox_login", `{"title":"sandbox_login"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Title: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("which activity says title: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("Title: Kickoff notes", "Cedar Locked")
	assertCompanyQuery("Title: Sandbox Login", "Cedar Token")
	assertCompanyQuery("Title: local-user")
	assertCompanyQuery("Harbor follow-up")
	assertCompanyQuery("title")
}

func TestRelationshipSearchFindsTheActivityAddress(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"from":"ada@harbor.example"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"from":"sam@northwind.example"}`, []byte{1, 2, 3})
	saveNote("Cedar Echo", "ada@harbor.example", `{"from":"ada@harbor.example"}`, nil)
	saveNote("Cedar Mine", "A saved note", `{"from":"local-user"}`, nil)
	saveNote("Cedar Mark", "ada_harbor", `{"from":"ada_harbor"}`, nil)
	saveNote("Birch Reply", "A saved note", `{"to":"blair@quay.example"}`, nil)
	saveNote("Birch Mine", "A saved note", `{"to":"meeting-counterparty"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("From: ada@harbor.example", "Quill Packet")
	assertCompanyQuery("which activity says from: ada@harbor.example", "Quill Packet")
	assertCompanyQuery("From: sam@northwind.example", "Cedar Locked")
	assertCompanyQuery("From: Ada Harbor", "Cedar Mark")
	assertCompanyQuery("From: local-user")
	assertCompanyQuery("To: blair@quay.example", "Birch Reply")
	assertCompanyQuery("To: meeting-counterparty")
	assertCompanyQuery("ada@harbor.example")
	assertCompanyQuery("blair@quay.example")
	assertCompanyQuery("from")
	assertCompanyQuery("to")
}

func TestRelationshipSearchFindsTheActivityPreview(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"snippet":"Harbor follow-up"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"preview":"Kickoff notes"}`, []byte{1, 2, 3})
	saveNote("Cedar Echo", "Harbor follow-up", `{"snippet":"Harbor follow-up"}`, nil)
	saveNote("Cedar Mine", "A saved note", `{"snippet":"local-user"}`, nil)
	saveNote("Cedar Mark", "sandbox_login", `{"snippet":"sandbox_login"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Preview: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("which activity says preview: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("Preview: Kickoff notes", "Cedar Locked")
	assertCompanyQuery("Preview: Sandbox Login", "Cedar Mark")
	assertCompanyQuery("Preview: local-user")
	assertCompanyQuery("Harbor follow-up")
	assertCompanyQuery("preview")
}

func TestRelationshipSearchFindsTheActivitySummary(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"summary":"Harbor follow-up"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"text":"Kickoff notes"}`, []byte{1, 2, 3})
	saveNote("Cedar Echo", "Harbor follow-up", `{"summary":"Harbor follow-up"}`, nil)
	saveNote("Cedar Mine", "A saved note", `{"summary":"local-user"}`, nil)
	saveNote("Cedar Mark", "sandbox_login", `{"summary":"sandbox_login"}`, nil)
	saveNote("Birch Slide", "A saved note", `{"text":"meeting-counterparty"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Summary: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("which activity says summary: Harbor follow-up", "Quill Packet")
	assertCompanyQuery("Summary: Sandbox Login", "Cedar Mark")
	assertCompanyQuery("Summary: local-user")
	assertCompanyQuery("Text: Kickoff notes", "Cedar Locked")
	assertCompanyQuery("Text: meeting-counterparty")
	assertCompanyQuery("Harbor follow-up")
	assertCompanyQuery("Kickoff notes")
	assertCompanyQuery("summary")
	assertCompanyQuery("text")
}

func TestRelationshipSearchFindsTheActivityReplyState(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"reply_state":"awaiting_reply"}`, nil)
	saveNote("Cedar Mark", "awaiting_reply", `{"reply_state":"awaiting_reply"}`, nil)
	saveNote("Cedar Echo", "Awaiting Reply", `{"reply_state":"awaiting_reply"}`, nil)
	saveNote("Birch Slide", "A saved note", `{"reply_state":"needs_reply"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"reply_state":"needs_reply"}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "A saved note", `{"reply_state":"quiet"}`, nil)
	saveNote("Cedar Lane", "A saved note", `{"reply_state":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Reply State: Awaiting Reply", "Quill Packet", "Cedar Mark")
	assertCompanyQuery("which activity says reply state: Awaiting Reply", "Quill Packet", "Cedar Mark")
	assertCompanyQuery("Reply State: Needs Reply", "Birch Slide", "Cedar Locked")
	assertCompanyQuery("Reply State: quiet", "Cedar Mine")
	assertCompanyQuery("Reply State: local-user")
	assertCompanyQuery("awaiting reply")
	assertCompanyQuery("reply state")
	assertCompanyQuery("needs a reply")
	assertCompanyQuery("waiting on them")
}

func TestRelationshipSearchFindsTheActivityDeparture(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("contact_departed").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	const evidence = "The mailbox rejected the harbor packet."
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"departure_kind":"left_organization"}`, nil)
	saveNote("Cedar Echo", "Left Organization", `{"departure_kind":"left_organization"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"departure_kind":"recipient_unknown"}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "A saved note", `{"departure_kind":"local-user"}`, nil)
	saveNote("Birch Slide", "A saved note", `{"departure_evidence":"The mailbox rejected the harbor packet."}`, nil)
	saveNote("Cedar Lane", evidence, `{"departure_evidence":"The mailbox rejected the harbor packet."}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Departure Kind: Left Organization", "Quill Packet")
	assertCompanyQuery("which activity says departure kind: Left Organization", "Quill Packet")
	assertCompanyQuery("Departure Kind: Recipient Unknown", "Cedar Locked")
	assertCompanyQuery("Departure Kind: local-user")
	assertCompanyQuery("Departure Evidence: The mailbox rejected the harbor packet.", "Birch Slide")
	assertCompanyQuery("left organization")
	assertCompanyQuery(evidence)
	assertCompanyQuery("departure")
}

func TestRelationshipSearchFindsTheActivityMailDirection(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Sandbox login", `{"direction":"outbound"}`, nil)
	saveNote("Cedar Echo", "outbound", `{"direction":"outbound"}`, nil)
	saveNote("Birch Slide", "A saved note", `{"direction":"inbound"}`, nil)
	saveNote("Cedar Locked", "A saved note", `{"direction":"inbound"}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "A saved note", `{"direction":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Direction: outbound", "Quill Packet")
	assertCompanyQuery("which activity says direction: outbound", "Quill Packet")
	assertCompanyQuery("Direction: inbound", "Birch Slide", "Cedar Locked")
	assertCompanyQuery("Direction: local-user")
	assertCompanyQuery("Direction: We owe them")
	assertCompanyQuery("outbound")
	assertCompanyQuery("inbound")
	assertCompanyQuery("direction")
}

func TestRelationshipSearchFindsTheActivityCounts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Locked",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Quill Packet", "Gmail thread observed: Harbor packet", `{"message_count":4}`, nil)
	saveNote("Cedar Echo", "4", `{"message_count":4}`, nil)
	saveNote("Birch Slide", "Gmail thread observed: Birch slide", `{"outbound_count":2}`, nil)
	saveNote("Cedar Quiet", "Gmail thread observed: Cedar quiet", `{"inbound_count":1}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "Gmail thread observed: local-user", `{"message_count":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Message Count: 4", "Quill Packet")
	assertCompanyQuery("which activity says message count: 4", "Quill Packet")
	assertCompanyQuery("Outbound Count: 2", "Birch Slide")
	assertCompanyQuery("Inbound Count: 1", "Cedar Quiet")
	assertCompanyQuery("Message Count: local-user")
	assertCompanyQuery("4 messages")
	assertCompanyQuery("message count")
	assertCompanyQuery("outbound count")
	assertCompanyQuery("inbound count")
}

func TestRelationshipSearchFindsTheActivityFlags(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveNote("Quill Packet", "Gmail thread observed: Harbor packet", `{"has_attachments":true}`, nil)
	saveNote("Cedar Echo", "true", `{"has_attachments":true}`, nil)
	saveNote("Birch Slide", "Gmail thread observed: Birch slide", `{"has_attachments":false}`, nil)
	saveNote("Cedar Quiet", "Gmail thread observed: Cedar quiet", `{"is_first_contact":true}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "Gmail thread observed: Cedar mine", `{"subject_present":false}`, nil)
	saveNote("Cedar Mark", "Gmail thread observed: Cedar mark", `{"has_attachments":1}`, nil)
	saveNote("Cedar Locked", "Gmail thread observed: Cedar locked", `{"has_attachments":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Has Attachments: true", "Quill Packet")
	assertCompanyQuery("which activity says has attachments: true", "Quill Packet")
	assertCompanyQuery("Has Attachments: false", "Birch Slide")
	assertCompanyQuery("Is First Contact: true", "Cedar Quiet")
	assertCompanyQuery("Subject Present: false", "Cedar Mine")
	assertCompanyQuery("Has Attachments: 1", "Cedar Mark")
	assertCompanyQuery("Has Attachments: local-user")
	assertCompanyQuery("has attachments")
	assertCompanyQuery("is first contact")
	assertCompanyQuery("subject present")
	assertCompanyQuery("true")
	assertCompanyQuery("false")
}

func TestRelationshipSearchFindsTheActivityMessageDays(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveNote("Quill Packet", "Gmail thread observed: Harbor packet", `{"first_message_at":"2026-10-04T15:04:05.123Z"}`, nil)
	saveNote("Cedar Echo", "Oct 4, 2026", `{"first_message_at":"2026-10-04T15:04:05Z"}`, nil)
	saveNote("Birch Slide", "Gmail thread observed: Birch slide", `{"last_message_at":"2026-08-01T00:30:00Z"}`, nil)
	saveNote("Cedar Quiet", "Gmail thread observed: Cedar quiet", `{"last_message_at":"2026-08-01T23:30:00Z"}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "Gmail thread observed: Cedar mine", `{"first_message_at":"2026-10-05T00:30:00Z"}`, nil)
	saveNote("Cedar Mark", "Gmail thread observed: Cedar mark", `{"first_message_at":"not-a-date"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("First message: Oct 4, 2026", "Quill Packet")
	assertCompanyQuery("which activity says first message: Oct 4, 2026", "Quill Packet")
	assertCompanyQuery("Last message: Aug 1, 2026", "Birch Slide", "Cedar Quiet")
	assertCompanyQuery("First message: Oct 5, 2026", "Cedar Mine")
	assertCompanyQuery("First message: Oct 4, 2026T15:04:05Z")
	assertCompanyQuery("First Message At: 2026-10-04T15:04:05.123Z")
	assertCompanyQuery("first message")
	assertCompanyQuery("last message")
	assertCompanyQuery("not-a-date")
}

func TestRelationshipSearchFindsTheActivityRoster(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveNote("Quill Packet", "Gmail thread observed: Harbor packet", `{"attachment_count":1,"thread_id":"18abc","message_id":"18def"}`, nil)
	saveNote("Cedar Echo", "1", `{"attachment_count":1}`, nil)
	saveNote("Birch Slide", "Gmail thread observed: Birch slide", `{"participant_count":3}`, nil)
	saveNote("Cedar Quiet", "Gmail thread observed: Cedar quiet", `{"external_participant_count":2}`, []byte{1, 2, 3})
	saveNote("Cedar Mark", "Gmail thread observed: Cedar mark", `{"participant_count":2}`, nil)
	saveNote("Cedar Locked", "Gmail thread observed: Cedar locked", `{"attachment_count":"local-user","thread_id":"18abc","message_id":"18def"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Attachment Count: 1", "Quill Packet")
	assertCompanyQuery("which activity says attachment count: 1", "Quill Packet")
	assertCompanyQuery("Participant Count: 3", "Birch Slide")
	assertCompanyQuery("External Participant Count: 2", "Cedar Quiet")
	assertCompanyQuery("Participant Count: 2", "Cedar Mark")
	assertCompanyQuery("participant count: 2 external participant count: 4", "Cedar Mark")
	assertCompanyQuery("Attachment Count: local-user")
	assertCompanyQuery("Thread Id: 18abc")
	assertCompanyQuery("Message Id: 18def")
	assertCompanyQuery("18abc")
	assertCompanyQuery("attachment count")
	assertCompanyQuery("participant count")
	assertCompanyQuery("external participant count")
}

func TestRelationshipSearchFindsTheActivityProvider(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, summary, facts string, payload []byte) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		create := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("gmail").SetExternalID(name).SetEventType("thread.snapshot").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetSummary(summary).
			SetNormalizedFactsJSON(facts)
		if len(payload) > 0 {
			create.SetPayloadCiphertext(payload)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveNote("Quill Packet", "Gmail thread observed: Harbor packet", `{"provider":"gmail"}`, nil)
	saveNote("Cedar Echo", "Gmail", `{"provider":"gmail"}`, nil)
	saveNote("Birch Slide", "Gmail thread observed: Birch slide", `{"direction":"outbound"}`, nil)
	saveNote("Cedar Quiet", "Gmail thread observed: Cedar quiet", `{"direction":"inbound"}`, []byte{1, 2, 3})
	saveNote("Cedar Mine", "Gmail thread observed: Cedar mine", `{"provider":"hubspot"}`, nil)
	saveNote("Cedar Mark", "Gmail thread observed: Cedar mark", `{"provider":"desktop_note"}`, nil)
	saveNote("Cedar Locked", "Outbound", `{"direction":"outbound"}`, nil)
	saveNote("Cedar West", "Gmail thread observed: Cedar west", `{"provider":"local-user"}`, nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Provider: Gmail", "Quill Packet")
	assertCompanyQuery("which activity says provider: Gmail", "Quill Packet")
	assertCompanyQuery("Provider: HubSpot", "Cedar Mine")
	assertCompanyQuery("Provider: A note", "Cedar Mark")
	assertCompanyQuery("Direction: Outbound", "Birch Slide")
	assertCompanyQuery("Direction: Inbound", "Cedar Quiet")
	assertCompanyQuery("Direction: We owe them")
	assertCompanyQuery("Provider: local-user")
	assertCompanyQuery("provider")
	assertCompanyQuery("direction")
	assertCompanyQuery("outbound")
}

func TestRelationshipSearchFindsTheMailTimelineHeading(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveCompany := func(name string) *ent.Relationship {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return rel
	}
	saveMail := func(rel *ent.Relationship, source, kind string, deleted bool) {
		t.Helper()
		now := time.Now().UTC()
		if _, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
			SetSource(source).SetSourceAccountID("owner@x.co").SetProviderObjectID(rel.DisplayName).
			SetInteractionType(kind).SetDirection("inbound").SetSubject("Harbor packet").
			SetOccurredAt(now).SetReceivedAt(now).SetVisibility("metadata").
			SetContentHash(rel.DisplayName).SetMetadataJSON(`{}`).
			SetDeleted(deleted).
			Save(auth.WithInternal(f.ctx)); err != nil {
			t.Fatal(err)
		}
	}
	activity := saveCompany("Quill Packet")
	now := time.Now().UTC()
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(activity).
		SetSource("gmail").SetExternalID("quill-packet").SetEventType("thread.snapshot").
		SetOccurredAt(now).SetReceivedAt(now).SetContentHash("quill-packet").
		SetSummary("Gmail thread observed: Harbor packet").
		SetNormalizedFactsJSON(`{}`).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	email := saveCompany("Birch Slide")
	saveMail(email, "gmail", "email", false)
	meeting := saveCompany("Cedar Quiet")
	saveMail(meeting, "calendar", "meeting", false)
	gmailMeeting := saveCompany("Cedar Mine")
	saveMail(gmailMeeting, "gmail", "meeting", false)
	removed := saveCompany("Cedar Mark")
	saveMail(removed, "gmail", "email", true)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Gmail · Email", "Birch Slide")
	assertCompanyQuery("which timeline says gmail · email", "Birch Slide")
	assertCompanyQuery("Gmail · Meeting", "Cedar Mine")
	assertCompanyQuery("Calendar · Meeting", "Cedar Quiet")
	assertCompanyQuery("Gmail · Mail", "Quill Packet")
	assertCompanyQuery("email")
	assertCompanyQuery("Calendar · Email")
}

func TestRelationshipSearchFindsTheMailTimelineSubject(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveCompany := func(name string) *ent.Relationship {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return rel
	}
	saveMail := func(rel *ent.Relationship, subject string, deleted bool) {
		t.Helper()
		now := time.Now().UTC()
		if _, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
			SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID(rel.DisplayName).
			SetInteractionType("email").SetDirection("inbound").SetSubject(subject).
			SetOccurredAt(now).SetReceivedAt(now).SetVisibility("metadata").
			SetContentHash(rel.DisplayName).SetMetadataJSON(`{}`).
			SetDeleted(deleted).
			Save(auth.WithInternal(f.ctx)); err != nil {
			t.Fatal(err)
		}
	}
	noted := saveCompany("Quill North")
	now := time.Now().UTC()
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(noted).
		SetSource("gmail").SetExternalID("quill-north").SetEventType("thread.snapshot").
		SetOccurredAt(now).SetReceivedAt(now).SetContentHash("quill-north").
		SetSummary("Harbor packet").
		SetNormalizedFactsJSON(`{}`).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	harbor := saveCompany("Birch Slide")
	saveMail(harbor, "Harbor packet", false)
	invoice := saveCompany("Cedar Mine")
	saveMail(invoice, "Invoice packet", false)
	removed := saveCompany("Cedar Mark")
	saveMail(removed, "Harbor packet", true)
	blank := saveCompany("Cedar Quiet")
	saveMail(blank, "   ", false)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Harbor packet", "Birch Slide")
	assertCompanyQuery("harbor", "Birch Slide")
	assertCompanyQuery("Invoice packet", "Cedar Mine")
	assertCompanyQuery("packet", "Birch Slide", "Cedar Mine")
	assertCompanyQuery("No message preview", "Cedar Quiet")
}

func TestRelationshipSearchFindsTheFollowUpLabel(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	meeting, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Meeting",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: meeting.ID,
		ActionType:     "meeting_follow_up",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from the meeting.",
		PriorityScore:  70,
	}); err != nil {
		t.Fatal(err)
	}
	warm, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Warm",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: warm.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Send the harbor packet",
		PriorityScore:  60,
	}); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Meeting follow-up", "Harbor Meeting")
	assertCompanyQuery("Meeting follow-up. You confirmed this follow-up from the meeting.", "Harbor Meeting")
	assertCompanyQuery("Warm follow-up", "Harbor Warm")
	assertCompanyQuery("No action is currently recommended", "Quill Atelier")
}

func TestRelationshipSearchFindsTheConfirmedMeetingReason(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	packet, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: packet.ID,
		ActionType:     "meeting_follow_up",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from the meeting.",
		PriorityScore:  70,
	}); err != nil {
		t.Fatal(err)
	}
	ledger, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: ledger.ID,
		ActionType:     "meeting_follow_up",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from source evidence meeting/commitment:harbor-rank.",
		PriorityScore:  70,
	}); err != nil {
		t.Fatal(err)
	}
	call, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Call",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: call.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from the call.",
		PriorityScore:  40,
	}); err != nil {
		t.Fatal(err)
	}
	open, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Open",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: open.ID,
		ActionType:     "crm_update",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from source evidence meeting/abc",
		PriorityScore:  20,
	}); err != nil {
		t.Fatal(err)
	}
	mail, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quay Mail",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: mail.ID,
		ActionType:     "crm_update",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from source evidence email/abc.",
		PriorityScore:  20,
	}); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("You confirmed this follow-up from the meeting.", "Quay Packet", "Quay Ledger")
	assertCompanyQuery(
		"where it says you confirmed this follow-up from the meeting",
		"Quay Packet", "Quay Ledger",
	)
	assertCompanyQuery("You confirmed this follow-up from the call.", "Quay Call")
	assertCompanyQuery("xylophone")
}

func TestRelationshipSearchFindsPromiseBadges(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Badge Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	makePromise := func(name, status, acceptance string, due *time.Time) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		row := seedCommitment(t, f, rel, "promised_by_them", "Send the quay packet", "", due)
		update := f.client.Commitment.UpdateOneID(row.ID).SetStatus(status).SetAcceptance(acceptance)
		if _, err := update.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	soon := time.Now().Add(24 * time.Hour)
	later := time.Now().Add(30 * 24 * time.Hour)
	past := time.Now().Add(-24 * time.Hour)
	makePromise("Badge Kept", "fulfilled", "internally_confirmed", &past)
	makePromise("Badge Released", "waived", "internally_confirmed", nil)
	makePromise("Badge Late", "missed", "internally_confirmed", &past)
	makePromise("Badge Halted", "cancelled", "internally_confirmed", nil)
	makePromise("Badge Replaced", "superseded", "internally_confirmed", nil)
	makePromise("Badge Argue", "open", "disputed", nil)
	makePromise("Badge Guess", "open", "candidate", &past)
	makePromise("Badge Live", "open", "internally_confirmed", &later)
	makePromise("Badge Soon", "open", "internally_confirmed", &soon)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Kept", "Badge Kept")
	assertCompanyQuery("Waived", "Badge Released")
	assertCompanyQuery("Missed", "Badge Late")
	assertCompanyQuery("Cancelled", "Badge Halted")
	assertCompanyQuery("the promise is cancelled", "Badge Halted")
	assertCompanyQuery("Superseded", "Badge Replaced")
	assertCompanyQuery("Disputed", "Badge Argue")
	assertCompanyQuery("Review", "Badge Guess")
	assertCompanyQuery("Open", "Badge Live")
	assertCompanyQuery("At risk", "Badge Soon")
	assertCompanyQuery("kept until it is transcribed")
	assertCompanyQuery("needs your review")
}

func TestRelationshipSearchFindsThePromiseDueDay(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Day Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	makeDue := func(name string, due time.Time) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		seedCommitment(t, f, rel, "promised_by_them", "Send the quay packet", "", &due)
	}
	makeDue("Day Third", time.Date(2026, 10, 3, 15, 0, 0, 0, time.UTC))
	makeDue("Day Early", time.Date(2026, 10, 3, 0, 30, 0, 0, time.UTC))
	makeDue("Day Late", time.Date(2026, 10, 3, 23, 30, 0, 0, time.UTC))
	makeDue("Day Fourth", time.Date(2026, 10, 4, 0, 30, 0, 0, time.UTC))

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Due: Oct 3, 2026", "Day Third", "Day Early", "Day Late")
	assertCompanyQuery("which promise is due: Oct 3, 2026", "Day Third", "Day Early", "Day Late")
	assertCompanyQuery("Oct 3, 2026", "Day Third", "Day Early", "Day Late")
	assertCompanyQuery("Due: Oct 4, 2026", "Day Fourth")
	assertCompanyQuery("Due: Oct 32, 2026")
	assertCompanyQuery("Oct 3")
	assertCompanyQuery("due")
}

func TestRelationshipSearchFindsPromiseOverflow(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string, count int) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i < count; i++ {
			seedCommitment(t, f, rel, "promised_by_them", fmt.Sprintf("Send the quay packet %d", i+1), "", nil)
		}
	}
	makeCompany("Pile Quiet", 0)
	makeCompany("Pile Three", 3)
	makeCompany("Pile Four", 4)
	makeCompany("Pile Six", 6)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Show the other 1 promise", "Pile Four")
	assertCompanyQuery("which button says show the other 1 promise", "Pile Four")
	assertCompanyQuery("Show the other 3 promises", "Pile Six")
	assertCompanyQuery("Show the other 2 promises")
	assertCompanyQuery("Show the other 1 promises")
	assertCompanyQuery("show the other")
}

func TestRelationshipSearchFindsTheEmptyActivity(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	saveNote := func(name, facts string) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("desktop_note").SetExternalID(name).SetEventType("note").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(name).
			SetNormalizedFactsJSON(facts).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Bare Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	saveNote("Bare Empty", "{}")
	saveNote("Bare Hidden", `{"meetingLinked":false,"user_confirmed":true,"noteId":"n-1"}`)
	saveNote("Bare Title", `{"title":"Harbor title"}`)
	saveNote("Bare Linked", `{"meetingLinked":true}`)
	saveNote("Bare Note", `{"content":"Hello from the note"}`)
	saveNote("Bare Direction", `{"commitment_direction":"promised_by_me"}`)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Nothing else was saved with this activity.", "Bare Empty", "Bare Hidden")
	assertCompanyQuery(
		"which activity says nothing else was saved with this activity",
		"Bare Empty", "Bare Hidden",
	)
	assertCompanyQuery("saved")
	assertCompanyQuery("activity")
}

func TestRelationshipSearchFindsTheAttentionBadge(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	queue, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Queue",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: queue.ID,
		ActionType:     "meeting_follow_up",
		Channel:        "email",
		Reason:         "You confirmed this follow-up from the meeting.",
		PriorityScore:  75,
	}); err != nil {
		t.Fatal(err)
	}
	glance, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Glance",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: glance.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Send the harbor packet",
		PriorityScore:  50,
	}); err != nil {
		t.Fatal(err)
	}
	calm, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Calm",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: calm.ID,
		ActionType:     "proposal_nudge",
		Channel:        "email",
		Reason:         "Send the harbor note",
		PriorityScore:  20,
	}); err != nil {
		t.Fatal(err)
	}
	soonCompany, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Soon",
	})
	if err != nil {
		t.Fatal(err)
	}
	soon := time.Now().Add(24 * time.Hour)
	seedCommitment(t, f, soonCompany, "promised_by_them", "Send the quay risk", "", &soon)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("At risk", "Harbor Queue", "Harbor Soon")
	assertCompanyQuery("At risk promise", "Harbor Soon")
	assertCompanyQuery("Watch", "Harbor Glance")
	assertCompanyQuery("Stable", "Harbor Calm")
}

func TestRelationshipSearchFindsTheCardAttentionBadge(t *testing.T) {
	f := newFixture(t)
	makeHealth := func(name, health string) {
		t.Helper()
		rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.Relationship.UpdateOneID(rel.ID).SetHealth(health).Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Mark Quiet",
	}); err != nil {
		t.Fatal(err)
	}
	makeHealth("Mark Critical", "critical")
	makeHealth("Mark Strained", "needs_attention")
	makeHealth("Mark Fit", "healthy")
	calm, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Mark Calm",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: calm.ID,
		ActionType:     "proposal_nudge",
		Channel:        "email",
		Reason:         "Send the harbor note",
		PriorityScore:  20,
	}); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Needs you", "Mark Critical", "Mark Strained")
	assertCompanyQuery("needs your review")
	assertCompanyQuery("Stable", "Mark Fit", "Mark Calm")
	assertCompanyQuery("healthy", "Mark Fit")
	assertCompanyQuery("critical", "Mark Critical")
}

func TestRelationshipSearchFindsNextQueueCompanies(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide",
	}); err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= attentionQueuePage; i++ {
		if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
			RelationshipID: quill.ID,
			ActionType:     "warm_follow_up",
			Channel:        "email",
			Reason:         fmt.Sprintf("Directory Leaf %03d", i),
			PriorityScore:  40,
		}); err != nil {
			t.Fatal(err)
		}
	}
	task, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: quill.ID,
		ActionType:     "follow_up_task",
		Channel:        "task",
		Reason:         "Task Quiet",
		PriorityScore:  40,
	})
	if err != nil {
		t.Fatal(err)
	}
	dismissed, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: quill.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Dismissed Quiet",
		PriorityScore:  40,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Dismiss(f.ctx, f.user, dismissed.ID, "already_handled"); err != nil {
		t.Fatal(err)
	}
	full, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", attentionQueuePage, 0)
	if err != nil {
		t.Fatal(err)
	}
	if full.HasMore || len(full.Items) != attentionQueuePage {
		t.Fatalf("full queue = %d hasMore=%v", len(full.Items), full.HasMore)
	}
	for _, item := range full.Items {
		if item.Explanation == "Task Quiet" || item.Explanation == "Dismissed Quiet" {
			t.Fatalf("queue included %q", item.Explanation)
		}
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	for _, query := range []string{
		"Show the next companies in the queue",
		"show", "next", "queue", "companies", "the next", "show the next", "in the queue",
	} {
		assertCompanyQuery(query)
	}
	if task.QueueStatus != QueueOpen {
		t.Fatalf("task status = %s", task.QueueStatus)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: quill.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Zed Hidden",
		PriorityScore:  1,
	}); err != nil {
		t.Fatal(err)
	}
	assertCompanyQuery("Show the next companies in the queue", "Quill North", "Cedar Slide")
	first, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", attentionQueuePage, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !first.HasMore || len(first.Items) != attentionQueuePage {
		t.Fatalf("first queue page = %d hasMore=%v", len(first.Items), first.HasMore)
	}
	for _, item := range first.Items {
		if item.Explanation == "Zed Hidden" {
			t.Fatal("the later follow-up was on the first queue page")
		}
	}
	second, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", attentionQueuePage, attentionQueuePage)
	if err != nil {
		t.Fatal(err)
	}
	if second.HasMore || len(second.Items) != 1 || second.Items[0].Explanation != "Zed Hidden" {
		got := make([]string, 0, len(second.Items))
		for _, item := range second.Items {
			got = append(got, item.Explanation)
		}
		t.Fatalf("next queue page = %v hasMore=%v", got, second.HasMore)
	}
}

func TestRelationshipSearchFindsThePeopleOnTheCompany(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	makerCompany, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Maker",
	})
	if err != nil {
		t.Fatal(err)
	}
	maker, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").
		SetTitle("Buyer").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetRelationship(makerCompany).SetPerson(maker).
		SetDisplayName("Casey Quinn").
		SetRole("decision_maker").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	leftCompany, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Left",
	})
	if err != nil {
		t.Fatal(err)
	}
	left, err := f.client.Person.Create().
		SetDisplayName("Ada Mesa").
		SetTitle("Buyer").
		SetEmploymentStatus("departed").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetRelationship(leftCompany).SetPerson(left).
		SetDisplayName("Ada Mesa").
		SetRole("contact").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	blankCompany, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Blank",
	})
	if err != nil {
		t.Fatal(err)
	}
	blank, err := f.client.Person.Create().
		SetDisplayName("No Profile").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetRelationship(blankCompany).SetPerson(blank).
		SetDisplayName("No Profile").
		SetRole("champion").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Decision maker", "Harbor Maker")
	assertCompanyQuery("Left the company", "Harbor Left")
	assertCompanyQuery("No profile details yet", "Harbor Blank")
	assertCompanyQuery("Champion", "Harbor Blank")
	assertCompanyQuery("Contact", "Harbor Left")
}

func TestRelationshipSearchFindsAnUnknownPerson(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	addMember := func(rel *ent.Relationship, header, email string, who *ent.Person) {
		t.Helper()
		create := f.client.RelationshipParticipant.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetDisplayName(header).SetRole("contact")
		if email != "" {
			create.SetEmail(email)
		}
		if who != nil {
			create.SetPerson(who)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	blankPerson := func() *ent.Person {
		t.Helper()
		row, err := f.client.Person.Create().
			SetDisplayName(" ").
			SetWorkspace(ws).SetUser(f.user).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	headerOnly := makeCompany("Quill North")
	linkedBlank := makeCompany("Cedar Mark")
	named := makeCompany("Birch Slide")
	addressed := makeCompany("Aspen Quay")
	emailed := makeCompany("Harbor Ledger")
	makeCompany("Lumen Packet")
	addMember(headerOnly, " ", "", nil)
	addMember(linkedBlank, " ", "", blankPerson())
	namedPerson, err := f.client.Person.Create().
		SetDisplayName("Ada Harbor").
		SetWorkspace(ws).SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	addMember(named, " ", "", namedPerson)
	addressPerson, err := f.client.Person.Create().
		SetDisplayName(" ").
		SetPrimaryEmail("ada@birch.example").
		SetWorkspace(ws).SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	addMember(addressed, " ", "", addressPerson)
	addMember(emailed, " ", "ada@lumen.example", nil)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Unknown person", "Quill North", "Cedar Mark")
	assertCompanyQuery("which companies have an unknown person", "Quill North", "Cedar Mark")
	assertCompanyQuery("person")
}

func TestRelationshipSearchFindsTheActivityHeading(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	note, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Note",
	})
	if err != nil {
		t.Fatal(err)
	}
	mail, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Mail",
	})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	writeObservation := func(rel *ent.Relationship, source, event, externalID string) {
		t.Helper()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource(source).SetExternalID(externalID).SetSourceVersion("1").
			SetEventType(event).SetOccurredAt(now).SetReceivedAt(now).
			SetSummary("Noted the harbor").SetContentHash(externalID).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	writeObservation(note, "user", "note", "harbor-note")
	writeObservation(mail, "gmail", "thread.updated", "harbor-mail")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Note saved", "Harbor Note")
	assertCompanyQuery("Added by you · Note saved", "Harbor Note")
	assertCompanyQuery("Mail updated", "Harbor Mail")
	assertCompanyQuery("Gmail · Mail updated", "Harbor Mail")
	assertCompanyQuery("Gmail", "Harbor Mail")
	assertCompanyQuery("Added by you", "Harbor Note")
}

func TestRelationshipSearchFindsAnOpenableDetail(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	corrected, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, corrected.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "healthy",
		Reason:    "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}
	sourced, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Source",
	})
	if err != nil {
		t.Fatal(err)
	}
	sourced, err = f.svc.GetRelationship(f.ctx, sourced.ID)
	if err != nil {
		t.Fatal(err)
	}
	obs, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(sourced).
		SetSource("meeting").SetExternalID("harbor-source").
		SetEventType("note").SetOccurredAt(sourced.CreatedAt).SetReceivedAt(sourced.CreatedAt).
		SetSummary("Moved to evaluation").SetContentHash("harbor-source").
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	rank, ok := relationshipAssertionAuthorityRank("source_fact")
	if !ok {
		t.Fatal("source_fact rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(sourced).SetObservation(obs).
		SetDimension("lifecycle").SetValue("evaluation").
		SetSourceType("source_fact").SetAuthorityRank(rank).
		SetValidFrom(sourced.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{obs.ID.String()}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	cited, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cited Nowhere",
	})
	if err != nil {
		t.Fatal(err)
	}
	cited, err = f.svc.GetRelationship(f.ctx, cited.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(cited).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("source_fact").SetAuthorityRank(rank).
		SetValidFrom(cited.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{"obs-cited"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("1 of 8 account details come from a source you can open.", "Harbor Source")
	assertCompanyQuery("0 of 8 account details come from a source you can open.", "Lumen Packet", "Cited Nowhere")
}

func TestRelationshipSearchFindsTheCompletenessCopy(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet", ResourceRefs: []string{"hubspot:company:lumen-1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	quillModel, err := f.svc.MissionControl(f.ctx, f.user, quill.ID)
	if err != nil {
		t.Fatal(err)
	}
	if quillModel.Completeness.Status != "partial" ||
		quillModel.Completeness.Explanation != "No source connection has completed its first useful sync." {
		t.Fatalf("quill completeness = %+v", quillModel.Completeness)
	}
	lumenModel, err := f.svc.MissionControl(f.ctx, f.user, lumen.ID)
	if err != nil {
		t.Fatal(err)
	}
	if lumenModel.Completeness.Explanation != "One or more material values have no accessible supporting evidence." {
		t.Fatalf("lumen completeness = %+v", lumenModel.Completeness)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Connect a source before these details can fill in", "Quill Atelier")
	assertCompanyQuery("One or more material values have no accessible supporting evidence", "Lumen Packet")
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, quill.ID, RelationshipCorrectionInput{
		Dimension: "lifecycle", Value: "prospect", Reason: "The buyer is a prospect.",
	}); err != nil {
		t.Fatal(err)
	}
	assertCompanyQuery("Connect a source before these details can fill in")
	assertCompanyQuery("7 account details still need a source", "Quill Atelier")
	assertCompanyQuery("1 account detail still needs a source")
	assertCompanyQuery("Some details have no source you can open", "Lumen Packet")
	assertCompanyQuery("source")
	assertCompanyQuery("missing")
}

func TestRelationshipSearchFindsTheGmailClearerSource(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	one := makeCompany("Quill North")
	two := makeCompany("Birch Slide")
	filled := makeCompany("Cedar Mark")
	makeCompany("Lumen Quiet")
	saveThread := func(rel *ent.Relationship, id string) {
		t.Helper()
		if _, err := f.client.MailThread.Create().
			SetUser(f.user).SetProviderThreadID(id).
			SetSubject("Harbor note").SetMessageCount(1).
			SetRelationship(rel).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveThread(one, "quill-one")
	saveThread(two, "birch-one")
	saveThread(two, "birch-two")
	saveThread(filled, "cedar-one")
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, filled.ID, RelationshipCorrectionInput{
		Dimension: "health", Value: "needs_attention", Reason: "The last note needs a reply.",
	}); err != nil {
		t.Fatal(err)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	oneSentence := "1 Gmail thread is linked. Health and status still need a clearer source."
	twoSentence := "2 Gmail threads are linked. Health and status still need a clearer source."
	assertCompanyQuery(oneSentence, "Quill North")
	assertCompanyQuery(twoSentence, "Birch Slide")
	assertCompanyQuery("which companies have "+oneSentence, "Quill North")
	assertCompanyQuery("Health and status still need a clearer source.", "Quill North", "Birch Slide")
	assertCompanyQuery("clearer")
}

func TestRelationshipSearchFindsTheCompletenessHeading(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetProposedRelationship(lumen).
		SetExistingRelationship(harbor).
		SetDedupeKey("lumen-harbor").
		SetAnchorKind("domain").
		SetAnchorKeyHash("lumen-harbor-hash").
		SetStatus("pending").
		Save(auth.WithInternal(f.ctx)); err != nil {
		t.Fatal(err)
	}
	lumenModel, err := f.svc.MissionControl(f.ctx, f.user, lumen.ID)
	if err != nil {
		t.Fatal(err)
	}
	if lumenModel.Completeness.Status != "ambiguous" || lumenModel.Completeness.UnresolvedIdentityCount != 1 {
		t.Fatalf("lumen completeness = %+v", lumenModel.Completeness)
	}
	quillModel, err := f.svc.MissionControl(f.ctx, f.user, quill.ID)
	if err != nil {
		t.Fatal(err)
	}
	if quillModel.Completeness.Status != "partial" {
		t.Fatalf("quill completeness = %+v", quillModel.Completeness)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("No account details have a source yet", "Quill Atelier")
	assertCompanyQuery("Some details are still missing")
	assertCompanyQuery("Needs a review before you act", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Identity review is required before acting on this relationship", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("1 identity review blocks acting", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("1 possible duplicate must be reviewed before you act", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Keep separate", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Move the evidence", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Decide later", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Review possible duplicates", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Needs your review", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Details are current")
}

func TestRelationshipSearchFindsAnOpenDuplicateChoice(t *testing.T) {
	f := newFixture(t)
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create("Quill North")
	cedar := create("Cedar Slide")
	birch := create("Birch Quay")
	aspen := create("Aspen Ledger")
	lumen := create("Lumen Packet")
	save := func(proposed, existing *ent.Relationship, key, status string) {
		t.Helper()
		if _, err := f.client.RelationshipIdentityCandidate.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetProposedRelationship(proposed).
			SetExistingRelationship(existing).
			SetDedupeKey(key).
			SetAnchorKind("domain").
			SetAnchorKeyHash(key + "-hash").
			SetStatus(status).
			Save(auth.WithInternal(f.ctx)); err != nil {
			t.Fatal(err)
		}
	}
	save(cedar, birch, "cedar-birch", "pending")
	save(aspen, lumen, "aspen-lumen", "resolved")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	open := []string{"Cedar Slide", "Birch Quay"}
	inbox := []string{"Aspen Ledger", "Birch Quay", "Cedar Slide", "Lumen Packet"}
	assertCompanyQuery("Keep separate", open...)
	assertCompanyQuery("which companies should I keep separate", open...)
	assertCompanyQuery("Move the evidence", open...)
	assertCompanyQuery("Decide later", open...)
	assertCompanyQuery("Review possible duplicates", inbox...)
	assertCompanyQuery("Needs your review", inbox...)
	assertCompanyQuery("Needs a review before you act", open...)
	assertCompanyQuery("keep")
	assertCompanyQuery("separate")
	assertCompanyQuery("later")
}

func TestRelationshipSearchFindsTheRefreshHeading(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier", ResourceRefs: []string{"hubspot:company:quill"},
	})
	if err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet", ResourceRefs: []string{"slack:channel:lumen"},
	})
	if err != nil {
		t.Fatal(err)
	}
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill",
		ResourceRefs: []string{"google:company:cedar", "slack:channel:cedar"},
	})
	if err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	northwind, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Mesa Clay",
	}); err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("hubspot").SetSourceAccountID("default").
		SetStatus("stale").SetCompleteness("stale").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("slack").SetSourceAccountID("default").
		SetStatus("rebuilding").SetCompleteness("rebuilding").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("google").SetSourceAccountID("default").
		SetStatus("degraded").SetCompleteness("disconnected").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-time.Minute)
	if _, err := f.client.RelationshipProjectionJob.Create().
		SetWorkspace(ws).SetRelationship(harbor).SetUser(f.user).
		SetIdempotencyKey("harbor-waiting").SetStatus("pending").SetEvaluatedAt(past).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipProjectionJob.Create().
		SetWorkspace(ws).SetRelationship(northwind).SetUser(f.user).
		SetIdempotencyKey("northwind-repair").SetStatus("dead").SetEvaluatedAt(past).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertStatus := func(id uuid.UUID, status, explanation string) {
		t.Helper()
		model, err := f.svc.MissionControl(f.ctx, f.user, id)
		if err != nil {
			t.Fatal(err)
		}
		if model.Completeness.Status != status || model.Completeness.Explanation != explanation {
			t.Fatalf("completeness = %+v, want %s / %s", model.Completeness, status, explanation)
		}
	}
	assertStatus(quill.ID, "stale", "A required source is stale or disconnected.")
	assertStatus(lumen.ID, "rebuilding", "A required source is rebuilding; partial state is visible.")
	assertStatus(cedar.ID, "stale", "A required source is stale or disconnected.")
	assertStatus(harbor.ID, "rebuilding", "Accepted evidence is waiting for the durable relationship projector.")
	assertStatus(northwind.ID, "rebuilding", "Relationship projection requires operator repair before this state is safe to act on.")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Details need a refresh", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("A required source is stale or disconnected", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("Updating from connected sources", "Lumen Packet", "Harbor Ledger", "Northwind")
	assertCompanyQuery("A required source is rebuilding; partial state is visible", "Lumen Packet")
	assertCompanyQuery("Accepted evidence is waiting for the durable relationship projector", "Harbor Ledger")
	assertCompanyQuery("Relationship projection requires operator repair before this state is safe to act on", "Northwind")
	assertCompanyQuery("No account details have a source yet", "Mesa Clay")
	assertCompanyQuery("Some details are still missing")
	assertCompanyQuery("refresh")
}

func TestRelationshipSearchFindsTheMissingNextStep(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(quill.ID).SetLifecycle("contracting").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(lumen.ID).SetLifecycle("prospect").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(harbor.ID).
		SetLifecycle("contracting").
		SetNextAction("Send the packet").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(cedar.ID).
		SetLifecycle("evaluation").
		SetNextAction("   ").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	quill, err = f.svc.GetRelationship(f.ctx, quill.ID)
	if err != nil {
		t.Fatal(err)
	}
	intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, quill)
	if err != nil {
		t.Fatal(err)
	}
	foundCue := false
	for _, cue := range intelligence.LiveCues {
		if cue.Kind == "missing_next_step" && cue.Title == "No next step" {
			foundCue = true
		}
	}
	if !foundCue {
		t.Fatalf("quill cues = %+v", intelligence.LiveCues)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	mesa, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Mesa Clay", ResourceRefs: []string{"hubspot:company:mesa"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(mesa.ID).SetLifecycle("contracting").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("hubspot").SetSourceAccountID("default").
		SetStatus("stale").SetCompleteness("stale").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery("No next step", "Quill Atelier", "Cedar Mill", "Mesa Clay")
	assertCompanyQuery("Add an owner and a date for what happens next", "Quill Atelier", "Cedar Mill", "Mesa Clay")
	assertCompanyQuery("This company is in Contracting and has no next step", "Quill Atelier")
	assertCompanyQuery("This company is in Evaluation and has no next step", "Cedar Mill")
	assertCompanyQuery("has no next step", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("owner")
	assertCompanyQuery("step")
}

func TestRelationshipSearchFindsTheSourceWarning(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier", ResourceRefs: []string{"hubspot:company:quill"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill", ResourceRefs: []string{"slack:channel:cedar"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
		ResourceRefs: []string{"google:company:lumen", "slack:channel:lumen"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	}); err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	for _, status := range []struct{ source, state, completeness string }{
		{"hubspot", "stale", "stale"},
		{"slack", "rebuilding", "rebuilding"},
		{"google", "degraded", "disconnected"},
	} {
		if _, err := f.client.RelationshipSourceStatus.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetSource(status.source).SetSourceAccountID("default").
			SetStatus(status.state).SetCompleteness(status.completeness).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	page, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", 100, 0)
	if err != nil || page == nil {
		t.Fatal(err)
	}
	gotExplanation := map[string]string{}
	for _, item := range page.Items {
		if item.ReasonCode != "source_degradation" || item.Edges.Relationship == nil {
			continue
		}
		gotExplanation[item.Edges.Relationship.DisplayName] = item.Explanation
	}
	wantExplanation := map[string]string{
		"Quill Atelier": "HubSpot evidence is incomplete, stale, rebuilding, or missing a required permission.",
		"Cedar Mill":    "Slack evidence is incomplete, stale, rebuilding, or missing a required permission.",
		"Lumen Packet":  "Google and Slack evidence is incomplete, stale, rebuilding, or missing a required permission.",
	}
	for name, explanation := range wantExplanation {
		if gotExplanation[name] != explanation {
			t.Fatalf("%s explanation = %q, want %q", name, gotExplanation[name], explanation)
		}
	}
	if _, ok := gotExplanation["Harbor Ledger"]; ok {
		t.Fatalf("harbor explanation = %q", gotExplanation["Harbor Ledger"])
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	hubspot := "HubSpot evidence is incomplete, stale, rebuilding, or missing a required permission."
	slack := "Slack evidence is incomplete, stale, rebuilding, or missing a required permission."
	combined := "Google and Slack evidence is incomplete, stale, rebuilding, or missing a required permission."
	assertCompanyQuery("Source needs reconnecting", "Quill Atelier", "Cedar Mill", "Lumen Packet")
	assertCompanyQuery(hubspot, "Quill Atelier")
	assertCompanyQuery(slack, "Cedar Mill")
	assertCompanyQuery(combined, "Lumen Packet")
	assertCompanyQuery("Google evidence is incomplete, stale, rebuilding, or missing a required permission.")
	assertCompanyQuery("HubSpot and Slack evidence is incomplete, stale, rebuilding, or missing a required permission.")
	assertCompanyQuery("reconnecting", "Quill Atelier", "Cedar Mill", "Lumen Packet")
}

func TestRelationshipSearchFindsTheQuietAccount(t *testing.T) {
	f := newFixture(t)
	now := time.Now().UTC()
	quietAt := now.Add(-40 * 24 * time.Hour)
	recentAt := now.Add(-5 * 24 * time.Hour)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(quill.ID).
		SetLifecycle("prospect").SetLastTouchAt(quietAt).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(lumen.ID).
		SetLifecycle("active_customer").SetLastTouchAt(quietAt).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(harbor.ID).
		SetLifecycle("prospect").SetLastTouchAt(recentAt).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill", ResourceRefs: []string{"hubspot:company:cedar"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(cedar.ID).
		SetLifecycle("prospect").SetLastTouchAt(quietAt).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	mesa, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Mesa Clay",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(mesa.ID).
		SetLifecycle("prospect").SetLastTouchAt(quietAt).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipSourceStatus.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetSource("hubspot").SetSourceAccountID("default").
		SetStatus("stale").SetCompleteness("stale").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	departed, err := f.client.Person.Create().
		SetDisplayName("Ada Mesa").
		SetEmploymentStatus("departed").
		SetWorkspace(ws).
		SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetRelationship(mesa).SetPerson(departed).
		SetDisplayName("Ada Mesa").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	page, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", 100, 0)
	if err != nil || page == nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, item := range page.Items {
		if item.Edges.Relationship == nil {
			continue
		}
		if item.ReasonCode == "quiet_account" || item.ReasonCode == "contact_departed" {
			got[item.Edges.Relationship.DisplayName] = item.Explanation
		}
	}
	days := int(time.Since(quietAt).Hours() / 24)
	prospectSentence := quietAccountExplanation("prospect", days, 30)
	customerSentence := quietAccountExplanation("active_customer", days, 21)
	if got["Quill Atelier"] != prospectSentence {
		t.Fatalf("quill explanation = %q, want %q", got["Quill Atelier"], prospectSentence)
	}
	if got["Lumen Packet"] != customerSentence {
		t.Fatalf("lumen explanation = %q, want %q", got["Lumen Packet"], customerSentence)
	}
	if _, ok := got["Harbor Ledger"]; ok {
		t.Fatalf("harbor explanation = %q", got["Harbor Ledger"])
	}
	if _, ok := got["Cedar Mill"]; ok {
		t.Fatalf("cedar explanation = %q", got["Cedar Mill"])
	}
	if !strings.Contains(got["Mesa Clay"], "Ada Mesa has left") {
		t.Fatalf("mesa explanation = %q", got["Mesa Clay"])
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery(prospectSentence, "Quill Atelier")
	assertCompanyQuery(customerSentence, "Lumen Packet")
	assertCompanyQuery("Quiet account", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("No recorded interaction", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("Prospects are usually contacted again within 30 days", "Quill Atelier")
	assertCompanyQuery("mail to that address is no longer delivered", "Mesa Clay")
	assertCompanyQuery("because there is nobody here to reply", "Mesa Clay")
}

func TestRelationshipSearchFindsTheUnresolvedRisk(t *testing.T) {
	f := newFixture(t)
	quill, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(quill.ID).
		SetHealth("critical").SetRisks([]string{"renewal slip"}).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(lumen.ID).
		SetHealth("needs_attention").SetRisks([]string{"renewal slip", "late invoice"}).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(harbor.ID).
		SetHealth("critical").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(cedar.ID).
		SetHealth("healthy").SetRisks([]string{"renewal slip"}).Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	page, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", 100, 0)
	if err != nil || page == nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, item := range page.Items {
		if item.ReasonCode != "unresolved_risk" || item.Edges.Relationship == nil {
			continue
		}
		got[item.Edges.Relationship.DisplayName] = item.Explanation
	}
	if got["Quill Atelier"] != "1 unresolved risk. This company is critical." {
		t.Fatalf("quill explanation = %q", got["Quill Atelier"])
	}
	if got["Lumen Packet"] != "2 unresolved risks. This company needs attention." {
		t.Fatalf("lumen explanation = %q", got["Lumen Packet"])
	}
	if _, ok := got["Harbor Ledger"]; ok || got["Cedar Mill"] != "" {
		t.Fatalf("explanations = %v", got)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("1 unresolved risk. This company is critical.", "Quill Atelier")
	assertCompanyQuery("2 unresolved risks. This company needs attention.", "Lumen Packet")
	assertCompanyQuery("Unresolved risk", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("unresolved risks", "Lumen Packet")
	assertCompanyQuery("This company is critical.", "Quill Atelier")
}

func TestRelationshipSearchFindsTheActionOutcome(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	makeAction := func(rel *ent.Relationship, channel, reason string) *ent.RevenueAction {
		t.Helper()
		action, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
			RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: channel, Detector: DetectorManual,
			Reason: reason, PriorityScore: 40,
		})
		if err != nil {
			t.Fatal(err)
		}
		return action
	}
	quill := makeCompany("Quill Atelier")
	lumen := makeCompany("Lumen Packet")
	harbor := makeCompany("Harbor Ledger")
	cedar := makeCompany("Cedar Mill")
	failed := makeAction(quill, "email", "Send the failed note.")
	failed.Update().SetExecutionStatus(ExecFailed).SaveX(f.ctx)
	ambiguous := makeAction(lumen, "slack", "Send the slack note.")
	ambiguous.Update().SetExecutionStatus(ExecAmbiguous).SaveX(f.ctx)
	manual := makeAction(cedar, "call", "Call them back.")
	manual.Update().SetReconciliationStatus("manual_review").SaveX(f.ctx)
	makeAction(harbor, "email", "Send the ordinary note.")

	page, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", 100, 0)
	if err != nil || page == nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, item := range page.Items {
		if item.ReasonCode != "action_outcome_review" || item.Edges.Relationship == nil {
			continue
		}
		got[item.Edges.Relationship.DisplayName] = item.Explanation
	}
	if got["Quill Atelier"] != "The email action failed. Review it before trying again." {
		t.Fatalf("quill explanation = %q", got["Quill Atelier"])
	}
	if got["Lumen Packet"] != "The slack action may have gone through. Review it before trying again." {
		t.Fatalf("lumen explanation = %q", got["Lumen Packet"])
	}
	if got["Cedar Mill"] != "The call action needs a manual review before it can be tried again." {
		t.Fatalf("cedar explanation = %q", got["Cedar Mill"])
	}
	if _, ok := got["Harbor Ledger"]; ok {
		t.Fatalf("harbor explanation = %q", got["Harbor Ledger"])
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("The email action failed. Review it before trying again.", "Quill Atelier")
	assertCompanyQuery("The slack action may have gone through. Review it before trying again.", "Lumen Packet")
	assertCompanyQuery("The call action needs a manual review before it can be tried again.", "Cedar Mill")
	assertCompanyQuery("Action needs review", "Quill Atelier", "Lumen Packet", "Cedar Mill")
	assertCompanyQuery("action failed", "Quill Atelier")
	assertCompanyQuery("may have gone through", "Lumen Packet")
}

func TestRelationshipSearchFindsDetectorLabels(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	recommend := func(rel *ent.Relationship, detector, dedupe string) {
		t.Helper()
		if _, err := f.client.RevenueAction.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetActionType("follow_up_task").SetChannel("task").
			SetDetector(detector).SetDedupeKey(dedupe).
			SetRevisionHash(dedupe).SetReason("Send the harbor note").
			SetPriorityScore(40).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Detect Quiet")
	follow := makeCompany("Detect Follow")
	proposal := makeCompany("Detect Offer")
	waiting := makeCompany("Detect Hold")
	dormant := makeCompany("Detect Dormant")
	referral := makeCompany("Detect Referral")
	alumni := makeCompany("Detect Alumni")
	pack := makeCompany("Detect Pack")
	clock := makeCompany("Detect Clock")
	manual := makeCompany("Detect Manual")
	_ = quiet
	recommend(follow, "requested_follow_up_due", "detect-follow")
	recommend(proposal, "unanswered_proposal", "detect-proposal")
	recommend(waiting, "waiting_on_me", "detect-waiting")
	if _, err := f.client.RevenueAction.Update().
		Where(revenueaction.DedupeKeyEQ("detect-waiting")).
		SetQueueStatus("dismissed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	recommend(dormant, "dormant_warm_opportunity", "detect-dormant")
	recommend(referral, "neglected_referral", "detect-referral")
	recommend(alumni, "former_customer_reconnect", "detect-alumni")
	recommend(pack, "conversation_action_pack", "detect-pack")
	recommend(clock, "commitment_due", "detect-clock")
	recommend(manual, "manual", "detect-manual")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Follow-up due", "Detect Follow")
	assertCompanyQuery("which companies have an unanswered proposal", "Detect Offer")
	assertCompanyQuery("Waiting on you", "Detect Hold")
	assertCompanyQuery("Dormant opportunity", "Detect Dormant")
	assertCompanyQuery("Neglected referral", "Detect Referral")
	assertCompanyQuery("Former customer", "Detect Alumni")
	assertCompanyQuery("Conversation action pack", "Detect Pack")
	assertCompanyQuery("Promise due", "Detect Clock")
	assertCompanyQuery("Added by you", "Detect Manual")
	assertCompanyQuery("proposal")
	assertCompanyQuery("waiting")
	assertCompanyQuery("due")
}

func TestRelationshipSearchFindsTheOverduePromise(t *testing.T) {
	f := newFixture(t)
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	quill := makeCompany("Quill Atelier")
	harbor := makeCompany("Harbor Ledger")
	lumen := makeCompany("Lumen Packet")
	due := now.Add(-72 * time.Hour)
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(quill).SetUser(f.user).
		SetDirection("promised_by_me").SetText("Send the revised packet").
		SetStatus("open").SetDueAt(due).SetConfidence(1).SetUserConfirmed(true).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(harbor).SetUser(f.user).
		SetDirection("promised_by_me").SetText("Send the draft").
		SetStatus("open").SetDueAt(due).SetConfidence(1).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(lumen).SetUser(f.user).
		SetDirection("promised_by_me").SetText("Send the future note").
		SetStatus("open").SetDueAt(now.Add(48 * time.Hour)).SetConfidence(1).SetUserConfirmed(true).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	page, err := f.svc.ListRelationshipAttention(f.ctx, f.user, "open", 100, 0)
	if err != nil || page == nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, item := range page.Items {
		if item.ReasonCode != "overdue_commitment" || item.Edges.Relationship == nil {
			continue
		}
		got[item.Edges.Relationship.DisplayName] = item.Explanation
	}
	days := max(1, int(time.Since(due).Hours()/24))
	sentence := overdueCommitmentExplanation(days)
	if got["Quill Atelier"] != sentence {
		t.Fatalf("quill explanation = %q, want %q", got["Quill Atelier"], sentence)
	}
	if _, ok := got["Harbor Ledger"]; ok {
		t.Fatalf("harbor explanation = %q", got["Harbor Ledger"])
	}
	if _, ok := got["Lumen Packet"]; ok {
		t.Fatalf("lumen explanation = %q", got["Lumen Packet"])
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: sentence})
	if err != nil {
		t.Fatal(err)
	}
	if names := namesOf(found.Relationships); len(names) != 1 || names[0] != "Quill Atelier" {
		t.Fatalf("sentence = %v", names)
	}
	label, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Overdue promise"})
	if err != nil {
		t.Fatal(err)
	}
	if names := namesOf(label.Relationships); len(names) != 1 || names[0] != "Quill Atelier" {
		t.Fatalf("label = %v", names)
	}
	legacy, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "A confirmed commitment is overdue"})
	if err != nil {
		t.Fatal(err)
	}
	if names := namesOf(legacy.Relationships); len(names) != 1 || names[0] != "Quill Atelier" {
		t.Fatalf("legacy sentence = %v", names)
	}
}

func TestRelationshipSearchFindsNeedsRefresh(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	rank, ok := relationshipAssertionAuthorityRank("source_fact")
	if !ok {
		t.Fatal("source_fact rank")
	}
	seed := func(name, source, account string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		row, err = f.svc.GetRelationship(f.ctx, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		obs, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(row).
			SetSource(source).SetSourceAccountID(account).
			SetExternalID(name).SetEventType("note").
			SetOccurredAt(row.CreatedAt).SetReceivedAt(row.CreatedAt).
			SetContentHash(name).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.RelationshipAssertion.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(row).SetObservation(obs).
			SetDimension("lifecycle").SetValue("prospect").
			SetSourceType("source_fact").SetAuthorityRank(rank).
			SetValidFrom(row.CreatedAt).
			SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
			SetProjectorCompatVersion(relationshipProjectorVersion).
			SetSupportingObservationIds([]string{}).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
		return row
	}
	quill := seed("Quill Atelier", "hubspot", "quill-account")
	lumen := seed("Lumen Packet", "hubspot", "lumen-account")
	cedar := seed("Cedar Mill", "hubspot", "cedar-account")
	harbor := seed("Harbor Ledger", "desktop_note", "default")
	for _, status := range []struct{ account, completeness string }{
		{"quill-account", "stale"},
		{"lumen-account", "complete"},
	} {
		if _, err := f.client.RelationshipSourceStatus.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetSource("hubspot").SetSourceAccountID(status.account).
			SetStatus("live").SetCompleteness(status.completeness).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	assertFresh := func(row *ent.Relationship, fresh bool) {
		t.Helper()
		model, err := f.svc.MissionControl(f.ctx, f.user, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		item := model.Evidence["lifecycle"]
		if item.Fresh != fresh {
			t.Fatalf("%s fresh = %v, supported = %v, reason = %q", row.DisplayName, item.Fresh, item.Supported, item.MissingReason)
		}
	}
	assertFresh(quill, false)
	assertFresh(lumen, true)
	assertFresh(cedar, false)
	assertFresh(harbor, true)
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Needs refresh"})
	if err != nil {
		t.Fatal(err)
	}
	got := namesOf(found.Relationships)
	if len(got) != 2 || !hasName(got, "Quill Atelier") || !hasName(got, "Cedar Mill") {
		t.Fatalf("needs refresh = %v", got)
	}
	plain, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "refresh"})
	if err != nil {
		t.Fatal(err)
	}
	if names := namesOf(plain.Relationships); len(names) != 0 {
		t.Fatalf("refresh = %v", names)
	}
}

func TestRelationshipSearchFindsTheDetailSource(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, lumen.ID, RelationshipCorrectionInput{
		Dimension: "health", Value: "healthy", Reason: "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	harbor, err = f.svc.GetRelationship(f.ctx, harbor.ID)
	if err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	rank, ok := relationshipAssertionAuthorityRank("source_fact")
	if !ok {
		t.Fatal("source_fact rank")
	}
	if _, err := f.client.RelationshipAssertion.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(harbor).
		SetDimension("lifecycle").SetValue("prospect").
		SetSourceType("source_fact").SetAuthorityRank(rank).
		SetValidFrom(harbor.CreatedAt).
		SetValueSchemaVersion(relationshipAssertionValueSchemaVersion).
		SetProjectorCompatVersion(relationshipProjectorVersion).
		SetSupportingObservationIds([]string{}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	lumenModel, err := f.svc.MissionControl(f.ctx, f.user, lumen.ID)
	if err != nil {
		t.Fatal(err)
	}
	if health := lumenModel.Evidence["health"]; !health.Supported || health.Authority != "user_correction" {
		t.Fatalf("lumen health = %+v", health)
	}
	harborModel, err := f.svc.MissionControl(f.ctx, f.user, harbor.ID)
	if err != nil {
		t.Fatal(err)
	}
	if lifecycle := harborModel.Evidence["lifecycle"]; lifecycle.Supported ||
		lifecycle.MissingReason != "The winning assertion has no accessible source evidence reference." {
		t.Fatalf("harbor lifecycle = %+v", lifecycle)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Confirmed by a person", "Lumen Packet")
	assertCompanyQuery("Retract correction", "Lumen Packet")
	assertCompanyQuery("This detail has no source you can open", "Harbor Ledger")
	assertCompanyQuery("Nothing connected has filled this in", "Quill Atelier", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Not filled in yet", "Quill Atelier", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("From a connected source")
	assertCompanyQuery("person")
}

func TestRelationshipSearchFindsRetractCorrection(t *testing.T) {
	f := newFixture(t)
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	correct := func(row *ent.Relationship) string {
		t.Helper()
		if _, err := f.svc.CorrectRelationship(f.ctx, f.user, row.ID, RelationshipCorrectionInput{
			Dimension: "health", Value: "healthy", Reason: "The account is healthy.",
		}); err != nil {
			t.Fatal(err)
		}
		model, err := f.svc.MissionControl(f.ctx, f.user, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		health := model.Evidence["health"]
		if !health.Supported || health.Authority != "user_correction" || health.AssertionID == "" {
			t.Fatalf("%s health = %+v", row.DisplayName, health)
		}
		return health.AssertionID
	}
	create("Quill North")
	cedar := create("Cedar Slide")
	correct(cedar)
	aspen := create("Aspen Ledger")
	assertionID, err := uuid.Parse(correct(aspen))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.RetractRelationshipAssertion(f.ctx, f.user, aspen.ID, assertionID, "The health note was wrong."); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Retract correction", "Cedar Slide")
	assertCompanyQuery("which companies can I retract correction", "Cedar Slide")
	assertCompanyQuery("Confirmed by a person", "Cedar Slide")
	assertCompanyQuery("retract")
	assertCompanyQuery("correction")
}

func TestRelationshipSearchFindsTheSheetReviewAndRecommendation(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: lumen.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Send the harbor packet",
		PriorityScore:  80,
	}); err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(harbor.ID).
		SetStateVersion(1).
		SetStateHash("harbor-reviewed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, harbor.ID, 1, "harbor-reviewed"); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("No action is currently recommended", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("Send the harbor packet", "Lumen Packet")
	assertCompanyQuery("Not reviewed yet", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("Nothing changed since your last review", "Harbor Ledger")
	assertCompanyQuery("Nothing new since your last review", "Harbor Ledger")
	assertCompanyQuery("recomm")
	assertCompanyQuery("changed")
	assertCompanyQuery("reviewed", "Quill Atelier", "Lumen Packet")
}

func TestRelationshipSearchFindsSupportingEvidenceChanged(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	quill := makeCompany("Quill North")
	cedar := makeCompany("Cedar Mark")
	birch := makeCompany("Birch Slide")
	aspen := makeCompany("Aspen Quay")
	mixed := makeCompany("Lumen Packet")
	quiet := makeCompany("Nook Quiet")
	plural := makeCompany("Plover Dock")

	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	setVersion := func(rel *ent.Relationship, version int, hash string) {
		t.Helper()
		if _, err := f.client.Relationship.UpdateOneID(rel.ID).
			SetStateVersion(version).
			SetStateHash(hash).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	snap := func(rel *ent.Relationship, version int, hash string, dims []string) {
		t.Helper()
		if _, err := f.client.RelationshipStateSnapshot.Create().
			SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
			SetVersion(version).SetStateJSON(`{}`).SetStateHash(hash).
			SetEvaluatedAt(at).SetChangedDimensions(dims).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}

	setVersion(quill, 1, "quill-evidence")
	snap(quill, 1, "quill-evidence", []string{"evidence"})
	setVersion(cedar, 1, "cedar-health")
	snap(cedar, 1, "cedar-health", []string{"health"})
	setVersion(birch, 1, "birch-evidence")
	snap(birch, 1, "birch-evidence", []string{"evidence"})
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, birch.ID, 1, "birch-evidence"); err != nil {
		t.Fatal(err)
	}
	setVersion(aspen, 1, "aspen-health")
	snap(aspen, 1, "aspen-health", []string{"health"})
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, aspen.ID, 1, "aspen-health"); err != nil {
		t.Fatal(err)
	}
	setVersion(aspen, 2, "aspen-evidence")
	snap(aspen, 2, "aspen-evidence", []string{"evidence"})
	setVersion(mixed, 1, "lumen-mixed")
	snap(mixed, 1, "lumen-mixed", []string{"health", "evidence"})
	snap(quiet, 1, "nook-evidence", []string{"evidence"})
	setVersion(plural, 1, "plover-evidence")
	snap(plural, 1, "plover-evidence", []string{"evidences"})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Supporting evidence changed.", "Quill North", "Aspen Quay", "Plover Dock")
	assertCompanyQuery("which companies have supporting evidence changed", "Quill North", "Aspen Quay", "Plover Dock")
	assertCompanyQuery("supporting")
	assertCompanyQuery("evidence")
	assertCompanyQuery("changed")
	assertCompanyQuery("Nothing changed since your last review.", "Birch Slide")
}

func TestRelationshipSearchFindsMarkAsReviewed(t *testing.T) {
	f := newFixture(t)
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	setVersion := func(row *ent.Relationship, version int, hash string) {
		t.Helper()
		if _, err := f.client.Relationship.UpdateOneID(row.ID).
			SetStateVersion(version).
			SetStateHash(hash).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	create("Quill North")
	create("Lumen Packet")
	cedar := create("Cedar Slide")
	setVersion(cedar, 1, "cedar-slide")
	birch := create("Birch Quay")
	setVersion(birch, 1, "birch-quay")
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, birch.ID, 1, "birch-quay"); err != nil {
		t.Fatal(err)
	}
	aspen := create("Aspen Ledger")
	setVersion(aspen, 1, "aspen-ledger")
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, aspen.ID, 1, "aspen-ledger"); err != nil {
		t.Fatal(err)
	}
	setVersion(aspen, 2, "aspen-ledger-next")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Mark as reviewed", "Cedar Slide", "Aspen Ledger")
	assertCompanyQuery("which companies should I mark as reviewed", "Cedar Slide", "Aspen Ledger")
	assertCompanyQuery("Not reviewed yet", "Quill North", "Lumen Packet")
	assertCompanyQuery("Nothing changed since your last review", "Birch Quay")
	assertCompanyQuery("reviewed", "Quill North", "Lumen Packet")
	assertCompanyQuery("mark")
	assertCompanyQuery("as reviewed")
}

func TestRelationshipSearchFindsEarlierChanges(t *testing.T) {
	f := newFixture(t)
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	correct := func(row *ent.Relationship, value string) {
		t.Helper()
		if _, err := f.svc.CorrectRelationship(f.ctx, f.user, row.ID, RelationshipCorrectionInput{
			Dimension: "health", Value: value, Reason: "The account health moved.",
		}); err != nil {
			t.Fatal(err)
		}
	}
	create("Quill North")
	cedar := create("Cedar Slide")
	correct(cedar, "healthy")
	birch := create("Birch Quay")
	correct(birch, "healthy")
	correct(birch, "needs_attention")
	aspen := create("Aspen Ledger")
	correct(aspen, "healthy")
	correct(aspen, "needs_attention")
	correct(aspen, "critical")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Show earlier changes", "Aspen Ledger")
	assertCompanyQuery("which companies should I show earlier changes", "Aspen Ledger")
	assertCompanyQuery("No account details have changed yet", "Quill North")
	assertCompanyQuery("earlier")
	assertCompanyQuery("show")
}

func TestRelationshipSearchFindsEarlierActivity(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	record := func(row *ent.Relationship, count int) {
		t.Helper()
		now := time.Now().UTC()
		for i := 0; i < count; i++ {
			id := fmt.Sprintf("%s-%02d", row.DisplayName, i)
			if _, err := f.client.RelationshipObservation.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(row).
				SetSource("user").SetExternalID(id).SetEventType("relationship.observed").
				SetOccurredAt(now.Add(-time.Duration(i) * time.Minute)).SetReceivedAt(now).
				SetSummary("A recorded note").SetContentHash(id).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	create("Quill North")
	cedar := create("Cedar Slide")
	record(cedar, 50)
	aspen := create("Aspen Ledger")
	record(aspen, 51)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Show earlier activity", "Aspen Ledger")
	assertCompanyQuery("which companies should I show earlier activity", "Aspen Ledger")
	assertCompanyQuery("Nothing recorded yet", "Quill North")
	assertCompanyQuery("earlier")
	assertCompanyQuery("show")
}

func TestRelationshipSearchFindsEarlierMail(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	none := makeCompany("Quill North")
	page := makeCompany("Cedar Slide")
	hidden := makeCompany("Birch Quiet")
	more := makeCompany("Aspen Ledger")
	_ = none

	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	internal := auth.WithInternal(context.Background())
	writeMail := func(rel *ent.Relationship, objectID string, removed bool) {
		t.Helper()
		if _, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
			SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID(objectID).
			SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
			SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
			SetContentHash("sha256:" + objectID).SetMetadataJSON(`{}`).SetDeleted(removed).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= 50; i++ {
		writeMail(page, fmt.Sprintf("cedar-%d", i), false)
		writeMail(hidden, fmt.Sprintf("birch-%d", i), false)
	}
	writeMail(hidden, "birch-deleted", true)
	for i := 1; i <= 51; i++ {
		writeMail(more, fmt.Sprintf("aspen-%d", i), false)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Show earlier mail and meetings", "Aspen Ledger")
	assertCompanyQuery("which companies should I show earlier mail and meetings", "Aspen Ledger")
	assertCompanyQuery("No Gmail or calendar events yet.", "Quill North")
	assertCompanyQuery("show")
	assertCompanyQuery("earlier")
	assertCompanyQuery("mail")
	assertCompanyQuery("meetings")
}

func TestRelationshipSearchFindsTheNextDuplicates(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	save := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.client.Relationship.Create().
			SetWorkspace(ws).SetUser(f.user).SetKind("company").SetDisplayName(name).
			SetResourceRefs([]string{}).SetRisks([]string{}).SetMilestones([]string{}).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	none := save("Quill North")
	page := save("Cedar Slide")
	hidden := save("Birch Quiet")
	split := save("Lumen Fold")
	resolved := save("Maple Kept")
	more := save("Aspen Ledger")
	_ = none
	link := func(existing *ent.Relationship, status, prefix string, n int) {
		t.Helper()
		for i := 1; i <= n; i++ {
			proposed := save(fmt.Sprintf("%s %d", prefix, i))
			if _, err := f.client.RelationshipIdentityCandidate.Create().
				SetWorkspace(ws).SetUser(f.user).
				SetProposedRelationship(proposed).SetExistingRelationship(existing).
				SetDedupeKey(fmt.Sprintf("%s-%d", prefix, i)).
				SetAnchorKind("domain").SetAnchorKeyHash(fmt.Sprintf("%s-hash-%d", prefix, i)).
				SetStatus(status).
				Save(internal); err != nil {
				t.Fatal(err)
			}
		}
	}
	link(page, "pending", "cedar-mate", 50)
	link(hidden, "resolving", "birch-mate", 51)
	link(split, "pending", "lumen-mate", 50)
	link(split, "deferred", "lumen-later", 1)
	link(resolved, "resolved", "maple-mate", 51)
	link(more, "pending", "aspen-mate", 51)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Show the next duplicates", "Aspen Ledger", "Maple Kept")
	assertCompanyQuery("which companies should I show the next duplicates", "Aspen Ledger", "Maple Kept")
	assertCompanyQuery("show")
	assertCompanyQuery("next")
	assertCompanyQuery("duplicates")
}

func TestRelationshipSearchFindsEarlierEvidence(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	save := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	none := save("Quill North")
	page := save("Cedar Slide")
	more := save("Aspen Ledger")
	_ = none
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	write := func(rel *ent.Relationship, prefix string, n int) {
		t.Helper()
		for i := 1; i <= n; i++ {
			externalID := fmt.Sprintf("%s-%d", prefix, i)
			if _, err := f.client.RelationshipObservation.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
				SetSource("user").SetExternalID(externalID).
				SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
				SetSummary("A recorded note").SetContentHash(externalID).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	write(page, "cedar", intelligenceObservationPage)
	write(more, "aspen", intelligenceObservationPage+1)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Show earlier evidence", "Aspen Ledger")
	assertCompanyQuery("which companies should I show earlier evidence", "Aspen Ledger")
	assertCompanyQuery("Nothing recorded yet.", "Quill North")
	assertCompanyQuery("show")
	assertCompanyQuery("earlier")
}

func TestRelationshipSearchFindsChangedSinceYouLastLooked(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill North",
	}); err != nil {
		t.Fatal(err)
	}
	moved, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Slide",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, moved.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "healthy",
		Reason:    "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}
	reviewed, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Aspen Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, reviewed.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "healthy",
		Reason:    "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}
	reviewed, err = f.svc.GetRelationship(f.ctx, reviewed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, reviewed.ID, reviewed.StateVersion, reviewed.StateHash); err != nil {
		t.Fatal(err)
	}
	again, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Birch Quiet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, again.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "healthy",
		Reason:    "The account is healthy.",
	}); err != nil {
		t.Fatal(err)
	}
	again, err = f.svc.GetRelationship(f.ctx, again.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.AcknowledgeMissionControl(f.ctx, f.user, again.ID, again.StateVersion, again.StateHash); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, again.ID, RelationshipCorrectionInput{
		Dimension: "health",
		Value:     "needs_attention",
		Reason:    "The account needs attention.",
	}); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Changed since you last looked", "Cedar Slide", "Birch Quiet")
	assertCompanyQuery("which companies changed since you last looked", "Cedar Slide", "Birch Quiet")
	assertCompanyQuery("Changed since you last looked: Health.", "Cedar Slide", "Birch Quiet")
	assertCompanyQuery("Not reviewed yet.", "Quill North")
	assertCompanyQuery("Nothing changed since your last review.", "Aspen Ledger")
	assertCompanyQuery("looked")
	assertCompanyQuery("since")
}

func TestRelationshipSearchFindsNoVisibleConnections(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	none := makeCompany("Quill North")
	noted := makeCompany("Cedar Slide")
	promised := makeCompany("Aspen Ledger")
	acted := makeCompany("Birch Quiet")
	risky := makeCompany("Maple Kept")
	mailed := makeCompany("Lumen Fold")
	peopled := makeCompany("Harbor Person")
	_ = none

	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(noted).
		SetSource("user").SetExternalID("cedar-note").
		SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A recorded note").SetContentHash("cedar-note").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(promised).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the packet").
		SetStatus("open").SetConfidence(1).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: acted.ID,
		ActionType:     "warm_follow_up",
		Channel:        "email",
		Reason:         "Send the harbor packet",
		PriorityScore:  80,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(risky.ID).
		SetRisks([]string{"A delivery risk"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(mailed.ID).
		SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID("lumen-mail").
		SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
		SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
		SetContentHash("sha256:lumen-mail").SetMetadataJSON(`{}`).
		Save(auth.WithInternal(context.Background())); err != nil {
		t.Fatal(err)
	}
	person, err := f.client.Person.Create().
		SetDisplayName("Casey Quinn").SetTitle("Buyer").
		SetWorkspace(ws).SetUser(f.user).
		Save(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).SetUser(f.user).
		SetRelationship(peopled).SetPerson(person).
		SetDisplayName("Casey Quinn").SetRole("decision_maker").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("No visible connections.", "Quill North", "Lumen Fold")
	assertCompanyQuery("which companies have no visible connections", "Quill North", "Lumen Fold")
	assertCompanyQuery("visible")
	assertCompanyQuery("connections")
}

func TestRelationshipSearchFindsTheLastInteraction(t *testing.T) {
	f := newFixture(t)
	recent, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(recent.ID).
		SetLastTouchAt(time.Now().Add(-3*24*time.Hour - time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	older, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(older.ID).
		SetLastTouchAt(time.Now().Add(-10 * 24 * time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "3 days ago"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(found.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("3 days ago = %v", got)
	}
}

func TestRelationshipSearchFindsAFutureLastInteraction(t *testing.T) {
	f := newFixture(t)
	ahead, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(ahead.ID).
		SetLastTouchAt(time.Now().Add(3*24*time.Hour + time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	behind, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(behind.ID).
		SetLastTouchAt(time.Now().Add(-10 * 24 * time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "3 days from now"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(found.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("3 days from now = %v", got)
	}
	past, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "3 days ago"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(past.Relationships); len(got) != 0 {
		t.Fatalf("3 days ago = %v", got)
	}
}

func TestRelationshipSearchFindsACalendarLastInteraction(t *testing.T) {
	f := newFixture(t)
	datedAt := time.Now().Add(-45 * 24 * time.Hour)
	label := datedAt.Format("Jan 2, 2006")
	dated, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(dated.ID).
		SetLastTouchAt(datedAt).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	recent, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	recentAt := time.Now().Add(-10 * 24 * time.Hour)
	if _, err := f.client.Relationship.UpdateOneID(recent.ID).
		SetLastTouchAt(recentAt).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: label})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(found.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("%s = %v", label, got)
	}
	inside, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{
		Query: recentAt.Format("Jan 2, 2006"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(inside.Relationships); len(got) != 0 {
		t.Fatalf("recent calendar day = %v", got)
	}
}

func TestRelationshipSearchFindsTheQuietCompany(t *testing.T) {
	f := newFixture(t)
	quiet, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(quiet.ID).
		SetSummary("   ").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	active, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(active.ID).
		SetSummary("Ledger notes").
		SetLastTouchAt(time.Now().Add(-3*24*time.Hour - time.Hour)).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	noActivity, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "No activity"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(noActivity.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("no activity = %v", got)
	}
	noDescription, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "No description yet"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(noDescription.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("no description yet = %v", got)
	}
}

func TestRelationshipSearchFindsNotFilledIn(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	}); err != nil {
		t.Fatal(err)
	}
	blankTags, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind Quiet",
		AccountDomain: "northwind.example", PrimaryEmail: "ada@northwind.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(blankTags.ID).
		SetCompanyCategories([]string{"  "}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	filled, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
		AccountDomain: "lumen.example", PrimaryEmail: "ada@lumen.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(filled.ID).
		SetCompanyCategories([]string{"Logistics"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Not filled in"})
	if err != nil {
		t.Fatal(err)
	}
	got := namesOf(found.Relationships)
	if len(got) != 2 || got[0] != "Northwind Quiet" || got[1] != "Quill Atelier" {
		t.Fatalf("not filled in = %v", got)
	}
}

func TestRelationshipSearchFindsEngagementAndSentiment(t *testing.T) {
	f := newFixture(t)
	declining, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(declining.ID).
		SetEngagement("declining").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	negative, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(negative.ID).
		SetEngagement("steady").
		SetSentiment("negative").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	// The column can say declining before any source supports it. The sheet
	// still says Not known, so the typed word must not find that company.
	stored, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Declining"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(stored.Relationships); hasName(got, "Quill Atelier") {
		t.Fatalf("unsupported declining = %v", got)
	}
	storedSentiment, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Negative"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(storedSentiment.Relationships); hasName(got, "Lumen Packet") {
		t.Fatalf("unsupported negative = %v", got)
	}
	assertBadge := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertBadge("Lifecycle · Not known", "Quill Atelier", "Lumen Packet")
	assertBadge("Health · Not known", "Quill Atelier", "Lumen Packet")
	assertBadge("Engagement · Not known", "Quill Atelier", "Lumen Packet")
	assertBadge("Sentiment · Not known", "Quill Atelier", "Lumen Packet")
	assertBadge("Engagement · Declining")
	assertBadge("Sentiment · Negative")
	assertBadge("engagement")
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, declining.ID, RelationshipCorrectionInput{
		Dimension: "engagement", Value: "declining", Reason: "Replies have slowed.",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, negative.ID, RelationshipCorrectionInput{
		Dimension: "sentiment", Value: "negative", Reason: "The last call was tense.",
	}); err != nil {
		t.Fatal(err)
	}
	byEngagement, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Declining"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(byEngagement.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("declining = %v", got)
	}
	bySentiment, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Negative"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(bySentiment.Relationships); len(got) != 1 || got[0] != "Lumen Packet" {
		t.Fatalf("negative = %v", got)
	}
	assertBadge("Engagement · Declining", "Quill Atelier")
	assertBadge("Sentiment · Negative", "Lumen Packet")
	assertBadge("Engagement · Not known", "Lumen Packet")
	assertBadge("Sentiment · Not known", "Quill Atelier")
	assertBadge("which companies have engagement · declining", "Quill Atelier")
	assertBadge("Health · Healthy")
	assertBadge("Health · Not known", "Quill Atelier", "Lumen Packet")
}

func TestRelationshipSearchFindsTheStateAnswer(t *testing.T) {
	f := newFixture(t)
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	stored := makeCompany("Quill North")
	stage := makeCompany("Cedar Mark")
	makeCompany("Birch Slide")
	if _, err := f.client.Relationship.UpdateOneID(stored.ID).
		SetHealth("needs_attention").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Health: Needs attention")
	assertCompanyQuery("No supported answer yet.", "Quill North", "Cedar Mark", "Birch Slide")
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, stored.ID, RelationshipCorrectionInput{
		Dimension: "health", Value: "needs_attention", Reason: "The last note needs a reply.",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CorrectRelationship(f.ctx, f.user, stage.ID, RelationshipCorrectionInput{
		Dimension: "lifecycle", Value: "prospect", Reason: "The buyer is a prospect.",
	}); err != nil {
		t.Fatal(err)
	}
	assertCompanyQuery("Health: Needs attention", "Quill North")
	assertCompanyQuery("Lifecycle: Prospect", "Cedar Mark")
	assertCompanyQuery("which companies have health: needs attention", "Quill North")
	assertCompanyQuery("Health: Healthy")
	assertCompanyQuery("Engagement: Declining")
	assertCompanyQuery("No supported answer yet.", "Birch Slide")
}

func TestRelationshipSearchFindsTheEnrichment(t *testing.T) {
	f := newFixture(t)
	austin, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(austin.ID).
		SetCompanyEnrichmentData(map[string]string{"headquarters": "Austin"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	denver, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(denver.ID).
		SetCompanyEnrichmentData(map[string]string{"headquarters": "Denver"}).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Austin"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(found.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("Austin = %v", got)
	}
}

func TestRelationshipSearchFindsTheDirectoryColumns(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	healthy, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quill Atelier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(healthy.ID).SetHealth("healthy").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipParticipant.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetRelationship(healthy).
		SetDisplayName("Ada Quill").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	busy, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind Quiet",
	})
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 2; i++ {
		if _, err := f.client.RevenueAction.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(busy).
			SetActionType("follow_up_task").
			SetChannel("task").
			SetDetector("manual").
			SetDedupeKey(fmt.Sprintf("directory-column-%d", i)).
			SetRevisionHash(fmt.Sprintf("directory-column-hash-%d", i)).
			SetReason("Send the excerpt").
			SetPriorityScore(40).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Relationship.UpdateOneID(lumen.ID).
		SetNextAction("Mail the ledger excerpt").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	healthyRows, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Healthy"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(healthyRows.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("healthy = %v", got)
	}
	notKnown, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Not known"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(notKnown.Relationships); len(got) != 2 || !hasName(got, "Northwind Quiet") || !hasName(got, "Lumen Packet") || hasName(got, "Quill Atelier") {
		t.Fatalf("not known = %v", got)
	}
	notKnownHyphen, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "not-known"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(notKnownHyphen.Relationships); len(got) != 2 || hasName(got, "Quill Atelier") {
		t.Fatalf("not-known = %v", got)
	}
	onePerson, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "1"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(onePerson.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("1 person = %v", got)
	}
	none, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "No open action"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(none.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("no open action = %v", got)
	}
	two, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "2 open actions"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(two.Relationships); len(got) != 1 || got[0] != "Northwind Quiet" {
		t.Fatalf("2 open actions = %v", got)
	}
	// "action" is inside "No open action" and "open actions". It must not
	// return every company that has no next-action sentence.
	actionWord, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "action"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(actionWord.Relationships); len(got) != 0 {
		t.Fatalf("action = %v", got)
	}
	if _, err := f.client.Relationship.UpdateOneID(healthy.ID).SetLifecycle("active_customer").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	// The directory stores a stage before any source supports it. The sheet
	// still says Not known, so the typed stage must not find that company.
	active, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Active Customer"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(active.Relationships); hasName(got, "Quill Atelier") {
		t.Fatalf("unsupported active customer = %v", got)
	}
	prospects, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Prospect"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(prospects.Relationships); hasName(got, "Lumen Packet") || hasName(got, "Quill Atelier") {
		t.Fatalf("unsupported prospect = %v", got)
	}
}

func TestRelationshipSearchFindsThePromiseFollowUp(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveRecovery := func(rel *ent.Relationship, classification, explanation, stableID string, version int) {
		t.Helper()
		payload, err := json.Marshal(CommitmentRecoveryEvaluation{
			EvaluationID:   stableID,
			CommitmentID:   uuid.NewString(),
			Classification: classification,
			Explanation:    explanation,
			EvaluatedAt:    time.Now().UTC().Format(time.RFC3339),
			EvidenceRefs:   []string{},
			StaleSources:   []string{},
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		create := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("recovery_evaluation").SetStableID(stableID).SetVersion(version).
			SetStatus(classification).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:]))
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quill := makeCompany("Quill Atelier")
	lumen := makeCompany("Lumen Packet")
	makeCompany("Harbor Ledger")
	cedar := makeCompany("Cedar Mill")
	saveRecovery(quill, "forgotten", recoveryExplanation("forgotten", nil), "recovery:quill", 1)
	saveRecovery(quill, "blocked", recoveryExplanation("blocked", nil), "recovery:quill", 2)
	saveRecovery(
		lumen, "blocked",
		"Fresh evidence suggests blocked; human review is required.",
		"recovery:lumen-blocked", 1,
	)
	saveRecovery(cedar, "renegotiated", recoveryExplanation("renegotiated", nil), "recovery:cedar", 1)
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("The promise is blocked", "Quill Atelier", "Lumen Packet")
	assertCompanyQuery("This promise is blocked. Review it before acting.", "Quill Atelier")
	assertCompanyQuery("The promise is blocked. Review it before acting.", "Lumen Packet")
	assertCompanyQuery("This promise looks forgotten")
	assertCompanyQuery("The promise was renegotiated", "Cedar Mill")
	assertCompanyQuery("This promise was renegotiated. Review the new terms.", "Cedar Mill")
	assertCompanyQuery("No promises are due for a follow-up.", "Harbor Ledger")
}

func TestRelationshipSearchFindsTheEmptyFollowUp(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	promise := func(rel *ent.Relationship, text, acceptance, status string, due *time.Time) {
		t.Helper()
		create := f.client.Commitment.Create().
			SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
			SetDirection("promised_by_them").SetText(text).
			SetStatus(status).SetConfidence(1).SetAcceptance(acceptance)
		if due != nil {
			create.SetDueAt(*due)
		}
		if _, err := create.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	soon := now.Add(24 * time.Hour)
	late := now.Add(-48 * time.Hour)
	later := now.Add(10 * 24 * time.Hour)
	quiet := makeCompany("Quay Quiet")
	_ = quiet
	laterCo := makeCompany("Quay Later")
	soonCo := makeCompany("Quay Soon")
	lateCo := makeCompany("Quay Late")
	pair := makeCompany("Quay Pair")
	two := makeCompany("Quay Two")
	review := makeCompany("Quay Review")
	checked := makeCompany("Quay Checked")
	promise(laterCo, "Send the later packet", "internally_confirmed", "open", &later)
	promise(soonCo, "Send the soon packet", "internally_confirmed", "open", &soon)
	promise(lateCo, "Send the late packet", "internally_confirmed", "open", &late)
	promise(pair, "Send the late half", "internally_confirmed", "open", &late)
	promise(pair, "Send the soon half", "accepted", "open", &soon)
	promise(two, "Send the first soon packet", "internally_confirmed", "open", &soon)
	promise(two, "Send the second soon packet", "internally_confirmed", "open", &soon)
	promise(review, "Send the unreviewed packet", "candidate", "open", &soon)
	payload, err := json.Marshal(CommitmentRecoveryEvaluation{
		EvaluationID: "recovery:quay-checked", CommitmentID: uuid.NewString(),
		Classification: "forgotten", Explanation: recoveryExplanation("forgotten", nil),
		EvaluatedAt: now.Format(time.RFC3339), EvidenceRefs: []string{}, StaleSources: []string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(payload)
	if _, err := f.client.ConversationIntelligenceArtifact.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(checked).
		SetKind("recovery_evaluation").SetStableID("recovery:quay-checked").SetVersion(1).
		SetStatus("forgotten").SetSubjectRef(checked.ID.String()).
		SetEffectiveAt(now).SetEvidenceRefs([]string{}).
		SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery(
		"No promises are due for a follow-up.",
		"Quay Quiet", "Quay Later", "Quay Review",
	)
	assertCompanyQuery("which companies have no promises are due for a follow-up", "Quay Quiet", "Quay Later", "Quay Review")
	assertCompanyQuery("A promise is due soon. Reconcile to check the follow-up.", "Quay Soon")
	assertCompanyQuery("A promise is past due. Reconcile to check the follow-up.", "Quay Late")
	assertCompanyQuery("A promise is past due and 1 is due soon. Reconcile to check the follow-up.", "Quay Pair")
	assertCompanyQuery("2 promises are due soon. Reconcile to check the follow-up.", "Quay Two")
	assertCompanyQuery("due soon")
}

func TestRelationshipSearchFindsThePlanAndDeletionLines(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	quiet := makeCompany("Quay Quiet")
	soon := makeCompany("Quay Soon")
	noted := makeCompany("Quay Note")
	mailed := makeCompany("Quay Mail")
	planned := makeCompany("Quay Plan")
	accepted := makeCompany("Quay Accepted")
	blank := makeCompany("Quay Blank")
	_ = quiet
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(soon).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the soon packet").
		SetStatus("open").SetConfidence(1).SetAcceptance("internally_confirmed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(blank).SetUser(f.user).
		SetDirection("promised_by_them").SetText("   ").
		SetStatus("open").SetConfidence(1).SetAcceptance("internally_confirmed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.Commitment.Create().
		SetWorkspace(ws).SetRelationship(accepted).SetUser(f.user).
		SetDirection("promised_by_them").SetText("Send the soon packet").
		SetStatus("open").SetConfidence(1).SetAcceptance("accepted").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(noted).
		SetSource("desktop_note").SetExternalID("quay-note").
		SetEventType("note").SetOccurredAt(now).SetReceivedAt(now).
		SetSummary("A note").SetContentHash("quay-note").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).SetProviderThreadID("quay-mail").
		SetSubject("The quay note").SetMessageCount(1).
		SetRelationship(mailed).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte("{}"))
	if _, err := f.client.ConversationIntelligenceArtifact.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(planned).
		SetKind("mutual_action_plan").SetStableID("plan:quay").SetVersion(1).
		SetStatus("draft").SetSubjectRef(planned.ID.String()).
		SetEffectiveAt(now).SetEvidenceRefs([]string{}).
		SetPayloadJSON(`{}`).SetPayloadHash(hex.EncodeToString(sum[:])).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery(
		"No mail or meeting data to delete.",
		"Quay Quiet", "Quay Plan",
	)
	assertCompanyQuery(
		"A shared plan starts once they accept a promise.",
		"Quay Quiet", "Quay Soon", "Quay Note", "Quay Mail", "Quay Accepted", "Quay Blank",
	)
	assertCompanyQuery("They accepted “Send the soon packet”", "Quay Soon")
	assertCompanyQuery(`They accepted "Send the soon packet"`, "Quay Soon")
	assertCompanyQuery("which companies have they accepted send the soon packet", "Quay Soon")
	assertCompanyQuery("They accepted “this promise”", "Quay Blank")
	assertCompanyQuery("delete")
	assertCompanyQuery(
		"Delete conversation data",
		"Quay Soon", "Quay Note", "Quay Mail", "Quay Accepted", "Quay Blank",
	)
	assertCompanyQuery(
		"which companies have delete conversation data",
		"Quay Soon", "Quay Note", "Quay Mail", "Quay Accepted", "Quay Blank",
	)
	assertCompanyQuery("conversation data")
}

func TestRelationshipSearchFindsPlanStatus(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	savePlan := func(rel *ent.Relationship, stableID, columnStatus, payloadStatus string, artifactVersion, revision int) {
		t.Helper()
		payload := "{}"
		if payloadStatus != "" || revision > 0 {
			raw, err := json.Marshal(map[string]any{
				"planId": stableID,
				"status": payloadStatus,
				"currentRevision": map[string]any{
					"version": revision,
					"items": []any{map[string]any{
						"itemId": "item:1", "title": "Send the harbor note",
						"ownerParticipantRef": "plan-participant", "status": "open",
					}},
				},
				"tokenState": "not_issued",
			})
			if err != nil {
				t.Fatal(err)
			}
			payload = string(raw)
		}
		sum := sha256.Sum256([]byte(payload))
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("mutual_action_plan").SetStableID(stableID).SetVersion(artifactVersion).
			SetStatus(columnStatus).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(now).SetEvidenceRefs([]string{}).
			SetPayloadJSON(payload).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Plan Quiet")
	blank := makeCompany("Plan Blank")
	open := makeCompany("Plan Open")
	edited := makeCompany("Plan Edited")
	ready := makeCompany("Plan Ready")
	reply := makeCompany("Plan Reply")
	kept := makeCompany("Plan Kept")
	halted := makeCompany("Plan Halted")
	issued := makeCompany("Plan Issued")
	stale := makeCompany("Plan Stale")
	column := makeCompany("Plan Column")
	_ = quiet
	savePlan(blank, "plan:blank", "draft", "", 1, 0)
	savePlan(open, "plan:open", "draft", "draft", 1, 1)
	savePlan(edited, "plan:edited", "revised", "revised", 1, 2)
	savePlan(ready, "plan:ready", "internally_approved", "internally_approved", 1, 2)
	savePlan(reply, "plan:reply", "counterparty_responded", "counterparty_responded", 1, 3)
	savePlan(kept, "plan:kept", "completed", "completed", 1, 1)
	savePlan(halted, "plan:halted", "cancelled", "cancelled", 1, 1)
	savePlan(issued, "plan:issued", "shared", "shared", 1, 4)
	savePlan(stale, "plan:stale", "draft", "draft", 1, 1)
	savePlan(stale, "plan:stale", "internally_approved", "internally_approved", 2, 2)
	savePlan(column, "plan:column", "internally_approved", "draft", 1, 1)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("A shared plan starts once they accept a promise.", "Plan Quiet")
	assertCompanyQuery("Approved in this workspace", "Plan Ready", "Plan Stale")
	assertCompanyQuery("Approved in this workspace · Version 2", "Plan Ready", "Plan Stale")
	assertCompanyQuery("Approved in this workspace · Version 1")
	assertCompanyQuery("which companies are approved in this workspace", "Plan Ready", "Plan Stale")
	assertCompanyQuery("Draft an email to share this plan", "Plan Ready", "Plan Stale")
	assertCompanyQuery("They responded", "Plan Reply")
	assertCompanyQuery("They responded · Version 3", "Plan Reply")
	assertCompanyQuery("They responded · Version 2")
	assertCompanyQuery("Finished", "Plan Kept")
	assertCompanyQuery("Finished · Version 1", "Plan Kept")
	assertCompanyQuery("the plan is finished", "Plan Kept")
	assertCompanyQuery("Deletion is finished")
	assertCompanyQuery("Cancelled", "Plan Halted")
	assertCompanyQuery("Cancelled · Version 1", "Plan Halted")
	assertCompanyQuery("Draft", "Plan Open", "Plan Column")
	assertCompanyQuery("Draft · Version 1", "Plan Open", "Plan Column")
	assertCompanyQuery("Revised", "Plan Edited")
	assertCompanyQuery("Revised · Version 2", "Plan Edited")
	assertCompanyQuery("Shared", "Plan Issued")
	assertCompanyQuery("Shared · Version 4", "Plan Issued")
	assertCompanyQuery("Approve this plan", "Plan Open", "Plan Edited", "Plan Column")
	assertCompanyQuery("approved")
	assertCompanyQuery("responded")
}

func TestRelationshipSearchFindsTheDisagreement(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveCase := func(rel *ent.Relationship, status, dimension, reason, stableID string, version int) {
		t.Helper()
		payload, err := json.Marshal(ConversationContradictionCase{
			CaseID: stableID, RelationshipID: rel.ID.String(), SubjectRef: rel.ID.String(),
			Dimension: dimension, Status: status, Reason: reason,
			Sides: []ConversationContradictionEvidenceSide{
				{AssertionID: "left", Source: "user"},
				{AssertionID: "right", Source: "hubspot"},
			},
			OpenedAt: time.Now().UTC().Format(time.RFC3339),
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("contradiction_case").SetStableID(stableID).SetVersion(version).
			SetStatus(status).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quill := makeCompany("Quill Atelier")
	cedar := makeCompany("Cedar Mill")
	makeCompany("Harbor Ledger")
	saveCase(
		quill, "auto_resolved_by_authority", "health",
		"A stronger source already chose the current value.",
		"contradiction:quill", 1,
	)
	saveCase(
		quill, "open", "lifecycle",
		"Two sources disagree. Choose which value is current.",
		"contradiction:quill", 2,
	)
	saveCase(
		cedar, "auto_resolved_by_authority", "health",
		"A stronger source already chose the current value.",
		"contradiction:cedar", 1,
	)
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Two details disagree", "Quill Atelier")
	assertCompanyQuery("Which Lifecycle should be the current one?", "Quill Atelier")
	assertCompanyQuery("Choose the current value from 2 sources.", "Quill Atelier")
	assertCompanyQuery("Which Health should be the current one?")
	assertCompanyQuery("A stronger source already chose the current value.", "Cedar Mill")
	assertCompanyQuery("Two sources disagree. Choose which value is current.")
}

func TestRelationshipSearchFindsContradictionReasons(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveCase := func(rel *ent.Relationship, status, reason, stableID string, version int) {
		t.Helper()
		payload, err := json.Marshal(ConversationContradictionCase{
			CaseID: stableID, RelationshipID: rel.ID.String(), SubjectRef: rel.ID.String(),
			Dimension: "health", Status: status, Reason: reason,
			Sides: []ConversationContradictionEvidenceSide{
				{AssertionID: "left", Source: "user"},
				{AssertionID: "right", Source: "hubspot"},
			},
			OpenedAt: time.Now().UTC().Format(time.RFC3339),
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("contradiction_case").SetStableID(stableID).SetVersion(version).
			SetStatus(status).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	makeCompany("Reason Quiet")
	openCase := makeCompany("Reason Open")
	split := makeCompany("Reason Split")
	splitPrinted := makeCompany("Reason Split Printed")
	chose := makeCompany("Reason Chose")
	chosePrinted := makeCompany("Reason Chose Printed")
	gmail := makeCompany("Reason Gmail")
	note := makeCompany("Reason Note")
	rule := makeCompany("Reason Rule")
	openChose := makeCompany("Reason Open Chose")
	revised := makeCompany("Reason Revised")
	calendarNoise := makeCompany("Reason Calendar Noise")
	calendar := makeCompany("Reason Calendar")
	saveCase(openCase, "open", "equally authoritative typed evidence overlaps with different values", "contradiction:reason-open", 1)
	saveCase(split, "user_resolved", "equally authoritative typed evidence overlaps with different values", "contradiction:reason-split", 1)
	saveCase(splitPrinted, "user_resolved", "Two sources disagree. Choose which value is current.", "contradiction:reason-split-printed", 1)
	saveCase(chose, "user_resolved", "User selected the current value from a focused contradiction case.", "contradiction:reason-chose", 1)
	saveCase(chosePrinted, "user_resolved", "You chose the current value.", "contradiction:reason-chose-printed", 1)
	saveCase(gmail, "user_resolved", "Selected gmail as current evidence.", "contradiction:reason-gmail", 1)
	saveCase(note, "user_resolved", "You chose the value from A note.", "contradiction:reason-note", 1)
	saveCase(rule, "user_resolved", "Selected deterministic as current evidence.", "contradiction:reason-rule", 1)
	saveCase(openChose, "open", "You chose the current value.", "contradiction:reason-open-chose", 1)
	saveCase(revised, "user_resolved", "You chose the current value.", "contradiction:reason-revised", 1)
	saveCase(revised, "open", "Two sources disagree. Choose which value is current.", "contradiction:reason-revised", 2)
	saveCase(calendar, "user_resolved", "Selected calendar as current evidence.", "contradiction:reason-calendar", 1)
	now := time.Now().UTC()
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(calendarNoise).
		SetSource("calendar").SetExternalID("reason-calendar-noise").
		SetEventType("event.updated").SetOccurredAt(now).SetReceivedAt(now).
		SetSummary("A calendar event").SetContentHash("reason-calendar-noise").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery(
		"Two sources disagree. Choose which value is current.",
		"Reason Split", "Reason Split Printed",
	)
	assertCompanyQuery(
		"You chose the current value.",
		"Reason Chose", "Reason Chose Printed",
	)
	assertCompanyQuery("You chose the value from Gmail.", "Reason Gmail")
	assertCompanyQuery("You chose the value from A note.", "Reason Note")
	assertCompanyQuery("You chose the value from A rule.", "Reason Rule")
	assertCompanyQuery("You chose the value from Calendar.", "Reason Calendar")
	assertCompanyQuery("Choose the current value from 2 sources.", "Reason Open", "Reason Open Chose", "Reason Revised")
}

func TestRelationshipSearchFindsTheChosenContradictionValue(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveCase := func(rel *ent.Relationship, status, reason, stableID string) {
		t.Helper()
		payload, err := json.Marshal(ConversationContradictionCase{
			CaseID: stableID, RelationshipID: rel.ID.String(), SubjectRef: rel.ID.String(),
			Dimension: "health", Status: status, Reason: reason,
			Sides: []ConversationContradictionEvidenceSide{
				{AssertionID: "left", Source: "desktop_note"},
				{AssertionID: "right", Source: "gmail"},
			},
			OpenedAt: time.Now().UTC().Format(time.RFC3339),
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("contradiction_case").SetStableID(stableID).SetVersion(1).
			SetStatus(status).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	note := makeCompany("Quill North")
	legacy := makeCompany("Cedar Mark")
	plain := makeCompany("Birch Slide")
	open := makeCompany("Aspen Quay")
	stronger := makeCompany("Harbor Ledger")
	gmail := makeCompany("Lumen Packet")
	saveCase(note, "user_resolved", "You chose the value from A note.", "contradiction:note")
	saveCase(legacy, "user_resolved", "Selected desktop_note as current evidence.", "contradiction:legacy")
	saveCase(plain, "user_resolved", "User selected the current value from a focused contradiction case.", "contradiction:plain")
	saveCase(open, "open", "You chose the value from A note.", "contradiction:open")
	saveCase(stronger, "auto_resolved_by_authority", "A stronger source already chose the current value.", "contradiction:stronger")
	saveCase(gmail, "user_resolved", "You chose the value from Gmail.", "contradiction:gmail")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("You chose the value from A note.", "Quill North", "Cedar Mark")
	assertCompanyQuery("which companies have you chose the value from a note", "Quill North", "Cedar Mark")
	assertCompanyQuery("You chose the current value.", "Birch Slide")
	assertCompanyQuery("You chose the value from Gmail.", "Lumen Packet")
	assertCompanyQuery("Choose the current value from 2 sources.", "Aspen Quay")
	assertCompanyQuery("A stronger source already chose the current value.", "Harbor Ledger")
	assertCompanyQuery("you chose")
	assertCompanyQuery("a note")
	assertCompanyQuery("gmail")
}

func TestRelationshipSearchFindsUncertainClaims(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveClaims := func(rel *ent.Relationship, externalID string, claims []map[string]any) string {
		t.Helper()
		facts, err := json.Marshal(map[string]any{"conversation_claims": claims})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		row, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row.ID.String()
	}
	saveCorrection := func(rel *ent.Relationship, externalID, observationID, claimID, kind string) {
		t.Helper()
		facts, err := json.Marshal(map[string]any{
			"review_correction": map[string]any{
				"review_item_id":  "review:test",
				"kind":            kind,
				"corrected_value": "kept",
				"claim_id":        claimID,
				"observation_id":  observationID,
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("user").SetExternalID(externalID).SetEventType("conversation_evidence_corrected").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	claim := func(id string, confidence, speaker float64) map[string]any {
		return map[string]any{
			"id": id, "kind": "claim", "value": id,
			"confidence": confidence, "speakerConfidence": speaker,
		}
	}
	makeCompany("Claim Quiet")
	saveClaims(makeCompany("Claim One"), "claim-one", []map[string]any{claim("one", 0.2, 0.9)})
	saveClaims(makeCompany("Claim Speaker"), "claim-speaker", []map[string]any{claim("speaker", 0.9, 0.2)})
	saveClaims(makeCompany("Claim Two"), "claim-two", []map[string]any{
		claim("two-a", 0.2, 0.9),
		claim("two-b", 0.9, 0.2),
	})
	saveClaims(makeCompany("Claim Sure"), "claim-sure", []map[string]any{claim("sure", 0.9, 0.9)})
	saveClaims(makeCompany("Claim Omitted"), "claim-omitted", []map[string]any{{
		"id": "omitted", "kind": "claim", "value": "omitted", "confidence": 0.95,
	}})
	fixed := makeCompany("Claim Fixed")
	fixedID := saveClaims(fixed, "claim-fixed", []map[string]any{claim("fixed", 0.2, 0.9)})
	saveCorrection(fixed, "claim-fixed-correction", fixedID, "fixed", "claim")
	half := makeCompany("Claim Half")
	halfID := saveClaims(half, "claim-half", []map[string]any{claim("half", 0.2, 0.2)})
	saveCorrection(half, "claim-half-correction", halfID, "half", "claim")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery(
		"1 material claim remains uncertain and queued for focused review.",
		"Claim One", "Claim Speaker", "Claim Omitted", "Claim Half",
	)
	assertCompanyQuery(
		"2 material claims remain uncertain and queued for focused review.",
		"Claim Two",
	)
	assertCompanyQuery("1 material claims remain uncertain and queued for focused review.")
	assertCompanyQuery("0 material claims remain uncertain and queued for focused review.")
}

func TestRelationshipSearchFindsSuggestionTitles(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name, lifecycle string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		if lifecycle != "" {
			if _, err := f.client.Relationship.UpdateOneID(row.ID).SetLifecycle(lifecycle).Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
		return row
	}
	saveClaim := func(rel *ent.Relationship, kind, value, externalID string) {
		t.Helper()
		facts, err := json.Marshal(map[string]any{
			"conversation_claims": []map[string]any{{
				"id": externalID, "kind": kind, "value": value,
			}},
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quill := makeCompany("Quill Atelier", "")
	cedar := makeCompany("Cedar Mill", "")
	harbor := makeCompany("Harbor Ledger", "renewal")
	saveClaim(quill, "objection", "The price is too high", "claim-quill-objection")
	saveClaim(cedar, "risk", "Security review may slip", "claim-cedar-risk")
	intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, quill)
	if err != nil {
		t.Fatal(err)
	}
	objectionSeen := false
	for _, cue := range intelligence.LiveCues {
		if cue.Title == "Unresolved objection" && cue.Detail == "The price is too high" {
			objectionSeen = true
		}
		if cue.Title == "Risk raised in a conversation" {
			t.Fatalf("objection company showed a risk cue: %#v", intelligence.LiveCues)
		}
	}
	if !objectionSeen {
		t.Fatalf("objection cue missing: %#v", intelligence.LiveCues)
	}
	cedarIntelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, cedar)
	if err != nil {
		t.Fatal(err)
	}
	riskSeen := false
	for _, cue := range cedarIntelligence.LiveCues {
		if cue.Title == "Risk raised in a conversation" && cue.Detail == "Security review may slip" {
			riskSeen = true
		}
		if cue.Title == "Unresolved objection" {
			t.Fatalf("risk claim was titled as an objection: %#v", cedarIntelligence.LiveCues)
		}
	}
	if !riskSeen {
		t.Fatalf("risk cue missing: %#v", cedarIntelligence.LiveCues)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Unresolved objection", "Quill Atelier")
	assertCompanyQuery("Risk raised in a conversation", "Cedar Mill")
	assertCompanyQuery("Renewal context", "Harbor Ledger")
	_ = harbor
}

func TestRelationshipSearchFindsFocusedReview(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveClaim := func(rel *ent.Relationship, kind string, confidence, speaker float64, externalID string) {
		t.Helper()
		facts, err := json.Marshal(map[string]any{
			"conversation_claims": []map[string]any{{
				"id": externalID, "kind": kind, "value": "Noted in the call",
				"confidence": confidence, "speakerConfidence": speaker, "speakerLabel": "Other",
			}},
		})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quill := makeCompany("Quill Atelier")
	cedar := makeCompany("Cedar Mill")
	lumen := makeCompany("Lumen Packet")
	makeCompany("Harbor Ledger")
	saveClaim(quill, "objection", 0.5, 1, "review-quill")
	saveClaim(cedar, "risk", 0.7, 0.4, "review-cedar")
	saveClaim(lumen, "stakeholder", 0.8, 1, "review-lumen")
	labelsOf := func(rel *ent.Relationship) []string {
		t.Helper()
		intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, rel)
		if err != nil {
			t.Fatal(err)
		}
		labels := make([]string, 0, len(intelligence.ReviewItems))
		for _, item := range intelligence.ReviewItems {
			labels = append(labels, item.Label)
		}
		return labels
	}
	if got := labelsOf(quill); !hasName(got, "Low-confidence material claim") || !hasName(got, "Confirm the low-confidence wording") || hasName(got, "Resolve the speaker for a material statement") {
		t.Fatalf("quill review = %v", got)
	}
	if got := labelsOf(cedar); !hasName(got, "Resolve the speaker for a material statement") || hasName(got, "Confirm the low-confidence wording") {
		t.Fatalf("cedar review = %v", got)
	}
	if got := labelsOf(lumen); !hasName(got, "Confirm the stakeholder identity or role") || hasName(got, "Low-confidence material claim") {
		t.Fatalf("lumen review = %v", got)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Low-confidence material claim", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("Confirm the low-confidence wording", "Quill Atelier")
	assertCompanyQuery("The wording", "Quill Atelier")
	assertCompanyQuery("Resolve the speaker for a material statement", "Cedar Mill")
	assertCompanyQuery("Who said it", "Cedar Mill")
	assertCompanyQuery("Who this is", "Lumen Packet")
	assertCompanyQuery("Focused evidence review", "Quill Atelier", "Cedar Mill", "Lumen Packet")
	assertCompanyQuery("Focused evidence review (2)", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("Focused evidence review (1)", "Lumen Packet")
}

func TestRelationshipSearchFindsOlderUnreviewedConversations(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	claimFacts := func(kind string, confidence, speaker float64, id string) string {
		t.Helper()
		body, err := json.Marshal(map[string]any{
			"conversation_claims": []map[string]any{{
				"id": id, "kind": kind, "value": "Noted in the call",
				"confidence": confidence, "speakerConfidence": speaker, "speakerLabel": "Other",
			}},
		})
		if err != nil {
			t.Fatal(err)
		}
		return string(body)
	}
	candidateFacts := `{
		"conversation_claim_candidates":[{
			"candidateId":"oldest-promise",
			"kind":"promise",
			"normalizedValue":"Oldest sheet promise",
			"displayValue":"Oldest sheet promise",
			"evidence":[{"exactQuote":"Oldest sheet promise quote"}],
			"stateDimension":"next_action",
			"confidence":0.4,
			"caveats":[]
		}],
		"conversation_review":{"batch_id":"batch-oldest","baseline_version":0}
	}`
	fillNotes := func(rel *ent.Relationship, prefix string, count int, newestFacts, oldestFacts string) {
		t.Helper()
		now := time.Now().UTC()
		for i := 1; i <= count; i++ {
			facts := "{}"
			if i == 1 && newestFacts != "" {
				facts = newestFacts
			} else if i == count && oldestFacts != "" {
				facts = oldestFacts
			}
			externalID := fmt.Sprintf("%s-%03d", prefix, i)
			if _, err := f.client.RelationshipObservation.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
				SetSource("user").SetExternalID(externalID).SetEventType("note").
				SetOccurredAt(now.Add(-time.Duration(i) * time.Second)).
				SetReceivedAt(now).SetSummary("A recorded note").
				SetNormalizedFactsJSON(facts).SetContentHash(externalID).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	quill := makeCompany("Quill North")
	cedar := makeCompany("Cedar Slide")
	aspen := makeCompany("Aspen Ledger")
	birch := makeCompany("Birch Quiet")
	maple := makeCompany("Maple Kept")
	makeCompany("Harbor Quiet")
	fillNotes(quill, "quill-older", intelligenceObservationPage+1, "", "")
	fillNotes(cedar, "cedar-older", intelligenceObservationPage, "", "")
	fillNotes(aspen, "aspen-older", intelligenceObservationPage+1, claimFacts("objection", 0.5, 1, "aspen-claim"), "")
	fillNotes(birch, "birch-older", intelligenceObservationPage+1, "", candidateFacts)
	fillNotes(maple, "maple-older", intelligenceObservationPage+1, claimFacts("fact", 0.95, 0.95, "maple-claim"), "")

	page := func(rel *ent.Relationship) (bool, int) {
		t.Helper()
		intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, rel)
		if err != nil {
			t.Fatal(err)
		}
		return intelligence.ObservationPageHasMore, len(intelligence.ReviewItems)
	}
	if hasMore, items := page(quill); !hasMore || items != 0 {
		t.Fatalf("quill page = hasMore %v items %d", hasMore, items)
	}
	if hasMore, items := page(cedar); hasMore || items != 0 {
		t.Fatalf("cedar page = hasMore %v items %d", hasMore, items)
	}
	if hasMore, items := page(aspen); !hasMore || items == 0 {
		t.Fatalf("aspen page = hasMore %v items %d", hasMore, items)
	}
	if hasMore, items := page(birch); !hasMore || items != 0 {
		t.Fatalf("birch page = hasMore %v items %d", hasMore, items)
	}
	if hasMore, items := page(maple); !hasMore || items != 0 {
		t.Fatalf("maple page = hasMore %v items %d", hasMore, items)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Older conversations may still need review.", "Quill North", "Birch Quiet", "Maple Kept")
	assertCompanyQuery("which companies have older conversations may still need review", "Quill North", "Birch Quiet", "Maple Kept")
	assertCompanyQuery("Low-confidence material claim", "Aspen Ledger")
	assertCompanyQuery("older")
	assertCompanyQuery("conversations")
	assertCompanyQuery("review")
}

func TestRelationshipSearchFindsPrivacySentences(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveArtifact := func(rel *ent.Relationship, kind, stableID string, version int, payload any) {
		t.Helper()
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(body)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind(kind).SetStableID(stableID).SetVersion(version).
			SetStatus("active").SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(body)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	policy := func(capture string, publish, share bool, days int) ConversationPolicyLayer {
		return ConversationPolicyLayer{
			LayerID: "layer", Scope: "meeting", Enforced: true,
			Capture: capture, ModelRoute: "hosted_allowed",
			PublishEvidence: publish, ExternalShare: share, RetentionDays: days,
			RedactionClasses: []string{},
		}
	}
	decision := func(id string) ConversationGovernanceDecision {
		return ConversationGovernanceDecision{
			DecisionID: id, Checkpoint: "transcription", PolicyVersion: "policy:test",
			Allowed: true, Route: "hosted_allowed",
			Reason:           "effective policy permits this operation",
			RedactionClasses: []string{}, DecidedAt: time.Now().UTC().Format(time.RFC3339),
		}
	}
	quill := makeCompany("Quill Atelier")
	cedar := makeCompany("Cedar Mill")
	harbor := makeCompany("Harbor Ledger")
	lumen := makeCompany("Lumen Packet")
	saveArtifact(quill, "conversation_policy", "privacy:quill", 1, policy("deny", false, false, 7))
	saveArtifact(quill, "governance_decision", "privacy:quill:decision", 1, decision("privacy:quill:decision"))
	saveArtifact(harbor, "governance_decision", "privacy:harbor:one", 1, decision("privacy:harbor:one"))
	saveArtifact(harbor, "governance_decision", "privacy:harbor:two", 1, decision("privacy:harbor:two"))
	saveArtifact(lumen, "conversation_policy", "privacy:lumen", 1, policy("deny", false, false, 7))
	saveArtifact(lumen, "conversation_policy", "privacy:lumen", 2, policy("require_consent", true, true, 30))
	quillIntel, err := f.svc.RelationshipIntelligenceFor(f.ctx, quill)
	if err != nil {
		t.Fatal(err)
	}
	if quillIntel.EffectivePolicy.Capture != "deny" || quillIntel.EffectivePolicy.PublishEvidence || quillIntel.EffectivePolicy.ExternalShare || quillIntel.EffectivePolicy.RetentionDays != 7 || len(quillIntel.GovernanceDecisions) != 1 {
		t.Fatalf("quill privacy = %+v decisions=%d", quillIntel.EffectivePolicy, len(quillIntel.GovernanceDecisions))
	}
	cedarIntel, err := f.svc.RelationshipIntelligenceFor(f.ctx, cedar)
	if err != nil {
		t.Fatal(err)
	}
	if cedarIntel.EffectivePolicy.Capture != "require_consent" || !cedarIntel.EffectivePolicy.PublishEvidence || !cedarIntel.EffectivePolicy.ExternalShare || cedarIntel.EffectivePolicy.RetentionDays != 30 || len(cedarIntel.GovernanceDecisions) != 0 {
		t.Fatalf("cedar privacy = %+v decisions=%d", cedarIntel.EffectivePolicy, len(cedarIntel.GovernanceDecisions))
	}
	lumenIntel, err := f.svc.RelationshipIntelligenceFor(f.ctx, lumen)
	if err != nil {
		t.Fatal(err)
	}
	if lumenIntel.EffectivePolicy.Capture != "require_consent" || lumenIntel.EffectivePolicy.RetentionDays != 30 {
		t.Fatalf("lumen privacy = %+v", lumenIntel.EffectivePolicy)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Do not capture", "Quill Atelier")
	assertCompanyQuery("Capture: Do not capture", "Quill Atelier")
	assertCompanyQuery("Shared excerpts: off", "Quill Atelier")
	assertCompanyQuery("Plan sharing outside this workspace: blocked", "Quill Atelier")
	assertCompanyQuery("Retention: 7 days", "Quill Atelier")
	assertCompanyQuery("1 privacy decision recorded.", "Quill Atelier")
	assertCompanyQuery("Ask before capturing", "Cedar Mill", "Harbor Ledger", "Lumen Packet")
	assertCompanyQuery("Shared excerpts: on", "Cedar Mill", "Harbor Ledger", "Lumen Packet")
	assertCompanyQuery("Plan sharing outside this workspace: allowed", "Cedar Mill", "Harbor Ledger", "Lumen Packet")
	assertCompanyQuery("Retention: 30 days", "Cedar Mill", "Harbor Ledger", "Lumen Packet")
	assertCompanyQuery("No privacy decisions recorded.", "Cedar Mill", "Lumen Packet")
	assertCompanyQuery("2 privacy decisions recorded.", "Harbor Ledger")
	assertCompanyQuery("Capture is allowed")
}

func TestRelationshipSearchFindsConsentReceipts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveReceipt := func(rel *ent.Relationship, externalID string, receipt ConversationGovernanceReceipt) {
		t.Helper()
		facts, err := json.Marshal(map[string]any{"governance_receipt": receipt})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveDeletion := func(rel *ent.Relationship, stableID, status, requestedAt string, version int) {
		t.Helper()
		payload, err := json.Marshal(ConversationDeletionReceipt{
			ReceiptID: stableID, RequestedAt: requestedAt, Status: status,
			Targets: []ConversationDeletionTargetOutcome{},
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("deletion_receipt").SetStableID(stableID).SetVersion(version).
			SetStatus(status).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quill := makeCompany("Quill Atelier")
	cedar := makeCompany("Cedar Mill")
	harbor := makeCompany("Harbor Ledger")
	lumen := makeCompany("Lumen Packet")
	saveReceipt(quill, "consent-quill", ConversationGovernanceReceipt{
		ReceiptID: "quill", CapturePolicy: "manual_capture",
		Routing: "local_transcription_to_oppulence", Region: "local_device",
		Retention: "until_transcribed", ParticipantDisclosure: "not_recorded",
		DeletionOutcome: "not_applicable", EvidenceClip: "not_retained",
	})
	saveReceipt(cedar, "consent-cedar", ConversationGovernanceReceipt{
		ReceiptID: "cedar", CapturePolicy: "explicit_upload", Routing: "local_only",
		Region: "provider_managed", Retention: "always", ParticipantDisclosure: "provider_reported",
		LegalHold: true, DeletionOutcome: "retained_by_user_policy", EvidenceClip: "encrypted",
	})
	saveReceipt(harbor, "consent-harbor-1", ConversationGovernanceReceipt{
		ReceiptID: "harbor-1", CapturePolicy: "provider_import", Routing: "gmail_to_oppulence",
		Region: "provider_managed", Retention: "provider_policy_plus_oppulence_evidence",
		ParticipantDisclosure: "provider_reported", DeletionOutcome: "deleted:audio",
		EvidenceClip: "not_retained",
	})
	saveReceipt(harbor, "consent-harbor-2", ConversationGovernanceReceipt{
		ReceiptID: "harbor-2", CapturePolicy: "calendar_prompt_or_manual",
		Routing: "local_only", Region: "local_device", Retention: "untilTranscribed",
		ParticipantDisclosure: "not_recorded", DeletionOutcome: "scheduled_after_transcription",
		EvidenceClip: "encrypted",
	})
	saveDeletion(harbor, "deletion:harbor", "pending", "2026-09-01T00:00:00Z", 1)
	saveDeletion(harbor, "deletion:harbor", "verified", "2026-10-01T00:00:00Z", 2)
	saveDeletion(lumen, "deletion:lumen", "pending", "2026-10-01T00:00:00Z", 1)
	quillIntel, err := f.svc.RelationshipIntelligenceFor(f.ctx, quill)
	if err != nil {
		t.Fatal(err)
	}
	if len(quillIntel.GovernanceReceipts) != 1 || quillIntel.GovernanceReceipts[0].CapturePolicy != "manual_capture" {
		t.Fatalf("quill receipts = %+v", quillIntel.GovernanceReceipts)
	}
	harborIntel, err := f.svc.RelationshipIntelligenceFor(f.ctx, harbor)
	if err != nil {
		t.Fatal(err)
	}
	if len(harborIntel.GovernanceReceipts) != 2 || len(harborIntel.DeletionReceipts) != 1 || harborIntel.DeletionReceipts[0].Status != "verified" {
		t.Fatalf("harbor receipts=%d deletion=%+v", len(harborIntel.GovernanceReceipts), harborIntel.DeletionReceipts)
	}
	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Captured by hand", "Quill Atelier")
	assertCompanyQuery("No audio was kept", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("People were not told", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("Uploaded on purpose", "Cedar Mill")
	assertCompanyQuery("The audio that was kept is encrypted", "Cedar Mill", "Harbor Ledger")
	assertCompanyQuery("Legal hold on", "Cedar Mill")
	assertCompanyQuery("Legal hold off", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("Kept", "Cedar Mill")
	assertCompanyQuery("Imported from Gmail, then saved here", "Harbor Ledger")
	assertCompanyQuery("Deleted", "Harbor Ledger")
	assertCompanyQuery("Consent and governance (1)", "Quill Atelier", "Cedar Mill")
	assertCompanyQuery("Consent and governance (2)", "Harbor Ledger")
	assertCompanyQuery("Consent and governance", "Quill Atelier", "Cedar Mill", "Harbor Ledger")
	assertCompanyQuery("Deletion is finished", "Harbor Ledger")
	assertCompanyQuery("Last deletion: Deletion is finished", "Harbor Ledger")
	assertCompanyQuery("Deletion is still running", "Lumen Packet")
}

func TestRelationshipSearchFindsNoneRecorded(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	addPerson := func(rel *ent.Relationship, name string) {
		t.Helper()
		person, err := f.client.Person.Create().
			SetDisplayName(name).
			SetWorkspace(ws).
			SetUser(f.user).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.RelationshipParticipant.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetRelationship(rel).SetPerson(person).
			SetDisplayName(name).SetRole("contact").
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	fill := func(rel *ent.Relationship, risks, milestones []string) {
		t.Helper()
		if _, err := f.client.Relationship.UpdateOneID(rel.ID).
			SetRisks(risks).SetMilestones(milestones).Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Quay Quiet")
	_ = quiet
	risksOnly := makeCompany("Quay Risks")
	fill(risksOnly, []string{"renewal slip"}, nil)
	milesOnly := makeCompany("Quay Miles")
	fill(milesOnly, nil, []string{"signed"})
	peopleOnly := makeCompany("Quay People")
	addPerson(peopleOnly, "Ada Mesa")
	full := makeCompany("Quay Full")
	fill(full, []string{"renewal slip"}, []string{"signed"})
	addPerson(full, "Casey Quinn")
	blank := makeCompany("Quay Blank")
	fill(blank, []string{""}, []string{""})
	addPerson(blank, "No Name")
	observed := makeCompany("Quay Observed")
	fill(observed, []string{"renewal slip"}, []string{"signed"})
	addPerson(observed, "Jules Pike")
	at := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	if _, err := f.client.RelationshipObservation.Create().
		SetWorkspace(ws).SetUser(f.user).SetRelationship(observed).
		SetSource("user").SetExternalID("quay-none-observed").
		SetEventType("relationship.observed").SetOccurredAt(at).SetReceivedAt(at).
		SetSummary("A recorded row").SetContentHash("quay-none-observed").
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	emptyLists := []string{"Quay Quiet", "Quay Risks", "Quay Miles", "Quay People"}
	assertCompanyQuery("None recorded.", emptyLists...)
	assertCompanyQuery("which companies have none recorded", emptyLists...)
	assertCompanyQuery("none")
}

func TestRelationshipSearchFindsProfileFieldCounts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	addPerson := func(rel *ent.Relationship, name, memberTitle string, fill func(*ent.PersonCreate)) {
		t.Helper()
		create := f.client.Person.Create().
			SetDisplayName(name).
			SetWorkspace(ws).
			SetUser(f.user)
		if fill != nil {
			fill(create)
		}
		personRow, err := create.Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		member := f.client.RelationshipParticipant.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetRelationship(rel).SetPerson(personRow).
			SetDisplayName(name).SetRole("contact")
		if memberTitle != "" {
			member.SetTitle(memberTitle)
		}
		if _, err := member.Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	makeCompany("Quay None")
	empty := makeCompany("Quay Empty")
	addPerson(empty, "No Profile", "", nil)
	spaces := makeCompany("Quay Space")
	addPerson(spaces, "Blank Profile", "", func(create *ent.PersonCreate) {
		create.SetTitle("   ")
	})
	titled := makeCompany("Quay Title")
	addPerson(titled, "Ada Mesa", "Buyer", nil)
	org := makeCompany("Quay Org")
	addPerson(org, "North Wind", "", func(create *ent.PersonCreate) {
		create.SetOrgName("Northwind")
	})
	half := makeCompany("Quay Half")
	addPerson(half, "Casey Quinn", "", func(create *ent.PersonCreate) {
		create.SetTitle("Engineer").SetLocation("Austin")
	})
	three := makeCompany("Quay Three")
	addPerson(three, "Jules Pike", "", func(create *ent.PersonCreate) {
		create.SetTitle("Engineer").SetOrgName("Northwind").SetSeniority("director")
	})
	full := makeCompany("Quay Full")
	addPerson(full, "Riley Chen", "", func(create *ent.PersonCreate) {
		create.SetTitle("Engineer").SetOrgName("Northwind").SetSeniority("director").SetLocation("Austin")
	})

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("0/4 profile fields", "Quay Empty", "Quay Space")
	assertCompanyQuery("No profile details yet", "Quay Empty", "Quay Space")
	assertCompanyQuery("1/4 profile fields", "Quay Title", "Quay Org")
	assertCompanyQuery("2/4 profile fields", "Quay Half")
	assertCompanyQuery("3/4 profile fields", "Quay Three")
	assertCompanyQuery("4/4 profile fields", "Quay Full")
	assertCompanyQuery("which companies have 4/4 profile fields", "Quay Full")
	assertCompanyQuery("profile fields")
}

func TestRelationshipSearchFindsPublicResearchCounts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	addPerson := func(rel *ent.Relationship, name string) *ent.Person {
		t.Helper()
		personRow, err := f.client.Person.Create().
			SetDisplayName(name).SetWorkspace(ws).SetUser(f.user).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.RelationshipParticipant.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetRelationship(rel).SetPerson(personRow).
			SetDisplayName(name).SetRole("contact").
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
		return personRow
	}
	addAttribute := func(personRow *ent.Person, sourceType, status, key, value string) {
		t.Helper()
		if _, err := f.client.PersonAttribute.Create().
			SetWorkspace(ws).SetUser(f.user).SetPerson(personRow).
			SetDimension("title").SetValue(value).
			SetSourceType(sourceType).SetSource("web").SetExtractor("parallel").
			SetStatus(status).SetConfidence(0.8).
			SetObservedAt(now).SetValidFrom(now).
			SetCitationsJSON(`[{"title":"Bio","url":"https://example.com/bio","excerpts":["Engineer"]}]`).
			SetDedupeKey(key).SetSupportingObservationIds([]string{}).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	one := makeCompany("Quay One")
	addAttribute(addPerson(one, "Ada Mesa"), "external_research", "active", "research-one", "Engineer")
	two := makeCompany("Quay Two")
	twoPerson := addPerson(two, "Riley Chen")
	addAttribute(twoPerson, "external_research", "active", "research-two-a", "Engineer")
	addAttribute(twoPerson, "external_research", "superseded", "research-two-b", "Director")
	retracted := makeCompany("Quay Retracted")
	addAttribute(addPerson(retracted, "Jules Pike"), "external_research", "retracted", "research-retracted", "Engineer")
	fact := makeCompany("Quay Fact")
	addAttribute(addPerson(fact, "Casey Quinn"), "source_fact", "active", "research-fact", "Buyer")
	makeCompany("Quay None")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Public research · 1 detail", "Quay One")
	assertCompanyQuery("Public research · 2 details", "Quay Two")
	assertCompanyQuery("which companies have public research · 2 details", "Quay Two")
	assertCompanyQuery("Public research · 1 details")
	assertCompanyQuery("Public research · 2 detail")
}

func TestRelationshipSearchFindsTheDuplicateLines(t *testing.T) {
	f := newFixture(t)
	quiet, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Quiet Forge",
	})
	if err != nil {
		t.Fatal(err)
	}
	lumen, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Lumen Packet",
	})
	if err != nil {
		t.Fatal(err)
	}
	harbor, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Harbor Ledger",
	})
	if err != nil {
		t.Fatal(err)
	}
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Mill",
	})
	if err != nil {
		t.Fatal(err)
	}
	north, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Northwind Mail",
	})
	if err != nil {
		t.Fatal(err)
	}
	resolvedA, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Resolved Quay",
	})
	if err != nil {
		t.Fatal(err)
	}
	resolvedB, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Resolved Dock",
	})
	if err != nil {
		t.Fatal(err)
	}
	undoneA, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Undone Pier",
	})
	if err != nil {
		t.Fatal(err)
	}
	undoneB, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Undone Slip",
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = quiet
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(f.ctx)
	if _, err := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetProposedRelationship(lumen).
		SetExistingRelationship(harbor).
		SetDedupeKey("lumen-harbor-domain").
		SetAnchorKind("domain").
		SetAnchorKeyHash("lumen-harbor-domain-hash").
		SetStatus("pending").
		SetEvidenceCount(1).
		SetConfidence(0.8).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetProposedRelationship(cedar).
		SetExistingRelationship(north).
		SetDedupeKey("cedar-north-email").
		SetAnchorKind("email").
		SetAnchorProvider("gmail").
		SetAnchorPreview("ada@northwind.example").
		SetAnchorKeyHash("cedar-north-email-hash").
		SetStatus("deferred").
		SetEvidenceCount(2).
		SetConfidence(0.5).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetProposedRelationship(resolvedA).
		SetExistingRelationship(resolvedB).
		SetDedupeKey("resolved-meeting").
		SetAnchorKind("resource_ref").
		SetAnchorProvider("meeting").
		SetAnchorPreview("kickoff").
		SetAnchorKeyHash("resolved-meeting-hash").
		SetStatus("resolved").
		SetEvidenceCount(3).
		SetConfidence(1).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.RelationshipIdentityCandidate.Create().
		SetWorkspace(ws).
		SetUser(f.user).
		SetProposedRelationship(undoneA).
		SetExistingRelationship(undoneB).
		SetDedupeKey("undone-note").
		SetAnchorKind("email").
		SetAnchorProvider("desktop_note").
		SetAnchorPreview("old alias").
		SetAnchorKeyHash("undone-note-hash").
		SetStatus("undone").
		SetEvidenceCount(4).
		SetConfidence(0.1).
		Save(internal); err != nil {
		t.Fatal(err)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("1 supporting detail · 80% match", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Matched on Domain: not shown", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("2 supporting details · 50% match", "Cedar Mill", "Northwind Mail")
	assertCompanyQuery("Matched on Email from Gmail: ada@northwind.example", "Cedar Mill", "Northwind Mail")
	assertCompanyQuery("3 supporting details · 100% match", "Resolved Quay", "Resolved Dock")
	assertCompanyQuery("Matched on a linked record from A meeting: kickoff", "Resolved Quay", "Resolved Dock")
	assertCompanyQuery("4 supporting details · 10% match")
	assertCompanyQuery("Matched on Email from A note: old alias")
	assertCompanyQuery("1 supporting details · 80% match")
	assertCompanyQuery("1 supporting detail · 81% match")
	assertCompanyQuery("2 supporting detail · 50% match")
	assertCompanyQuery("Matched on Email: ada@northwind.example")
}

func TestRelationshipSearchFindsTheDuplicateInbox(t *testing.T) {
	f := newFixture(t)
	create := func(name, domain string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name, AccountDomain: domain,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	lumen := create("Lumen Packet", "")
	harbor := create("Harbor Ledger", "")
	cedar := create("Cedar Mill", "")
	acme := create("acme.example", "acme.example")
	north := create("Northwind Mail", "")
	resolvedA := create("Resolved Quay", "")
	resolvedB := create("Resolved Dock", "")
	undoneA := create("Undone Pier", "")
	undoneB := create("Undone Slip", "")
	resolvingA := create("Resolving Mill", "")
	resolvingB := create("Resolving Forge", "")
	quiet := create("Quiet Forge", "")
	_ = quiet
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(f.ctx)
	link := func(proposed, existing *ent.Relationship, key, status string) {
		t.Helper()
		if _, err := f.client.RelationshipIdentityCandidate.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetProposedRelationship(proposed).
			SetExistingRelationship(existing).
			SetDedupeKey(key).
			SetAnchorKind("domain").
			SetAnchorKeyHash(key + "-hash").
			SetStatus(status).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	link(lumen, harbor, "inbox-lumen-harbor", "pending")
	link(lumen, cedar, "inbox-lumen-cedar", "pending")
	link(acme, north, "inbox-acme-north", "deferred")
	link(resolvedA, resolvedB, "inbox-resolved", "resolved")
	link(undoneA, undoneB, "inbox-undone", "undone")
	link(resolvingA, resolvingB, "inbox-resolving", "resolving")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	visible := []string{
		"Lumen Packet", "Harbor Ledger", "Cedar Mill", "acme.example", "Northwind Mail",
		"Resolved Quay", "Resolved Dock",
	}
	one := []string{
		"Harbor Ledger", "Cedar Mill", "acme.example", "Northwind Mail",
		"Resolved Quay", "Resolved Dock",
	}
	assertCompanyQuery("Review possible duplicates", visible...)
	assertCompanyQuery("Needs your review", visible...)
	assertCompanyQuery("2 possible duplicates cannot receive actions until reviewed.", "Lumen Packet")
	assertCompanyQuery("1 possible duplicate cannot receive actions until reviewed.", one...)
	assertCompanyQuery("Lumen Packet may match Harbor Ledger", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Lumen Packet may match Cedar Mill", "Lumen Packet", "Cedar Mill")
	assertCompanyQuery("Acme may match Northwind Mail", "acme.example", "Northwind Mail")
	assertCompanyQuery("Harbor Ledger may match Lumen Packet")
	assertCompanyQuery("1 possible duplicates cannot receive actions until reviewed.")
	assertCompanyQuery("2 possible duplicate cannot receive actions until reviewed.")
	assertCompanyQuery("Undone Pier may match Undone Slip")
	assertCompanyQuery("Resolving Mill may match Resolving Forge")
}

func TestRelationshipSearchFindsTheRecommendationBadges(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	recommend := func(company *ent.Relationship, key, policy, approval, mode string, score int) {
		t.Helper()
		if _, err := f.client.RevenueAction.Create().
			SetWorkspace(ws).
			SetUser(f.user).
			SetRelationship(company).
			SetActionType("follow_up_task").
			SetChannel("task").
			SetDetector("manual").
			SetDedupeKey(key).
			SetRevisionHash(key + "-hash").
			SetReason("Mail the ledger excerpt").
			SetPolicyStatus(policy).
			SetApprovalStatus(approval).
			SetExecutionMode(mode).
			SetPriorityScore(score).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	review := create("Review Co")
	stale := create("Stale Co")
	pending := create("Pending Co")
	cleared := create("Cleared Co")
	blocked := create("Blocked Co")
	approved := create("Approved Co")
	rejected := create("Rejected Co")
	_ = create("Quiet Forge")
	recommend(review, "badge-review", PolicyReviewRequired, ApprovalPending, ExecModeDraft, 80)
	recommend(stale, "badge-stale", PolicyStale, ApprovalPending, ExecModeDraft, 50)
	recommend(pending, "badge-pending", PolicyPending, ApprovalPending, ExecModeDraft, 10)
	recommend(cleared, "badge-cleared", PolicyPassed, ApprovalPending, ExecModeSend, 80)
	recommend(blocked, "badge-blocked", PolicyBlocked, ApprovalPending, ExecModeDraft, 10)
	recommend(approved, "badge-approved", PolicyPassed, ApprovalApproved, ExecModeDraft, 50)
	recommend(rejected, "badge-rejected", PolicyBlocked, ApprovalRejected, ExecModeSend, 85)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Review required", "Review Co")
	assertCompanyQuery("Re-check needed", "Stale Co")
	assertCompanyQuery("re check needed", "Stale Co")
	assertCompanyQuery("Not checked", "Pending Co")
	assertCompanyQuery("Cleared", "Cleared Co", "Approved Co")
	assertCompanyQuery("Blocked", "Blocked Co", "Rejected Co")
	assertCompanyQuery("Approved", "Approved Co")
	assertCompanyQuery("Rejected", "Rejected Co")
	assertCompanyQuery("Draft", "Review Co", "Stale Co", "Pending Co", "Blocked Co", "Approved Co")
	assertCompanyQuery("Send", "Cleared Co", "Rejected Co")
	assertCompanyQuery("High", "Review Co", "Cleared Co", "Rejected Co")
	assertCompanyQuery("Medium", "Stale Co", "Approved Co")
	assertCompanyQuery("Low", "Pending Co", "Blocked Co")
	assertCompanyQuery("Awaiting approval")
	assertCompanyQuery("Approved in this workspace")
}

func TestRelationshipSearchFindsThePlanHeading(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	create := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	savePlan := func(company *ent.Relationship, stable string, version int, payload string) {
		t.Helper()
		sum := sha256.Sum256([]byte(payload))
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(company).
			SetKind("mutual_action_plan").SetStableID(stable).SetVersion(version).
			SetStatus("draft").SetSubjectRef(company.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(payload).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	draft := create("Plan Draft")
	approved := create("Plan Approved")
	unknown := create("Plan Unknown")
	revised := create("Plan Revised")
	_ = create("Plan Quiet")
	savePlan(draft, "plan:draft", 1, `{
		"status": "draft",
		"currentRevision": {"version": 1, "items": [
			{"itemId": "item-1", "title": "Send the security packet", "ownerParticipantRef": "Ada Quill"},
			{"itemId": "item-2", "title": "  ", "ownerParticipantRef": "owner_token"}
		]}
	}`)
	savePlan(approved, "plan:approved", 1, `{
		"status": "internally_approved",
		"currentRevision": {"version": 2, "items": [
			{"itemId": "item-3", "title": "Kickoff", "ownerParticipantRef": "owner_token"}
		]}
	}`)
	savePlan(unknown, "plan:unknown", 1, `{}`)
	savePlan(revised, "plan:revised", 1, `{
		"status": "draft",
		"currentRevision": {"version": 1, "items": [
			{"itemId": "item-old", "title": "Old step", "ownerParticipantRef": "owner_token"}
		]}
	}`)
	savePlan(revised, "plan:revised", 2, `{
		"status": "revised",
		"currentRevision": {"version": 2, "items": [
			{"itemId": "item-new", "title": "New step", "ownerParticipantRef": "owner_token"}
		]}
	}`)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}

	assertCompanyQuery("Draft · Version 1", "Plan Draft")
	assertCompanyQuery("Approve this plan", "Plan Draft", "Plan Revised")
	assertCompanyQuery("Send the security packet · Ada Quill", "Plan Draft")
	assertCompanyQuery("Untitled step", "Plan Draft")
	assertCompanyQuery("Approved in this workspace · Version 2", "Plan Approved")
	assertCompanyQuery("Draft an email to share this plan", "Plan Approved")
	assertCompanyQuery("Kickoff", "Plan Approved")
	assertCompanyQuery("Unknown · Version 1", "Plan Unknown")
	assertCompanyQuery("Revised · Version 2", "Plan Revised")
	assertCompanyQuery("New step", "Plan Revised")
	assertCompanyQuery("Draft · Version 2")
	assertCompanyQuery("Old step")
	assertCompanyQuery("which companies show draft · version 1", "Plan Draft")
}

func TestRelationshipSearchFindsPromiseLinks(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	savePromise := func(rel *ent.Relationship, text string) *ent.Commitment {
		t.Helper()
		row, err := f.client.Commitment.Create().
			SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
			SetDirection("promised_by_them").SetText(text).
			SetStatus("open").SetConfidence(1).SetAcceptance("accepted").
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	link := func(rel *ent.Relationship, from, to *ent.Commitment, kind string) {
		t.Helper()
		if _, err := f.svc.CreateCommitmentDependency(f.ctx, f.user, rel.ID, CommitmentDependencyInput{
			FromCommitmentID: from.ID, ToCommitmentID: to.ID, Kind: kind,
			EvidenceRefs: []string{"relationship-observation:" + kind},
		}); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Link Quiet")
	_ = quiet
	cedar := makeCompany("Link Cedar")
	cedarFrom := savePromise(cedar, "Send the cedar notes")
	cedarTo := savePromise(cedar, "Return the packet")
	link(cedar, cedarFrom, cedarTo, "blocks")
	harbor := makeCompany("Link Harbor")
	harborFrom := savePromise(harbor, "Send the harbor notes")
	harborMid := savePromise(harbor, "Return the ledger")
	harborTo := savePromise(harbor, "File the excerpt")
	link(harbor, harborFrom, harborMid, "blocks")
	link(harbor, harborFrom, harborTo, "requires")
	blank := makeCompany("Link Blank")
	blankFrom := savePromise(blank, "   ")
	blankTo := savePromise(blank, "Return the blank packet")
	link(blank, blankFrom, blankTo, "blocks")
	named := makeCompany("Link Named")
	namedFrom := savePromise(named, "Unknown promise")
	namedTo := savePromise(named, "Return the named packet")
	link(named, namedFrom, namedTo, "requires")
	replace := makeCompany("Link Replace")
	replaceFrom := savePromise(replace, "Send the replace notes")
	replaceTo := savePromise(replace, "Return the old packet")
	link(replace, replaceFrom, replaceTo, "supersedes")
	solo := makeCompany("Link Solo")
	_ = savePromise(solo, "   ")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	assertCompanyQuery("Promise links (1)", "Link Cedar", "Link Blank", "Link Named", "Link Replace")
	assertCompanyQuery("Promise links (2)", "Link Harbor")
	assertCompanyQuery("Promise links (0)")
	assertCompanyQuery("which companies show promise links (2)", "Link Harbor")
	assertCompanyQuery("Promise links", "Link Cedar", "Link Harbor", "Link Blank", "Link Named", "Link Replace")
	assertCompanyQuery("Unknown promise", "Link Blank", "Link Named")
	assertCompanyQuery("which companies show unknown promise", "Link Blank", "Link Named")
	assertCompanyQuery("Blocks", "Link Cedar", "Link Harbor", "Link Blank")
	assertCompanyQuery("Requires", "Link Harbor", "Link Named")
	assertCompanyQuery("Replaces", "Link Replace")
	assertCompanyQuery("links")
	assertCompanyQuery("promise", "Link Named")
	assertCompanyQuery("Blocks the packet")
}

func TestRelationshipSearchFindsDuplicateImpact(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	link := func(proposed, existing *ent.Relationship, status, impact, dedupe string) {
		t.Helper()
		if _, err := f.client.RelationshipIdentityCandidate.Create().
			SetWorkspace(ws).SetUser(f.user).
			SetProposedRelationship(proposed).SetExistingRelationship(existing).
			SetDedupeKey(dedupe).SetAnchorKind("domain").SetAnchorKeyHash(dedupe).
			SetStatus(status).SetImpactJSON(impact).
			Save(auth.WithInternal(f.ctx)); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Impact Quiet")
	_ = quiet
	event := makeCompany("Impact Event")
	twin := makeCompany("Impact Twin")
	link(event, twin, "pending", `{"observations":1}`, "impact-event")
	saved := makeCompany("Impact Saved")
	ledger := makeCompany("Impact Ledger")
	link(saved, ledger, "pending", `{"assertions":3,"evidence":2}`, "impact-saved")
	done := makeCompany("Impact Done")
	old := makeCompany("Impact Old")
	link(done, old, "resolved", `{"observations":4}`, "impact-done")
	undone := makeCompany("Impact Undone")
	gone := makeCompany("Impact Gone")
	link(undone, gone, "undone", `{"observations":5}`, "impact-undone")
	wait := makeCompany("Impact Wait")
	later := makeCompany("Impact Later")
	link(wait, later, "deferred", `{"assertions":1}`, "impact-wait")

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	openReview := []string{
		"Impact Event", "Impact Twin", "Impact Saved", "Impact Ledger", "Impact Wait", "Impact Later",
	}
	assertCompanyQuery("1 recorded event", "Impact Event", "Impact Twin")
	assertCompanyQuery("which companies show 1 recorded event", "Impact Event", "Impact Twin")
	assertCompanyQuery("4 recorded events", "Impact Done", "Impact Old")
	assertCompanyQuery("recorded events", "Impact Done", "Impact Old")
	assertCompanyQuery("5 recorded events")
	assertCompanyQuery("0 recorded events")
	assertCompanyQuery("3 saved details", "Impact Saved", "Impact Ledger")
	assertCompanyQuery("1 saved detail", "Impact Wait", "Impact Later")
	assertCompanyQuery("2 supporting records", "Impact Saved", "Impact Ledger")
	assertCompanyQuery("Keep separate", openReview...)
	assertCompanyQuery("Move the evidence", openReview...)
	assertCompanyQuery("Decide later", openReview...)
	assertCompanyQuery("which companies show decide later", openReview...)
}

func TestRelationshipSearchFindsRankingFactors(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveRank := func(rel *ent.Relationship, stableID string, version int, factors string) {
		t.Helper()
		payload := `{"evaluationId":"` + stableID + `","factors":[` + factors + `]}`
		sum := sha256.Sum256([]byte(payload))
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("recommendation_evaluation").SetStableID(stableID).SetVersion(version).
			SetStatus("ranked").SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(now).SetEvidenceRefs([]string{}).
			SetPayloadJSON(payload).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Rank Quiet")
	_ = quiet
	due := makeCompany("Rank Due")
	saveRank(due, "rank:due", 1, `{"factor":"commitment_due_state","contribution":12,"reason":"This promise is past due."}`)
	old := makeCompany("Rank Old")
	saveRank(old, "rank:old", 1, `{"factor":"commitment_due_state","contribution":8,"reason":"An accepted commitment is overdue."}`)
	cover := makeCompany("Rank Cover")
	saveRank(cover, "rank:cover", 1, `{"factor":"source_completeness","contribution":-2,"reason":"How complete the sources are changes where this sits."}`)
	learn := makeCompany("Rank Learn")
	saveRank(learn, "rank:learn", 1, `{"factor":"outcome_learning","contribution":5,"reason":"Earlier results change the order. They do not approve the action."}`)
	fresh := makeCompany("Rank Fresh")
	saveRank(fresh, "rank:fresh", 1, `{"factor":"source_completeness","contribution":3,"reason":"More complete fresh evidence increases confidence in ordering."}`)
	revised := makeCompany("Rank Revised")
	saveRank(revised, "rank:revised", 1, `{"factor":"commitment_due_state","contribution":12,"reason":"This promise is past due."}`)
	saveRank(revised, "rank:revised", 2, `{"factor":"source_completeness","contribution":4,"reason":"How complete the sources are changes where this sits."}`)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		got := namesOf(found.Relationships)
		if len(got) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, got, want)
		}
		for _, name := range want {
			if !hasName(got, name) {
				t.Fatalf("query %q = %v, want %v", query, got, want)
			}
		}
	}
	withFactors := []string{"Rank Due", "Rank Old", "Rank Cover", "Rank Learn", "Rank Fresh", "Rank Revised"}
	assertCompanyQuery("Inspect ranking factors", withFactors...)
	assertCompanyQuery("which companies show inspect ranking factors", withFactors...)
	assertCompanyQuery("Due date", "Rank Due", "Rank Old")
	assertCompanyQuery("Source coverage", "Rank Cover", "Rank Fresh", "Rank Revised")
	assertCompanyQuery("Earlier outcomes", "Rank Learn")
	assertCompanyQuery("This promise is past due.", "Rank Due", "Rank Old")
	assertCompanyQuery(
		"How complete the sources are changes where this sits.",
		"Rank Cover", "Rank Fresh", "Rank Revised",
	)
	assertCompanyQuery(
		"Earlier results change the order. They do not approve the action.",
		"Rank Learn",
	)
	assertCompanyQuery("Due date: +12 · This promise is past due.", "Rank Due")
	assertCompanyQuery("Due date: +8 · This promise is past due.", "Rank Old")
	assertCompanyQuery("Source coverage: +4 · How complete the sources are changes where this sits.", "Rank Revised")
	assertCompanyQuery("which companies show due date: +12 · this promise is past due.", "Rank Due")
}

func TestRelationshipSearchFindsReceiptOverflow(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveObservation := func(rel *ent.Relationship, externalID string, at time.Time, receiptID string) {
		t.Helper()
		facts := "{}"
		if receiptID != "" {
			body, err := json.Marshal(map[string]any{
				"governance_receipt": ConversationGovernanceReceipt{
					ReceiptID: receiptID, CapturePolicy: "manual_capture",
					Routing: "local_only", Region: "local_device", Retention: "always",
					ParticipantDisclosure: "not_recorded", DeletionOutcome: "not_applicable",
					EvidenceClip: "not_retained",
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			facts = string(body)
		}
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(at).SetReceivedAt(at).SetContentHash(externalID).
			SetNormalizedFactsJSON(facts).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveReceipts := func(rel *ent.Relationship, n int, at time.Time) {
		t.Helper()
		for i := 0; i < n; i++ {
			saveObservation(rel, rel.DisplayName+":"+strconv.Itoa(i), at.Add(time.Duration(i)*time.Second), "receipt-"+strconv.Itoa(i))
		}
	}
	five := makeCompany("Receipt Five")
	six := makeCompany("Receipt Six")
	seven := makeCompany("Receipt Seven")
	buried := makeCompany("Receipt Buried")
	now := time.Now().UTC()
	saveReceipts(five, 5, now)
	saveReceipts(six, 6, now)
	saveReceipts(seven, 7, now)
	saveReceipts(buried, 6, now.Add(-2*time.Hour))
	for i := 0; i < intelligenceObservationPage; i++ {
		saveObservation(buried, "buried-note:"+strconv.Itoa(i), now, "")
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Show the other 1 receipt", "Receipt Six")
	assertCompanyQuery("Show the other 2 receipts", "Receipt Seven")
	assertCompanyQuery("Show the other 1 receipts")
	assertCompanyQuery("Show the other 2 receipt")
	assertCompanyQuery("Consent and governance (5)", "Receipt Five")
	assertCompanyQuery("Consent and governance (6)", "Receipt Six", "Receipt Buried")
}

func TestRelationshipSearchFindsSuggestionCounts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name, lifecycle, next string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		update := f.client.Relationship.UpdateOneID(row.ID)
		if lifecycle != "" {
			update.SetLifecycle(lifecycle)
		}
		if next != "" {
			update.SetNextAction(next)
		}
		saved, err := update.Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return saved
	}
	saveClaim := func(rel *ent.Relationship, kind, externalID string, at time.Time) {
		t.Helper()
		facts, err := json.Marshal(map[string]any{
			"conversation_claims": []map[string]any{{
				"id": externalID, "kind": kind, "value": "The cue sentence",
			}},
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).SetEventType("conversation_evidence_compiled").
			SetOccurredAt(at).SetReceivedAt(at).SetContentHash(externalID).
			SetNormalizedFactsJSON(string(facts)).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	savePromise := func(rel *ent.Relationship, status string) {
		t.Helper()
		due := time.Now().Add(-24 * time.Hour)
		if _, err := f.client.Commitment.Create().
			SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
			SetDirection("promised_by_them").SetText("Send the cue packet").
			SetStatus(status).SetConfidence(1).SetDueAt(due).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	saveCase := func(rel *ent.Relationship, status string, sides int) {
		t.Helper()
		caseSides := make([]ConversationContradictionEvidenceSide, sides)
		for i := range caseSides {
			caseSides[i] = ConversationContradictionEvidenceSide{AssertionID: strconv.Itoa(i), Source: "user"}
		}
		payload, err := json.Marshal(ConversationContradictionCase{
			CaseID: rel.ID.String(), RelationshipID: rel.ID.String(), SubjectRef: rel.ID.String(),
			Dimension: "health", Status: status, Reason: "Two sources disagree.",
			Sides: caseSides, OpenedAt: time.Now().UTC().Format(time.RFC3339),
		})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(payload)
		if _, err := f.client.ConversationIntelligenceArtifact.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetKind("contradiction_case").SetStableID("cue:" + rel.ID.String()).SetVersion(1).
			SetStatus(status).SetSubjectRef(rel.ID.String()).
			SetEffectiveAt(time.Now().UTC()).SetEvidenceRefs([]string{}).
			SetPayloadJSON(string(payload)).SetPayloadHash(hex.EncodeToString(sum[:])).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	quiet := makeCompany("Suggest Quiet", "", "Keep the account")
	renew := makeCompany("Suggest Renew", "renewal", "Call them")
	gap := makeCompany("Suggest Gap", "evaluation", "")
	double := makeCompany("Suggest Double", "renewal", "")
	late := makeCompany("Suggest Late", "", "Keep the account")
	kept := makeCompany("Suggest Kept", "", "Keep the account")
	twice := makeCompany("Suggest Twice", "", "Keep the account")
	objection := makeCompany("Suggest Objection", "", "Keep the account")
	pair := makeCompany("Suggest Pair", "", "Keep the account")
	split := makeCompany("Suggest Split", "", "Keep the account")
	closed := makeCompany("Suggest Closed", "", "Keep the account")
	buried := makeCompany("Suggest Buried", "", "Keep the account")
	savePromise(late, "open")
	savePromise(kept, "fulfilled")
	savePromise(twice, "open")
	savePromise(twice, "open")
	now := time.Now().UTC()
	saveClaim(objection, "objection", "objection-a", now)
	saveClaim(objection, "objection", "objection-b", now)
	saveClaim(pair, "objection", "pair-objection", now)
	saveClaim(pair, "risk", "pair-risk", now)
	saveCase(split, "open", 2)
	saveCase(closed, "user_resolved", 2)
	saveClaim(buried, "objection", "buried-objection", now.Add(-2*time.Hour))
	for i := 0; i < intelligenceObservationPage; i++ {
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(buried).
			SetSource("meeting").SetExternalID("buried-note:" + strconv.Itoa(i)).
			SetEventType("conversation_evidence_compiled").
			SetOccurredAt(now).SetReceivedAt(now).SetContentHash("buried-note:" + strconv.Itoa(i)).
			SetNormalizedFactsJSON("{}").
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	expectCues := func(rel *ent.Relationship, want int) {
		t.Helper()
		intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, rel)
		if err != nil {
			t.Fatal(err)
		}
		if len(intelligence.LiveCues) != want {
			t.Fatalf("%s cues = %d, want %d (%+v)", rel.DisplayName, len(intelligence.LiveCues), want, intelligence.LiveCues)
		}
	}
	expectCues(quiet, 0)
	expectCues(renew, 1)
	expectCues(gap, 1)
	expectCues(double, 2)
	expectCues(late, 1)
	expectCues(kept, 0)
	expectCues(twice, 2)
	expectCues(objection, 1)
	expectCues(pair, 2)
	expectCues(split, 1)
	expectCues(closed, 0)
	expectCues(buried, 0)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Suggestions (1)", "Suggest Renew", "Suggest Gap", "Suggest Late", "Suggest Objection", "Suggest Split")
	assertCompanyQuery("Suggestions (2)", "Suggest Double", "Suggest Twice", "Suggest Pair")
	assertCompanyQuery("Suggestions (0)")
	assertCompanyQuery("Suggestions (3)")
	assertCompanyQuery("Suggestions (1+)")
}

func TestRelationshipSearchFindsEarlierPages(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	at := time.Now().UTC()
	saveNotes := func(rel *ent.Relationship, n int) {
		t.Helper()
		for i := 0; i < n; i++ {
			externalID := rel.DisplayName + ":" + strconv.Itoa(i)
			if _, err := f.client.RelationshipObservation.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
				SetSource("desktop_note").SetExternalID(externalID).
				SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
				SetSummary("A note").SetContentHash(externalID).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	internal := auth.WithInternal(context.Background())
	saveMail := func(rel *ent.Relationship, n int, removed bool) {
		t.Helper()
		for i := 0; i < n; i++ {
			objectID := rel.DisplayName + ":" + strconv.Itoa(i)
			if _, err := f.client.CommunicationInteraction.Create().
				SetWorkspace(ws).SetOwner(f.user).SetRelationshipID(rel.ID).
				SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID(objectID).
				SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
				SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
				SetContentHash("sha256:" + objectID).SetMetadataJSON(`{}`).SetDeleted(removed).
				Save(internal); err != nil {
				t.Fatal(err)
			}
		}
	}
	saveChanges := func(rel *ent.Relationship, n int) {
		t.Helper()
		for i := 1; i <= n; i++ {
			if _, err := f.client.RelationshipStateSnapshot.Create().
				SetWorkspace(ws).SetRelationship(rel).SetUser(f.user).
				SetVersion(i).SetStateJSON(`{}`).SetStateHash(rel.DisplayName + ":" + strconv.Itoa(i)).
				SetEvaluatedAt(at).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	quiet := makeCompany("Earlier Quiet")
	exact := makeCompany("Earlier Exact")
	activity := makeCompany("Earlier Activity")
	evidence := makeCompany("Earlier Evidence")
	mail := makeCompany("Earlier Mail")
	removed := makeCompany("Earlier Removed")
	change := makeCompany("Earlier Change")
	two := makeCompany("Earlier Two")
	_ = quiet
	saveNotes(exact, relationshipActivityPage)
	saveNotes(activity, relationshipActivityPage+1)
	saveNotes(evidence, intelligenceObservationPage+1)
	saveMail(mail, relationshipCommunicationPage+1, false)
	saveMail(removed, relationshipCommunicationPage+1, true)
	saveChanges(change, relationshipChangePage+1)
	saveChanges(two, relationshipChangePage)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Show earlier activity", "Earlier Activity", "Earlier Evidence")
	assertCompanyQuery("Show earlier activity.", "Earlier Activity", "Earlier Evidence")
	assertCompanyQuery("Show earlier evidence", "Earlier Evidence")
	assertCompanyQuery("Show earlier mail and meetings", "Earlier Mail")
	assertCompanyQuery("Show earlier changes", "Earlier Change")
	assertCompanyQuery("Show earlier")
}

func TestRelationshipSearchFindsOlderReview(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveNotes := func(rel *ent.Relationship, n int, at time.Time) {
		t.Helper()
		for i := 0; i < n; i++ {
			externalID := rel.DisplayName + ":" + strconv.Itoa(i)
			if _, err := f.client.RelationshipObservation.Create().
				SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
				SetSource("desktop_note").SetExternalID(externalID).
				SetEventType("note").SetOccurredAt(at).SetReceivedAt(at).
				SetSummary("A note").SetContentHash(externalID).
				Save(f.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	saveFacts := func(rel *ent.Relationship, externalID string, at time.Time, facts map[string]any) *ent.RelationshipObservation {
		t.Helper()
		raw, err := json.Marshal(facts)
		if err != nil {
			t.Fatal(err)
		}
		row, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("meeting").SetExternalID(externalID).
			SetEventType("conversation_evidence_compiled").
			SetOccurredAt(at).SetReceivedAt(at).
			SetContentHash(externalID).SetNormalizedFactsJSON(string(raw)).
			Save(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	claimFacts := func(id, kind string, confidence, speaker float64) map[string]any {
		return map[string]any{
			"conversation_claims": []map[string]any{{
				"id": id, "kind": kind, "value": "The packet is late",
				"confidence": confidence, "speakerConfidence": speaker,
			}},
		}
	}
	candidateFacts := func() map[string]any {
		return map[string]any{
			"conversation_claim_candidates": []map[string]any{{
				"candidateId": "candidate-risk", "kind": "risk",
				"displayValue": "Security review may delay renewal", "confidence": 0.96,
			}},
		}
	}
	now := time.Now().UTC()
	older := now.Add(-2 * time.Hour)
	quiet := makeCompany("Older Quiet")
	page := makeCompany("Older Page")
	open := makeCompany("Older Open")
	claimed := makeCompany("Older Claim")
	buried := makeCompany("Older Buried")
	fixed := makeCompany("Older Fixed")
	sure := makeCompany("Older Sure")
	speaker := makeCompany("Older Speaker")
	heard := makeCompany("Older Heard")
	role := makeCompany("Older Role")
	candidate := makeCompany("Older Candidate")
	decided := makeCompany("Older Decided")
	deferred := makeCompany("Older Deferred")
	half := makeCompany("Older Half")
	_ = quiet
	saveNotes(page, intelligenceObservationPage, now)
	saveNotes(open, intelligenceObservationPage+1, now)
	saveNotes(claimed, intelligenceObservationPage, older)
	saveNotes(buried, intelligenceObservationPage, now)
	saveNotes(fixed, intelligenceObservationPage, older)
	saveNotes(sure, intelligenceObservationPage, older)
	saveNotes(speaker, intelligenceObservationPage, older)
	saveNotes(heard, intelligenceObservationPage, older)
	saveNotes(role, intelligenceObservationPage, older)
	saveNotes(candidate, intelligenceObservationPage, older)
	saveNotes(decided, intelligenceObservationPage, older)
	saveNotes(deferred, intelligenceObservationPage, older)
	saveNotes(half, intelligenceObservationPage, older)
	saveFacts(claimed, "older-claim", now, claimFacts("weak-claim", "risk", 0.2, 0.95))
	saveFacts(buried, "older-buried", older.Add(-time.Hour), claimFacts("buried-claim", "risk", 0.2, 0.95))
	fixedClaim := saveFacts(fixed, "older-fixed", now, claimFacts("fixed-claim", "risk", 0.2, 0.95))
	saveFacts(fixed, "older-fixed-correction", now.Add(time.Minute), map[string]any{
		"review_correction": map[string]any{
			"review_item_id": reviewItemID(fixedClaim.ID.String(), "fixed-claim", "claim"),
			"kind":           "claim", "claim_id": "fixed-claim",
			"observation_id": fixedClaim.ID.String(), "corrected_value": "The packet is on time",
		},
	})
	saveFacts(sure, "older-sure", now, claimFacts("sure-claim", "risk", 0.95, 0.95))
	saveFacts(speaker, "older-speaker", now, claimFacts("speaker-claim", "risk", 0.95, 0.2))
	heardClaim := saveFacts(heard, "older-heard", now, claimFacts("heard-claim", "risk", 0.95, 0.2))
	saveFacts(heard, "older-heard-correction", now.Add(time.Minute), map[string]any{
		"review_correction": map[string]any{
			"review_item_id": reviewItemID(heardClaim.ID.String(), "heard-claim", "speaker"),
			"kind":           "speaker", "claim_id": "heard-claim",
			"observation_id": heardClaim.ID.String(), "corrected_value": "Ada",
		},
	})
	saveFacts(role, "older-role", now, claimFacts("role-claim", "stakeholder", 0.8, 0.95))
	saveFacts(candidate, "older-candidate", now, candidateFacts())
	decidedClaim := saveFacts(decided, "older-decided", now, candidateFacts())
	saveFacts(decided, "older-decided-choice", now.Add(time.Minute), map[string]any{
		"review_decision": map[string]any{
			"item_id": reviewItemID(decidedClaim.ID.String(), "candidate-risk", "candidate"),
			"kind":    "approve", "candidate_id": "candidate-risk",
			"observation_id": decidedClaim.ID.String(),
		},
	})
	deferredClaim := saveFacts(deferred, "older-deferred", now, candidateFacts())
	saveFacts(deferred, "older-deferred-choice", now.Add(time.Minute), map[string]any{
		"review_decision": map[string]any{
			"item_id": reviewItemID(deferredClaim.ID.String(), "candidate-risk", "candidate"),
			"kind":    "defer", "candidate_id": "candidate-risk",
			"observation_id": deferredClaim.ID.String(),
		},
	})
	halfClaim := saveFacts(half, "older-half", now, claimFacts("half-claim", "risk", 0.2, 0.2))
	saveFacts(half, "older-half-correction", now.Add(time.Minute), map[string]any{
		"review_correction": map[string]any{
			"review_item_id": reviewItemID(halfClaim.ID.String(), "half-claim", "speaker"),
			"kind":           "speaker", "claim_id": "half-claim",
			"observation_id": halfClaim.ID.String(), "corrected_value": "Ada",
		},
	})

	assertReview := func(rel *ent.Relationship, items int, hasMore bool) {
		t.Helper()
		intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, rel)
		if err != nil {
			t.Fatal(err)
		}
		if len(intelligence.ReviewItems) != items || intelligence.ObservationPageHasMore != hasMore {
			t.Fatalf("%s review items = %d hasMore %v, want %d hasMore %v",
				rel.DisplayName, len(intelligence.ReviewItems), intelligence.ObservationPageHasMore, items, hasMore)
		}
	}
	assertReview(open, 0, true)
	assertReview(page, 0, false)
	assertReview(claimed, 2, true)
	assertReview(buried, 0, true)
	assertReview(fixed, 0, true)
	assertReview(sure, 0, true)
	assertReview(speaker, 1, true)
	assertReview(heard, 0, true)
	assertReview(role, 1, true)
	assertReview(candidate, 1, true)
	assertReview(decided, 0, true)
	assertReview(deferred, 1, true)
	assertReview(half, 2, true)

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	want := []string{"Older Open", "Older Buried", "Older Fixed", "Older Sure", "Older Heard", "Older Decided"}
	assertCompanyQuery("Older conversations may still need review.", want...)
	assertCompanyQuery("Older conversations may still need review", want...)
}

func TestRelationshipSearchFindsMailAccess(t *testing.T) {
	f, teammate, teammateCtx, ws := communicationPrivacyFixture(t)
	internal := auth.WithInternal(context.Background())
	at := time.Now().UTC()
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveMail := func(rel *ent.Relationship, owner *ent.User, account, object, email string, removed bool) *ent.CommunicationInteraction {
		t.Helper()
		row, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(owner).SetRelationshipID(rel.ID).
			SetSource("gmail").SetSourceAccountID(account).SetProviderObjectID(object).
			SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
			SetOccurredAt(at).SetReceivedAt(at).SetVisibility("metadata").
			SetContentHash("sha256:" + object).SetMetadataJSON(`{}`).SetDeleted(removed).
			Save(internal)
		if err != nil {
			t.Fatal(err)
		}
		if email != "" {
			if _, err := f.client.CommunicationParticipant.Create().
				SetWorkspace(ws).SetInteraction(row).SetEmail(email).
				SetRole("to").SetExternal(true).Save(internal); err != nil {
				t.Fatal(err)
			}
		}
		return row
	}
	quiet := makeCompany("Mail Quiet")
	mine := makeCompany("Mail Mine")
	ownerRule := makeCompany("Mail Owner Rule")
	shared := makeCompany("Mail Shared")
	private := makeCompany("Mail Private")
	blocked := makeCompany("Mail Blocked")
	protected := makeCompany("Mail Shield")
	domain := makeCompany("Mail Domain")
	granted := makeCompany("Mail Granted")
	expired := makeCompany("Mail Expired")
	removed := makeCompany("Mail Removed")
	_ = quiet
	saveMail(mine, teammate, "teammate@x.co", "mine-message", "buyer@mine.example", false)
	saveMail(ownerRule, teammate, "teammate@x.co", "owner-message", "buyer@owner-rule.example", false)
	saveMail(shared, f.user, "shared@x.co", "shared-message", "buyer@shared.example", false)
	saveMail(private, f.user, "private@x.co", "private-message", "buyer@private.example", false)
	saveMail(blocked, f.user, "shared@x.co", "blocked-message", "buyer@blocked.example", false)
	saveMail(protected, f.user, "shared@x.co", "protected-message", "buyer@protected.example", false)
	saveMail(domain, f.user, "shared@x.co", "domain-message", "buyer@domain.example", false)
	saveMail(granted, f.user, "shared@x.co", "grant-message", "buyer@grant.example", false)
	saveMail(expired, f.user, "shared@x.co", "expired-message", "buyer@expired.example", false)
	saveMail(removed, teammate, "teammate@x.co", "removed-message", "buyer@removed.example", true)
	if _, err := f.client.CommunicationPrivacyRule.Create().
		SetWorkspace(ws).SetOwner(teammate).
		SetKind("protected_address").SetValue("buyer@owner-rule.example").
		SetValueHash(privacyValueHash("buyer@owner-rule.example")).SetActive(true).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UpsertCommunicationPolicy(f.ctx, f.user, "private@x.co", CommunicationPolicyInput{
		MetadataVisibility: "private", ShareSubject: true, RetentionDays: 30,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateCommunicationPrivacyRule(f.ctx, f.user, CommunicationRuleInput{
		Kind: "blocked_address", Value: "buyer@blocked.example",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateCommunicationPrivacyRule(f.ctx, f.user, CommunicationRuleInput{
		Kind: "protected_address", Value: "buyer@protected.example",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateCommunicationPrivacyRule(f.ctx, f.user, CommunicationRuleInput{
		Kind: "protected_domain", Value: "domain.example",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.GrantCommunicationAccess(f.ctx, f.user, CommunicationGrantInput{
		Scope: "body", ResourceType: "message", ResourceID: "grant-message", GranteeID: &teammate.ID,
	}); err != nil {
		t.Fatal(err)
	}
	f.svc.now = func() time.Time { return at }
	later := at.Add(time.Hour)
	if _, err := f.svc.GrantCommunicationAccess(f.ctx, f.user, CommunicationGrantInput{
		Scope: "body", ResourceType: "message", ResourceID: "expired-message",
		GranteeID: &teammate.ID, ExpiresAt: &later,
	}); err != nil {
		t.Fatal(err)
	}
	f.svc.now = func() time.Time { return at.Add(2 * time.Hour) }

	assertCompanyQuery := func(actorCtx context.Context, actor *ent.User, query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(actorCtx, actor, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery(teammateCtx, teammate, "Your mailbox", "Mail Mine", "Mail Owner Rule")
	assertCompanyQuery(teammateCtx, teammate, "Protected", "Mail Shield", "Mail Domain")
	assertCompanyQuery(teammateCtx, teammate, "Kept private", "Mail Private", "Mail Blocked")
	assertCompanyQuery(teammateCtx, teammate, "Shared with you", "Mail Granted")
	assertCompanyQuery(teammateCtx, teammate, "Shared in this workspace", "Mail Shared", "Mail Expired")
	assertCompanyQuery(f.ctx, f.user, "Your mailbox",
		"Mail Shared", "Mail Private", "Mail Blocked", "Mail Shield", "Mail Domain", "Mail Granted", "Mail Expired")
	assertCompanyQuery(f.ctx, f.user, "Shared in this workspace", "Mail Mine")
	assertCompanyQuery(f.ctx, f.user, "Protected", "Mail Owner Rule")
	assertCompanyQuery(f.ctx, f.user, "mailbox")
}

func TestRelationshipSearchFindsHiddenReceipts(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveNote := func(rel *ent.Relationship, externalID string, ago time.Duration, facts string) {
		t.Helper()
		now := time.Now().UTC()
		if _, err := f.client.RelationshipObservation.Create().
			SetWorkspace(ws).SetUser(f.user).SetRelationship(rel).
			SetSource("user").SetExternalID(externalID).SetEventType("note").
			SetOccurredAt(now.Add(-ago)).SetReceivedAt(now).SetSummary("A recorded note").
			SetNormalizedFactsJSON(facts).SetContentHash(externalID).
			Save(f.ctx); err != nil {
			t.Fatal(err)
		}
	}
	receiptFacts := func(id string) string {
		t.Helper()
		body, err := json.Marshal(map[string]any{
			"governance_receipt": ConversationGovernanceReceipt{
				ReceiptID: id, CapturePolicy: "manual_capture", Routing: "local_only",
				Region: "local_device", Retention: "always", ParticipantDisclosure: "not_recorded",
				DeletionOutcome: "not_applicable", EvidenceClip: "not_retained",
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		return string(body)
	}
	fillReceipts := func(rel *ent.Relationship, prefix string, count int, older bool) {
		t.Helper()
		for i := 1; i <= count; i++ {
			ago := time.Duration(i) * time.Second
			if older {
				ago = time.Duration(1000+i) * time.Second
			}
			saveNote(rel, fmt.Sprintf("%s-%02d", prefix, i), ago, receiptFacts(fmt.Sprintf("%s-%02d", prefix, i)))
		}
	}
	quill := makeCompany("Quill North")
	cedar := makeCompany("Cedar Slide")
	aspen := makeCompany("Aspen Ledger")
	birch := makeCompany("Birch Quiet")
	makeCompany("Harbor Quiet")
	fillReceipts(quill, "quill-receipt", governanceReceiptPage+1, false)
	fillReceipts(cedar, "cedar-receipt", governanceReceiptPage, false)
	fillReceipts(aspen, "aspen-receipt", governanceReceiptPage+2, false)
	for i := 1; i <= intelligenceObservationPage; i++ {
		saveNote(birch, fmt.Sprintf("birch-note-%03d", i), time.Duration(i)*time.Second, "{}")
	}
	fillReceipts(birch, "birch-receipt", governanceReceiptPage+1, true)

	page := func(rel *ent.Relationship) (bool, int) {
		t.Helper()
		intelligence, err := f.svc.RelationshipIntelligenceFor(f.ctx, rel)
		if err != nil {
			t.Fatal(err)
		}
		return intelligence.ObservationPageHasMore, len(intelligence.GovernanceReceipts)
	}
	if hasMore, receipts := page(quill); hasMore || receipts != governanceReceiptPage+1 {
		t.Fatalf("quill page = hasMore %v receipts %d", hasMore, receipts)
	}
	if hasMore, receipts := page(cedar); hasMore || receipts != governanceReceiptPage {
		t.Fatalf("cedar page = hasMore %v receipts %d", hasMore, receipts)
	}
	if hasMore, receipts := page(aspen); hasMore || receipts != governanceReceiptPage+2 {
		t.Fatalf("aspen page = hasMore %v receipts %d", hasMore, receipts)
	}
	if hasMore, receipts := page(birch); !hasMore || receipts != 0 {
		t.Fatalf("birch page = hasMore %v receipts %d", hasMore, receipts)
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Show the other 1 receipt", "Quill North")
	assertCompanyQuery("which companies show the other 1 receipt", "Quill North")
	assertCompanyQuery("Show the other 2 receipts", "Aspen Ledger")
	assertCompanyQuery("Consent and governance (6)", "Quill North")
	assertCompanyQuery("Consent and governance (5)", "Cedar Slide")
	assertCompanyQuery("Consent and governance (7)", "Aspen Ledger")
	assertCompanyQuery("Consent and governance", "Quill North", "Cedar Slide", "Aspen Ledger")
	assertCompanyQuery("Show the other 1 receipts")
	assertCompanyQuery("show the other")
	assertCompanyQuery("receipt")
	assertCompanyQuery("receipts")
}

func TestRelationshipSearchFindsMailBodyBadges(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	teammate := newUser(t, f.client, "teammate@x.co", "user_mail_badge")
	if _, err := f.svc.UpsertWorkspaceMember(f.ctx, f.user, teammate.ID, "member"); err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	makeCompany := func(name string) *ent.Relationship {
		t.Helper()
		row, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
			Kind: "company", DisplayName: name,
		})
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	saveMail := func(rel *ent.Relationship, owner *ent.User, objectID, account string, ago time.Duration, removed bool) *ent.CommunicationInteraction {
		t.Helper()
		now := time.Now().UTC()
		row, err := f.client.CommunicationInteraction.Create().
			SetWorkspace(ws).SetOwner(owner).SetRelationship(rel).
			SetSource("gmail").SetSourceAccountID(account).SetProviderObjectID(objectID).
			SetInteractionType("email").SetDirection("inbound").SetSubject("Hello").
			SetOccurredAt(now.Add(-ago)).SetReceivedAt(now).SetVisibility("metadata").
			SetContentHash("sha256:" + objectID).SetMetadataJSON(`{"threadId":"thread-` + objectID + `"}`).
			SetDeleted(removed).Save(internal)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.client.CommunicationParticipant.Create().
			SetWorkspace(ws).SetInteraction(row).SetEmail("buyer@example.com").
			SetRole("from").SetExternal(true).Save(internal); err != nil {
			t.Fatal(err)
		}
		return row
	}
	quill := makeCompany("Quill North")
	cedar := makeCompany("Cedar Slide")
	aspen := makeCompany("Aspen Ledger")
	birch := makeCompany("Birch Quiet")
	maple := makeCompany("Maple Kept")
	lumen := makeCompany("Lumen Fold")
	pine := makeCompany("Pine Rest")
	makeCompany("Harbor Quiet")
	saveMail(quill, f.user, "quill-mail", "owner@x.co", time.Second, false)
	saveMail(cedar, teammate, "cedar-mail", "cedar@x.co", time.Second, false)
	saveMail(aspen, teammate, "aspen-mail", "teammate@x.co", time.Second, false)
	birchMail := saveMail(birch, teammate, "birch-mail", "teammate@x.co", time.Second, false)
	saveMail(maple, teammate, "maple-mail", "cedar@x.co", time.Second, true)
	lumenMail := saveMail(lumen, teammate, "lumen-mail", "cedar@x.co", time.Second, false)
	for i := 1; i <= communicationTimelinePage; i++ {
		saveMail(pine, f.user, fmt.Sprintf("pine-mail-%02d", i), "owner@x.co", time.Duration(i)*time.Second, false)
	}
	saveMail(pine, teammate, "pine-old", "cedar@x.co", time.Hour, false)
	if _, err := f.client.CommunicationParticipant.Update().
		Where(communicationparticipant.HasInteractionWith(communicationinteraction.IDEQ(birchMail.ID))).
		SetEmail("buyer@private.example").Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationPrivacyPolicy.Create().
		SetWorkspace(ws).SetOwner(teammate).SetSourceAccountID("teammate@x.co").
		SetMetadataVisibility("workspace").SetShareBody(true).Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationPrivacyRule.Create().
		SetWorkspace(ws).SetOwner(teammate).SetKind("protected_domain").SetValue("private.example").
		SetValueHash(privacyValueHash("private.example")).SetActive(true).Save(internal); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationShareGrant.Create().
		SetWorkspace(ws).SetOwner(teammate).SetGrantee(f.user).
		SetScope("body").SetResourceType("message").SetResourceID(lumenMail.ProviderObjectID).
		Save(internal); err != nil {
		t.Fatal(err)
	}

	locked := func(rel *ent.Relationship) bool {
		t.Helper()
		page, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, nil, nil, communicationTimelinePage)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range page.Items {
			if item.BodyLocked {
				return true
			}
		}
		return false
	}
	shared := func(rel *ent.Relationship) bool {
		t.Helper()
		page, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, nil, nil, communicationTimelinePage)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range page.Items {
			if !item.BodyLocked {
				return true
			}
		}
		return false
	}
	if !shared(quill) || locked(quill) {
		t.Fatal("owner mail should be shared")
	}
	if !locked(cedar) || shared(cedar) {
		t.Fatal("teammate mail should be locked")
	}
	if !shared(aspen) || locked(aspen) {
		t.Fatal("a shared body should be shared")
	}
	if !locked(birch) || shared(birch) {
		t.Fatal("a protected recipient should be locked")
	}
	if locked(maple) || shared(maple) {
		t.Fatal("deleted mail should not show a badge")
	}
	if !shared(lumen) || locked(lumen) {
		t.Fatal("an explicit body grant should be shared")
	}
	if !shared(pine) || locked(pine) {
		t.Fatal("mail past the first page should not show its badge")
	}

	assertCompanyQuery := func(query string, want ...string) {
		t.Helper()
		found, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		names := namesOf(found.Relationships)
		if len(names) != len(want) {
			t.Fatalf("query %q = %v, want %v", query, names, want)
		}
		for _, name := range want {
			if !hasName(names, name) {
				t.Fatalf("query %q = %v, want %v", query, names, want)
			}
		}
	}
	assertCompanyQuery("Shared", "Quill North", "Aspen Ledger", "Lumen Fold", "Pine Rest")
	assertCompanyQuery("Locked", "Cedar Slide", "Birch Quiet")
	assertCompanyQuery("lock")
	assertCompanyQuery("share")
}

func hasName(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}
