package revenue

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"

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
	if err != nil || len(found) != 1 || found[0].AccountDomain != "dogfood-label.example" {
		t.Fatalf("title search = %+v err=%v", found, err)
	}
	miss, err := f.svc.ListRelationshipsFiltered(f.ctx, f.user, RelationshipListFilter{Query: "zzzz-not-a-company"})
	if err != nil || len(miss) != 0 {
		t.Fatalf("unrelated search = %+v err=%v", miss, err)
	}
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
	if len(args) != 3 || args[0] != "%dogfood label%" {
		t.Fatalf("args = %#v", args)
	}
}
