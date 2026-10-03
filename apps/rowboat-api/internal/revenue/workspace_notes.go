package revenue

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/predicate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
)

const (
	workspaceNotePageDefault = 50
	workspaceNotePageMax     = 100
)

// workspaceNoteReadBatch is how many raw revisions are read at once. A note
// keeps every edit, so the scan continues until the collapsed page is full.
var workspaceNoteReadBatch = 200

// WorkspaceNote is the latest copy of one company note.
type WorkspaceNote struct {
	ExternalID       string
	Title            string
	Body             string
	Content          any
	MeetingLinked    bool
	LiveLinked       bool
	RelationshipID   string
	RelationshipName string
	// OccurredAt is the latest save. CreatedAt is the first write, so an edit
	// does not move the note into "created today".
	OccurredAt time.Time
	CreatedAt  time.Time
	EventType  string
}

// WorkspaceNotePage is one page of collapsed notes. Newest is the default.
// Oldest starts at the earliest note, so a later page is not the only place
// that note can appear.
type WorkspaceNotePage struct {
	Notes   []WorkspaceNote
	HasMore bool
}

// ListWorkspaceNotes returns the latest copy of each company note. A newer
// edit replaces the previous copy, and a later deletion removes the note.
// Order "oldest" pages from the earliest note. Any other order is newest first.
func (s *Service) ListWorkspaceNotes(ctx context.Context, u *ent.User, limit, offset int, order string) (*WorkspaceNotePage, error) {
	limit, offset, err := normalizeWorkspaceNotePage(limit, offset)
	if err != nil {
		return nil, err
	}
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	oldest := order == "oldest"
	rows, err := s.collectWorkspaceNoteRows(ctx, ws.ID, offset+limit+1, oldest)
	if err != nil {
		return nil, err
	}
	live := collapseWorkspaceNotes(rows)
	created := earliestNoteWrite(rows)
	if oldest {
		// Oldest is the first write. Reversing the latest-save order put a
		// note edited today behind one that was written later and left alone.
		slices.SortStableFunc(live, func(a, b WorkspaceNote) int {
			left, right := created[a.ExternalID], created[b.ExternalID]
			switch {
			case left.Before(right):
				return -1
			case right.Before(left):
				return 1
			default:
				return strings.Compare(a.ExternalID, b.ExternalID)
			}
		})
	}
	if offset > len(live) {
		offset = len(live)
	}
	end := offset + limit
	hasMore := end < len(live)
	if end > len(live) {
		end = len(live)
	}
	page := live[offset:end]
	// Newest stops once the page is full, which can be before the first write
	// of a note that was edited again later.
	lookedUp, err := s.noteCreationTimes(ctx, ws.ID, noteExternalIDs(page))
	if err != nil {
		return nil, err
	}
	for id, at := range lookedUp {
		if prev, ok := created[id]; !ok || at.Before(prev) {
			created[id] = at
		}
	}
	stampNoteCreatedAt(page, created)
	return &WorkspaceNotePage{Notes: page, HasMore: hasMore}, nil
}

func normalizeWorkspaceNotePage(limit, offset int) (int, int, error) {
	if offset < 0 {
		return 0, 0, fmt.Errorf("%w: invalid offset", ErrInvalidInput)
	}
	if limit < 0 {
		return 0, 0, fmt.Errorf("%w: invalid limit", ErrInvalidInput)
	}
	if limit == 0 {
		limit = workspaceNotePageDefault
	}
	if limit > workspaceNotePageMax {
		limit = workspaceNotePageMax
	}
	return limit, offset, nil
}

// collectWorkspaceNoteRows reads revisions newest first until enough distinct
// notes are collapsed, or the history ends. Stopping after a fixed number of
// raw rows hid every older note once one note had been edited that many times.
func (s *Service) collectWorkspaceNoteRows(ctx context.Context, workspaceID uuid.UUID, liveNeed int, untilEnd bool) ([]*ent.RelationshipObservation, error) {
	if liveNeed < 1 {
		liveNeed = 1
	}
	batchSize := workspaceNoteReadBatch
	if batchSize < 1 {
		batchSize = 200
	}
	var rows []*ent.RelationshipObservation
	var after *ent.RelationshipObservation
	for {
		q := s.client.RelationshipObservation.Query().
			Where(
				relationshipobservation.HasWorkspaceWith(revenueworkspace.IDEQ(workspaceID)),
				relationshipobservation.SourceEQ("desktop_note"),
				relationshipobservation.EventTypeIn("note", "note_deleted"),
				relationshipobservation.HasRelationshipWith(relationship.KindNEQ("person")),
			).
			WithRelationship().
			Order(
				ent.Desc(relationshipobservation.FieldOccurredAt),
				ent.Desc(relationshipobservation.FieldID),
			).
			Limit(batchSize)
		if after != nil {
			q = q.Where(relationshipobservation.Or(
				relationshipobservation.OccurredAtLT(after.OccurredAt),
				relationshipobservation.And(
					relationshipobservation.OccurredAtEQ(after.OccurredAt),
					relationshipobservation.IDLT(after.ID),
				),
			))
		}
		batch, err := q.All(ctx)
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}
		rows = append(rows, batch...)
		if len(batch) < batchSize {
			break
		}
		// Oldest-first has to see the whole history. Stopping at the newest
		// page would hide the earliest note behind that page.
		if !untilEnd && len(collapseWorkspaceNotes(rows)) >= liveNeed {
			break
		}
		after = batch[len(batch)-1]
	}
	return rows, nil
}

// collapseWorkspaceNotes keeps the newest revision of each note and drops a
// note whose newest revision is a deletion. Rows must be newest first.
func collapseWorkspaceNotes(rows []*ent.RelationshipObservation) []WorkspaceNote {
	seen := make(map[string]struct{}, len(rows))
	live := make([]WorkspaceNote, 0, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		facts := map[string]any{}
		_ = json.Unmarshal([]byte(row.NormalizedFactsJSON), &facts)
		noteID := workspaceNoteID(row, facts)
		if noteID == "" {
			continue
		}
		if _, ok := seen[noteID]; ok {
			continue
		}
		seen[noteID] = struct{}{}
		if row.EventType != "note" {
			continue
		}
		company, err := row.Edges.RelationshipOrErr()
		if err != nil || company == nil {
			continue
		}
		live = append(live, workspaceNoteFromObservation(row, company, facts, noteID))
	}
	return live
}

func workspaceNoteID(row *ent.RelationshipObservation, facts map[string]any) string {
	if value, ok := facts["noteId"].(string); ok {
		if id := strings.TrimSpace(value); id != "" {
			return id
		}
	}
	return strings.TrimSpace(row.ExternalID)
}

func noteExternalIDs(notes []WorkspaceNote) []string {
	ids := make([]string, 0, len(notes))
	seen := make(map[string]struct{}, len(notes))
	for _, note := range notes {
		id := strings.TrimSpace(note.ExternalID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

// earliestNoteWrite is the first revision present in rows already read.
func earliestNoteWrite(rows []*ent.RelationshipObservation) map[string]time.Time {
	created := make(map[string]time.Time, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		facts := map[string]any{}
		_ = json.Unmarshal([]byte(row.NormalizedFactsJSON), &facts)
		noteID := workspaceNoteID(row, facts)
		if noteID == "" {
			continue
		}
		at := row.OccurredAt.UTC()
		if prev, ok := created[noteID]; !ok || at.Before(prev) {
			created[noteID] = at
		}
	}
	return created
}

func stampNoteCreatedAt(notes []WorkspaceNote, created map[string]time.Time) {
	for i := range notes {
		at, ok := created[notes[i].ExternalID]
		if !ok || at.IsZero() {
			at = notes[i].OccurredAt
		}
		notes[i].CreatedAt = at.UTC()
	}
}

// noteCreationTimes reads the first write for notes whose earlier revisions
// were not in the page scan. The note id lives in the facts, and each save
// gets a new external id.
func (s *Service) noteCreationTimes(ctx context.Context, workspaceID uuid.UUID, ids []string) (map[string]time.Time, error) {
	created := make(map[string]time.Time, len(ids))
	if len(ids) == 0 {
		return created, nil
	}
	wanted := make(map[string]struct{}, len(ids))
	match := make([]predicate.RelationshipObservation, 0, len(ids)*2)
	for _, id := range ids {
		wanted[id] = struct{}{}
		match = append(match, relationshipobservation.ExternalIDEQ(id))
		if needle, ok := noteIDJSONNeedle(id); ok {
			match = append(match, relationshipobservation.NormalizedFactsJSONContains(needle))
		}
	}
	rows, err := s.client.RelationshipObservation.Query().
		Where(
			relationshipobservation.HasWorkspaceWith(revenueworkspace.IDEQ(workspaceID)),
			relationshipobservation.SourceEQ("desktop_note"),
			relationshipobservation.EventTypeIn("note", "note_deleted"),
			relationshipobservation.Or(match...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		facts := map[string]any{}
		_ = json.Unmarshal([]byte(row.NormalizedFactsJSON), &facts)
		noteID := workspaceNoteID(row, facts)
		if _, ok := wanted[noteID]; !ok {
			continue
		}
		at := row.OccurredAt.UTC()
		if prev, seen := created[noteID]; !seen || at.Before(prev) {
			created[noteID] = at
		}
	}
	return created, nil
}

// noteIDJSONNeedle matches the compact facts encoding. The closing quote keeps
// a shorter id from matching a longer one.
func noteIDJSONNeedle(id string) (string, bool) {
	if id == "" || strings.ContainsAny(id, `"\`) {
		return "", false
	}
	return `"noteId":"` + id + `"`, true
}

func workspaceNoteFromObservation(row *ent.RelationshipObservation, company *ent.Relationship, facts map[string]any, noteID string) WorkspaceNote {
	title, _ := facts["title"].(string)
	title = strings.TrimSpace(title)
	if title == "" {
		title = strings.TrimSpace(row.Summary)
	}
	if title == "" {
		title = "Untitled note"
	}
	body, _ := facts["body"].(string)
	note := WorkspaceNote{
		ExternalID:       noteID,
		Title:            title,
		Body:             body,
		MeetingLinked:    factBool(facts, "meetingLinked"),
		LiveLinked:       factBool(facts, "liveLinked"),
		RelationshipID:   company.ID.String(),
		RelationshipName: company.DisplayName,
		OccurredAt:       row.OccurredAt.UTC(),
		EventType:        row.EventType,
	}
	if content, ok := facts["content"]; ok {
		note.Content = content
	}
	return note
}

func factBool(facts map[string]any, key string) bool {
	value, _ := facts[key].(bool)
	return value
}
