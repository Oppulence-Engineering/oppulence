package revenue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
)

const (
	workspaceNotePageDefault = 50
	workspaceNotePageMax     = 100
	// One notes page used to read every company timeline. Note revisions are
	// sparse next to mail, so one bounded scan replaces that fan-out.
	workspaceNoteScanCap = 2000
)

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
	OccurredAt       time.Time
	EventType        string
}

// WorkspaceNotePage is one page of collapsed notes, newest first.
type WorkspaceNotePage struct {
	Notes   []WorkspaceNote
	HasMore bool
}

// ListWorkspaceNotes returns the latest copy of each company note. A newer
// edit replaces the previous copy, and a later deletion removes the note.
func (s *Service) ListWorkspaceNotes(ctx context.Context, u *ent.User, limit, offset int) (*WorkspaceNotePage, error) {
	limit, offset, err := normalizeWorkspaceNotePage(limit, offset)
	if err != nil {
		return nil, err
	}
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	rows, err := s.client.RelationshipObservation.Query().
		Where(
			relationshipobservation.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
			relationshipobservation.SourceEQ("desktop_note"),
			relationshipobservation.EventTypeIn("note", "note_deleted"),
			relationshipobservation.HasRelationshipWith(relationship.KindNEQ("person")),
		).
		WithRelationship().
		Order(
			ent.Desc(relationshipobservation.FieldOccurredAt),
			ent.Desc(relationshipobservation.FieldID),
		).
		Limit(workspaceNoteScanCap + 1).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) > workspaceNoteScanCap {
		rows = rows[:workspaceNoteScanCap]
	}
	live := collapseWorkspaceNotes(rows)
	if offset > len(live) {
		offset = len(live)
	}
	end := offset + limit
	hasMore := end < len(live)
	if end > len(live) {
		end = len(live)
	}
	return &WorkspaceNotePage{Notes: live[offset:end], HasMore: hasMore}, nil
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

func workspaceNoteFromObservation(row *ent.RelationshipObservation, company *ent.Relationship, facts map[string]any, noteID string) WorkspaceNote {
	title, _ := facts["title"].(string)
	title = strings.TrimSpace(title)
	if title == "" {
		title = strings.TrimSpace(row.Summary)
	}
	if title == "" {
		title = "Untitled"
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
