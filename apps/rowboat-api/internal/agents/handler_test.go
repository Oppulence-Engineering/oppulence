package agents

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/agentregistry"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/appconfig"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/db"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

func setupHandler(t *testing.T) (*Handler, *ent.User) {
	t.Helper()
	d, err := db.Open(context.Background(), appconfig.Config{
		DatabaseURL: "file:" + t.Name() + "?mode=memory&cache=shared&_pragma=foreign_keys(1)",
		AutoMigrate: true,
	}, zap.NewNop())
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	u := d.Client.User.Create().SetEmail("a@x.co").SetWorkosUserID("user_1").SaveX(context.Background())
	loader, err := agentregistry.NewLoader(d.Client, agentregistry.DefaultCatalog())
	if err != nil {
		t.Fatalf("loader: %v", err)
	}
	return New(d.Client, loader, appconfig.Config{AgentRuntimeModel: "test"}, zap.NewNop()), u
}

// TestCreateAgentRejectsUnknownTool is the Layer-2 deny-by-default boundary: a
// definition referencing a tool absent from the capability registry is a 400.
func TestCreateAgentRejectsUnknownTool(t *testing.T) {
	h, u := setupHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/agents", strings.NewReader(`{"slug":"x","name":"X","enabledTools":["shell"]}`)).
		WithContext(auth.WithUser(context.Background(), u))
	h.CreateAgent(rec, req)
	if rec.Code != 400 {
		t.Fatalf("CreateAgent(unknown tool) = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

// TestCreateAgentAcceptsKnownTools confirms a valid allowlist is accepted.
func TestCreateAgentAcceptsKnownTools(t *testing.T) {
	h, u := setupHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/agents", strings.NewReader(`{"slug":"helper","name":"Helper","enabledTools":["echo","current_time"]}`)).
		WithContext(auth.WithUser(context.Background(), u))
	h.CreateAgent(rec, req)
	if rec.Code != 201 {
		t.Fatalf("CreateAgent(valid) = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
}

// TestListAgentsIncludesBuiltins confirms the embedded built-ins surface in the
// catalog listing.
func TestListAgentsIncludesBuiltins(t *testing.T) {
	h, u := setupHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/agents", nil).WithContext(auth.WithUser(context.Background(), u))
	h.ListAgents(rec, req)
	if rec.Code != 200 {
		t.Fatalf("ListAgents = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "assistant") {
		t.Fatalf("ListAgents body missing built-in 'assistant': %s", rec.Body.String())
	}
}

func TestListEventsExactPageIsNotAnotherPage(t *testing.T) {
	h, u := setupHandler(t)
	ctx := auth.WithUser(context.Background(), u)
	sess := h.client.AgentSession.Create().
		SetUser(u).SetSessionID("s-events").SetAgentSlug("assistant").
		SaveX(ctx)
	for seq := 1; seq <= 2; seq++ {
		h.client.AgentSessionEvent.Create().
			SetUser(u).SetSession(sess).SetSeq(seq).SetEventType("message").
			SetEventJSON(`{"text":"one"}`).
			SaveX(ctx)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/agent-sessions/s-events/events?limit=2", nil).WithContext(ctx)
	h.ListEvents(rec, withURLParam(req, "id", "s-events"))
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "nextSeq") {
		t.Fatalf("exact page = %d %s", rec.Code, rec.Body.String())
	}
	h.client.AgentSessionEvent.Create().
		SetUser(u).SetSession(sess).SetSeq(3).SetEventType("message").
		SetEventJSON(`{"text":"three"}`).
		SaveX(ctx)
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/v1/agent-sessions/s-events/events?limit=2", nil).WithContext(ctx)
	h.ListEvents(rec, withURLParam(req, "id", "s-events"))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"nextSeq":2`) || strings.Contains(rec.Body.String(), "three") {
		t.Fatalf("full page = %d %s", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/v1/agent-sessions/s-events/events?limit=2&afterSeq=2", nil).WithContext(ctx)
	h.ListEvents(rec, withURLParam(req, "id", "s-events"))
	body := rec.Body.String()
	if rec.Code != http.StatusOK || strings.Contains(body, "nextSeq") || !strings.Contains(body, "three") {
		t.Fatalf("last page = %d %s", rec.Code, body)
	}
}

func TestListSessionsOffsetSkipsTheNewest(t *testing.T) {
	h, u := setupHandler(t)
	ctx := auth.WithUser(context.Background(), u)
	older := h.client.AgentSession.Create().SetUser(u).SetSessionID("older").SetAgentSlug("assistant").SaveX(ctx)
	newer := h.client.AgentSession.Create().SetUser(u).SetSessionID("newer").SetAgentSlug("assistant").SaveX(ctx)
	h.client.AgentSession.UpdateOne(older).SetUpdatedAt(time.Now().Add(-time.Hour)).SaveX(ctx)
	h.client.AgentSession.UpdateOne(newer).SetUpdatedAt(time.Now()).SaveX(ctx)

	rec := httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions?offset=1", nil).WithContext(ctx))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"sessionId":"older"`) ||
		strings.Contains(rec.Body.String(), "newer") {
		t.Fatalf("offset session list = %d %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions?offset=-4", nil).WithContext(ctx))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "newer") ||
		!strings.Contains(rec.Body.String(), "older") {
		t.Fatalf("negative offset = %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Index(body, "newer") > strings.Index(body, "older") {
		t.Fatalf("negative offset listed the older session first: %s", body)
	}

	rec = httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions?offset=nope", nil).WithContext(ctx))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid offset = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

func TestListSessionsExactPageIsNotAnotherPage(t *testing.T) {
	h, u := setupHandler(t)
	ctx := auth.WithUser(context.Background(), u)
	when := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	for i := 1; i <= sessionListLimit; i++ {
		row := h.client.AgentSession.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a1165000-0000-4000-8000-%012d", i))).
			SetUser(u).
			SetSessionID(fmt.Sprintf("exact-chat-%03d", i)).
			SetAgentSlug("assistant").
			SetTitle("Exact Chat Last").
			SaveX(ctx)
		if i > 1 {
			row = h.client.AgentSession.UpdateOne(row).SetTitle(fmt.Sprintf("Exact Chat %03d", i)).SaveX(ctx)
		}
		h.client.AgentSession.UpdateOne(row).SetUpdatedAt(when).SaveX(ctx)
	}

	rec := httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions", nil).WithContext(ctx))
	body := rec.Body.String()
	if rec.Code != http.StatusOK || strings.Contains(body, `"hasMore":true`) || !strings.Contains(body, "exact-chat-001") {
		t.Fatalf("exact page = %d %s", rec.Code, body)
	}

	extra := h.client.AgentSession.Create().
		SetID(uuid.MustParse(fmt.Sprintf("a1165000-0000-4000-8000-%012d", sessionListLimit+1))).
		SetUser(u).
		SetSessionID("exact-chat-051").
		SetAgentSlug("assistant").
		SetTitle("Exact Chat Newest").
		SaveX(ctx)
	h.client.AgentSession.UpdateOne(extra).SetUpdatedAt(when).SaveX(ctx)

	rec = httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions", nil).WithContext(ctx))
	body = rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `"hasMore":true`) || strings.Contains(body, "exact-chat-001") {
		t.Fatalf("first page = %d %s", rec.Code, body)
	}

	rec = httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions?offset=50", nil).WithContext(ctx))
	body = rec.Body.String()
	if rec.Code != http.StatusOK || strings.Contains(body, `"hasMore":true`) || !strings.Contains(body, "exact-chat-001") || strings.Contains(body, "exact-chat-002") {
		t.Fatalf("second page = %d %s", rec.Code, body)
	}
}

func TestListSessionsReturnsOnlyCurrentUser(t *testing.T) {
	h, u := setupHandler(t)
	ctx := auth.WithUser(context.Background(), u)
	h.client.AgentSession.Create().SetUser(u).SetSessionID("mine").SetAgentSlug("assistant").SaveX(ctx)
	other := h.client.User.Create().SetEmail("b@x.co").SetWorkosUserID("user_2").SaveX(context.Background())
	h.client.AgentSession.Create().SetUser(other).SetSessionID("theirs").SetAgentSlug("assistant").
		SaveX(auth.WithUser(context.Background(), other))

	rec := httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/v1/agent-sessions", nil).WithContext(ctx))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"sessionId":"mine"`) ||
		strings.Contains(rec.Body.String(), "theirs") {
		t.Fatalf("tenant session list = %d %s", rec.Code, rec.Body.String())
	}
}

// TestContinuationTokenResolvesSession is the continuation-token gate: a valid
// signed token resolves the session (overriding the path id), and a forged token
// is rejected.
func TestContinuationTokenResolvesSession(t *testing.T) {
	h, u := setupHandler(t)
	ctx := auth.WithUser(context.Background(), u)
	wf := agentWorkflowID(u.ID.String(), "s-cont")
	h.client.AgentSession.Create().
		SetUser(u).SetSessionID("s-cont").SetAgentSlug("assistant").SetChannel("http").
		SetStatus("active").SetTemporalWorkflowID(wf).SaveX(ctx)

	token := h.continuationToken(wf, "s-cont", u.ID.String())
	if token == "" {
		t.Fatal("expected a signed continuation token")
	}

	// Valid token resolves the session even though the path id is wrong.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/agent-sessions/WRONG?continuationToken="+token, nil).WithContext(ctx)
	req = withURLParam(req, "id", "WRONG")
	h.GetSession(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "s-cont") {
		t.Fatalf("valid continuation token did not resolve session: code=%d body=%s", rec.Code, rec.Body.String())
	}

	// A forged token is rejected.
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/v1/agent-sessions/s-cont?continuationToken=agt_forged.deadbeef", nil).WithContext(ctx)
	req = withURLParam(req, "id", "s-cont")
	h.GetSession(rec, req)
	if rec.Code != 401 {
		t.Fatalf("forged continuation token = %d, want 401", rec.Code)
	}
}

// agentWorkflowID mirrors agentworkflow.WorkflowID without importing it here.
func agentWorkflowID(userID, sessionID string) string {
	return "agent-session/" + userID + "/" + sessionID
}

// withURLParam attaches a chi route param to the request, preserving the
// existing context (the auth user).
func withURLParam(r *http.Request, key, val string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, val)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// TestCreateSessionWithoutTemporalReturns503 confirms the create path degrades
// to 503 (not a panic) before SetStarter wires Temporal.
func TestCreateSessionWithoutTemporalReturns503(t *testing.T) {
	h, u := setupHandler(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/agent-sessions", strings.NewReader(`{"agent":"assistant","input":"hi"}`)).
		WithContext(auth.WithUser(context.Background(), u))
	h.CreateSession(rec, req)
	if rec.Code != 503 {
		t.Fatalf("CreateSession(no temporal) = %d, want 503; body=%s", rec.Code, rec.Body.String())
	}
}
