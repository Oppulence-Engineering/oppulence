package revenue

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
	assertCompanyQuery("0 of 8 details have a source", "Quill Atelier")
	assertCompanyQuery("1 of 8 details come from a source you can open", "Lumen Packet")
	assertCompanyQuery("2 of 8 details have a source")
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
	assertCompanyQuery("source")
	assertCompanyQuery("missing")
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
	assertCompanyQuery("Some details are still missing", "Quill Atelier")
	assertCompanyQuery("Needs a review before you act", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Identity review is required before acting on this relationship", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("1 identity review blocks acting", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Details are current")
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
	assertCompanyQuery("Some details are still missing", "Mesa Clay")
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
	assertCompanyQuery("This detail has no source you can open", "Harbor Ledger")
	assertCompanyQuery("Nothing connected has filled this in", "Quill Atelier", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("Not filled in yet", "Quill Atelier", "Lumen Packet", "Harbor Ledger")
	assertCompanyQuery("From a connected source")
	assertCompanyQuery("person")
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
}

func hasName(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}
