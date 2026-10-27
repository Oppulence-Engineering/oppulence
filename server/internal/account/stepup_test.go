package account_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/accountdeletionchallenge"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/account"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/email"
)

func TestDeleteWithoutAStepUpTokenDoesNotTouchBilling(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "session_only")
	h.stripe.status["sub_live"] = "active"
	h.client.Subscription.Create().SetUser(u).SetSanctionedCredits(10000).SetStripeCustomerID("cus_1").SaveX(internal)

	rec := serveDelete(t, h.handler, deleteRequest(auth.WithUser(context.Background(), u), `{"confirm":"DELETE"}`))
	if rec.Code != http.StatusForbidden || problemCode(rec) != "step_up_required" {
		t.Fatalf("status = %d code = %q, want 403 step_up_required", rec.Code, problemCode(rec))
	}
	if !h.exists(u) || h.stripe.calls != 0 || len(h.identity.deleted) != 0 || len(h.identity.revoked) != 0 {
		t.Fatalf("a session-only deletion had side effects: exists %v stripe %d deleted %v revoked %v",
			h.exists(u), h.stripe.calls, h.identity.deleted, h.identity.revoked)
	}
}

func TestDeleteRejectsAnotherUsersStepUpToken(t *testing.T) {
	h := newHarness(t)
	owner := newUser(h.client, "owner_token")
	other := newUser(h.client, "other_token")
	token := mintDeletionProof(t, h.handler, owner)

	rec := serveDelete(t, h.handler, deleteRequest(auth.WithUser(context.Background(), other),
		`{"confirm":"DELETE","stepUpToken":"`+token+`"}`))
	if rec.Code != http.StatusForbidden || problemCode(rec) != "step_up_required" {
		t.Fatalf("status = %d code = %q, want 403 step_up_required", rec.Code, problemCode(rec))
	}
	if !h.exists(owner) || !h.exists(other) || len(h.identity.deleted) != 0 {
		t.Fatal("another user's proof deleted an account")
	}
}

func TestDeleteRejectsAReplayedStepUpToken(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "replay")
	token := mintDeletionProof(t, h.handler, u)
	body := `{"confirm":"DELETE","stepUpToken":"` + token + `"}`

	first := serveDelete(t, h.handler, deleteRequest(auth.WithUser(context.Background(), u), body))
	if first.Code != http.StatusOK {
		t.Fatalf("first delete = %d: %s", first.Code, first.Body.String())
	}
	second := serveDelete(t, h.handler, deleteRequest(auth.WithUser(context.Background(), u), body))
	if second.Code != http.StatusForbidden || problemCode(second) != "step_up_required" {
		t.Fatalf("replay = %d code = %q, want 403 step_up_required", second.Code, problemCode(second))
	}
	if len(h.identity.deleted) != 1 {
		t.Fatalf("identity deletes = %v, want one", h.identity.deleted)
	}
}

func TestDeleteRejectsAnExpiredStepUpToken(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "expired_proof")
	token := mintDeletionProof(t, h.handler, u)
	if n := h.client.AccountDeletionChallenge.Update().
		Where(accountdeletionchallenge.HasUserWith(user.IDEQ(u.ID))).
		SetExpiresAt(time.Now().Add(-time.Minute)).
		SaveX(internal); n != 1 {
		t.Fatalf("expired %d challenges, want 1", n)
	}

	rec := serveDelete(t, h.handler, deleteRequest(auth.WithUser(context.Background(), u),
		`{"confirm":"DELETE","stepUpToken":"`+token+`"}`))
	if rec.Code != http.StatusForbidden || problemCode(rec) != "step_up_required" {
		t.Fatalf("status = %d code = %q, want 403 step_up_required", rec.Code, problemCode(rec))
	}
	if !h.exists(u) {
		t.Fatal("an expired proof deleted the account")
	}
}

func TestOAuthStepUpRejectsTheSessionThatStartedIt(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "same_session")
	baseline := time.Now().Add(-time.Minute).Unix()
	status, body := startChallenge(t, h, u, "oauth_reauth", baseline)
	if status != http.StatusCreated {
		t.Fatalf("start = %d %v", status, body)
	}
	rec := verifyChallenge(t, h, u, body["challengeId"].(string), baseline)
	if rec.Code != http.StatusForbidden || problemCode(rec) != "reauth_required" {
		t.Fatalf("verify = %d code = %q, want 403 reauth_required", rec.Code, problemCode(rec))
	}
	if !h.exists(u) {
		t.Fatal("a same-session reauth deleted the account")
	}
}

func TestOAuthStepUpAcceptsASlightlyFutureAuthTime(t *testing.T) {
	h := newHarness(t)
	u := newUser(h.client, "clock_skew")
	baseline := time.Now().Unix()
	status, body := startChallenge(t, h, u, "oauth_reauth", baseline)
	if status != http.StatusCreated {
		t.Fatalf("start = %d %v", status, body)
	}
	// Devstack stamps prompt=login one second ahead so a same-second reauth
	// is strictly newer than the session that asked for deletion.
	rec := verifyChallenge(t, h, u, body["challengeId"].(string), baseline+1)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify = %d %s, want 200", rec.Code, rec.Body.String())
	}
}

func TestEmailStepUpAcceptsTheRightCodeAfterAWrongOne(t *testing.T) {
	h := newHarness(t)
	mail := &recordingMailer{}
	h.handler.SetMailer(mail)
	u := newUser(h.client, "otp")
	status, body := startChallenge(t, h, u, "email_otp", time.Now().Unix())
	if status != http.StatusCreated {
		t.Fatalf("start = %d %v", status, body)
	}
	if len(mail.messages) != 1 || !strings.Contains(mail.messages[0].To, u.Email) {
		t.Fatalf("mail = %+v, want one message to %s", mail.messages, u.Email)
	}
	code := codeFrom(t, mail.messages[0])
	wrongCode := "000000"
	if wrongCode == code {
		wrongCode = "000001"
	}
	wrong := verifyChallengeCode(t, h, u, body["challengeId"].(string), wrongCode)
	if wrong.Code != http.StatusForbidden || problemCode(wrong) != "invalid_code" {
		t.Fatalf("wrong code = %d %s", wrong.Code, wrong.Body.String())
	}
	right := verifyChallengeCode(t, h, u, body["challengeId"].(string), code)
	if right.Code != http.StatusOK || !strings.Contains(right.Body.String(), "stepUpToken") {
		t.Fatalf("right code = %d %s", right.Code, right.Body.String())
	}
	if strings.Contains(right.Body.String(), code) {
		t.Fatal("verify response echoed the email code")
	}
}

func TestEmailStepUpLocksAfterFiveFailures(t *testing.T) {
	h := newHarness(t)
	h.handler.SetMailer(&recordingMailer{})
	u := newUser(h.client, "otp_lock")
	status, body := startChallenge(t, h, u, "email_otp", time.Now().Unix())
	if status != http.StatusCreated {
		t.Fatalf("start = %d %v", status, body)
	}
	id := body["challengeId"].(string)
	var last *httptest.ResponseRecorder
	for i := 0; i < 5; i++ {
		last = verifyChallengeCode(t, h, u, id, "111111")
	}
	if last.Code != http.StatusForbidden || problemCode(last) != "too_many_attempts" {
		t.Fatalf("fifth attempt = %d %s", last.Code, last.Body.String())
	}
	again := verifyChallengeCode(t, h, u, id, "111111")
	if again.Code != http.StatusNotFound || problemCode(again) != "step_up_not_found" {
		t.Fatalf("after lock = %d %s, want 404 step_up_not_found", again.Code, again.Body.String())
	}
}

func TestEmailStepUpIsRefusedWhenMFAIsEnrolled(t *testing.T) {
	h := newHarness(t)
	h.identity.factors = []string{"totp"}
	h.handler.SetMailer(&recordingMailer{})
	u := newUser(h.client, "mfa_email")
	status, body := startChallenge(t, h, u, "email_otp", time.Now().Unix())
	if status != http.StatusForbidden || body["code"] != "mfa_required" {
		t.Fatalf("email start = %d %v, want 403 mfa_required", status, body)
	}
}

func TestOAuthStepUpRequiresTheEnrolledSecondFactor(t *testing.T) {
	h := newHarness(t)
	h.identity.factors = []string{"totp"}
	u := newUser(h.client, "mfa_oauth")
	baseline := time.Now().Add(-2 * time.Minute).Unix()
	status, body := startChallenge(t, h, u, "oauth_reauth", baseline)
	if status != http.StatusCreated || body["mfaRequired"] != true {
		t.Fatalf("start = %d %v", status, body)
	}
	id := body["challengeId"].(string)
	without := verifyChallenge(t, h, u, id, time.Now().Unix())
	if without.Code != http.StatusForbidden || problemCode(without) != "mfa_required" {
		t.Fatalf("without amr = %d %s", without.Code, without.Body.String())
	}
	with := verifyChallengeMethods(t, h, u, id, time.Now().Unix(), "pwd", "totp")
	if with.Code != http.StatusOK {
		t.Fatalf("with amr = %d %s", with.Code, with.Body.String())
	}
}

func TestStepUpFailsClosedWhenFactorLookupFails(t *testing.T) {
	h := newHarness(t)
	h.identity.factorErr = errors.New("workos unavailable")
	h.handler.SetMailer(&recordingMailer{})
	u := newUser(h.client, "factors_down")
	status, body := startChallenge(t, h, u, "email_otp", time.Now().Unix())
	if status != http.StatusServiceUnavailable || body["code"] != "step_up_unavailable" {
		t.Fatalf("start = %d %v, want 503 step_up_unavailable", status, body)
	}
	if n := h.client.AccountDeletionChallenge.Query().CountX(internal); n != 0 {
		t.Fatalf("challenges = %d, want 0 when enrollment is unknown", n)
	}
}

func TestDeleteRevokesSessionsBeforeDeletingTheIdentity(t *testing.T) {
	h := newHarness(t)
	identity := &orderedIdentity{fakeIdentity: h.identity}
	handler := account.New(h.database, h.billing, h.connectors, identity, zap.NewNop())
	u := newUser(h.client, "revoke_order")
	rec := serveDelete(t, handler, deleteRequest(auth.WithUser(context.Background(), u), confirmedDeleteBody(t, handler, u, "DELETE")))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Join(identity.order, ",") != "revoke,delete" {
		t.Fatalf("identity order = %v, want revoke then delete", identity.order)
	}
}

type recordingMailer struct {
	messages []email.Message
	err      error
}

func (m *recordingMailer) Send(_ context.Context, msg email.Message) error {
	m.messages = append(m.messages, msg)
	return m.err
}

func (m *recordingMailer) Enabled() bool { return true }

type orderedIdentity struct {
	*fakeIdentity
	order []string
}

func (o *orderedIdentity) RevokeSessions(ctx context.Context, workosUserID string) error {
	o.order = append(o.order, "revoke")
	return o.fakeIdentity.RevokeSessions(ctx, workosUserID)
}

func (o *orderedIdentity) DeleteUser(ctx context.Context, workosUserID string) error {
	o.order = append(o.order, "delete")
	return o.fakeIdentity.DeleteUser(ctx, workosUserID)
}

func startChallenge(t *testing.T, h *harness, u *ent.User, method string, authTime int64) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/me/deletion-challenges", strings.NewReader(`{"method":"`+method+`"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userActor(u, authTime))
	rec := httptest.NewRecorder()
	h.handler.StartDeletionChallenge(rec, req)
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func verifyChallenge(t *testing.T, h *harness, u *ent.User, id string, authTime int64) *httptest.ResponseRecorder {
	t.Helper()
	return verifyChallengeMethods(t, h, u, id, authTime)
}

func verifyChallengeMethods(t *testing.T, h *harness, u *ent.User, id string, authTime int64, methods ...string) *httptest.ResponseRecorder {
	t.Helper()
	return verifyChallengeCodeMethods(t, h, u, id, authTime, "", methods...)
}

func verifyChallengeCode(t *testing.T, h *harness, u *ent.User, id, code string) *httptest.ResponseRecorder {
	t.Helper()
	return verifyChallengeCodeMethods(t, h, u, id, time.Now().Unix(), code)
}

func verifyChallengeCodeMethods(t *testing.T, h *harness, u *ent.User, id string, authTime int64, code string, methods ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/verify", strings.NewReader(`{"code":"`+code+`"}`))
	req.Header.Set("Content-Type", "application/json")
	route := chi.NewRouteContext()
	route.URLParams.Add("id", id)
	req = req.WithContext(context.WithValue(userActor(u, authTime, methods...), chi.RouteCtxKey, route))
	rec := httptest.NewRecorder()
	h.handler.VerifyDeletionChallenge(rec, req)
	return rec
}

var deletionCodePattern = regexp.MustCompile(`\b(\d{6})\b`)

func codeFrom(t *testing.T, msg email.Message) string {
	t.Helper()
	match := deletionCodePattern.FindStringSubmatch(msg.Text)
	if match == nil {
		t.Fatalf("email has no 6-digit code: %s", msg.Text)
	}
	return match[1]
}
