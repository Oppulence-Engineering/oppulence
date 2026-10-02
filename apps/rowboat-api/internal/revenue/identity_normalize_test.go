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

func hasName(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}
