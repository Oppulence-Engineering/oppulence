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
	assertCompanyQuery("gmail", "Quill Atelier", "Harbor Ledger")
	assertCompanyQuery("the quill invoice", "Quill Atelier")
	assertCompanyQuery("quill invoice", "Quill Atelier")
	assertCompanyQuery("ada@northwind.example", "Northwind Ledger")
	assertCompanyQuery("1 message", "Quill Atelier")
	assertCompanyQuery("2 messages", "Northwind Ledger")
	assertCompanyQuery("0 messages", "Harbor Ledger")
	assertCompanyQuery("date")
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

func hasName(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}
