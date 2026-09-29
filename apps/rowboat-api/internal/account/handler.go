// Package account serves DELETE /v1/me: self-serve account deletion.
package account

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspacemember"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/subscription"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/billing"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/connectors"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/db"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/email"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/httpx"
)

// confirmation is the exact value the client must send. It stops a stray or
// replayed request from deleting an account.
const confirmation = "DELETE"

var errNoSuccessor = errors.New("account: shared workspace has no eligible successor")

// IdentityDeleter removes the identity-provider user and answers the questions
// account deletion needs before it will destroy anything. auth.WorkOSEnricher
// and auth.NoopEnricher implement it.
type IdentityDeleter interface {
	DeleteUser(ctx context.Context, workosUserID string) error
	// RevokeSessions invalidates every live identity-provider session. Deleting
	// the user does this too; the explicit call covers a user-delete failure.
	RevokeSessions(ctx context.Context, workosUserID string) error
	// ListAuthFactorTypes returns enrolled second-factor types. A non-empty
	// list means email OTP is not an acceptable deletion proof.
	ListAuthFactorTypes(ctx context.Context, workosUserID string) ([]string, error)
}

// Handler serves DELETE /v1/me.
type Handler struct {
	database   *db.DB
	billing    *billing.Handler
	connectors *connectors.Handler
	identity   IdentityDeleter
	mailer     email.Sender
	log        *zap.Logger
	now        func() time.Time
}

// New builds the account handler.
func New(database *db.DB, billingH *billing.Handler, connectorsH *connectors.Handler, identity IdentityDeleter, log *zap.Logger) *Handler {
	return &Handler{
		database:   database,
		billing:    billingH,
		connectors: connectorsH,
		identity:   identity,
		log:        log,
		now:        func() time.Time { return time.Now().UTC() },
	}
}

// Receipt records what a deletion did, so support can show evidence instead of
// a claim. It holds no personal data.
type Receipt struct {
	ReceiptID              string `json:"receiptId"`
	RequestedAt            string `json:"requestedAt"`
	CompletedAt            string `json:"completedAt"`
	SubscriptionsCancelled int    `json:"subscriptionsCancelled"`
	ConnectorsRevoked      int    `json:"connectorsRevoked"`
	WorkspacesTransferred  int    `json:"workspacesTransferred"`
	WorkspacesDeleted      int    `json:"workspacesDeleted"`
	IdentityDeleted        bool   `json:"identityDeleted"`
}

// Delete handles DELETE /v1/me.
//
// The steps run in this order, and each one stops the request if it fails
// before any data is deleted:
//  1. Require the exact confirmation word. That word is intent, not identity.
//  2. Consume a single-use step-up proof. A stolen session that never completed
//     a fresh factor cannot pass this check, and the proof cannot be reused.
//  3. Plan the workspaces. A shared workspace with no eligible successor → 409.
//  4. Cancel every Stripe subscription. Failure → 502. An account that Stripe
//     can still charge is never deleted.
//  5. Revoke every connector grant (durable jobs keep retrying).
//  6. Delete the account in one database transaction (db.DeleteAccount).
//  7. Revoke identity-provider sessions, then delete the WorkOS identity, so
//     the next sign-in cannot recreate the user. The data is already gone, so
//     a failure here is logged for a retry.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFromCtx(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "unauthorized")
		return
	}
	var body struct {
		Confirm     string `json:"confirm"`
		StepUpToken string `json:"stepUpToken"`
	}
	if !httpx.DecodeJSON(w, r, 1<<10, &body) {
		return
	}
	if body.Confirm != confirmation {
		httpx.Error(w, http.StatusBadRequest, `set "confirm" to "DELETE" to delete this account`, "confirmation_required")
		return
	}
	// DELETE is intent. The step-up token is the authentication factor, and it
	// is burned before Stripe or the database are touched so a replay cannot
	// pass the check twice.
	ctx := r.Context()
	if err := h.consumeDeletionProof(ctx, u, body.StepUpToken); err != nil {
		if !errors.Is(err, errStepUpRequired) {
			h.log.Error("account deletion: step-up", zap.Error(err))
			httpx.Error(w, http.StatusInternalServerError, "could not delete the account", "internal_error")
			return
		}
		httpx.Error(w, http.StatusForbidden, "sign in again before deleting this account", "step_up_required")
		return
	}
	receipt := Receipt{ReceiptID: uuid.NewString(), RequestedAt: h.now().Format(time.RFC3339)}
	log := h.log.With(zap.String("receipt_id", receipt.ReceiptID), zap.String("user_id", u.ID.String()))

	transfers, workspacesDeleted, err := h.planWorkspaces(ctx, u)
	if errors.Is(err, errNoSuccessor) {
		writeNoSuccessor(w)
		return
	}
	if err != nil {
		log.Error("account deletion: plan workspaces", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not delete the account", "internal_error")
		return
	}

	// Kept for the dispute and tax trail: the cascade deletes the billing rows.
	sub, err := h.database.Client.Subscription.Query().
		Where(subscription.HasUserWith(user.IDEQ(u.ID))).
		Only(auth.WithInternal(ctx))
	if err != nil && !ent.IsNotFound(err) {
		log.Error("account deletion: load subscription", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not delete the account", "internal_error")
		return
	}

	receipt.SubscriptionsCancelled, err = h.billing.CancelSubscriptions(ctx, u)
	if err != nil {
		log.Error("account deletion: cancel Stripe subscriptions", zap.Error(err))
		httpx.Error(w, http.StatusBadGateway, "could not cancel the subscription, so the account was not deleted", "billing_cancellation_failed")
		return
	}

	receipt.ConnectorsRevoked, err = h.connectors.RevokeAllForUser(ctx, u)
	if err != nil {
		log.Error("account deletion: revoke connectors", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "could not disconnect the connected accounts, so the account was not deleted", "connector_revocation_failed")
		return
	}

	// Billing is already cancelled. A client that disconnects now must not stop
	// the deletion halfway.
	work := context.WithoutCancel(ctx)
	if err := h.database.DeleteAccount(work, u.ID, transfers); err != nil {
		if errors.Is(err, db.ErrWorkspaceTransferConflict) {
			writeNoSuccessor(w)
			return
		}
		log.Error("account deletion: delete data", zap.Error(err))
		httpx.Error(w, http.StatusInternalServerError, "the subscription was cancelled but the account data was not deleted; try again", "internal_error")
		return
	}
	receipt.WorkspacesTransferred = len(transfers)
	receipt.WorkspacesDeleted = workspacesDeleted

	if err := h.identity.RevokeSessions(work, u.WorkosUserID); err != nil {
		log.Error("account deletion: data deleted but identity sessions were not revoked",
			zap.String("workos_user_id", u.WorkosUserID), zap.Error(err))
	}
	if err := h.identity.DeleteUser(work, u.WorkosUserID); err != nil {
		log.Error("account deletion: data deleted but the WorkOS identity remains; delete it manually",
			zap.String("workos_user_id", u.WorkosUserID), zap.Error(err))
	} else {
		receipt.IdentityDeleted = true
	}

	receipt.CompletedAt = h.now().Format(time.RFC3339)
	fields := []zap.Field{
		zap.Int("subscriptions_cancelled", receipt.SubscriptionsCancelled),
		zap.Int("connectors_revoked", receipt.ConnectorsRevoked),
		zap.Int("workspaces_transferred", receipt.WorkspacesTransferred),
		zap.Int("workspaces_deleted", receipt.WorkspacesDeleted),
		zap.Bool("identity_deleted", receipt.IdentityDeleted),
	}
	if sub != nil {
		fields = append(fields, zap.String("plan", sub.Plan), zap.String("stripe_customer_id", sub.StripeCustomerID))
	}
	log.Info("account deleted", fields...)
	httpx.WriteJSON(w, http.StatusOK, receipt)
}

func writeNoSuccessor(w http.ResponseWriter) {
	httpx.Error(w, http.StatusConflict,
		"your workspace has other members and none of them can take ownership; remove the other members first",
		"workspace_successor_required")
}

// planWorkspaces decides what happens to each workspace that the user founded.
// A workspace with no other active member is deleted by the cascade. A shared
// workspace goes to the oldest active owner, then admin, then member, who does
// not already own a workspace (the owner column has a unique index).
func (h *Handler) planWorkspaces(ctx context.Context, u *ent.User) ([]db.WorkspaceTransfer, int, error) {
	// A successor check must see workspaces of other users. The request user
	// would otherwise scope every query to the deleting user's own rows.
	internal := auth.WithInternalOnly(ctx)
	client := h.database.Client
	owned, err := client.RevenueWorkspace.Query().
		Where(revenueworkspace.HasUserWith(user.IDEQ(u.ID))).
		All(internal)
	if err != nil {
		return nil, 0, err
	}
	var transfers []db.WorkspaceTransfer
	deleted := 0
	for _, ws := range owned {
		others, err := client.RevenueWorkspaceMember.Query().
			Where(
				revenueworkspacemember.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
				revenueworkspacemember.StatusEQ("active"),
				revenueworkspacemember.Not(revenueworkspacemember.HasUserWith(user.IDEQ(u.ID))),
			).
			WithUser().
			Order(ent.Asc(revenueworkspacemember.FieldCreatedAt)).
			All(internal)
		if err != nil {
			return nil, 0, err
		}
		if len(others) == 0 {
			deleted++
			continue
		}
		successor, err := pickSuccessor(internal, client, others)
		if err != nil {
			return nil, 0, err
		}
		transfers = append(transfers, db.WorkspaceTransfer{WorkspaceID: ws.ID, SuccessorID: successor})
	}
	return transfers, deleted, nil
}

func pickSuccessor(ctx context.Context, client *ent.Client, members []*ent.RevenueWorkspaceMember) (uuid.UUID, error) {
	for _, role := range []string{"owner", "admin", "member"} {
		for _, m := range members {
			if m.Role != role || m.Edges.User == nil {
				continue
			}
			ownsWorkspace, err := client.RevenueWorkspace.Query().
				Where(revenueworkspace.HasUserWith(user.IDEQ(m.Edges.User.ID))).
				Exist(ctx)
			if err != nil {
				return uuid.Nil, err
			}
			if !ownsWorkspace {
				return m.Edges.User.ID, nil
			}
		}
	}
	return uuid.Nil, errNoSuccessor
}
