package revenue

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
)

func TestListWorkspaceNotesCollapsesEditsAndSkipsOtherCompanies(t *testing.T) {
	f := newFixture(t)
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Notes", AccountDomain: "cedar-notes.example",
	})
	if err != nil {
		t.Fatalf("cedar: %v", err)
	}
	pine, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Pine Notes", AccountDomain: "pine-notes.example",
	})
	if err != nil {
		t.Fatalf("pine: %v", err)
	}
	person, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Ada Notes", PrimaryEmail: "ada-notes@example.com",
		AccountDomain: "ada-notes.example",
	})
	if err != nil {
		t.Fatalf("person: %v", err)
	}
	other := newUser(t, f.client, "other-notes@x.co", "user_other_notes")
	otherCtx := auth.WithUser(context.Background(), other)
	otherCompany, err := f.svc.CreateRelationship(otherCtx, other, RelationshipInput{
		Kind: "company", DisplayName: "Other Notes", AccountDomain: "other-notes.example",
	})
	if err != nil {
		t.Fatalf("other company: %v", err)
	}

	sept := func(day, hour int) time.Time {
		return time.Date(2026, 9, day, hour, 0, 0, 0, time.UTC)
	}
	observations := []RelationshipObservationInput{
		{
			RelationshipID: pine.ID, Source: "desktop_note", ExternalID: "pine-note",
			EventType: "note", OccurredAt: sept(1, 12), Summary: "Pine title",
			Facts: map[string]any{"noteId": "pine-note", "title": "Pine title", "body": "Pine body"},
		},
		{
			RelationshipID: cedar.ID, Source: "desktop_note", ExternalID: "cedar-original",
			EventType: "note", OccurredAt: sept(2, 12), Summary: "Original title",
			Facts: map[string]any{
				"noteId": "cedar-edit", "title": "Original title", "body": "Original body",
				"meetingLinked": true,
			},
		},
		{
			RelationshipID: cedar.ID, Source: "desktop_note", ExternalID: "cedar-edited",
			EventType: "note", OccurredAt: sept(3, 12), Summary: "Edited title",
			Facts: map[string]any{
				"noteId": "cedar-edit", "title": "Edited title", "body": "Edited body",
				"meetingLinked": true, "liveLinked": true,
				"content": []any{map[string]any{"type": "p"}},
			},
		},
		{
			RelationshipID: cedar.ID, Source: "desktop_note", ExternalID: "cedar-dropped",
			EventType: "note", OccurredAt: sept(1, 15), Summary: "Dropped title",
			Facts: map[string]any{"noteId": "cedar-dropped", "title": "Dropped title", "body": "Gone"},
		},
		{
			RelationshipID: cedar.ID, Source: "desktop_note", ExternalID: "cedar-deleted",
			EventType: "note_deleted", OccurredAt: sept(4, 12), Summary: "Dropped title",
			Facts: map[string]any{"noteId": "cedar-dropped"},
		},
		{
			RelationshipID: cedar.ID, Source: "gmail", ExternalID: "cedar-mail",
			EventType: "message", OccurredAt: sept(5, 12), Summary: "A mail thread",
			Facts: map[string]any{"noteId": "not-a-note", "title": "Mail"},
		},
		{
			RelationshipID: person.ID, Source: "desktop_note", ExternalID: "person-note",
			EventType: "note", OccurredAt: sept(6, 12), Summary: "Person note",
			Facts: map[string]any{"noteId": "person-note", "title": "Person note", "body": "Hidden"},
		},
	}
	if _, err := f.svc.IngestRelationshipObservationCandidates(f.ctx, f.user, observations); err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if _, err := f.svc.IngestRelationshipObservationCandidates(otherCtx, other, []RelationshipObservationInput{{
		RelationshipID: otherCompany.ID, Source: "desktop_note", ExternalID: "other-note",
		EventType: "note", OccurredAt: sept(7, 12), Summary: "Other title",
		Facts: map[string]any{"noteId": "other-note", "title": "Other title", "body": "Elsewhere"},
	}}); err != nil {
		t.Fatalf("ingest other: %v", err)
	}

	page, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 50, 0, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if page.HasMore {
		t.Fatal("two notes should fit on one page")
	}
	if len(page.Notes) != 2 {
		t.Fatalf("notes = %+v, want the edited cedar note and the pine note", page.Notes)
	}
	if page.Notes[0].Title != "Edited title" || page.Notes[0].Body != "Edited body" ||
		page.Notes[0].RelationshipName != "Cedar Notes" || !page.Notes[0].MeetingLinked ||
		!page.Notes[0].LiveLinked || page.Notes[0].ExternalID != "cedar-edit" || page.Notes[0].Content == nil {
		t.Fatalf("newest note = %+v", page.Notes[0])
	}
	if page.Notes[1].Title != "Pine title" || page.Notes[1].RelationshipName != "Pine Notes" {
		t.Fatalf("older note = %+v", page.Notes[1])
	}

	first, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 1, 0, "")
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if !first.HasMore || len(first.Notes) != 1 || first.Notes[0].ExternalID != "cedar-edit" {
		t.Fatalf("first page = %+v", first)
	}
	second, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 1, 1, "")
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if second.HasMore || len(second.Notes) != 1 || second.Notes[0].ExternalID != "pine-note" {
		t.Fatalf("second page = %+v", second)
	}
	if _, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, -1, 0, ""); err == nil {
		t.Fatal("negative limit was accepted")
	}
}

func TestListWorkspaceNotesReadsPastARevisionBatch(t *testing.T) {
	previous := workspaceNoteReadBatch
	workspaceNoteReadBatch = 2
	t.Cleanup(func() { workspaceNoteReadBatch = previous })

	f := newFixture(t)
	cedar, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Edits", AccountDomain: "cedar-edits.example",
	})
	if err != nil {
		t.Fatalf("cedar: %v", err)
	}
	pine, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Pine Kept", AccountDomain: "pine-kept.example",
	})
	if err != nil {
		t.Fatalf("pine: %v", err)
	}
	at := func(hour int) time.Time {
		return time.Date(2026, 9, 2, hour, 0, 0, 0, time.UTC)
	}
	observations := []RelationshipObservationInput{
		{
			RelationshipID: pine.ID, Source: "desktop_note", ExternalID: "pine-kept",
			EventType: "note", OccurredAt: at(1), Summary: "Pine kept",
			Facts: map[string]any{"noteId": "pine-kept", "title": "Pine kept", "body": "Still here"},
		},
	}
	for hour, title := range map[int]string{2: "Draft", 3: "Revised", 4: "Edited Cedar"} {
		observations = append(observations, RelationshipObservationInput{
			RelationshipID: cedar.ID, Source: "desktop_note", ExternalID: title,
			EventType: "note", OccurredAt: at(hour), Summary: title,
			Facts: map[string]any{"noteId": "cedar-edit", "title": title, "body": title},
		})
	}
	if _, err := f.svc.IngestRelationshipObservationCandidates(f.ctx, f.user, observations); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	page, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 50, 0, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if page.HasMore || len(page.Notes) != 2 {
		t.Fatalf("notes = %+v, want both companies", page.Notes)
	}
	if page.Notes[0].Title != "Edited Cedar" || page.Notes[0].RelationshipName != "Cedar Edits" {
		t.Fatalf("newest = %+v", page.Notes[0])
	}
	if page.Notes[1].Title != "Pine kept" || page.Notes[1].RelationshipName != "Pine Kept" {
		t.Fatalf("older = %+v", page.Notes[1])
	}
}

func TestListWorkspaceNotesOldestStartsAtTheFirstNote(t *testing.T) {
	f := newFixture(t)
	company, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Cedar Order", AccountDomain: "cedar-order.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	at := func(day int) time.Time {
		return time.Date(2026, 8, day, 12, 0, 0, 0, time.UTC)
	}
	notes := []RelationshipObservationInput{
		{
			RelationshipID: company.ID, Source: "desktop_note", ExternalID: "oldest-note",
			EventType: "note", OccurredAt: at(1), Summary: "Pine oldest",
			Facts: map[string]any{"noteId": "oldest-note", "title": "Pine oldest", "body": "First"},
		},
		{
			RelationshipID: company.ID, Source: "desktop_note", ExternalID: "middle-note",
			EventType: "note", OccurredAt: at(2), Summary: "Cedar middle",
			Facts: map[string]any{"noteId": "middle-note", "title": "Cedar middle", "body": "Second"},
		},
		{
			RelationshipID: company.ID, Source: "desktop_note", ExternalID: "newest-note",
			EventType: "note", OccurredAt: at(3), Summary: "Cedar newest",
			Facts: map[string]any{"noteId": "newest-note", "title": "Cedar newest", "body": "Third"},
		},
	}
	if _, err := f.svc.IngestRelationshipObservationCandidates(f.ctx, f.user, notes); err != nil {
		t.Fatal(err)
	}
	oldest, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 1, 0, "oldest")
	if err != nil || !oldest.HasMore || len(oldest.Notes) != 1 || oldest.Notes[0].Title != "Pine oldest" {
		t.Fatalf("oldest page = %+v err=%v", oldest, err)
	}
	next, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 1, 1, "oldest")
	if err != nil || !next.HasMore || len(next.Notes) != 1 || next.Notes[0].Title != "Cedar middle" {
		t.Fatalf("next oldest = %+v err=%v", next, err)
	}
	newest, err := f.svc.ListWorkspaceNotes(f.ctx, f.user, 1, 0, "newest")
	if err != nil || len(newest.Notes) != 1 || newest.Notes[0].Title != "Cedar newest" {
		t.Fatalf("newest page = %+v err=%v", newest, err)
	}
}

func TestWorkspaceNotesRouteIsMounted(t *testing.T) {
	router := chi.NewRouter()
	NewHandler(nil, zap.NewNop()).Mount(router)
	mounted := false
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == http.MethodGet && route == "/v1/workspace-notes" {
			mounted = true
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if !mounted {
		t.Fatal("GET /v1/workspace-notes is not mounted")
	}
}
