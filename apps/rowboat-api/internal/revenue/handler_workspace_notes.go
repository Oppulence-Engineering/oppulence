package revenue

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/httpx"
)

type workspaceNoteDTO struct {
	ExternalID       string    `json:"externalId"`
	Title            string    `json:"title"`
	Body             string    `json:"body"`
	Content          any       `json:"content,omitempty"`
	MeetingLinked    bool      `json:"meetingLinked"`
	LiveLinked       bool      `json:"liveLinked"`
	RelationshipID   string    `json:"relationshipId"`
	RelationshipName string    `json:"relationshipName"`
	OccurredAt       time.Time `json:"occurredAt"`
	CreatedAt        time.Time `json:"createdAt"`
	EventType        string    `json:"eventType"`
}

// ListWorkspaceNotes returns the latest copy of each company note.
func (h *Handler) ListWorkspaceNotes(w http.ResponseWriter, r *http.Request) {
	u, ok := h.viewer(w, r)
	if !ok {
		return
	}
	limit := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			h.writeServiceError(w, fmt.Errorf("%w: invalid limit", ErrInvalidInput))
			return
		}
		limit = parsed
	}
	offset := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			h.writeServiceError(w, fmt.Errorf("%w: invalid offset", ErrInvalidInput))
			return
		}
		offset = parsed
	}
	order := ""
	if r.URL.Query().Get("order") == "oldest" {
		order = "oldest"
	}
	page, err := h.svc.ListWorkspaceNotes(r.Context(), u, limit, offset, order)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	notes := make([]workspaceNoteDTO, 0, len(page.Notes))
	for _, note := range page.Notes {
		notes = append(notes, workspaceNoteDTO{
			ExternalID:       note.ExternalID,
			Title:            note.Title,
			Body:             note.Body,
			Content:          note.Content,
			MeetingLinked:    note.MeetingLinked,
			LiveLinked:       note.LiveLinked,
			RelationshipID:   note.RelationshipID,
			RelationshipName: note.RelationshipName,
			OccurredAt:       note.OccurredAt,
			CreatedAt:        note.CreatedAt,
			EventType:        note.EventType,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"notes": notes, "hasMore": page.HasMore})
}
