package account

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/accountdeletionchallenge"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/email"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/httpx"
)

const (
	// methodOAuthReauth is a fresh interactive sign-in. auth_time must move
	// forward; a refresh of the current session does not.
	methodOAuthReauth = "oauth_reauth"
	// methodEmailOTP is a one-time code to the account email. It is refused
	// when the identity provider has a second factor enrolled.
	methodEmailOTP = "email_otp"

	// challengeTTL bounds how long the user has to finish the factor.
	challengeTTL = 10 * time.Minute
	// proofTTL bounds how long a successful factor can authorize deletion.
	// The proof is single-use, so this is also the replay window.
	proofTTL = 5 * time.Minute
	// reauthMaxAge is how recently the interactive sign-in itself must have
	// happened. A challenge cannot be satisfied by an older authentication
	// that merely predates the challenge.
	reauthMaxAge = 5 * time.Minute
	// authTimeFutureSkew rejects tokens whose auth_time is implausibly ahead
	// of the API clock.
	authTimeFutureSkew = time.Minute
	maxCodeAttempts    = 5
)

var (
	errStepUpRequired    = errors.New("account: step-up required")
	errReauthRequired    = errors.New("account: reauth required")
	errMFARequired       = errors.New("account: mfa required")
	errStepUpExpired     = errors.New("account: step-up expired")
	errStepUpNotFound    = errors.New("account: step-up not found")
	errInvalidCode       = errors.New("account: invalid deletion code")
	errTooManyAttempts   = errors.New("account: too many deletion code attempts")
	errStepUpUnavailable = errors.New("account: step-up unavailable")
)

// SetMailer installs the transactional sender used for deletion codes. A nil
// or disabled sender refuses the email factor and leaves OAuth re-authentication
// available.
func (h *Handler) SetMailer(sender email.Sender) {
	h.mailer = sender
}

// StartDeletionChallenge handles POST /v1/me/deletion-challenges.
//
// The current session is recorded as a baseline, not as permission. Verify
// accepts an interactive sign-in only when its auth_time is strictly newer
// than that baseline, so the request that started deletion cannot complete it.
func (h *Handler) StartDeletionChallenge(w http.ResponseWriter, r *http.Request) {
	u, actor, ok := h.owner(w, r)
	if !ok {
		return
	}
	var body struct {
		Method string `json:"method"`
	}
	if !httpx.DecodeJSON(w, r, 1<<10, &body) {
		return
	}
	method := body.Method
	if method != methodOAuthReauth && method != methodEmailOTP {
		httpx.Error(w, http.StatusBadRequest, `set "method" to "oauth_reauth" or "email_otp"`, "bad_request")
		return
	}
	factors, err := h.identity.ListAuthFactorTypes(r.Context(), u.WorkosUserID)
	if err != nil {
		h.log.Error("account deletion: list auth factors", zap.Error(err))
		httpx.Error(w, http.StatusServiceUnavailable, "could not check the account's sign-in methods", "step_up_unavailable")
		return
	}
	mfaRequired := len(factors) > 0
	if method == methodEmailOTP && mfaRequired {
		httpx.Error(w, http.StatusForbidden, "use your identity provider to confirm this deletion", "mfa_required")
		return
	}
	if method == methodEmailOTP && (h.mailer == nil || !h.mailer.Enabled()) {
		httpx.Error(w, http.StatusServiceUnavailable, "email verification is not available", "step_up_unavailable")
		return
	}
	if strings.TrimSpace(u.Email) == "" && method == methodEmailOTP {
		httpx.Error(w, http.StatusServiceUnavailable, "this account has no email address for a verification code", "step_up_unavailable")
		return
	}

	now := h.now()
	ctx := r.Context()
	client := h.database.Client
	// One live challenge per account. A newer request retires the previous
	// proof so an abandoned code cannot be used later.
	if _, err := client.AccountDeletionChallenge.Update().
		Where(accountdeletionchallenge.ConsumedAtIsNil()).
		SetConsumedAt(now).
		Save(ctx); err != nil {
		h.log.Error("account deletion: retire challenges", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not start deletion confirmation", "internal_error")
		return
	}

	challengeID := uuid.New()
	create := client.AccountDeletionChallenge.Create().
		SetID(challengeID).
		SetUser(u).
		SetMethod(method).
		SetBaselineAuthTime(actor.AuthTime).
		SetMfaRequired(mfaRequired).
		SetExpiresAt(now.Add(challengeTTL))
	var code string
	if method == methodEmailOTP {
		code, err = newDeletionCode()
		if err != nil {
			h.log.Error("account deletion: code", zap.Error(err))
			httpx.Error(w, http.StatusInternalServerError, "could not start deletion confirmation", "internal_error")
			return
		}
		// The hash is bound to this challenge id before the row is visible,
		// so a code cannot be checked against a different challenge.
		create.SetCodeHash(codeDigest(challengeID, code))
	}
	row, err := create.Save(ctx)
	if err != nil {
		h.log.Error("account deletion: create challenge", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not start deletion confirmation", "internal_error")
		return
	}
	if method == methodEmailOTP {
		if err := h.mailer.Send(ctx, deletionCodeMessage(u.Email, code)); err != nil {
			_, _ = client.AccountDeletionChallenge.UpdateOneID(row.ID).SetConsumedAt(h.now()).Save(ctx)
			h.log.Error("account deletion: send code", zap.Error(err))
			httpx.Error(w, http.StatusServiceUnavailable, "could not send the verification code", "step_up_unavailable")
			return
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"challengeId": row.ID.String(),
		"method":      method,
		"expiresAt":   row.ExpiresAt.Format(time.RFC3339),
		"mfaRequired": mfaRequired,
	})
}

// VerifyDeletionChallenge handles POST /v1/me/deletion-challenges/{id}/verify.
// It returns a single-use token. The plaintext token is not stored.
func (h *Handler) VerifyDeletionChallenge(w http.ResponseWriter, r *http.Request) {
	u, actor, ok := h.owner(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "deletion challenge not found", "step_up_not_found")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if !httpx.DecodeJSON(w, r, 1<<10, &body) {
		return
	}
	row, err := h.database.Client.AccountDeletionChallenge.Get(r.Context(), id)
	if ent.IsNotFound(err) {
		httpx.Error(w, http.StatusNotFound, "deletion challenge not found", "step_up_not_found")
		return
	}
	if err != nil {
		h.log.Error("account deletion: load challenge", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not verify the deletion confirmation", "internal_error")
		return
	}
	now := h.now()
	if row.ConsumedAt != nil || row.VerifiedAt != nil {
		httpx.Error(w, http.StatusNotFound, "deletion challenge not found", "step_up_not_found")
		return
	}
	if !row.ExpiresAt.After(now) {
		httpx.Error(w, http.StatusForbidden, "that confirmation expired; start again", "step_up_expired")
		return
	}
	switch row.Method {
	case methodOAuthReauth:
		if !freshReauth(row.BaselineAuthTime, actor, now) {
			httpx.Error(w, http.StatusForbidden, "sign in again before deleting this account", "reauth_required")
			return
		}
		if row.MfaRequired && !actor.HasMFA() {
			httpx.Error(w, http.StatusForbidden, "confirm this deletion with your second factor", "mfa_required")
			return
		}
	case methodEmailOTP:
		if err := h.checkDeletionCode(r.Context(), row, body.Code, now); err != nil {
			writeStepUpError(w, err)
			return
		}
	default:
		httpx.Error(w, http.StatusNotFound, "deletion challenge not found", "step_up_not_found")
		return
	}
	token, err := newStepUpToken()
	if err != nil {
		h.log.Error("account deletion: mint proof", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not verify the deletion confirmation", "internal_error")
		return
	}
	expires := now.Add(proofTTL)
	n, err := h.database.Client.AccountDeletionChallenge.Update().
		Where(
			accountdeletionchallenge.IDEQ(row.ID),
			accountdeletionchallenge.HasUserWith(user.IDEQ(u.ID)),
			accountdeletionchallenge.ConsumedAtIsNil(),
			accountdeletionchallenge.VerifiedAtIsNil(),
			accountdeletionchallenge.ExpiresAtGT(now),
		).
		SetTokenHash(tokenDigest(token)).
		SetVerifiedAt(now).
		SetExpiresAt(expires).
		ClearCodeHash().
		Save(r.Context())
	if err != nil || n != 1 {
		if err != nil {
			h.log.Error("account deletion: store proof", zap.Error(err))
		}
		httpx.Error(w, http.StatusNotFound, "deletion challenge not found", "step_up_not_found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"stepUpToken": token,
		"expiresAt":   expires.Format(time.RFC3339),
	})
}

// consumeDeletionProof burns a step-up token before any deletion side effect.
// A second presentation, a token from another account, and an expired token
// all fail closed.
func (h *Handler) consumeDeletionProof(ctx context.Context, u *ent.User, token string) error {
	if strings.TrimSpace(token) == "" {
		return errStepUpRequired
	}
	now := h.now()
	n, err := h.database.Client.AccountDeletionChallenge.Update().
		Where(
			accountdeletionchallenge.TokenHashEQ(tokenDigest(token)),
			accountdeletionchallenge.HasUserWith(user.IDEQ(u.ID)),
			accountdeletionchallenge.ConsumedAtIsNil(),
			accountdeletionchallenge.VerifiedAtNotNil(),
			accountdeletionchallenge.ExpiresAtGT(now),
		).
		SetConsumedAt(now).
		Save(ctx)
	if err != nil {
		return err
	}
	if n != 1 {
		return errStepUpRequired
	}
	return nil
}

func (h *Handler) checkDeletionCode(ctx context.Context, row *ent.AccountDeletionChallenge, code string, now time.Time) error {
	if row.Attempts >= maxCodeAttempts {
		return errTooManyAttempts
	}
	sum := codeDigest(row.ID, strings.TrimSpace(code))
	stored := ""
	if row.CodeHash != nil {
		stored = *row.CodeHash
	}
	if subtle.ConstantTimeCompare([]byte(sum), []byte(stored)) != 1 {
		n, err := h.database.Client.AccountDeletionChallenge.Update().
			Where(
				accountdeletionchallenge.IDEQ(row.ID),
				accountdeletionchallenge.ConsumedAtIsNil(),
				accountdeletionchallenge.AttemptsLT(maxCodeAttempts),
			).
			AddAttempts(1).
			Save(ctx)
		if err != nil {
			return err
		}
		if n != 1 {
			return errTooManyAttempts
		}
		fresh, err := h.database.Client.AccountDeletionChallenge.Get(ctx, row.ID)
		if err != nil {
			return err
		}
		if fresh.Attempts >= maxCodeAttempts {
			_, _ = h.database.Client.AccountDeletionChallenge.UpdateOneID(row.ID).SetConsumedAt(now).Save(ctx)
			return errTooManyAttempts
		}
		return errInvalidCode
	}
	return nil
}

func (h *Handler) owner(w http.ResponseWriter, r *http.Request) (*ent.User, *auth.Actor, bool) {
	u, ok := auth.UserFromCtx(r.Context())
	actor, actorOK := auth.ActorFromCtx(r.Context())
	if !ok || !actorOK || actor.Kind != auth.KindUser {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "unauthorized")
		return nil, nil, false
	}
	return u, actor, true
}

func writeStepUpError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errInvalidCode):
		httpx.Error(w, http.StatusForbidden, "that code is wrong", "invalid_code")
	case errors.Is(err, errTooManyAttempts):
		httpx.Error(w, http.StatusForbidden, "too many attempts; start again", "too_many_attempts")
	case errors.Is(err, errMFARequired):
		httpx.Error(w, http.StatusForbidden, "confirm this deletion with your second factor", "mfa_required")
	case errors.Is(err, errReauthRequired):
		httpx.Error(w, http.StatusForbidden, "sign in again before deleting this account", "reauth_required")
	case errors.Is(err, errStepUpExpired):
		httpx.Error(w, http.StatusForbidden, "that confirmation expired; start again", "step_up_expired")
	case errors.Is(err, errStepUpUnavailable):
		httpx.Error(w, http.StatusServiceUnavailable, "could not confirm this deletion", "step_up_unavailable")
	default:
		httpx.Error(w, http.StatusForbidden, "sign in again before deleting this account", "step_up_required")
	}
}

// freshReauth reports whether this token is an interactive sign-in that
// happened after the challenge was issued and within the proof window.
// auth_time must be strictly newer than the baseline captured when the
// challenge started, so the same session cannot approve itself. A timestamp
// a few seconds ahead of this process is clock skew and still counts as fresh.
func freshReauth(baseline int64, actor *auth.Actor, now time.Time) bool {
	if actor == nil || actor.AuthTime <= baseline {
		return false
	}
	authedAt := time.Unix(actor.AuthTime, 0)
	if authedAt.After(now.Add(authTimeFutureSkew)) {
		return false
	}
	if authedAt.After(now) {
		authedAt = now
	}
	return now.Sub(authedAt) <= reauthMaxAge
}

func newDeletionCode() (string, error) {
	// Rejection sampling keeps the code uniform. The bound is the largest
	// multiple of the code space that fits in 32 bits.
	const space uint32 = 1_000_000
	limit := (math.MaxUint32 / space) * space
	var buf [4]byte
	for {
		if _, err := rand.Read(buf[:]); err != nil {
			return "", err
		}
		n := binary.BigEndian.Uint32(buf[:])
		if n < limit {
			return fmt.Sprintf("%06d", n%space), nil
		}
	}
}

func newStepUpToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func tokenDigest(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func codeDigest(id uuid.UUID, code string) string {
	sum := sha256.Sum256([]byte(id.String() + "\x00" + code))
	return hex.EncodeToString(sum[:])
}

func deletionCodeMessage(to, code string) email.Message {
	text := "Your Oppulence account deletion code is " + code + ".\n\nIt expires in 10 minutes. If you did not ask to delete your account, ignore this email and sign in to review your sessions."
	html := "<p>Your Oppulence account deletion code is <strong>" + code + "</strong>.</p><p>It expires in 10 minutes. If you did not ask to delete your account, ignore this email and sign in to review your sessions.</p>"
	return email.Message{
		To:      to,
		Subject: "Confirm deletion of your Oppulence account",
		Text:    text,
		HTML:    html,
	}
}
