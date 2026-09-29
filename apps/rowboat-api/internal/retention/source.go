// Package retention removes synced source content. The privacy policy says
// disconnect deletes previously synced data. Rows stay so assertion links and
// routing audit survive, and so a disconnect tombstone still shows that sync
// stopped. Another user's rows are not updated.
package retention

import (
	"context"
	"fmt"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/cloudevent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueevidence"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
)

// observationSources are RelationshipObservation.source values that hold
// synced content. desktop_note and voice_note are the user's own notes, not
// a connected source, so disconnect does not blank them.
var observationSources = map[string]struct{}{
	"gmail": {}, "calendar": {}, "slack": {}, "hubspot": {},
	"meeting": {}, "browser": {}, "crm": {}, "composio": {},
}

// evidenceSources are RevenueEvidence.source values. "crm" is the payload
// store for the HubSpot connector; the evidence enum has no hubspot value.
var evidenceSources = map[string]struct{}{
	"gmail": {}, "calendar": {}, "meeting": {}, "slack": {}, "crm": {},
}

// cloudSources are CloudEvent.source values that carry a provider payload.
var cloudSources = map[string]struct{}{
	"gmail": {}, "google_calendar": {}, "google_drive": {}, "slack": {},
	"github": {}, "linear": {}, "stripe": {},
	"conduit": {}, "cadence": {}, "eigen": {}, "corinthian": {}, "canvas": {},
}

// SourcesForConnector maps a connector registry name to the source values
// whose synced bodies belong to that connection. Unknown connectors have no
// synced body store in this schema.
func SourcesForConnector(connector string) []string {
	switch connector {
	case "hubspot":
		return []string{"hubspot", "crm"}
	case "github", "linear", "stripe", "canvas", "corinthian", "cadence", "conduit", "eigen":
		return []string{connector}
	default:
		return nil
	}
}

// GoogleSources are the source values written from a Google grant. Mail
// index rows are purged separately; this list is the observation and event
// content that purge does not cover.
func GoogleSources() []string {
	return []string{"gmail", "calendar", "google_calendar", "google_drive"}
}

// RedactSources clears synced body content for one user. An empty source
// list is a no-op.
func RedactSources(ctx context.Context, client *ent.Client, owner *ent.User, sources ...string) error {
	if owner == nil || len(sources) == 0 {
		return nil
	}
	ctx = auth.WithUser(ctx, owner)
	if names := filterSources(sources, observationSources); len(names) > 0 {
		err := client.RelationshipObservation.Update().
			Where(
				relationshipobservation.HasUserWith(user.IDEQ(owner.ID)),
				relationshipobservation.SourceIn(names...),
			).
			ClearSummary().
			SetNormalizedFactsJSON("{}").
			ClearPayloadCiphertext().
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("redact relationship observations: %w", err)
		}
	}
	if names := filterSources(sources, evidenceSources); len(names) > 0 {
		// The sealed payload is the provider body. The excerpt is the quote
		// the product kept as the user's own action history; Google disconnect
		// already documents that quotes survive the mail-index purge.
		err := client.RevenueEvidence.Update().
			Where(
				revenueevidence.HasUserWith(user.IDEQ(owner.ID)),
				revenueevidence.SourceIn(names...),
			).
			ClearPayloadCiphertext().
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("redact revenue evidence payloads: %w", err)
		}
	}
	if names := filterSources(sources, cloudSources); len(names) > 0 {
		err := client.CloudEvent.Update().
			Where(
				cloudevent.HasUserWith(user.IDEQ(owner.ID)),
				cloudevent.SourceIn(names...),
			).
			ClearSubject().
			ClearText().
			ClearPayloadCiphertext().
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("redact cloud event payloads: %w", err)
		}
	}
	return nil
}

func filterSources(sources []string, allowed map[string]struct{}) []string {
	out := make([]string, 0, len(sources))
	seen := map[string]struct{}{}
	for _, source := range sources {
		if _, ok := allowed[source]; !ok {
			continue
		}
		if _, dup := seen[source]; dup {
			continue
		}
		seen[source] = struct{}{}
		out = append(out, source)
	}
	return out
}
