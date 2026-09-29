package account_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
)

func TestDeleteKeepsBillingFactsAndDropsTheAccount(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "taxed")
	trial := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	h.stripe.status["sub_tax"] = "active"
	h.client.Subscription.Create().SetUser(u).SetPlan("pro").SetStatus("active").
		SetSanctionedCredits(10000).SetStripeCustomerID("cus_1").SetStripeSubscriptionID("sub_tax").
		SetTrialExpiresAt(trial).SaveX(internal)

	rec, _ := h.deleteAccount(t, u, "DELETE")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if h.exists(u) {
		t.Fatal("the account row survived")
	}
	rows := h.client.BillingRetention.Query().AllX(internal)
	if len(rows) != 1 {
		t.Fatalf("billing retention rows = %d, want 1", len(rows))
	}
	row := rows[0]
	if row.Plan != "pro" || row.Status != "active" || row.StripeCustomerID != "cus_1" || row.StripeSubscriptionID != "sub_tax" {
		t.Fatalf("retention = %+v", row)
	}
	if row.TrialExpiresAt == nil || !row.TrialExpiresAt.Equal(trial) {
		t.Fatalf("trial = %v, want %s", row.TrialExpiresAt, trial)
	}
	encoded, err := json.Marshal(row)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), u.Email) {
		t.Fatalf("retention holds the account email: %s", encoded)
	}
	if n := h.client.Subscription.Query().CountX(internal); n != 0 {
		t.Fatalf("subscriptions left = %d", n)
	}
}

func TestDeleteWithoutASubscriptionKeepsNoBillingRow(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "free_tax")
	rec, _ := h.deleteAccount(t, u, "DELETE")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if n := h.client.BillingRetention.Query().CountX(internal); n != 0 {
		t.Fatalf("retention rows = %d, want 0", n)
	}
}

func TestExportReturnsOnlyTheCallersRelationshipsAndNotes(t *testing.T) {
	h := newHarness(t)
	owner := newUser(h.client, "exporter")
	other := newUser(h.client, "neighbor")
	ws := newWorkspace(h.client, owner)
	otherWS := newWorkspace(h.client, other)
	now := time.Now().UTC()
	ownerRel := h.client.Relationship.Create().SetWorkspace(ws).SetUser(owner).SetKind("company").
		SetDisplayName("Owner account").SetSummary("Owner summary").SaveX(internal)
	neighborRel := h.client.Relationship.Create().SetWorkspace(otherWS).SetUser(other).SetKind("company").
		SetDisplayName("Neighbor secret").SaveX(internal)
	h.client.RelationshipObservation.Create().SetWorkspace(ws).SetUser(owner).SetRelationship(ownerRel).
		SetSource("desktop_note").SetExternalID("note-1").SetEventType("note").
		SetOccurredAt(now).SetReceivedAt(now).SetSummary("Owner note").
		SetNormalizedFactsJSON(`{"body":"owner"}`).SetContentHash("owner-note").SaveX(internal)
	h.client.RelationshipObservation.Create().SetWorkspace(otherWS).SetUser(other).SetRelationship(neighborRel).
		SetSource("desktop_note").SetExternalID("note-2").SetEventType("note").
		SetOccurredAt(now).SetReceivedAt(now).SetSummary("Neighbor note").
		SetContentHash("neighbor-note").SaveX(internal)
	h.client.RelationshipObservation.Create().SetWorkspace(ws).SetUser(owner).SetRelationship(ownerRel).
		SetSource("gmail").SetExternalID("mail-1").SetEventType("message").
		SetOccurredAt(now).SetReceivedAt(now).SetSummary("Synced mail").
		SetContentHash("synced-mail").SaveX(internal)

	req := httptest.NewRequest(http.MethodGet, "/v1/me/export", nil)
	req = req.WithContext(auth.WithUser(context.Background(), owner))
	rec := httptest.NewRecorder()
	h.handler.Export(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "Neighbor") || strings.Contains(rec.Body.String(), "Synced mail") {
		t.Fatalf("export included content it should omit: %s", rec.Body.String())
	}
	var body struct {
		Account struct {
			Email string `json:"email"`
		} `json:"account"`
		Relationships []struct {
			DisplayName string `json:"displayName"`
			Summary     string `json:"summary"`
		} `json:"relationships"`
		Notes []struct {
			Summary string `json:"summary"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Account.Email != owner.Email {
		t.Fatalf("email = %q", body.Account.Email)
	}
	if len(body.Relationships) != 1 || body.Relationships[0].DisplayName != "Owner account" || body.Relationships[0].Summary != "Owner summary" {
		t.Fatalf("relationships = %+v", body.Relationships)
	}
	if len(body.Notes) != 1 || body.Notes[0].Summary != "Owner note" {
		t.Fatalf("notes = %+v", body.Notes)
	}
	if n := h.client.RelationshipObservation.Query().Where(relationshipobservation.SummaryEQ("Neighbor note")).CountX(internal); n != 1 {
		t.Fatalf("neighbor note count = %d", n)
	}
}
