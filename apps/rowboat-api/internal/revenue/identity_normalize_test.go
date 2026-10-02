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
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipidentity"
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
		SetLastActivityAt(when).
		SetReplyState("quiet").
		SetRelationship(quiet).
		Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.MailThread.Create().
		SetUser(f.user).
		SetProviderThreadID("harbor-blank").
		SetSubject("").
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
		SetLastActivityAt(when).
		SetReplyState("awaiting_reply").
		SetRelationship(waiting).
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
	assertCompanyQuery("Quiet", "Quill Atelier")
	assertCompanyQuery("gmail")
	assertCompanyQuery("date")
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
	if _, err := f.client.Relationship.UpdateOneID(healthy.ID).SetLifecycle("active_customer").Save(f.ctx); err != nil {
		t.Fatal(err)
	}
	active, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Active Customer"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(active.Relationships); len(got) != 1 || got[0] != "Quill Atelier" {
		t.Fatalf("active customer = %v", got)
	}
	prospects, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "Prospect"})
	if err != nil {
		t.Fatal(err)
	}
	if got := namesOf(prospects.Relationships); !hasName(got, "Lumen Packet") || hasName(got, "Quill Atelier") {
		t.Fatalf("prospect = %v", got)
	}
}

func hasName(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}
