package account

import (
	"net/http"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/httpx"
	"go.uber.org/zap"
)

// noteSources are observations the user wrote, as opposed to bodies synced
// from a connected account. The privacy policy says people can export much of
// their content. Connected-source bodies stay out of this file; a privacy
// request still covers anything this export omits.
var noteSources = []string{"desktop_note", "voice_note"}

type contentExport struct {
	ExportedAt    string               `json:"exportedAt"`
	Account       exportAccount        `json:"account"`
	Relationships []exportRelationship `json:"relationships"`
	Notes         []exportNote         `json:"notes"`
}

type exportAccount struct {
	ID    string `json:"id"`
	Email string `json:"email,omitempty"`
}

type exportRelationship struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	DisplayName string `json:"displayName"`
	Summary     string `json:"summary,omitempty"`
}

type exportNote struct {
	ID         string `json:"id"`
	Source     string `json:"source"`
	Summary    string `json:"summary,omitempty"`
	OccurredAt string `json:"occurredAt"`
}

// Export handles GET /v1/me/export. It returns the caller's own relationship
// records and notes. It does not return another member's rows, sealed provider
// payloads, or billing identifiers.
func (h *Handler) Export(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFromCtx(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "unauthorized")
		return
	}
	ctx := auth.WithUser(r.Context(), u)
	out := contentExport{
		ExportedAt:    h.now().Format(time.RFC3339),
		Account:       exportAccount{ID: u.ID.String(), Email: u.Email},
		Relationships: []exportRelationship{},
		Notes:         []exportNote{},
	}
	rels, err := h.database.Client.Relationship.Query().
		Where(relationship.HasUserWith(user.IDEQ(u.ID))).
		All(ctx)
	if err != nil {
		h.log.Error("account export: relationships", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not export the account", "internal_error")
		return
	}
	for _, rel := range rels {
		out.Relationships = append(out.Relationships, exportRelationship{
			ID: rel.ID.String(), Kind: rel.Kind, DisplayName: rel.DisplayName, Summary: rel.Summary,
		})
	}
	notes, err := h.database.Client.RelationshipObservation.Query().
		Where(
			relationshipobservation.HasUserWith(user.IDEQ(u.ID)),
			relationshipobservation.SourceIn(noteSources...),
		).
		All(ctx)
	if err != nil {
		h.log.Error("account export: notes", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not export the account", "internal_error")
		return
	}
	for _, note := range notes {
		out.Notes = append(out.Notes, exportNote{
			ID: note.ID.String(), Source: note.Source, Summary: note.Summary,
			OccurredAt: note.OccurredAt.UTC().Format(time.RFC3339),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
