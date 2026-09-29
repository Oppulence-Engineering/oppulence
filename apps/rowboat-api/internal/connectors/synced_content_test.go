package connectors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/cloudevent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/appconfig"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/crypto"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/db"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func TestDisconnectClearsSyncedContentAndLeavesTheOtherUser(t *testing.T) {
	database, err := db.Open(t.Context(), appconfig.Config{
		DatabaseURL: "file:" + t.Name() + "?mode=memory&cache=shared&_pragma=foreign_keys(1)",
		AutoMigrate: true,
	}, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	client := database.Client
	sealer, err := crypto.NewSealer("disconnect-content-test")
	if err != nil {
		t.Fatal(err)
	}
	handler := revokeTestHandler(client, sealer, "http://127.0.0.1:1")
	owner := revokeTestUser(t, client, "owner")
	other := revokeTestUser(t, client, "other")
	internal := auth.WithInternal(t.Context())
	ownerWS := client.RevenueWorkspace.Create().SetUser(owner).SaveX(internal)
	otherWS := client.RevenueWorkspace.Create().SetUser(other).SaveX(internal)
	now := time.Now().UTC()
	ownerRel := client.Relationship.Create().SetWorkspace(ownerWS).SetUser(owner).SetKind("company").SetDisplayName("Owner").SaveX(internal)
	otherRel := client.Relationship.Create().SetWorkspace(otherWS).SetUser(other).SetKind("company").SetDisplayName("Other").SaveX(internal)
	client.RelationshipObservation.Create().SetWorkspace(ownerWS).SetUser(owner).SetRelationship(ownerRel).
		SetSource("hubspot").SetExternalID("deal-1").SetEventType("deal").
		SetOccurredAt(now).SetReceivedAt(now).SetSummary("Owner deal body").
		SetNormalizedFactsJSON(`{"amount":"secret"}`).SetContentHash("owner-deal").
		SetPayloadCiphertext([]byte("owner-payload")).SaveX(internal)
	client.RelationshipObservation.Create().SetWorkspace(otherWS).SetUser(other).SetRelationship(otherRel).
		SetSource("hubspot").SetExternalID("deal-2").SetEventType("deal").
		SetOccurredAt(now).SetReceivedAt(now).SetSummary("Other deal body").
		SetNormalizedFactsJSON(`{"amount":"other"}`).SetContentHash("other-deal").
		SetPayloadCiphertext([]byte("other-payload")).SaveX(internal)
	client.CloudEvent.Create().SetUser(owner).SetSource("github").SetDedupeKey("gh-1").
		SetSubject("Owner subject").SetText("Owner text").SetPayloadCiphertext([]byte("owner-event")).SaveX(internal)
	client.MCPConnection.Create().SetUser(owner).SetConnector("hubspot").SetAudience("hubspot-api").
		SetOrganizationID(OrganizationIDForUser(owner)).SetScopes([]string{}).
		SetStatus("active").SetConnectedAt(now).SaveX(auth.WithUser(t.Context(), owner))

	req := httptest.NewRequest(http.MethodDelete, "/v1/connections/hubspot", nil)
	route := chi.NewRouteContext()
	route.URLParams.Add("name", "hubspot")
	req = req.WithContext(context.WithValue(auth.WithUser(t.Context(), owner), chi.RouteCtxKey, route))
	rec := httptest.NewRecorder()
	handler.Delete(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	ownerObs := client.RelationshipObservation.Query().AllX(internal)
	var sawOwner, sawOther bool
	for _, obs := range ownerObs {
		switch obs.Summary {
		case "":
			sawOwner = true
			if obs.NormalizedFactsJSON != "{}" || len(obs.PayloadCiphertext) != 0 {
				t.Fatalf("owner observation still holds content: %+v", obs)
			}
		case "Other deal body":
			sawOther = true
			if string(obs.PayloadCiphertext) != "other-payload" {
				t.Fatalf("other user's payload changed: %q", obs.PayloadCiphertext)
			}
		default:
			t.Fatalf("unexpected observation summary %q", obs.Summary)
		}
	}
	if !sawOwner || !sawOther {
		t.Fatalf("saw owner blanked=%v other kept=%v", sawOwner, sawOther)
	}
	// The hubspot disconnect must not blank a github event. That source belongs
	// to a different connector.
	event := client.CloudEvent.Query().Where(cloudevent.DedupeKeyEQ("gh-1")).OnlyX(internal)
	if event.Subject != "Owner subject" || string(event.PayloadCiphertext) != "owner-event" {
		t.Fatalf("github event was redacted by a hubspot disconnect: %+v", event)
	}
	tombstone := client.MCPConnection.Query().OnlyX(internal)
	if tombstone.Status != "revoked" {
		t.Fatalf("connection status = %q, want revoked", tombstone.Status)
	}
}
