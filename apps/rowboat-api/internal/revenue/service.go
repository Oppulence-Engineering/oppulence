package revenue

import (
	"context"
	stdsha256 "crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/commitment"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationinteraction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/conversationintelligenceartifact"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/mailthread"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/person"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/policydecisionsnapshot"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/predicate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationship"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipassertion"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipattentionitem"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipidentity"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipidentitycandidate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipobservation"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipparticipant"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipprojectionjob"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipreviewacknowledgement"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipsourcestatus"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueaction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspacemember"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/crypto"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/embeddings"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/revenuemetrics"
)

// Lifecycle errors. Handlers map these onto HTTP statuses; each one is a hard
// invariant from RFC 030, not a soft validation.
var (
	// ErrNotFound is returned for a missing (or other-tenant) row.
	ErrNotFound = errors.New("revenue: not found")
	// ErrBlocked enforces invariant 1: a blocked action cannot be approved
	// or executed.
	ErrBlocked = errors.New("revenue: action is blocked by policy")
	// ErrNoDecision means a send-mode action has no policy decision for its
	// current revision (invariant 4).
	ErrNoDecision = errors.New("revenue: no policy decision for the current revision")
	// ErrDecisionExpired enforces invariant 5: an expired decision must be
	// re-evaluated before approval or execution.
	ErrDecisionExpired = errors.New("revenue: policy decision expired; re-evaluate")
	// ErrReviewRequired means the decision needs an explicit human risk
	// acceptance before approval (invariant 4).
	ErrReviewRequired = errors.New("revenue: decision requires human review")
	// ErrNotApproved means execute was requested without a valid bound
	// approval (invariant 2).
	ErrNotApproved = errors.New("revenue: action is not approved for its current revision")
	// ErrNotEditable means execution has already begun for this revision.
	ErrNotEditable = errors.New("revenue: action is no longer editable")
	// ErrWorkspaceNotLinked means a send was requested in local mode; only
	// draft execution works without an OutboundConsole link.
	ErrWorkspaceNotLinked = errors.New("revenue: workspace is not linked; sends are disabled")
	// ErrConflict means a concurrent transition won; the caller should
	// reload and retry deliberately.
	ErrConflict = errors.New("revenue: conflicting concurrent transition")
	// ErrInvalidInput is a bounded validation failure.
	ErrInvalidInput = errors.New("revenue: invalid input")
	// ErrForbidden means the authenticated user is in the workspace but their
	// explicit role does not grant the requested capability.
	ErrForbidden = errors.New("revenue: workspace role forbids this operation")
	// ErrIdentityUnresolved prevents any approval or execution whose
	// destination is attached to an ambiguous canonical relationship.
	ErrIdentityUnresolved = errors.New("revenue: action destination depends on unresolved identity")
	// ErrSourceIncomplete prevents beta recommendations and external writes
	// from treating partial, stale, or rebuilding source state as complete.
	ErrSourceIncomplete = errors.New("revenue: required source evidence is incomplete")
)

// ErrAmbiguous is returned by an Executor when the provider may have accepted
// the submission but the result was lost (invariant 8). The action is marked
// ambiguous and is never automatically resent; reconciliation checks provider
// state by message ID first.
var ErrAmbiguous = errors.New("revenue: execution result ambiguous")

// Enum values shared with the ent schemas.
const (
	ModeLocal  = "local"
	ModeLinked = "linked"

	QueueOpen      = "open"
	QueueSnoozed   = "snoozed"
	QueueDismissed = "dismissed"
	QueueHandled   = "handled"

	PolicyPending        = "pending"
	PolicyPassed         = "passed"
	PolicyReviewRequired = "review_required"
	PolicyBlocked        = "blocked"
	PolicyStale          = "stale"

	ApprovalPending  = "pending"
	ApprovalApproved = "approved"
	ApprovalRejected = "rejected"

	ExecPending   = "pending"
	ExecRequested = "requested"
	ExecSent      = "sent"
	ExecFailed    = "failed"
	ExecAmbiguous = "ambiguous"
	ExecCancelled = "cancelled"

	ExecModeDraft = "draft"
	ExecModeSend  = "send"

	OwnerRowboat = "rowboat"

	DetectorManual = "manual"
)

// ExecRequest is what an Executor needs to perform one action revision.
type ExecRequest struct {
	Action    *ent.RevenueAction
	Workspace *ent.RevenueWorkspace
	// UserID is the assigned executing user, verified by the service against
	// invariant 11 before the executor runs; the executor resolves the sender
	// credential for exactly this user.
	UserID         uuid.UUID
	Mode           string // draft | send
	IdempotencyKey string
}

// ExecResult reports a completed execution.
type ExecResult struct {
	ProviderMessageID string
	ProviderThreadID  string
}

// Executor performs the provider call (Gmail draft/send in the first release).
// Implementations must honor the idempotency key and return ErrAmbiguous when
// a submission may have been accepted but the result was lost.
type Executor interface {
	Execute(ctx context.Context, req ExecRequest) (*ExecResult, error)
}

// Reconciler performs a read-only provider lookup for a write whose response
// was lost. found=false never authorizes a resend; the service schedules a
// later lookup and eventually leaves the action for manual review.
type Reconciler interface {
	Reconcile(ctx context.Context, req ExecRequest) (result *ExecResult, found bool, err error)
}

// notConfiguredExecutor is the default until the Gmail executor is wired: it
// fails every execution deterministically (never ambiguous — nothing was
// submitted).
type notConfiguredExecutor struct{}

func (notConfiguredExecutor) Execute(context.Context, ExecRequest) (*ExecResult, error) {
	return nil, errors.New("revenue: no execution backend configured")
}

// Service implements the RFC 030 action-queue lifecycle. Every method runs
// with the caller's authenticated context, so ent interceptors and mutation
// hooks scope all reads and writes to the tenant.
type Service struct {
	client            *ent.Client
	facade            FacadeClient
	executor          Executor
	sweeper           ThreadSweeper
	entitlements      Entitlements
	bodyFetcher       MailBodyFetcher
	attachmentFetcher CommunicationAttachmentFetcher
	// promiseExtractor proposes promises the deterministic detector missed.
	// Nil leaves extraction deterministic-only, which is the default.
	promiseExtractor PromiseExtractor
	sealer           *crypto.Sealer
	evidenceKeys     *TenantEvidenceKeyManager
	mailBodyTTL      time.Duration
	embedder         embeddings.Embedder
	mailSyncer       MailSyncer
	research         ResearchConfig
	log              *zap.Logger
	now              func() time.Time
}

// NewService builds the lifecycle service. A nil facade falls back to the
// fail-closed disabled facade; a nil executor fails executions until WP4
// wires Gmail.
func NewService(client *ent.Client, facade FacadeClient, executor Executor, log *zap.Logger) *Service {
	if facade == nil {
		facade = NewDisabledFacade()
	}
	if executor == nil {
		executor = notConfiguredExecutor{}
	}
	if log == nil {
		log = zap.NewNop()
	}
	return &Service{
		client:   client,
		facade:   facade,
		executor: executor,
		log:      log,
		now:      func() time.Time { return time.Now().UTC() },
	}
}

// --- workspace ---------------------------------------------------------------

// CurrentWorkspace returns the caller's active revenue workspace. Explicit
// membership is authoritative; the founding-owner edge remains a migration
// fallback and is backfilled into an owner membership on access.
func (s *Service) CurrentWorkspace(ctx context.Context, u *ent.User) (*ent.RevenueWorkspace, error) {
	member, err := s.client.RevenueWorkspaceMember.Query().
		Where(
			revenueworkspacemember.StatusEQ("active"),
			revenueworkspacemember.HasUserWith(user.IDEQ(u.ID)),
		).
		WithWorkspace().
		Order(ent.Asc(revenueworkspacemember.FieldCreatedAt)).
		First(ctx)
	if err == nil {
		ws, workspaceErr := member.Edges.WorkspaceOrErr()
		if workspaceErr != nil {
			return nil, workspaceErr
		}
		auth.GrantRevenueWorkspace(ctx, ws.ID, member.Role)
		return ws, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	ws, err := s.client.RevenueWorkspace.Query().
		Where(revenueworkspace.HasUserWith(user.IDEQ(u.ID))).
		First(ctx)
	if err == nil {
		auth.GrantRevenueWorkspace(ctx, ws.ID, "owner")
		if _, memberErr := s.client.RevenueWorkspaceMember.Create().
			SetWorkspace(ws).
			SetUser(u).
			SetRole("owner").
			SetStatus("active").
			Save(ctx); memberErr != nil && !ent.IsConstraintError(memberErr) {
			return nil, memberErr
		}
		return ws, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	create := s.client.RevenueWorkspace.Create().SetUser(u)
	if u.WorkosOrgID != "" {
		create.SetWorkosOrgID(u.WorkosOrgID)
	}
	ws, err = create.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			// Concurrent first touch: the peer's row wins.
			ws, queryErr := s.client.RevenueWorkspace.Query().
				Where(revenueworkspace.HasUserWith(user.IDEQ(u.ID))).
				First(ctx)
			if queryErr == nil {
				auth.GrantRevenueWorkspace(ctx, ws.ID, "owner")
			}
			return ws, queryErr
		}
		return nil, err
	}
	auth.GrantRevenueWorkspace(ctx, ws.ID, "owner")
	if _, err := s.client.RevenueWorkspaceMember.Create().
		SetWorkspace(ws).
		SetUser(u).
		SetRole("owner").
		SetStatus("active").
		Save(ctx); err != nil {
		return nil, err
	}
	return ws, nil
}

// CurrentWorkspaceForOrg resolves an existing active workspace membership for
// the exact organization asserted by the current verified token. Unlike
// CurrentWorkspace, this authorization helper is read-only: it never creates a
// workspace or backfills membership while deciding access.
func (s *Service) CurrentWorkspaceForOrg(ctx context.Context, u *ent.User, workosOrgID string) (*ent.RevenueWorkspace, error) {
	workosOrgID = strings.TrimSpace(workosOrgID)
	if u == nil || workosOrgID == "" {
		return s.client.RevenueWorkspace.Query().
			Where(revenueworkspace.IDEQ(uuid.Nil)).
			First(ctx)
	}
	member, err := s.client.RevenueWorkspaceMember.Query().
		Where(
			revenueworkspacemember.StatusEQ("active"),
			revenueworkspacemember.HasUserWith(user.IDEQ(u.ID)),
			revenueworkspacemember.HasWorkspaceWith(revenueworkspace.WorkosOrgIDEQ(workosOrgID)),
		).
		WithWorkspace().
		Order(ent.Asc(revenueworkspacemember.FieldCreatedAt)).
		First(ctx)
	if err == nil {
		workspace, workspaceErr := member.Edges.WorkspaceOrErr()
		if workspaceErr != nil {
			return nil, workspaceErr
		}
		auth.GrantRevenueWorkspace(ctx, workspace.ID, member.Role)
		return workspace, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	workspace, err := s.client.RevenueWorkspace.Query().
		Where(
			revenueworkspace.WorkosOrgIDEQ(workosOrgID),
			revenueworkspace.HasUserWith(user.IDEQ(u.ID)),
		).
		First(ctx)
	if err != nil {
		return nil, err
	}
	auth.GrantRevenueWorkspace(ctx, workspace.ID, "owner")
	return workspace, nil
}

// WorkspaceCapability names one server-enforced workspace permission.
type WorkspaceCapability string

// Workspace capability constants define the operations granted by each role.
const (
	WorkspaceView          WorkspaceCapability = "view"
	WorkspaceContribute    WorkspaceCapability = "contribute"
	WorkspaceExecute       WorkspaceCapability = "execute"
	WorkspaceManageSources WorkspaceCapability = "manage_sources"
	WorkspaceManageMembers WorkspaceCapability = "manage_members"
	// WorkspaceManagePrivacy permits owners and admins to manage workspace
	// defaults. Mailbox policy and rules still require ownership in the privacy
	// service; a role alone never grants control of another user's content.
	WorkspaceManagePrivacy WorkspaceCapability = "manage_privacy"
	// WorkspaceShareCommunications is intentionally owner-only. Explicit
	// grants, revocations, and purges change access to mailbox content.
	WorkspaceShareCommunications WorkspaceCapability = "share_communications"
)

var workspaceRoleCapabilities = map[string]map[WorkspaceCapability]bool{
	"owner": {
		WorkspaceView: true, WorkspaceContribute: true, WorkspaceExecute: true,
		WorkspaceManageSources: true, WorkspaceManageMembers: true,
		WorkspaceManagePrivacy: true, WorkspaceShareCommunications: true,
	},
	"admin": {
		WorkspaceView: true, WorkspaceContribute: true, WorkspaceExecute: true,
		WorkspaceManageSources: true, WorkspaceManageMembers: true,
		WorkspaceManagePrivacy: true,
	},
	"member": {
		WorkspaceView: true, WorkspaceContribute: true, WorkspaceExecute: true,
	},
	"viewer": {WorkspaceView: true},
}

// WorkspaceRole returns the caller's active explicit role. The founding edge
// is accepted as owner only for pre-membership migration compatibility.
func (s *Service) WorkspaceRole(
	ctx context.Context,
	u *ent.User,
	ws *ent.RevenueWorkspace,
) (string, error) {
	member, err := s.client.RevenueWorkspaceMember.Query().
		Where(
			revenueworkspacemember.StatusEQ("active"),
			revenueworkspacemember.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
			revenueworkspacemember.HasUserWith(user.IDEQ(u.ID)),
		).
		Only(ctx)
	if err == nil {
		return member.Role, nil
	}
	if !ent.IsNotFound(err) {
		return "", err
	}
	isFounder, err := ws.QueryUser().Where(user.IDEQ(u.ID)).Exist(ctx)
	if err != nil {
		return "", err
	}
	if isFounder {
		return "owner", nil
	}
	return "", ErrForbidden
}

// RequireWorkspaceCapability authorizes an operation against an exact tenant
// and returns the caller's active role.
func (s *Service) RequireWorkspaceCapability(
	ctx context.Context,
	u *ent.User,
	ws *ent.RevenueWorkspace,
	capability WorkspaceCapability,
) (string, error) {
	role, err := s.WorkspaceRole(ctx, u, ws)
	if err != nil {
		return "", err
	}
	if !workspaceRoleCapabilities[role][capability] {
		return role, ErrForbidden
	}
	return role, nil
}

func (s *Service) currentWorkspaceWithCapability(
	ctx context.Context,
	u *ent.User,
	capability WorkspaceCapability,
) (*ent.RevenueWorkspace, error) {
	ws, err := s.CurrentWorkspace(ctx, u)
	if err != nil {
		return nil, err
	}
	if _, err := s.RequireWorkspaceCapability(ctx, u, ws, capability); err != nil {
		return nil, err
	}
	return ws, nil
}

// workspaceWithCapability resolves an exact workspace without creating or
// backfilling access. A nil ID preserves the existing current-workspace path.
func (s *Service) workspaceWithCapability(
	ctx context.Context,
	u *ent.User,
	workspaceID uuid.UUID,
	capability WorkspaceCapability,
) (*ent.RevenueWorkspace, error) {
	if workspaceID == uuid.Nil {
		return s.currentWorkspaceWithCapability(ctx, u, capability)
	}
	ws, err := s.client.RevenueWorkspace.Get(ctx, workspaceID)
	if ent.IsNotFound(err) {
		return nil, fmt.Errorf("%w: workspace", ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	role, err := s.RequireWorkspaceCapability(ctx, u, ws, capability)
	if err != nil {
		return nil, err
	}
	auth.GrantRevenueWorkspace(ctx, ws.ID, role)
	return ws, nil
}

// ListWorkspaceMembers returns the active and removed membership audit rows.
func (s *Service) ListWorkspaceMembers(ctx context.Context, u *ent.User) ([]*ent.RevenueWorkspaceMember, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	return s.client.RevenueWorkspaceMember.Query().
		Where(revenueworkspacemember.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID))).
		WithUser().
		Order(ent.Asc(revenueworkspacemember.FieldCreatedAt)).
		All(ctx)
}

// UpsertWorkspaceMember grants a pre-existing authenticated user a role. User
// provisioning remains the identity provider's responsibility.
func (s *Service) UpsertWorkspaceMember(
	ctx context.Context,
	actor *ent.User,
	targetUserID uuid.UUID,
	role string,
) (*ent.RevenueWorkspaceMember, error) {
	role = strings.ToLower(strings.TrimSpace(role))
	if role != "admin" && role != "member" && role != "viewer" {
		return nil, fmt.Errorf("%w: role must be admin, member, or viewer", ErrInvalidInput)
	}
	ws, err := s.CurrentWorkspace(ctx, actor)
	if err != nil {
		return nil, err
	}
	actorRole, err := s.RequireWorkspaceCapability(ctx, actor, ws, WorkspaceManageMembers)
	if err != nil {
		return nil, err
	}
	if role == "admin" && actorRole != "owner" {
		return nil, ErrForbidden
	}
	target, err := s.client.User.Get(ctx, targetUserID)
	if ent.IsNotFound(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	existing, err := s.client.RevenueWorkspaceMember.Query().
		Where(
			revenueworkspacemember.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
			revenueworkspacemember.HasUserWith(user.IDEQ(targetUserID)),
		).
		Only(ctx)
	if err == nil {
		if existing.Role == "owner" {
			return nil, ErrForbidden
		}
		return existing.Update().SetRole(role).SetStatus("active").Save(ctx)
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	return s.client.RevenueWorkspaceMember.Create().
		SetWorkspace(ws).SetUser(target).SetRole(role).SetStatus("active").Save(ctx)
}

// RemoveWorkspaceMember deactivates a tenant membership while preventing the
// protected owner membership from being removed through this path.
func (s *Service) RemoveWorkspaceMember(
	ctx context.Context,
	actor *ent.User,
	membershipID uuid.UUID,
) (*ent.RevenueWorkspaceMember, error) {
	ws, err := s.CurrentWorkspace(ctx, actor)
	if err != nil {
		return nil, err
	}
	actorRole, err := s.RequireWorkspaceCapability(ctx, actor, ws, WorkspaceManageMembers)
	if err != nil {
		return nil, err
	}
	member, err := s.client.RevenueWorkspaceMember.Query().
		Where(
			revenueworkspacemember.IDEQ(membershipID),
			revenueworkspacemember.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
		).
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if member.Role == "owner" || (member.Role == "admin" && actorRole != "owner") {
		return nil, ErrForbidden
	}
	return member.Update().SetStatus("removed").Save(ctx)
}

// LinkInput carries the OutboundConsole identifiers for a workspace link.
type LinkInput struct {
	OutboundOrganizationID string
	OutboundWorkspaceID    string
}

// LinkWorkspace completes the OutboundConsole workspace link. It requires a
// configured facade: linking is the act of turning preflight on, and there is
// nothing to link against when the facade is absent (fail closed).
//
// TODO(WP0.6): replace the trusted-identifier link with the server-verified
// WorkOS ↔ OutboundConsole handshake before multi-tenant rollout.
func (s *Service) LinkWorkspace(ctx context.Context, u *ent.User, in LinkInput) (*ent.RevenueWorkspace, error) {
	if strings.TrimSpace(in.OutboundWorkspaceID) == "" {
		return nil, fmt.Errorf("%w: outboundWorkspaceId is required", ErrInvalidInput)
	}
	if _, ok := s.facade.(disabledFacade); ok {
		return nil, ErrFacadeUnavailable
	}
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceManageSources)
	if err != nil {
		return nil, err
	}
	return ws.Update().
		SetOutboundOrganizationID(strings.TrimSpace(in.OutboundOrganizationID)).
		SetOutboundWorkspaceID(strings.TrimSpace(in.OutboundWorkspaceID)).
		SetMode(ModeLinked).
		SetStatus("active").
		SetLastVerifiedAt(s.now()).
		Save(ctx)
}

// --- relationships -----------------------------------------------------------

// RelationshipInput creates a revenue-memory relationship.
type RelationshipInput struct {
	Kind           string
	DisplayName    string
	PrimaryEmail   string
	AccountDomain  string
	Summary        string
	ResourceRefs   []string
	WorkspaceID    uuid.UUID
	IdempotencyKey string
}

// CreateRelationship records a relationship in the caller's workspace.
func (s *Service) CreateRelationship(ctx context.Context, u *ent.User, in RelationshipInput) (*ent.Relationship, error) {
	if strings.TrimSpace(in.DisplayName) == "" {
		return nil, fmt.Errorf("%w: displayName is required", ErrInvalidInput)
	}
	refs, err := normalizeResourceRefs(in.ResourceRefs)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
	}
	ws, err := s.workspaceWithCapability(ctx, u, in.WorkspaceID, WorkspaceContribute)
	if err != nil {
		return nil, err
	}

	var idempotencySignal relationshipIdentitySignal
	if key := strings.TrimSpace(in.IdempotencyKey); key != "" {
		if len(key) > 400 {
			return nil, fmt.Errorf("%w: idempotencyKey exceeds 400 bytes", ErrInvalidInput)
		}
		idempotencySignal = newRelationshipIdentitySignal("resource_ref", "oppulence", "oppulence:agent_create:"+key, 1)
		existing, lookupErr := s.client.RelationshipIdentity.Query().Where(
			relationshipidentity.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
			relationshipidentity.KeyHashEQ(idempotencySignal.KeyHash),
		).WithRelationship().Only(ctx)
		if lookupErr == nil {
			return existing.Edges.RelationshipOrErr()
		}
		if !ent.IsNotFound(lookupErr) {
			return nil, lookupErr
		}
	}

	tx, err := s.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	txc := tx.Client()
	create := txc.Relationship.Create().
		SetWorkspace(ws).
		SetUser(u).
		SetKind(in.Kind).
		SetDisplayName(strings.TrimSpace(in.DisplayName))
	email := normalizeEmail(in.PrimaryEmail)
	domain := companyAccountDomain(in.AccountDomain)
	// A copied "Name <addr>" or mailto link leaves the domain half as
	// "example>" . Keep the host from the address instead of that fragment.
	if !cleanAccountDomain(domain) {
		domain = accountDomain(email)
	}
	if email != "" {
		create.SetPrimaryEmail(email)
	}
	if domain != "" {
		create.SetAccountDomain(domain)
	}
	if in.Summary != "" {
		create.SetSummary(in.Summary)
	}
	if len(refs) > 0 {
		create.SetResourceRefs(refs)
	}
	rel, err := create.Save(ctx)
	if err != nil {
		if isValidationError(err) {
			return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
		}
		return nil, err
	}
	// Bind anchors here too. A hand-created relationship that skipped this stayed
	// invisible to the identity engine, so the next observation for the same address
	// resolved to nothing and forked a second relationship for the same account.
	// A collision surfaces as a reviewable candidate, exactly as it does on ingest.
	signals := relationshipIdentitySignals(rel)
	if idempotencySignal.KeyHash != "" {
		signals = append(signals, idempotencySignal)
	}
	if err := bindRelationshipIdentities(ctx, txc, ws, u, rel, signals, "user", rel.CreatedAt); err != nil {
		return nil, err
	}
	if idempotencySignal.KeyHash != "" {
		winner, err := txc.RelationshipIdentity.Query().Where(
			relationshipidentity.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
			relationshipidentity.KeyHashEQ(idempotencySignal.KeyHash),
		).WithRelationship().Only(ctx)
		if err != nil {
			return nil, err
		}
		owner, err := winner.Edges.RelationshipOrErr()
		if err != nil {
			return nil, err
		}
		if owner.ID != rel.ID {
			if err := tx.Rollback(); err != nil {
				return nil, err
			}
			return s.client.Relationship.Get(ctx, owner.ID)
		}
	}
	// People added before this company existed already share its domain.
	// Filing them here is what puts them on the company and in the directory.
	if err := attachExistingPeopleToCompany(ctx, txc, ws, u, rel); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return rel.Unwrap(), nil
}

// relationshipListLimit is one page of the company directory. The next page
// is the same filters with Offset set to how many rows are already on screen.
const relationshipListLimit = 200

// ListRelationships returns the workspace's relationships, most recent
// interaction first. A company with no interaction follows those, newest
// edit first. Each row includes its open queue actions so the caller can
// report open-loop counts.
func (s *Service) ListRelationships(ctx context.Context, u *ent.User) ([]*ent.Relationship, error) {
	page, err := s.ListRelationshipsFiltered(ctx, u, RelationshipListFilter{})
	if err != nil {
		return nil, err
	}
	return page.Relationships, nil
}

// RelationshipListFilter controls relationship list search, paging, and state filters.
type RelationshipListFilter struct {
	Query      string
	Lifecycle  string
	Health     string
	Engagement string
	Offset     int
}

// RelationshipListPage is one directory page. HasMore is true only when
// another row exists past this page, so an exact page of 200 is not offered
// as if a 201st company were waiting.
type RelationshipListPage struct {
	Relationships []*ent.Relationship
	HasMore       bool
}

// ListRelationshipsFiltered returns account mission-control rows with
// explainable-state filters shared by web and desktop. The Last interaction
// column is this order. Companies that share an interaction time stay in
// edit time, then id, so the next page does not repeat or skip one.
func (s *Service) ListRelationshipsFiltered(
	ctx context.Context,
	u *ent.User,
	filter RelationshipListFilter,
) (*RelationshipListPage, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	if err := s.reopenDueSnoozes(ctx, ws.ID); err != nil {
		return nil, err
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	q := s.client.Relationship.Query().
		Where(relationship.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)))
	if value := strings.TrimSpace(filter.Lifecycle); value != "" {
		// A new company is stored as prospect before any stage is chosen. The
		// company record says Not known until a correction or cited evidence
		// supports the stage, so the stage menu has to use that same rule.
		q.Where(
			relationship.LifecycleEQ(value),
			relationshipHasSupportedDimension("lifecycle", s.now()),
		)
	}
	if value := strings.TrimSpace(filter.Health); value != "" {
		q.Where(relationship.HealthEQ(value))
	}
	if value := strings.TrimSpace(filter.Engagement); value != "" {
		q.Where(relationship.EngagementEQ(value))
	}
	if value := strings.ToLower(strings.TrimSpace(filter.Query)); value != "" {
		parts := []predicate.Relationship{
			relationship.DisplayNameContainsFold(value),
			relationship.AccountDomainContainsFold(value),
			relationship.PrimaryEmailContainsFold(value),
			relationship.NextActionContainsFold(value),
			relationship.SummaryContainsFold(value),
			relationship.CompanyDescriptionContainsFold(value),
			relationship.LinkedinURLContainsFold(value),
			relationshipNormalizedContains(value),
			relationshipCategoryContains(value),
			relationshipEnrichmentContains(value),
		}
		if labels := relationshipLinkedInLabelMatch(value); labels != nil {
			parts = append(parts, labels)
		}
		if threads := relationshipEmailThreadLabelMatch(value); threads != nil {
			parts = append(parts, threads)
		}
		if columns := relationshipDirectoryColumnMatch(value, s.now()); columns != nil {
			parts = append(parts, columns)
		}
		if window, ok := visibleActivityWindow(value, time.Now()); ok {
			parts = append(parts, relationship.And(
				relationship.LastTouchAtNotNil(),
				relationship.LastTouchAtGT(window.after),
				relationship.LastTouchAtLTE(window.until),
			))
		}
		needle := normalizePersonSearch(value)
		if labelPhraseMatches("no activity", needle) {
			parts = append(parts, relationship.LastTouchAtIsNil())
		}
		if labelPhraseMatches("no description yet", needle) {
			parts = append(parts, relationship.And(
				relationshipTextBlank(relationship.FieldCompanyDescription),
				relationshipTextBlank(relationship.FieldSummary),
			))
		}
		if labelPhraseMatches("not filled in", needle) {
			parts = append(parts, relationship.Or(
				relationshipTextBlank(relationship.FieldAccountDomain),
				relationshipTextBlank(relationship.FieldPrimaryEmail),
				relationshipCategoriesBlank(),
			))
		}
		// A blank name with no domain is "Unknown company" on the row. A blank
		// name that still has a domain uses that host's title instead.
		if sheetPhraseMatches("unknown company", needle) {
			parts = append(parts, relationship.And(
				relationship.KindEQ("company"),
				relationshipTextBlank(relationship.FieldDisplayName),
				relationshipTextBlank(relationship.FieldAccountDomain),
			))
		}
		// Activity history prints "Open the source" when the summary is blank.
		// The email and meeting timeline prints "No message preview" when the
		// subject is blank. A hidden subject stays hidden: this matches only
		// a subject that is already empty.
		if sheetPhraseMatches("open the source", needle) {
			parts = append(parts, relationship.HasObservationsWith(observationSummaryBlank()))
		}
		if sheetPhraseMatches("no message preview", needle) {
			parts = append(parts, relationship.HasCommunicationInteractionsWith(communicationSubjectBlank()))
		}
		if mail := relationshipSheetMailMatch(needle); mail != nil {
			parts = append(parts, mail)
		}
		if empty := relationshipSheetEmptyCopyMatch(needle); empty != nil {
			parts = append(parts, empty)
		}
		// The subject and the address are the first two lines of each thread.
		// Searching either word has to open that company.
		parts = append(parts, relationship.HasMailThreadsWith(mailthread.Or(
			mailthread.SubjectContainsFold(value),
			mailthread.CounterpartyEmailContainsFold(value),
		)))
		if review := relationshipSheetReviewMatch(u.ID, needle); review != nil {
			parts = append(parts, review)
		}
		searchedAt := time.Now()
		if sheetPhraseMatches("no supported answer yet", needle) {
			// An open confirmed promise is the answer on the sheet. A company
			// that shows that promise is not "No supported answer yet."
			parts = append(parts, relationship.And(
				relationship.Not(relationshipHasSupportedStateAnswer(searchedAt)),
				relationship.Not(relationship.HasCommitmentsWith(visibleTruthCommitment())),
			))
		}
		if truth := relationshipSheetTruthPromiseMatch(needle, searchedAt); truth != nil {
			parts = append(parts, truth)
		}
		if band := relationshipAttentionBandMatch(needle); band != nil {
			parts = append(parts, band)
		}
		if people := relationshipSheetPeopleMatch(needle); people != nil {
			parts = append(parts, people)
		}
		// "Nothing recorded yet" contains "recorded", and the calendar
		// sentence contains "calendar". Those words are also activity
		// headings. The empty sentence is the company with no history.
		if activity := relationshipSheetActivityMatch(needle); activity != nil && !sheetEmptySentenceOwnsActivity(needle) {
			parts = append(parts, activity)
		}
		if subject := relationshipSheetActivitySubjectMatch(needle); subject != nil {
			parts = append(parts, subject)
		}
		if actionLabel := relationshipSheetActionLabelMatch(needle); actionLabel != nil {
			parts = append(parts, actionLabel)
		}
		parts = append(parts, relationship.HasCommitmentsWith(commitment.TextContainsFold(value)))
		if text := promiseLineText(needle); text != "" {
			parts = append(parts, relationship.HasCommitmentsWith(commitment.And(
				visibleTruthCommitment(),
				commitment.TextContainsFold(text),
			)))
		}
		if counts := relationshipSheetDetailCountMatch(needle); counts != nil {
			parts = append(parts, counts)
		}
		if sources := relationshipSheetDetailSourceMatch(needle); sources != nil {
			parts = append(parts, sources)
		}
		if completeness := relationshipSheetCompletenessMatch(needle); completeness != nil {
			parts = append(parts, completeness)
		}
		if sheetPhraseMatches("no next step", needle) ||
			sheetPhraseMatches("add an owner and a date for what happens next.", needle) {
			parts = append(parts, relationshipShowsMissingNextStep())
		}
		for _, lifecycle := range []string{"evaluation", "contracting", "onboarding", "renewal"} {
			phrase := strings.ToLower(fmt.Sprintf(
				"This company is in %s and has no next step.",
				attentionTokenLabel(lifecycle),
			))
			if sheetPhraseMatches(phrase, needle) {
				parts = append(parts, relationship.And(
					relationshipShowsMissingNextStep(),
					relationship.LifecycleEQ(lifecycle),
					relationship.Not(relationshipHasDegradedDependency()),
				))
			}
		}
		if degraded := relationshipSheetSourceDegradationMatch(needle); degraded != nil {
			parts = append(parts, degraded)
		}
		if quiet := relationshipSheetQuietMatch(needle, searchedAt); quiet != nil {
			parts = append(parts, quiet)
		}
		if risk := relationshipSheetRiskMatch(needle); risk != nil {
			parts = append(parts, risk)
		}
		if outcome := relationshipSheetActionOutcomeMatch(needle); outcome != nil {
			parts = append(parts, outcome)
		}
		if overdue := relationshipSheetOverdueMatch(needle, searchedAt); overdue != nil {
			parts = append(parts, overdue)
		}
		if recovery := relationshipSheetRecoveryMatch(needle); recovery != nil {
			parts = append(parts, recovery)
		}
		if followUp := relationshipSheetFollowUpEmptyMatch(needle, searchedAt); followUp != nil {
			parts = append(parts, followUp)
		}
		if plan := relationshipSheetPlanEmptyMatch(needle); plan != nil {
			parts = append(parts, plan)
		}
		if deletion := relationshipSheetDeletionEmptyMatch(needle); deletion != nil {
			parts = append(parts, deletion)
		}
		if accepted := relationshipSheetAcceptedPromiseMatch(needle); accepted != nil {
			parts = append(parts, accepted)
		}
		if contradiction := relationshipSheetContradictionMatch(needle); contradiction != nil {
			parts = append(parts, contradiction)
		}
		if suggestion := relationshipSheetSuggestionMatch(needle); suggestion != nil {
			parts = append(parts, suggestion)
		}
		if privacy := relationshipSheetPrivacyMatch(needle); privacy != nil {
			parts = append(parts, privacy)
		}
		if governance := relationshipSheetGovernanceMatch(needle); governance != nil {
			parts = append(parts, governance)
		}
		if sheetPhraseMatches("no action is currently recommended", needle) {
			// A confirmed promise with no draft says "No follow-up is drafted."
			parts = append(parts, relationship.And(
				relationship.Not(relationship.HasActionsWith(revenueaction.QueueStatusEQ(QueueOpen))),
				relationship.Not(relationship.HasCommitmentsWith(visibleTruthCommitment())),
			))
		}
		parts = append(parts, relationship.HasActionsWith(revenueaction.ReasonContainsFold(value)))
		q.Where(relationship.Or(parts...))
	}
	rows, err := q.
		WithActions(func(q *ent.RevenueActionQuery) {
			q.Where(revenueaction.QueueStatusEQ(QueueOpen))
		}).
		WithParticipants().
		WithMailThreads().
		WithCommitments().
		Order(
			relationship.ByLastTouchAt(sql.OrderDesc(), sql.OrderNullsLast()),
			relationship.ByUpdatedAt(sql.OrderDesc()),
			relationship.ByID(sql.OrderDesc()),
		).
		Limit(relationshipListLimit + 1).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > relationshipListLimit
	if hasMore {
		rows = rows[:relationshipListLimit]
	}
	return &RelationshipListPage{Relationships: rows, HasMore: hasMore}, nil
}

// relationshipNormalizedContains matches the words a teammate sees. A domain
// stored as dogfood-label.example is shown as "Dogfood Label", and a next
// action stored with a hyphen still has to match the phrase on the row.
func relationshipNormalizedContains(term string) predicate.Relationship {
	needle := "%" + escapePersonSearchLike(normalizePersonSearch(term)) + "%"
	return predicate.Relationship(func(s *sql.Selector) {
		parts := make([]*sql.Predicate, 0, len(relationshipSearchColumns))
		for _, field := range relationshipSearchColumns {
			parts = append(parts, normalizedSearchLike(s, field, needle))
		}
		s.Where(sql.Or(parts...))
	})
}

// relationshipSearchColumns are the text facts on a company row: the name,
// the domain, the email, the next action, and the description.
var relationshipSearchColumns = []string{
	relationship.FieldDisplayName,
	relationship.FieldAccountDomain,
	relationship.FieldPrimaryEmail,
	relationship.FieldNextAction,
	relationship.FieldSummary,
	relationship.FieldCompanyDescription,
}

// relationshipCategoryContains matches the category badge on the directory.
// The value is a JSON list, so Postgres has to read it as text. SQLite already
// stores that list as text.
func relationshipCategoryContains(term string) predicate.Relationship {
	needle := "%" + escapePersonSearchLike(strings.ToLower(strings.TrimSpace(term))) + "%"
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldCompanyCategories)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("lower(%s::text) LIKE ", column))
			} else {
				b.WriteString(fmt.Sprintf("lower(coalesce(%s, '')) LIKE ", column))
			}
			b.Arg(needle)
			b.WriteString(" ESCAPE '!'")
		}))
	})
}

// relationshipEnrichmentContains matches the research facts the directory
// can show: headquarters, employee range, funding, revenue, and growth
// signals. They live in one JSON object, so the search reads that object as
// text. The keys are not words on the row; a city or a range still has to match.
func relationshipEnrichmentContains(term string) predicate.Relationship {
	needle := "%" + escapePersonSearchLike(strings.ToLower(strings.TrimSpace(term))) + "%"
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldCompanyEnrichmentData)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("lower(%s::text) LIKE ", column))
			} else {
				b.WriteString(fmt.Sprintf("lower(coalesce(%s, '')) LIKE ", column))
			}
			b.Arg(needle)
			b.WriteString(" ESCAPE '!'")
		}))
	})
}

// relationshipLinkedInLabelMatch matches the LinkedIn column. A saved page or
// company reference reads "View profile". Every other company reads "Find profile".
func relationshipLinkedInLabelMatch(term string) predicate.Relationship {
	needle := normalizePersonSearch(term)
	if needle == "" {
		return nil
	}
	view := labelPhraseMatches("view profile", needle)
	find := labelPhraseMatches("find profile", needle)
	switch {
	case view && find:
		return relationshipMatchAll()
	case view:
		return relationshipSavedLinkedIn()
	case find:
		return relationship.Not(relationshipSavedLinkedIn())
	default:
		return nil
	}
}

func relationshipSavedLinkedIn() predicate.Relationship {
	return relationship.Or(
		relationship.And(
			relationship.LinkedinURLNotNil(),
			relationship.LinkedinURLNEQ(""),
		),
		relationshipResourceRefContains("linkedin:company:"),
	)
}

func relationshipResourceRefContains(fragment string) predicate.Relationship {
	needle := "%" + escapePersonSearchLike(strings.ToLower(fragment)) + "%"
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldResourceRefs)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("lower(%s::text) LIKE ", column))
			} else {
				b.WriteString(fmt.Sprintf("lower(coalesce(%s, '')) LIKE ", column))
			}
			b.Arg(needle)
			b.WriteString(" ESCAPE '!'")
		}))
	})
}

func relationshipMatchAll() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) { b.WriteString("1 = 1") }))
	})
}

// relationshipEmailThreadLabelMatch matches the Email threads column.
// Zero is "0 email threads" and one is "1 email thread".
func relationshipEmailThreadLabelMatch(term string) predicate.Relationship {
	needle := normalizePersonSearch(term)
	if needle == "" {
		return nil
	}
	if n, ok := exactEmailThreadCount(needle); ok {
		return relationshipMailThreadCount("=", n)
	}
	singular := labelPhraseMatches("1 email thread", needle)
	plural := labelPhraseMatches("email threads", needle)
	switch {
	case singular && plural:
		return relationshipMatchAll()
	case singular:
		return relationshipMailThreadCount("=", 1)
	case plural:
		return relationshipMailThreadCount("<>", 1)
	default:
		return nil
	}
}

func exactEmailThreadCount(needle string) (int, bool) {
	var n int
	if _, err := fmt.Sscanf(needle, "%d email thread", &n); err != nil || n < 0 {
		return 0, false
	}
	label := fmt.Sprintf("%d email threads", n)
	if n == 1 {
		label = "1 email thread"
	}
	if needle != label {
		return 0, false
	}
	return n, true
}

// relationshipDirectoryColumnMatch matches the columns that open with the
// directory: Health, People, and the next-action sentence. Health is stored
// as a token and printed as a title. People is the participant count. A blank
// next action reads "No open action", or "2 open actions" when drafts exist.
func relationshipDirectoryColumnMatch(term string, now time.Time) predicate.Relationship {
	needle := normalizePersonSearch(term)
	if needle == "" {
		return nil
	}
	var preds []predicate.Relationship
	if health := relationshipHealthLabelMatch(needle); health != nil {
		preds = append(preds, health)
	}
	if lifecycle := relationshipLifecycleLabelMatch(needle, now); lifecycle != nil {
		preds = append(preds, lifecycle)
	}
	if engagement := relationshipClosedLabelMatch(needle, now, "engagement", engagementSearchLabels, relationship.EngagementIn); engagement != nil {
		preds = append(preds, engagement)
	}
	if sentiment := relationshipClosedLabelMatch(needle, now, "sentiment", sentimentSearchLabels, relationship.SentimentIn); sentiment != nil {
		preds = append(preds, sentiment)
	}
	if n, ok := exactPersonCompanyCount(needle); ok {
		preds = append(preds, relationshipParticipantCount("=", n))
		// "2 open actions" also prints that number. A bare "2" has to find it,
		// and it must not pull in every company that has some other count.
		if n >= 1 {
			preds = append(preds, relationship.And(
				relationshipNextActionBlank(),
				relationshipOpenActionCount("=", n),
			))
		}
	}
	if action := relationshipOpenActionLabelMatch(needle); action != nil {
		preds = append(preds, action)
	}
	if len(preds) == 0 {
		return nil
	}
	return relationship.Or(preds...)
}

func relationshipHealthLabelMatch(needle string) predicate.Relationship {
	// The directory Health badge prints "Not known" for the stored value
	// unknown. The stored word still matches on its own.
	if needle == "not known" {
		return relationship.HealthEQ("unknown")
	}
	labels := []struct {
		label string
		value string
	}{
		{"unknown", "unknown"},
		{"healthy", "healthy"},
		{"needs attention", "needs_attention"},
		{"critical", "critical"},
	}
	values := make([]string, 0, len(labels))
	for _, item := range labels {
		if sheetPhraseMatches(item.label, needle) {
			values = append(values, item.value)
		}
	}
	if len(values) == 0 {
		return nil
	}
	if len(values) == len(labels) {
		return relationshipMatchAll()
	}
	return relationship.HealthIn(values...)
}

func relationshipLifecycleLabelMatch(needle string, now time.Time) predicate.Relationship {
	labels := []struct {
		label string
		value string
	}{
		{"prospect", "prospect"},
		{"evaluation", "evaluation"},
		{"contracting", "contracting"},
		{"onboarding", "onboarding"},
		{"active customer", "active_customer"},
		{"renewal", "renewal"},
		{"churned", "churned"},
		{"former customer", "former_customer"},
	}
	values := make([]string, 0, len(labels))
	for _, item := range labels {
		if sheetPhraseMatches(item.label, needle) {
			values = append(values, item.value)
		}
	}
	if len(values) == 0 {
		return nil
	}
	// A new company is stored as prospect before anyone chooses a stage. The
	// sheet and the stage menu say Not known until a correction or cited
	// evidence supports that stage, so typing the stage has to use that rule.
	var stored predicate.Relationship
	if len(values) == len(labels) {
		stored = relationshipMatchAll()
	} else {
		stored = relationship.LifecycleIn(values...)
	}
	return relationship.And(stored, relationshipHasSupportedDimension("lifecycle", now))
}

// engagementSearchLabels are the words on the company sheet. The stored token
// stays declining. A default of unknown is printed as Not known.
var engagementSearchLabels = []searchLabel{
	{"increasing", "increasing"},
	{"steady", "steady"},
	{"declining", "declining"},
	{"dormant", "dormant"},
}

// sentimentSearchLabels are the words on the company sheet. Unknown is Not known.
var sentimentSearchLabels = []searchLabel{
	{"positive", "positive"},
	{"mixed", "mixed"},
	{"negative", "negative"},
}

type searchLabel struct {
	label string
	value string
}

// relationshipClosedLabelMatch matches a sheet word only after that detail is
// supported. The stored column can already say declining or negative while the
// sheet still says Not known.
func relationshipClosedLabelMatch(
	needle string,
	now time.Time,
	dimension string,
	labels []searchLabel,
	in func(...string) predicate.Relationship,
) predicate.Relationship {
	values := make([]string, 0, len(labels))
	for _, item := range labels {
		if sheetPhraseMatches(item.label, needle) {
			values = append(values, item.value)
		}
	}
	if len(values) == 0 {
		return nil
	}
	var stored predicate.Relationship
	if len(values) == len(labels) {
		stored = relationshipMatchAll()
	} else {
		stored = in(values...)
	}
	return relationship.And(stored, relationshipHasSupportedDimension(dimension, now))
}

func relationshipOpenActionLabelMatch(needle string) predicate.Relationship {
	// A bare number is the People column, and the exact open-action count above.
	// Treating it as a substring of "1 open action" would match every draft.
	if _, ok := exactPersonCompanyCount(needle); ok {
		return nil
	}
	if n, ok := exactOpenActionCount(needle); ok {
		return relationship.And(relationshipNextActionBlank(), relationshipOpenActionCount("=", n))
	}
	none := labelPhraseMatches("no open action", needle)
	some := labelPhraseMatches("open actions", needle) || labelPhraseMatches("1 open action", needle)
	switch {
	case none && some:
		return relationshipNextActionBlank()
	case none:
		return relationship.And(relationshipNextActionBlank(), relationshipOpenActionCount("=", 0))
	case some:
		return relationship.And(relationshipNextActionBlank(), relationshipOpenActionCount("<>", 0))
	default:
		return nil
	}
}

func exactOpenActionCount(needle string) (int, bool) {
	var n int
	if _, err := fmt.Sscanf(needle, "%d open action", &n); err != nil || n < 1 {
		return 0, false
	}
	label := fmt.Sprintf("%d open actions", n)
	if n == 1 {
		label = "1 open action"
	}
	if needle != label {
		return 0, false
	}
	return n, true
}

func relationshipNextActionBlank() predicate.Relationship {
	return relationship.Or(relationship.NextActionIsNil(), relationship.NextActionEQ(""))
}

// relationshipTextBlank matches a description the sheet prints as empty.
// A whitespace-only summary still reads "No description yet".
// relationshipShowsMissingNextStep is the suggestion "No next step". A prospect
// with a blank next step does not print that card.
func relationshipShowsMissingNextStep() predicate.Relationship {
	return relationship.And(
		relationshipTextBlank(relationship.FieldNextAction),
		relationship.LifecycleIn("evaluation", "contracting", "onboarding", "renewal"),
	)
}

// relationshipSheetSourceDegradationMatch matches the attention sentence for a
// connector that is incomplete, stale, rebuilding, or missing a permission.
// The joined sentence is exact: "Slack evidence…" stays off a company whose
// warning actually says "Google and Slack evidence…".
func relationshipSheetSourceDegradationMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if sheetPhraseMatches("source needs reconnecting", needle) {
		preds = append(preds, relationshipHasDegradedDependency())
	}
	type sourceWarning struct {
		phrase string
		pred   predicate.Relationship
	}
	families := []string{"google", "hubspot", "slack"}
	warnings := make([]sourceWarning, 0, (1<<len(families))-1)
	for mask := 1; mask < 1<<len(families); mask++ {
		sources := make([]string, 0, len(families))
		for i, family := range families {
			if mask&(1<<i) != 0 {
				sources = append(sources, family)
			}
		}
		warnings = append(warnings, sourceWarning{
			phrase: normalizePersonSearch(sourceDegradationExplanation(sources)),
			pred:   relationshipDegradedCanonicalSet(sources),
		})
	}
	exact := false
	for _, warning := range warnings {
		if needle == warning.phrase {
			preds = append(preds, warning.pred)
			exact = true
			break
		}
	}
	if !exact {
		for _, warning := range warnings {
			if sheetPhraseMatches(warning.phrase, needle) {
				preds = append(preds, warning.pred)
			}
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// relationshipSheetQuietMatch matches the quiet-account sentence. The day count
// and the stage are part of the sentence, so "Prospects … within 30 days" stays
// off an active customer, and a company under the stage's usual silence does
// not match. A departed contact prints a different sentence.
func relationshipSheetQuietMatch(needle string, now time.Time) predicate.Relationship {
	if days, cohort, usual, ok := parseQuietSentence(needle); ok {
		for _, lifecycle := range quietSearchLifecycles() {
			if normalizePersonSearch(quietAccountCohort(lifecycle)) != cohort {
				continue
			}
			if int(lifecycleQuietCooldown(lifecycle).Hours()/24) != usual {
				continue
			}
			return relationship.And(
				relationshipQuietFor(now, lifecycle, days),
				relationship.Not(relationshipHasDepartedContact()),
			)
		}
		return relationship.IDEQ(uuid.Nil)
	}
	var preds []predicate.Relationship
	if sheetPhraseMatches("quiet account", needle) ||
		sheetPhraseMatches("no recorded interaction", needle) {
		preds = append(preds, relationshipShowsQuietAccount(now))
	}
	for _, lifecycle := range quietSearchLifecycles() {
		usual := int(lifecycleQuietCooldown(lifecycle).Hours() / 24)
		clause := normalizePersonSearch(fmt.Sprintf(
			"%s are usually contacted again within %d days.",
			quietAccountCohort(lifecycle), usual,
		))
		if sheetPhraseMatches(clause, needle) {
			preds = append(preds, relationship.And(
				relationshipQuietFor(now, lifecycle, 0),
				relationship.Not(relationshipHasDepartedContact()),
			))
		}
	}
	if sheetPhraseMatches("mail to that address is no longer delivered", needle) ||
		sheetPhraseMatches("because there is nobody here to reply", needle) {
		preds = append(preds, relationshipShowsDepartedQuiet(now))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func quietSearchLifecycles() []string {
	return []string{
		"prospect", "evaluation", "contracting", "onboarding",
		"active_customer", "renewal", "former_customer",
	}
}

func parseQuietSentence(needle string) (days int, cohort string, usual int, ok bool) {
	const prefix = "no recorded interaction for "
	const daysMark = " days "
	const tail = " are usually contacted again within "
	const suffix = " days"
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, suffix) {
		return 0, "", 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), suffix)
	dayText, rest, found := strings.Cut(body, daysMark)
	if !found {
		return 0, "", 0, false
	}
	cohort, usualText, found := strings.Cut(rest, tail)
	if !found || cohort == "" || usualText == "" {
		return 0, "", 0, false
	}
	var err error
	days, err = strconv.Atoi(dayText)
	if err != nil || days < 0 {
		return 0, "", 0, false
	}
	usual, err = strconv.Atoi(usualText)
	if err != nil || usual < 0 {
		return 0, "", 0, false
	}
	return days, cohort, usual, true
}

func relationshipShowsQuietAccount(now time.Time) predicate.Relationship {
	parts := make([]predicate.Relationship, 0, len(quietSearchLifecycles()))
	for _, lifecycle := range quietSearchLifecycles() {
		parts = append(parts, relationshipQuietFor(now, lifecycle, 0))
	}
	return relationship.And(relationship.Or(parts...), relationship.Not(relationshipHasDepartedContact()))
}

func relationshipShowsDepartedQuiet(now time.Time) predicate.Relationship {
	parts := make([]predicate.Relationship, 0, len(quietSearchLifecycles()))
	for _, lifecycle := range quietSearchLifecycles() {
		parts = append(parts, relationshipQuietFor(now, lifecycle, 0))
	}
	return relationship.And(relationship.Or(parts...), relationshipHasDepartedContact())
}

func relationshipQuietFor(now time.Time, lifecycle string, exactDays int) predicate.Relationship {
	usual := int(lifecycleQuietCooldown(lifecycle).Hours() / 24)
	if usual <= 0 {
		return relationship.IDEQ(uuid.Nil)
	}
	var age predicate.Relationship
	if exactDays > 0 {
		if exactDays < usual {
			return relationship.IDEQ(uuid.Nil)
		}
		age = relationshipQuietForExactly(now, exactDays)
	} else {
		age = relationshipQuietForAtLeast(now, usual)
	}
	return relationship.And(
		relationship.LifecycleEQ(lifecycle),
		age,
		relationship.Not(relationshipHasDegradedDependency()),
	)
}

func relationshipQuietForAtLeast(now time.Time, days int) predicate.Relationship {
	cutoff := now.UTC().Add(-time.Duration(days) * 24 * time.Hour)
	return relationship.And(
		relationship.LastTouchAtNotNil(),
		relationship.LastTouchAtLTE(cutoff),
	)
}

func relationshipQuietForExactly(now time.Time, days int) predicate.Relationship {
	newest := now.UTC().Add(-time.Duration(days) * 24 * time.Hour)
	oldest := now.UTC().Add(-time.Duration(days+1) * 24 * time.Hour)
	return relationship.And(
		relationship.LastTouchAtNotNil(),
		relationship.LastTouchAtLTE(newest),
		relationship.LastTouchAtGT(oldest),
	)
}

func relationshipHasDepartedContact() predicate.Relationship {
	return relationship.HasParticipantsWith(
		relationshipparticipant.HasPersonWith(
			person.EmploymentStatusEQ("departed"),
			person.StatusEQ("active"),
		),
	)
}

// relationshipSheetPeopleMatch is the people section on the company sheet.
// The role is stored with underscores, the badge says Left the company, and
// a person with no title, company, seniority, or location says there are no
// profile details yet.
func relationshipSheetPeopleMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if role := relationshipParticipantRoleMatch(needle); role != nil {
		preds = append(preds, role)
	}
	if queryHasPhrase("left the company", needle) {
		preds = append(preds, relationshipHasDepartedContact())
	}
	if queryHasPhrase("no profile details yet", needle) {
		preds = append(preds, relationshipShowsEmptyPersonProfile())
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipParticipantRoleMatch(needle string) predicate.Relationship {
	if needle == "" {
		return nil
	}
	like := "%" + escapePersonSearchLike(needle) + "%"
	return relationship.HasParticipantsWith(predicate.RelationshipParticipant(func(s *sql.Selector) {
		s.Where(normalizedSearchLike(s, relationshipparticipant.FieldRole, like))
	}))
}

func relationshipShowsEmptyPersonProfile() predicate.Relationship {
	return relationship.HasParticipantsWith(
		participantTextBlank(relationshipparticipant.FieldTitle),
		relationshipparticipant.Or(
			relationshipparticipant.Not(relationshipparticipant.HasPerson()),
			relationshipparticipant.HasPersonWith(
				personTextMissing(person.FieldTitle),
				personTextMissing(person.FieldOrgName),
				personTextMissing(person.FieldSeniority),
				personTextMissing(person.FieldLocation),
			),
		),
	)
}

func participantTextBlank(field string) predicate.RelationshipParticipant {
	return predicate.RelationshipParticipant(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(field)))
		}))
	})
}

// Activity history prints "Added by you · Note saved". The stored row is
// source user and event note. The same heading is used for every source and
// event the timeline knows.
var activitySourceSearchLabels = []struct {
	phrase string
	source string
}{
	{"gmail", "gmail"},
	{"calendar", "calendar"},
	{"slack", "slack"},
	{"hubspot", "hubspot"},
	{"a meeting", "meeting"},
	{"a note", "desktop_note"},
	{"a voice note", "voice_note"},
	{"the browser", "browser"},
	{"the crm", "crm"},
	{"added by you", "user"},
	{"a connected app", "composio"},
}

var activityEventSearchLabels = []struct {
	phrase string
	event  string
}{
	{"mail updated", "thread.updated"},
	{"mail", "thread"},
	{"mail", "thread.snapshot"},
	{"message", "message.posted"},
	{"message", "message.snapshot"},
	{"message", "message.created"},
	{"meeting updated", "event.updated"},
	{"meeting", "meeting.snapshot"},
	{"company added", "company.created"},
	{"company updated", "company.updated"},
	{"company record", "company.snapshot"},
	{"recorded", "relationship.observed"},
	{"reviewed", "relationship.reviewed"},
	{"person added", "person_added"},
	{"note saved", "note"},
	{"note removed", "note_deleted"},
	{"promise confirmed", "commitment_confirmed"},
	{"promise added", "commitment_created"},
	{"promise updated", "commitment_status_changed"},
	{"promise evidence", "commitment_evidence_observed"},
	{"lifecycle updated", "lifecycle_changed"},
	{"lifecycle updated", "lifecycle_observed"},
	{"deal stage updated", "deal_stage_changed"},
	{"meeting missing", "meeting_missing"},
	{"engagement changed", "engagement_declined"},
	{"engagement changed", "engagement_changed"},
	{"contact left", "contact_departed"},
	{"conversation reviewed", "conversation_evidence_compiled"},
	{"conversation corrected", "conversation_evidence_corrected"},
	{"contradiction resolved", "relationship_contradiction_resolved"},
	{"crm activity", "crm.activity"},
	{"plan response", "mutual_action_plan_response_received"},
	{"action recorded", "oppulence_action"},
	{"message sent", "action.outcome.sent"},
	{"delivered", "action.outcome.delivered"},
	{"bounced", "action.outcome.bounced"},
	{"they replied", "action.outcome.replied"},
	{"meeting booked", "action.outcome.meeting_booked"},
	{"won", "action.outcome.won"},
	{"lost", "action.outcome.lost"},
	{"dismissed", "action.outcome.dismissed"},
	{"not a good suggestion", "action.outcome.bad_recommendation"},
	{"deal moved forward", "action.outcome.deal_advanced"},
	{"onboarding moved forward", "action.outcome.onboarding_progressed"},
	{"renewed", "action.outcome.renewed"},
	{"escalated", "action.outcome.escalated"},
	{"they left", "action.outcome.churned"},
	{"corrected", "action.outcome.corrected"},
}

// relationshipSheetActivitySubjectMatch is "Subject: …" on an opened activity.
// Gmail stores the thread subject on the note. The row summary is a longer
// sentence, so the subject line stays visible. A subject that repeats the
// summary is not printed again. local-user is not a subject.
func relationshipSheetActivitySubjectMatch(needle string) predicate.Relationship {
	const marker = "subject: "
	index := strings.Index(needle, marker)
	if index < 0 {
		return nil
	}
	subject := strings.TrimSpace(needle[index+len(marker):])
	if subject == "" {
		return nil
	}
	return relationship.HasObservationsWith(observationFactSubject(subject))
}

func observationFactSubject(subject string) predicate.RelationshipObservation {
	return predicate.RelationshipObservation(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			facts := s.C(relationshipobservation.FieldNormalizedFactsJSON)
			summary := s.C(relationshipobservation.FieldSummary)
			b.WriteString("(")
			writeSubjectTrim(b, s, facts)
			b.WriteString(" <> '' AND ")
			writeSubjectTrim(b, s, facts)
			b.WriteString(" NOT IN ('local-user', 'meeting-counterparty') AND ")
			writeNormalizedSubject(b, s, facts)
			b.WriteString(" = ")
			b.Arg(subject)
			b.WriteString(" AND (")
			writeSubjectToken(b, s, facts)
			b.WriteString(" OR ")
			writeSubjectTrim(b, s, facts)
			b.WriteString(" <> ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("btrim(coalesce(")
			} else {
				b.WriteString("trim(coalesce(")
			}
			b.WriteString(summary)
			b.WriteString(", ''))))")
		}))
	})
}

func writeSubjectTrim(b *sql.Builder, s *sql.Selector, facts string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("btrim(coalesce(")
		b.WriteString(facts)
		b.WriteString("::jsonb->>'subject', ''))")
		return
	}
	b.WriteString("trim(coalesce(json_extract(")
	b.WriteString(facts)
	b.WriteString(", '$.subject'), ''))")
}

func writeNormalizedSubject(b *sql.Builder, s *sql.Selector, facts string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("btrim(regexp_replace(replace(replace(replace(lower(")
		writeSubjectTrim(b, s, facts)
		b.WriteString("), '-', ' '), '_', ' '), '.', ' '), '[[:space:]]+', ' ', 'g'))")
		return
	}
	b.WriteString("trim(")
	for range 4 {
		b.WriteString("replace(")
	}
	b.WriteString("replace(replace(replace(lower(")
	writeSubjectTrim(b, s, facts)
	b.WriteString("), '-', ' '), '_', ' '), '.', ' ')")
	for range 4 {
		b.WriteString(", '  ', ' ')")
	}
	b.WriteString(")")
}

func writeSubjectToken(b *sql.Builder, s *sql.Selector, facts string) {
	if s.Dialect() == dialect.Postgres {
		writeSubjectTrim(b, s, facts)
		b.WriteString(" ~ '^[a-z0-9_]*_[a-z0-9_]*$'")
		return
	}
	writeSubjectTrim(b, s, facts)
	b.WriteString(" GLOB '[a-z0-9_]*_[a-z0-9_]*'")
}

func relationshipSheetActivityMatch(needle string) predicate.Relationship {
	if strings.Contains(needle, "·") {
		sides := strings.Split(needle, "·")
		if len(sides) == 2 {
			source := activitySources(normalizePersonSearch(sides[0]))
			event := activityEvents(normalizePersonSearch(sides[1]))
			if len(source) > 0 && len(event) > 0 {
				return relationship.HasObservationsWith(relationshipobservation.And(
					relationshipobservation.SourceIn(source...),
					relationshipobservation.EventTypeIn(event...),
				))
			}
		}
	}
	sources := activitySources(needle)
	events := activityEvents(needle)
	switch {
	case len(sources) > 0 && len(events) > 0:
		return relationship.HasObservationsWith(relationshipobservation.And(
			relationshipobservation.SourceIn(sources...),
			relationshipobservation.EventTypeIn(events...),
		))
	case len(sources) > 0:
		return relationship.HasObservationsWith(relationshipobservation.SourceIn(sources...))
	case len(events) > 0:
		return relationship.HasObservationsWith(relationshipobservation.EventTypeIn(events...))
	default:
		return nil
	}
}

func activitySources(needle string) []string {
	return longestActivityMatches(needle, func(yield func(phrase, value string)) {
		for _, item := range activitySourceSearchLabels {
			yield(item.phrase, item.source)
		}
	})
}

func activityEvents(needle string) []string {
	return longestActivityMatches(needle, func(yield func(phrase, value string)) {
		for _, item := range activityEventSearchLabels {
			yield(item.phrase, item.event)
		}
	})
}

// longestActivityMatches keeps the heading that was typed. "Conversation
// reviewed" contains "reviewed", and the shorter heading is a different event.
func longestActivityMatches(needle string, each func(func(phrase, value string))) []string {
	type match struct{ phrase, value string }
	var matched []match
	each(func(phrase, value string) {
		if queryHasPhrase(phrase, needle) {
			matched = append(matched, match{phrase, value})
		}
	})
	var values []string
	seen := map[string]bool{}
	for _, item := range matched {
		shadowed := false
		for _, other := range matched {
			if len(other.phrase) > len(item.phrase) && strings.Contains(needle, other.phrase) && strings.Contains(other.phrase, item.phrase) {
				shadowed = true
				break
			}
		}
		if shadowed || seen[item.value] {
			continue
		}
		seen[item.value] = true
		values = append(values, item.value)
	}
	return values
}

// relationshipSheetRiskMatch matches the unresolved-risk sentence. "1 unresolved
// risk" stays off a company whose queue says "2 unresolved risks", and a
// critical company with no risks does not match.
func relationshipSheetRiskMatch(needle string) predicate.Relationship {
	var exact []predicate.Relationship
	for _, health := range []string{"critical", "needs_attention"} {
		for n := 1; n <= 40; n++ {
			if needle != normalizePersonSearch(unresolvedRiskExplanation(n, health)) {
				continue
			}
			exact = append(exact, relationship.And(
				relationship.HealthEQ(health),
				relationshipRiskCount("=", n),
			))
		}
	}
	if len(exact) == 1 {
		return exact[0]
	}
	if len(exact) > 1 {
		return relationship.Or(exact...)
	}
	var preds []predicate.Relationship
	if needle == "unresolved risk" {
		preds = append(preds, relationshipHasUnresolvedRisk())
	}
	if needle == "unresolved risks" {
		preds = append(preds, relationship.And(
			relationshipHasUnresolvedRisk(),
			relationshipRiskCount(">=", 2),
		))
	}
	if sheetPhraseMatches("this company is critical", needle) {
		preds = append(preds, relationship.And(
			relationship.HealthEQ("critical"),
			relationshipRiskCount(">=", 1),
		))
	}
	if sheetPhraseMatches("this company needs attention", needle) {
		preds = append(preds, relationship.And(
			relationship.HealthEQ("needs_attention"),
			relationshipRiskCount(">=", 1),
		))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipHasUnresolvedRisk() predicate.Relationship {
	return relationship.And(
		relationship.HealthIn("critical", "needs_attention"),
		relationshipRiskCount(">=", 1),
	)
}

// relationshipSheetActionOutcomeMatch matches the sentence for a send that
// failed, may have gone through, or needs a manual review. "The email action
// failed" stays off a company whose failed send was Slack.
func relationshipSheetActionOutcomeMatch(needle string) predicate.Relationship {
	type outcomeWarning struct {
		phrase string
		pred   predicate.Relationship
	}
	channels := []string{"email", "slack", "call", "crm_task", "crm", "task", "calendar"}
	warnings := make([]outcomeWarning, 0, len(channels)*3)
	for _, channel := range channels {
		kind := strings.ToLower(attentionTokenLabel(channel))
		warnings = append(warnings,
			outcomeWarning{
				normalizePersonSearch(actionOutcomeExplanation(channel, ExecFailed, "")),
				relationshipHasActionOutcome(kind, "failed"),
			},
			outcomeWarning{
				normalizePersonSearch(actionOutcomeExplanation(channel, ExecAmbiguous, "")),
				relationshipHasActionOutcome(kind, "ambiguous"),
			},
			outcomeWarning{
				normalizePersonSearch(actionOutcomeExplanation(channel, "pending", "manual_review")),
				relationshipHasActionOutcome(kind, "manual_review"),
			},
		)
	}
	for _, warning := range warnings {
		if needle == warning.phrase {
			return warning.pred
		}
	}
	var preds []predicate.Relationship
	if needle == "action needs review" {
		preds = append(preds, relationshipHasActionOutcome("", "any"))
	}
	for _, warning := range warnings {
		if sheetPhraseMatches(warning.phrase, needle) {
			preds = append(preds, warning.pred)
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipHasActionOutcome(kind, mode string) predicate.Relationship {
	return relationship.HasActionsWith(revenueActionOutcome(kind, mode))
}

func revenueActionOutcome(kind, mode string) predicate.RevenueAction {
	preds := make([]predicate.RevenueAction, 0, 2)
	if kind != "" {
		preds = append(preds, revenueActionChannelIs(kind))
	}
	switch mode {
	case "failed":
		preds = append(preds, revenueaction.ExecutionStatusEQ(ExecFailed))
	case "ambiguous":
		preds = append(preds, revenueaction.ExecutionStatusEQ(ExecAmbiguous))
	case "manual_review":
		preds = append(preds, revenueaction.And(
			revenueaction.ReconciliationStatusEQ("manual_review"),
			revenueaction.Not(revenueaction.ExecutionStatusEQ(ExecFailed)),
			revenueaction.Not(revenueaction.ExecutionStatusEQ(ExecAmbiguous)),
		))
	default:
		preds = append(preds, revenueaction.Or(
			revenueaction.ExecutionStatusEQ(ExecFailed),
			revenueaction.ExecutionStatusEQ(ExecAmbiguous),
			revenueaction.ReconciliationStatusEQ("manual_review"),
		))
	}
	if len(preds) == 1 {
		return preds[0]
	}
	return revenueaction.And(preds...)
}

func revenueActionChannelIs(kind string) predicate.RevenueAction {
	return predicate.RevenueAction(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("trim(lower(replace(replace(")
			b.WriteString(s.C(revenueaction.FieldChannel))
			b.WriteString(", '_', ' '), '.', ' '))) = ")
			b.Arg(kind)
		}))
	})
}

// relationshipSheetOverdueMatch matches the overdue-promise sentence, including
// the day count. One day and three days are different sentences.
func relationshipSheetOverdueMatch(needle string, now time.Time) predicate.Relationship {
	for days := 1; days <= 120; days++ {
		if needle == normalizePersonSearch(overdueCommitmentExplanation(days)) {
			return relationship.HasCommitmentsWith(overdueCommitmentWindow(now, days))
		}
	}
	var preds []predicate.Relationship
	if needle == "overdue promise" ||
		sheetPhraseMatches("a confirmed commitment is overdue", needle) ||
		sheetPhraseMatches("a confirmed promise is overdue", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(overdueCommitmentAny(now)))
	}
	for days := 1; days <= 120; days++ {
		phrase := normalizePersonSearch(overdueCommitmentExplanation(days))
		if sheetPhraseMatches(phrase, needle) {
			preds = append(preds, relationship.HasCommitmentsWith(overdueCommitmentWindow(now, days)))
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// recoverySearchPhrase is one sentence the promise follow-up list prints, and
// the stored artifact that prints it. A heading matches every latest evaluation
// of that kind. A body matches the explanation that is still stored.
type recoverySearchPhrase struct {
	phrase          string
	classification  string
	explanation     string
	explanationLike string
}

func recoverySearchPhrases() []recoverySearchPhrase {
	classes := []string{
		"forgotten", "unknown_stale_sources", "fulfilled", "likely_fulfilled",
		"superseded", "renegotiated", "blocked",
	}
	phrases := make([]recoverySearchPhrase, 0, len(classes)*3+3)
	for _, class := range classes {
		phrases = append(phrases, recoverySearchPhrase{
			phrase:         normalizePersonSearch(recoveryClassificationLabel(class)),
			classification: class,
		})
		explanation := recoveryExplanation(class, nil)
		if class == "unknown_stale_sources" {
			explanation = recoveryExplanation(class, []string{"source"})
		}
		phrases = append(phrases, recoverySearchPhrase{
			phrase:         normalizePersonSearch(explanation),
			classification: class,
			explanation:    explanation,
		})
		review := recoveryClassificationLabel(class) + ". Review it before acting."
		phrases = append(phrases, recoverySearchPhrase{
			phrase:         normalizePersonSearch(review),
			classification: class,
			explanation: fmt.Sprintf(
				"Fresh evidence suggests %s; human review is required.", class,
			),
		})
	}
	dueSoon := recoveryExplanation("unknown_stale_sources", nil)
	phrases = append(phrases, recoverySearchPhrase{
		phrase:         normalizePersonSearch(dueSoon),
		classification: "unknown_stale_sources",
		explanation:    dueSoon,
	})
	stale := normalizePersonSearch(recoveryExplanation("unknown_stale_sources", []string{"source"}))
	phrases = append(phrases,
		recoverySearchPhrase{
			phrase: stale, classification: "unknown_stale_sources", explanationLike: "%stale sources:%",
		},
		recoverySearchPhrase{
			phrase: stale, classification: "unknown_stale_sources", explanationLike: "%unknown_stale_sources%",
		},
		recoverySearchPhrase{
			phrase:         normalizePersonSearch(recoveryExplanation("fulfilled", nil)),
			classification: "fulfilled",
			explanation:    "Fresh explicit source evidence proves fulfillment.",
		},
	)
	return phrases
}

// relationshipSheetRecoveryMatch matches the promise follow-up heading and the
// sentence under it. "The promise is blocked" stays off a company whose body
// says the promise was renegotiated.
func relationshipSheetRecoveryMatch(needle string) predicate.Relationship {
	phrases := recoverySearchPhrases()
	chosen := make([]recoverySearchPhrase, 0)
	for _, item := range phrases {
		if needle == item.phrase {
			chosen = append(chosen, item)
		}
	}
	if len(chosen) == 0 {
		for _, item := range phrases {
			if sheetPhraseMatches(item.phrase, needle) {
				chosen = append(chosen, item)
			}
		}
	}
	if len(chosen) == 0 {
		return nil
	}
	preds := make([]predicate.Relationship, 0, len(chosen))
	for _, item := range chosen {
		preds = append(preds, relationshipHasLatestRecovery(item))
	}
	if len(preds) == 1 {
		return preds[0]
	}
	return relationship.Or(preds...)
}

// relationshipSheetFollowUpEmptyMatch matches the line under Promises to
// follow up when no check has been saved. A saved check replaces that line,
// and a promise due inside 72 hours is not the empty sentence.
func relationshipSheetFollowUpEmptyMatch(needle string, now time.Time) predicate.Relationship {
	overdue, dueSoon, ok := promiseFollowUpEmptyCounts(needle)
	if !ok {
		return nil
	}
	return relationship.And(
		relationship.Not(relationshipHasRecoveryEvaluation()),
		relationshipFollowUpCounts(now, overdue, dueSoon),
	)
}

// promiseFollowUpEmptyCounts reads the sentence the sheet prints. Zero is
// "No promises are due for a follow-up." A due promise adds "Reconcile to
// check the follow-up." A longer question that still contains the sentence
// counts as that sentence.
func promiseFollowUpEmptyCounts(needle string) (overdue int, dueSoon int, ok bool) {
	needle = normalizePersonSearch(needle)
	if needle == "" {
		return 0, 0, false
	}
	if labelPhraseMatches("no promises are due for a follow-up.", needle) {
		return 0, 0, true
	}
	const suffix = "reconcile to check the follow up"
	index := strings.LastIndex(needle, suffix)
	if index < 0 {
		return 0, 0, false
	}
	head := strings.TrimSpace(needle[:index])
	if overdue, dueSoon, ok = promiseFollowUpCombinedCounts(head); ok {
		return overdue, dueSoon, true
	}
	if n, matched := followUpClauseCount(head, "a promise is past due", " promises are past due"); matched {
		return n, 0, true
	}
	if n, matched := followUpClauseCount(head, "a promise is due soon", " promises are due soon"); matched {
		return 0, n, true
	}
	return 0, 0, false
}

func promiseFollowUpCombinedCounts(head string) (overdue int, dueSoon int, ok bool) {
	index := strings.LastIndex(head, " and ")
	if index < 0 {
		return 0, 0, false
	}
	left := strings.TrimSpace(head[:index])
	right := strings.TrimSpace(head[index+len(" and "):])
	overdue, ok = followUpClauseCount(left, "a promise is past due", " promises are past due")
	if !ok {
		return 0, 0, false
	}
	dueSoon, ok = followUpSoonSideCount(right)
	if !ok {
		return 0, 0, false
	}
	return overdue, dueSoon, true
}

func followUpSoonSideCount(clause string) (int, bool) {
	if clause == "1 is due soon" || strings.HasSuffix(clause, " 1 is due soon") {
		return 1, true
	}
	return followUpPluralCount(clause, " are due soon")
}

func followUpClauseCount(head, singular, pluralSuffix string) (int, bool) {
	if head == singular || strings.HasSuffix(head, " "+singular) {
		return 1, true
	}
	return followUpPluralCount(head, pluralSuffix)
}

func followUpPluralCount(head, suffix string) (int, bool) {
	if !strings.HasSuffix(head, suffix) {
		return 0, false
	}
	prefix := strings.TrimSpace(strings.TrimSuffix(head, suffix))
	number := prefix
	if i := strings.LastIndex(prefix, " "); i >= 0 {
		number = prefix[i+1:]
	}
	n, err := strconv.Atoi(number)
	if err != nil || n < 2 {
		return 0, false
	}
	return n, true
}

func relationshipHasRecoveryEvaluation() predicate.Relationship {
	return relationshipHasArtifactKind("recovery_evaluation")
}

func relationshipFollowUpCounts(now time.Time, overdue, dueSoon int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.And(
			followUpBucketCount(s, now, true, overdue),
			followUpBucketCount(s, now, false, dueSoon),
		))
	})
}

func followUpBucketCount(s *sql.Selector, now time.Time, past bool, n int) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		soon := now.UTC().Add(72 * time.Hour)
		b.WriteString("(SELECT count(*) FROM ")
		b.WriteString(commitment.Table)
		b.WriteString(" WHERE ")
		b.WriteString(commitment.RelationshipColumn)
		b.WriteString(" = ")
		b.WriteString(s.C(relationship.FieldID))
		b.WriteString(" AND ")
		b.WriteString(commitment.FieldStatus)
		b.WriteString(" IN ('open', 'at_risk') AND ")
		b.WriteString(commitment.FieldAcceptance)
		b.WriteString(" NOT IN ('candidate', 'disputed') AND (")
		b.WriteString(commitment.FieldStatus)
		b.WriteString(" = 'at_risk' OR (")
		b.WriteString(commitment.FieldDueAt)
		b.WriteString(" IS NOT NULL AND ")
		b.WriteString(commitment.FieldDueAt)
		b.WriteString(" < ")
		b.Arg(soon)
		b.WriteString(")) AND ")
		if past {
			b.WriteString(commitment.FieldDueAt)
			b.WriteString(" IS NOT NULL AND ")
			b.WriteString(commitment.FieldDueAt)
			b.WriteString(" < ")
			b.Arg(now.UTC())
		} else {
			b.WriteString("(")
			b.WriteString(commitment.FieldDueAt)
			b.WriteString(" IS NULL OR ")
			b.WriteString(commitment.FieldDueAt)
			b.WriteString(" >= ")
			b.Arg(now.UTC())
			b.WriteString(")")
		}
		b.WriteString(") = ")
		b.Arg(n)
	})
}

// relationshipSheetPlanEmptyMatch matches the mutual-plan line. The sheet
// prints it when no plan is saved, including a company that already has a
// promise waiting for the other party to accept.
func relationshipSheetPlanEmptyMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("a shared plan starts once they accept a promise.", needle) {
		return nil
	}
	return relationship.Not(relationshipHasArtifactKind("mutual_action_plan"))
}

// relationshipSheetDeletionEmptyMatch matches the privacy line. The delete
// button appears once there is mail, a meeting, a note, or any promise.
func relationshipSheetDeletionEmptyMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("no mail or meeting data to delete.", needle) {
		return nil
	}
	return relationship.And(
		relationshipMailThreadCount("=", 0),
		relationship.Not(relationshipHasVisibleCommunication()),
		relationship.Not(relationship.HasCommitments()),
		relationship.Not(relationship.HasObservationsWith(relationshipobservation.SourceIn(
			"meeting", "desktop_note", "voice_note", "browser",
		))),
	)
}

// relationshipSheetAcceptedPromiseMatch matches the button on a promise the
// workspace confirmed and the other party has not accepted yet. The button
// reads They accepted “Send the packet”.
func relationshipSheetAcceptedPromiseMatch(needle string) predicate.Relationship {
	name, ok := acceptedPromiseQuery(needle)
	if !ok {
		return nil
	}
	text := commitment.And(
		commitment.AcceptanceEQ("internally_confirmed"),
		commitmentTextEquals(name),
	)
	if name == "this promise" {
		text = commitment.And(
			commitment.AcceptanceEQ("internally_confirmed"),
			commitment.Or(commitmentTextEquals(""), commitmentTextEquals(name)),
		)
	}
	return relationship.HasCommitmentsWith(text)
}

func acceptedPromiseQuery(needle string) (string, bool) {
	text := strings.NewReplacer("“", "", "”", "", "\"", "", "'", "").Replace(normalizePersonSearch(needle))
	const prefix = "they accepted "
	index := strings.Index(text, prefix)
	if index < 0 {
		return "", false
	}
	name := strings.TrimSpace(text[index+len(prefix):])
	if name == "" {
		return "", false
	}
	return name, true
}

func commitmentTextEquals(text string) predicate.Commitment {
	return predicate.Commitment(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("lower(trim(")
			b.WriteString(s.C(commitment.FieldText))
			b.WriteString(")) = ")
			b.Arg(strings.ToLower(strings.TrimSpace(text)))
		}))
	})
}

func relationshipHasArtifactKind(kind string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(art)
			b.WriteString(" WHERE ")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = ")
			b.Arg(kind)
			b.WriteString(")")
		}))
	})
}

func relationshipHasLatestRecovery(item recoverySearchPhrase) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(art)
			b.WriteString(" AS eval WHERE eval.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND eval.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = 'recovery_evaluation' AND eval.")
			b.WriteString(conversationintelligenceartifact.FieldStatus)
			b.WriteString(" = ")
			b.Arg(item.classification)
			b.WriteString(" AND eval.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(" = (SELECT MAX(newer.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(") FROM ")
			b.WriteString(art)
			b.WriteString(" AS newer WHERE newer.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(")")
			switch {
			case item.explanation != "":
				b.WriteString(" AND ")
				writeRecoveryExplanation(b, s)
				b.WriteString(" = ")
				b.Arg(item.explanation)
			case item.explanationLike != "":
				b.WriteString(" AND ")
				writeRecoveryExplanation(b, s)
				b.WriteString(" LIKE ")
				b.Arg(item.explanationLike)
			}
			b.WriteString(")")
		}))
	})
}

func writeRecoveryExplanation(b *sql.Builder, s *sql.Selector) {
	column := "eval." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->>'explanation'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.explanation')")
}

// contradictionDimensionLabel matches the sheet. The stored dimension stays a token.
func contradictionDimensionLabel(dimension string) string {
	switch dimension {
	case "lifecycle":
		return "Lifecycle"
	case "engagement":
		return "Engagement"
	case "sentiment":
		return "Sentiment"
	case "health":
		return "Health"
	case "summary":
		return "Summary"
	case "next_action":
		return "Next action"
	case "risk":
		return "Risk"
	case "milestone":
		return "Milestone"
	default:
		return dimension
	}
}

type contradictionSearchPhrase struct {
	phrase     string
	status     string
	statusNot  string
	dimension  string
	minSides   int
	exactSides int
	reason     string
}

func contradictionSearchPhrases() []contradictionSearchPhrase {
	phrases := []contradictionSearchPhrase{{
		phrase: "two details disagree", status: "open", minSides: 2,
	}}
	for _, dimension := range relationshipProjectionDimensions {
		phrases = append(phrases, contradictionSearchPhrase{
			phrase: normalizePersonSearch(fmt.Sprintf(
				"Which %s should be the current one?",
				contradictionDimensionLabel(dimension),
			)),
			status: "open", dimension: dimension, minSides: 2,
		})
	}
	for n := 1; n <= 6; n++ {
		phrases = append(phrases, contradictionSearchPhrase{
			phrase: normalizePersonSearch(fmt.Sprintf(
				"Choose the current value from %d sources.", n,
			)),
			status: "open", exactSides: n,
		})
	}
	stronger := "A stronger source already chose the current value."
	phrases = append(phrases,
		contradictionSearchPhrase{
			phrase: normalizePersonSearch(stronger), statusNot: "open", reason: stronger,
		},
		contradictionSearchPhrase{
			phrase:    normalizePersonSearch(stronger),
			statusNot: "open",
			reason:    "deterministic assertion authority selected the current value",
		},
	)
	return phrases
}

// relationshipSheetContradictionMatch matches the suggestion "Two details disagree"
// and the sentence under it. A resolved disagreement prints a different sentence,
// so the open suggestion stays off that company.
func relationshipSheetContradictionMatch(needle string) predicate.Relationship {
	phrases := contradictionSearchPhrases()
	chosen := make([]contradictionSearchPhrase, 0)
	for _, item := range phrases {
		if needle == item.phrase {
			chosen = append(chosen, item)
		}
	}
	if len(chosen) == 0 {
		for _, item := range phrases {
			if sheetPhraseMatches(item.phrase, needle) {
				chosen = append(chosen, item)
			}
		}
	}
	if len(chosen) == 0 {
		return nil
	}
	preds := make([]predicate.Relationship, 0, len(chosen))
	for _, item := range chosen {
		preds = append(preds, relationshipHasLatestContradiction(item))
	}
	if len(preds) == 1 {
		return preds[0]
	}
	return relationship.Or(preds...)
}

func relationshipHasLatestContradiction(item contradictionSearchPhrase) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(art)
			b.WriteString(" AS eval WHERE eval.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND eval.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = 'contradiction_case' AND eval.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(" = (SELECT MAX(newer.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(") FROM ")
			b.WriteString(art)
			b.WriteString(" AS newer WHERE newer.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(" = eval.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(")")
			if item.status != "" {
				b.WriteString(" AND eval.")
				b.WriteString(conversationintelligenceartifact.FieldStatus)
				b.WriteString(" = ")
				b.Arg(item.status)
			}
			if item.statusNot != "" {
				b.WriteString(" AND eval.")
				b.WriteString(conversationintelligenceartifact.FieldStatus)
				b.WriteString(" <> ")
				b.Arg(item.statusNot)
			}
			if item.dimension != "" {
				b.WriteString(" AND ")
				writeContradictionText(b, s, "dimension")
				b.WriteString(" = ")
				b.Arg(item.dimension)
			}
			if item.reason != "" {
				b.WriteString(" AND ")
				writeContradictionText(b, s, "reason")
				b.WriteString(" = ")
				b.Arg(item.reason)
			}
			if item.minSides > 0 {
				b.WriteString(" AND ")
				writeContradictionSideCount(b, s)
				b.WriteString(" >= ")
				b.Arg(item.minSides)
			}
			if item.exactSides > 0 {
				b.WriteString(" AND ")
				writeContradictionSideCount(b, s)
				b.WriteString(" = ")
				b.Arg(item.exactSides)
			}
			b.WriteString(")")
		}))
	})
}

func writeContradictionText(b *sql.Builder, s *sql.Selector, field string) {
	column := "eval." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(field)
	b.WriteString("')")
}

func writeContradictionSideCount(b *sql.Builder, s *sql.Selector) {
	column := "eval." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_array_length(COALESCE(")
		b.WriteString(column)
		b.WriteString("::jsonb->'sides', '[]'::jsonb))")
		return
	}
	b.WriteString("COALESCE(json_array_length(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.sides')), 0)")
}

// relationshipSheetSuggestionMatch matches suggestion titles the sheet prints
// from the company stage or from a conversation claim. A risk is not an objection.
func relationshipSheetSuggestionMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if sheetPhraseMatches("renewal context", needle) {
		preds = append(preds, relationship.LifecycleEQ("renewal"))
	}
	if sheetPhraseMatches("unresolved objection", needle) {
		preds = append(preds, relationshipHasConversationClaimKind("objection"))
	}
	if sheetPhraseMatches("risk raised in a conversation", needle) {
		preds = append(preds, relationshipHasConversationClaimKind("risk"))
	}
	if n, atLeast, ok := focusedReviewCount(needle); ok {
		preds = append(preds, relationshipReviewCount(n, atLeast))
	} else if sheetPhraseMatches("focused evidence review", needle) {
		preds = append(preds, relationshipHasReviewClaim("any"))
	}
	if sheetPhraseMatches("low-confidence material claim", needle) || sheetPhraseMatches("what was said", needle) {
		preds = append(preds, relationshipHasReviewClaim("claim"))
	}
	if sheetPhraseMatches("resolve the speaker for a material statement", needle) || sheetPhraseMatches("who said it", needle) {
		preds = append(preds, relationshipHasReviewClaim("speaker"))
	}
	if sheetPhraseMatches("confirm the low-confidence wording", needle) || sheetPhraseMatches("the wording", needle) {
		preds = append(preds, relationshipHasReviewClaim("word"))
	}
	if sheetPhraseMatches("confirm the stakeholder identity or role", needle) || sheetPhraseMatches("who this is", needle) {
		preds = append(preds, relationshipHasReviewClaim("entity"))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipHasConversationClaimKind(kind string) predicate.Relationship {
	return relationshipHasConversationClaim(func(b *sql.Builder, s *sql.Selector) {
		if s.Dialect() == dialect.Postgres {
			b.WriteString("claim->>'kind' = ")
		} else {
			b.WriteString("json_extract(claim.value, '$.kind') = ")
		}
		b.Arg(kind)
	})
}

// relationshipHasReviewClaim matches a focused-review card. A missing confidence
// is 0, which is how the sheet reads a claim that never stored one.
func relationshipHasReviewClaim(mode string) predicate.Relationship {
	return relationshipHasConversationClaim(func(b *sql.Builder, s *sql.Selector) {
		writeReviewClaimCondition(b, s, mode)
	})
}

func relationshipHasConversationClaim(match func(*sql.Builder, *sql.Selector)) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			facts := "obs." + relationshipobservation.FieldNormalizedFactsJSON
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs WHERE obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("jsonb_typeof(")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims') AS claim WHERE ")
			} else {
				b.WriteString("json_valid(")
				b.WriteString(facts)
				b.WriteString(") AND json_type(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') = 'array' AND EXISTS (SELECT 1 FROM json_each(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') AS claim WHERE ")
			}
			match(b, s)
			b.WriteString("))")
		}))
	})
}

func writeReviewClaimCondition(b *sql.Builder, s *sql.Selector, mode string) {
	confidence := reviewClaimNumber(s, "confidence")
	speaker := reviewClaimNumber(s, "speakerConfidence")
	kind := "claim->>'kind'"
	if s.Dialect() != dialect.Postgres {
		kind = "json_extract(claim.value, '$.kind')"
	}
	switch mode {
	case "speaker":
		b.WriteString(speaker)
		b.WriteString(" < 0.75")
	case "word":
		b.WriteString(confidence)
		b.WriteString(" < 0.65")
	case "entity":
		b.WriteString(kind)
		b.WriteString(" = 'stakeholder' AND ")
		b.WriteString(confidence)
		b.WriteString(" < 0.85")
	case "any":
		b.WriteString("(")
		b.WriteString(confidence)
		b.WriteString(" < 0.75 OR ")
		b.WriteString(speaker)
		b.WriteString(" < 0.75 OR (")
		b.WriteString(kind)
		b.WriteString(" = 'stakeholder' AND ")
		b.WriteString(confidence)
		b.WriteString(" < 0.85))")
	default:
		b.WriteString(confidence)
		b.WriteString(" < 0.75")
	}
}

func reviewClaimNumber(s *sql.Selector, field string) string {
	if s.Dialect() == dialect.Postgres {
		return fmt.Sprintf("COALESCE((claim->>'%s')::double precision, 0)", field)
	}
	return fmt.Sprintf("COALESCE(json_extract(claim.value, '$.%s'), 0)", field)
}

func focusedReviewCount(needle string) (n int, atLeast bool, ok bool) {
	const prefix = "focused evidence review ("
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, ")") {
		return 0, false, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), ")")
	atLeast = strings.HasSuffix(body, "+")
	body = strings.TrimSuffix(body, "+")
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 0 || strconv.Itoa(parsed) != body {
		return 0, false, false
	}
	return parsed, atLeast, true
}

func relationshipReviewCount(n int, atLeast bool) predicate.Relationship {
	compare := "="
	if atLeast {
		compare = ">="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			facts := "obs." + relationshipobservation.FieldNormalizedFactsJSON
			b.WriteString("(SELECT COALESCE(SUM(")
			b.WriteString("(CASE WHEN ")
			b.WriteString(reviewClaimNumber(s, "confidence"))
			b.WriteString(" < 0.75 THEN 1 ELSE 0 END) + (CASE WHEN ")
			b.WriteString(reviewClaimNumber(s, "speakerConfidence"))
			b.WriteString(" < 0.75 THEN 1 ELSE 0 END) + (CASE WHEN ")
			b.WriteString(reviewClaimNumber(s, "confidence"))
			b.WriteString(" < 0.65 THEN 1 ELSE 0 END) + (CASE WHEN ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("claim->>'kind'")
			} else {
				b.WriteString("json_extract(claim.value, '$.kind')")
			}
			b.WriteString(" = 'stakeholder' AND ")
			b.WriteString(reviewClaimNumber(s, "confidence"))
			b.WriteString(" < 0.85 THEN 1 ELSE 0 END)), 0) FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs")
			if s.Dialect() == dialect.Postgres {
				b.WriteString(", LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims') = 'array' THEN ")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims' ELSE '[]'::jsonb END) AS claim WHERE obs.")
			} else {
				b.WriteString(", json_each(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') AS claim WHERE json_valid(")
				b.WriteString(facts)
				b.WriteString(") AND json_type(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') = 'array' AND obs.")
			}
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
}

// relationshipSheetPrivacyMatch matches the sentences inside the company
// sheet's Privacy disclosure. The builtin rule is ask-before-capture, shared
// excerpts on, plan sharing allowed, and 30 days, unless a saved layer is stricter.
func relationshipSheetPrivacyMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if sheetPhraseMatches("do not capture", needle) || sheetPhraseMatches("capture: do not capture", needle) {
		preds = append(preds, relationshipHasPolicyCapture("deny"))
	}
	if sheetPhraseMatches("ask before capturing", needle) || sheetPhraseMatches("capture: ask before capturing", needle) {
		preds = append(preds, relationship.Not(relationshipHasPolicyCapture("deny")))
	}
	if sheetPhraseMatches("shared excerpts: off", needle) {
		preds = append(preds, relationshipHasPolicyBoolFalse("publishEvidence"))
	}
	if sheetPhraseMatches("shared excerpts: on", needle) {
		preds = append(preds, relationship.Not(relationshipHasPolicyBoolFalse("publishEvidence")))
	}
	if sheetPhraseMatches("plan sharing outside this workspace: blocked", needle) {
		preds = append(preds, relationshipHasPolicyBoolFalse("externalShare"))
	}
	if sheetPhraseMatches("plan sharing outside this workspace: allowed", needle) {
		preds = append(preds, relationship.Not(relationshipHasPolicyBoolFalse("externalShare")))
	}
	if days, ok := privacyRetentionDays(needle); ok {
		preds = append(preds, relationshipPrivacyRetention(days))
	}
	if n, ok := privacyDecisionCount(needle); ok {
		preds = append(preds, relationshipGovernanceDecisionCount("=", n))
	} else {
		var counts []predicate.Relationship
		if sheetPhraseMatches("no privacy decisions recorded", needle) {
			counts = append(counts, relationship.Or(
				relationshipGovernanceDecisionCount("=", 0),
				relationshipGovernanceDecisionCount(">=", 2),
			))
		}
		if sheetPhraseMatches("1 privacy decision recorded", needle) {
			counts = append(counts, relationshipGovernanceDecisionCount("=", 1))
		}
		switch len(counts) {
		case 1:
			preds = append(preds, counts[0])
		case 2:
			preds = append(preds, relationship.Or(counts...))
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func privacyDecisionCount(needle string) (int, bool) {
	switch needle {
	case "no privacy decisions recorded":
		return 0, true
	case "1 privacy decision recorded":
		return 1, true
	}
	const suffix = " privacy decisions recorded"
	if !strings.HasSuffix(needle, suffix) {
		return 0, false
	}
	body := strings.TrimSuffix(needle, suffix)
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 2 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	return parsed, true
}

func privacyRetentionDays(needle string) (int, bool) {
	const prefix = "retention: "
	const suffix = " days"
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, suffix) {
		return 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), suffix)
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 0 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	return parsed, true
}

func relationshipHasPolicyCapture(capture string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			writeLatestApplicablePolicy(b, s)
			b.WriteString(" AND ")
			writePolicyText(b, s, "capture")
			b.WriteString(" = ")
			b.Arg(capture)
			b.WriteString(")")
		}))
	})
}

func relationshipHasPolicyBoolFalse(field string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			writeLatestApplicablePolicy(b, s)
			b.WriteString(" AND ")
			writePolicyBoolIsFalse(b, s, field)
			b.WriteString(")")
		}))
	})
}

func relationshipPrivacyRetention(days int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT MIN(policy_days.days) FROM (SELECT 30 AS days UNION ALL SELECT ")
			writePolicyRetentionDays(b, s)
			b.WriteString(" AS days FROM ")
			writeLatestApplicablePolicy(b, s)
			b.WriteString(") AS policy_days) = ")
			b.Arg(days)
		}))
	})
}

func relationshipGovernanceDecisionCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("(SELECT COUNT(DISTINCT decision.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(") FROM ")
			b.WriteString(art)
			b.WriteString(" AS decision WHERE decision.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND decision.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = 'governance_decision') ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
}

// writeLatestApplicablePolicy is the saved conversation policy that actually
// applies to this company: the newest version of a layer, either on this
// company or shared by the workspace. The builtin default is not a row.
func writeLatestApplicablePolicy(b *sql.Builder, s *sql.Selector) {
	art := conversationintelligenceartifact.Table
	b.WriteString(art)
	b.WriteString(" AS layer WHERE layer.")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" = 'conversation_policy' AND layer.")
	b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.WorkspaceColumn))
	b.WriteString(" AND (layer.")
	b.WriteString(conversationintelligenceartifact.RelationshipColumn)
	b.WriteString(" IS NULL OR layer.")
	b.WriteString(conversationintelligenceartifact.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.FieldID))
	b.WriteString(") AND layer.")
	b.WriteString(conversationintelligenceartifact.FieldVersion)
	b.WriteString(" = (SELECT MAX(newer.")
	b.WriteString(conversationintelligenceartifact.FieldVersion)
	b.WriteString(") FROM ")
	b.WriteString(art)
	b.WriteString(" AS newer WHERE newer.")
	b.WriteString(conversationintelligenceartifact.FieldStableID)
	b.WriteString(" = layer.")
	b.WriteString(conversationintelligenceartifact.FieldStableID)
	b.WriteString(" AND newer.")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" = layer.")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" AND newer.")
	b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
	b.WriteString(" = layer.")
	b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
	b.WriteString(")")
}

func writePolicyText(b *sql.Builder, s *sql.Selector, field string) {
	column := "layer." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(field)
	b.WriteString("')")
}

func writePolicyBoolIsFalse(b *sql.Builder, s *sql.Selector, field string) {
	column := "layer." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE(")
		b.WriteString(column)
		b.WriteString("::jsonb->>'")
		b.WriteString(field)
		b.WriteString("', 'false') = 'false'")
		return
	}
	b.WriteString("COALESCE(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(field)
	b.WriteString("'), 0) = 0")
}

// relationshipSheetGovernanceMatch matches the consent receipt and the last
// deletion line. The receipt is stored on the conversation observation.
func relationshipSheetGovernanceMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for _, item := range governanceReceiptPhrases() {
		if !sheetPhraseMatches(item.phrase, needle) {
			continue
		}
		if item.prefix {
			preds = append(preds, relationshipHasGovernanceReceiptPrefix(item.field, item.value))
			continue
		}
		preds = append(preds, relationshipHasGovernanceReceiptValue(item.field, item.value))
	}
	if sheetPhraseMatches("legal hold on", needle) {
		preds = append(preds, relationshipHasGovernanceLegalHold(true))
	}
	if sheetPhraseMatches("legal hold off", needle) {
		preds = append(preds, relationshipHasGovernanceLegalHold(false))
	}
	if route, ok := importedGovernanceRoute(needle); ok {
		preds = append(preds, relationshipHasGovernanceReceiptValue("routing", route))
	}
	if n, ok := governanceReceiptCount(needle); ok {
		preds = append(preds, relationshipGovernanceReceiptCount("=", n))
	} else if sheetPhraseMatches("consent and governance", needle) {
		preds = append(preds, relationshipGovernanceReceiptCount(">=", 1))
	}
	for _, item := range governanceDeletionPhrases() {
		if sheetPhraseMatches(item.phrase, needle) {
			preds = append(preds, relationshipHasLatestDeletionStatus(item.status))
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

type governanceReceiptPhrase struct {
	phrase string
	field  string
	value  string
	prefix bool
}

func governanceReceiptPhrases() []governanceReceiptPhrase {
	return []governanceReceiptPhrase{
		{phrase: "captured by hand", field: "capturePolicy", value: "manual_capture"},
		{phrase: "uploaded on purpose", field: "capturePolicy", value: "explicit_upload"},
		{phrase: "imported from the provider", field: "capturePolicy", value: "provider_import"},
		{phrase: "started from the calendar or by hand", field: "capturePolicy", value: "calendar_prompt_or_manual"},
		{phrase: "do not capture", field: "capturePolicy", value: "deny"},
		{phrase: "ask before capturing", field: "capturePolicy", value: "require_consent"},
		{phrase: "capture is allowed", field: "capturePolicy", value: "allow"},
		{phrase: "transcribed on this device, then saved here", field: "routing", value: "local_transcription_to_oppulence"},
		{phrase: "stays on this device", field: "routing", value: "local_only"},
		{phrase: "on this device", field: "region", value: "local_device"},
		{phrase: "at the provider", field: "region", value: "provider_managed"},
		{phrase: "kept until it is transcribed", field: "retention", value: "until_transcribed"},
		{phrase: "kept until it is transcribed", field: "retention", value: "untilTranscribed"},
		{phrase: "the provider's policy, plus the evidence saved here", field: "retention", value: "provider_policy_plus_oppulence_evidence"},
		{phrase: "kept", field: "retention", value: "always"},
		{phrase: "kept", field: "deletionOutcome", value: "retained"},
		{phrase: "people were not told", field: "participantDisclosure", value: "not_recorded"},
		{phrase: "the provider says people were told", field: "participantDisclosure", value: "provider_reported"},
		{phrase: "scheduled to be deleted after transcription", field: "deletionOutcome", value: "scheduled_after_transcription"},
		{phrase: "kept because of your settings", field: "deletionOutcome", value: "retained_by_user_policy"},
		{phrase: "nothing to delete", field: "deletionOutcome", value: "not_applicable"},
		{phrase: "deleted", field: "deletionOutcome", value: "deleted:", prefix: true},
		{phrase: "no audio was kept", field: "evidenceClip", value: "not_retained"},
		{phrase: "the audio that was kept is encrypted", field: "evidenceClip", value: "encrypted"},
	}
}

func governanceDeletionPhrases() []struct {
	phrase string
	status string
} {
	return []struct {
		phrase string
		status string
	}{
		{phrase: "deletion is still running", status: "pending"},
		{phrase: "last deletion: deletion is still running", status: "pending"},
		{phrase: "deletion is blocked", status: "blocked"},
		{phrase: "last deletion: deletion is blocked", status: "blocked"},
		{phrase: "some copies are still there", status: "partial"},
		{phrase: "last deletion: some copies are still there", status: "partial"},
		{phrase: "deletion is finished", status: "verified"},
		{phrase: "last deletion: deletion is finished", status: "verified"},
	}
}

func importedGovernanceRoute(needle string) (string, bool) {
	const prefix = "imported from "
	const suffix = ", then saved here"
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, suffix) {
		return "", false
	}
	name := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), suffix)
	if name == "" || strings.Contains(name, "provider") {
		return "", false
	}
	return strings.ReplaceAll(name, " ", "_") + "_to_oppulence", true
}

func governanceReceiptCount(needle string) (int, bool) {
	const prefix = "consent and governance ("
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, ")") {
		return 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), ")")
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 0 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	return parsed, true
}

func relationshipHasGovernanceReceiptValue(field, value string) predicate.Relationship {
	return relationshipHasGovernanceReceipt(func(b *sql.Builder, s *sql.Selector) {
		writeGovernanceText(b, s, field)
		b.WriteString(" = ")
		b.Arg(value)
	})
}

func relationshipHasGovernanceReceiptPrefix(field, prefix string) predicate.Relationship {
	return relationshipHasGovernanceReceipt(func(b *sql.Builder, s *sql.Selector) {
		writeGovernanceText(b, s, field)
		b.WriteString(" LIKE ")
		b.Arg(prefix + "%")
	})
}

func relationshipHasGovernanceLegalHold(on bool) predicate.Relationship {
	return relationshipHasGovernanceReceipt(func(b *sql.Builder, s *sql.Selector) {
		writeGovernanceBool(b, s, "legalHold", on)
	})
}

func relationshipHasGovernanceReceipt(match func(*sql.Builder, *sql.Selector)) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs WHERE obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			writeGovernanceText(b, s, "receiptId")
			b.WriteString(" <> '' AND ")
			match(b, s)
			b.WriteString(")")
		}))
	})
}

func relationshipGovernanceReceiptCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs WHERE obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			writeGovernanceText(b, s, "receiptId")
			b.WriteString(" <> '') ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
}

func relationshipHasLatestDeletionStatus(status string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			writeLatestDeletionReceipt(b, s, "eval")
			b.WriteString(" AND ")
			writeDeletionText(b, s, "eval", "status")
			b.WriteString(" = ")
			b.Arg(status)
			b.WriteString(" AND ")
			writeDeletionText(b, s, "eval", "requestedAt")
			b.WriteString(" = (SELECT MAX(")
			writeDeletionText(b, s, "newest", "requestedAt")
			b.WriteString(") FROM ")
			writeLatestDeletionReceipt(b, s, "newest")
			b.WriteString("))")
		}))
	})
}

func writeLatestDeletionReceipt(b *sql.Builder, s *sql.Selector, alias string) {
	art := conversationintelligenceartifact.Table
	b.WriteString(art)
	b.WriteString(" AS ")
	b.WriteString(alias)
	b.WriteString(" WHERE ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.FieldID))
	b.WriteString(" AND ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" = 'deletion_receipt' AND ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.FieldVersion)
	b.WriteString(" = (SELECT MAX(prior.")
	b.WriteString(conversationintelligenceartifact.FieldVersion)
	b.WriteString(") FROM ")
	b.WriteString(art)
	b.WriteString(" AS prior WHERE prior.")
	b.WriteString(conversationintelligenceartifact.FieldStableID)
	b.WriteString(" = ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.FieldStableID)
	b.WriteString(" AND prior.")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" = ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" AND prior.")
	b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(alias)
	b.WriteString(".")
	b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
	b.WriteString(")")
}

func writeGovernanceText(b *sql.Builder, s *sql.Selector, field string) {
	column := "obs." + relationshipobservation.FieldNormalizedFactsJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->'governance_receipt'->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.governance_receipt.")
	b.WriteString(field)
	b.WriteString("')")
}

func writeGovernanceBool(b *sql.Builder, s *sql.Selector, field string, on bool) {
	column := "obs." + relationshipobservation.FieldNormalizedFactsJSON
	want := "0"
	if on {
		want = "1"
	}
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE(")
		b.WriteString(column)
		b.WriteString("::jsonb->'governance_receipt'->>'")
		b.WriteString(field)
		b.WriteString("', 'false') = ")
		if on {
			b.WriteString("'true'")
			return
		}
		b.WriteString("'false'")
		return
	}
	b.WriteString("COALESCE(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.governance_receipt.")
	b.WriteString(field)
	b.WriteString("'), 0) = ")
	b.WriteString(want)
}

func writeDeletionText(b *sql.Builder, s *sql.Selector, alias, field string) {
	column := alias + "." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(field)
	b.WriteString("')")
}

func writePolicyRetentionDays(b *sql.Builder, s *sql.Selector) {
	column := "layer." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE((")
		b.WriteString(column)
		b.WriteString("::jsonb->>'retentionDays')::int, 0)")
		return
	}
	b.WriteString("COALESCE(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.retentionDays'), 0)")
}

// visibleTruthCommitment is a promise the sheet can put on "What is true now?".
// A candidate still needs confirmation, and a disputed promise is not the fact.
func visibleTruthCommitment() predicate.Commitment {
	return commitment.And(
		commitment.Or(
			commitment.StatusEQ("open"),
			commitment.StatusEQ("at_risk"),
		),
		commitment.AcceptanceNEQ("candidate"),
		commitment.AcceptanceNEQ("disputed"),
	)
}

// openTruthCommitment is the promise the sheet calls "Open promise". A due
// time inside 72 hours is "At risk" even while the stored status stays open.
// countedOpenPromise is the Open promises highlight. Due soon still counts.
func countedOpenPromise() predicate.Commitment {
	return commitment.And(
		commitment.StatusEQ("open"),
		commitment.AcceptanceNEQ("candidate"),
		commitment.AcceptanceNEQ("disputed"),
	)
}

func openTruthCommitment(now time.Time) predicate.Commitment {
	soon := now.UTC().Add(72 * time.Hour)
	return commitment.And(
		visibleTruthCommitment(),
		commitment.StatusNEQ("at_risk"),
		commitment.Or(
			commitment.DueAtIsNil(),
			commitment.DueAtGTE(soon),
		),
	)
}

func atRiskTruthCommitment(now time.Time) predicate.Commitment {
	soon := now.UTC().Add(72 * time.Hour)
	return commitment.And(
		visibleTruthCommitment(),
		commitment.Or(
			commitment.StatusEQ("at_risk"),
			commitment.And(
				commitment.DueAtNotNil(),
				commitment.DueAtLT(soon),
			),
		),
	)
}

// promiseLineText is the promise inside "Open promise: …" or the action
// sentence that ends with "No follow-up is drafted."
// queryHasPhrase matches the printed label, and a longer question that still
// contains it. "What they owe us" is the same card as "They owe us".
func queryHasPhrase(phrase, needle string) bool {
	phrase = normalizePersonSearch(phrase)
	if phrase == "" || needle == "" {
		return false
	}
	if sheetPhraseMatches(phrase, needle) {
		return true
	}
	return len(phrase) >= 8 && strings.Contains(needle, phrase)
}

func promiseLineText(needle string) string {
	text := normalizePersonSearch(needle)
	stripped := false
	drafted := normalizePersonSearch("no follow-up is drafted")
	if strings.HasSuffix(text, drafted) && text != drafted {
		text = strings.TrimSpace(strings.TrimSuffix(text, drafted))
		text = strings.TrimRight(text, ".")
		text = strings.TrimSpace(text)
		stripped = true
	}
	for _, prefix := range []string{"open promise:", "at risk promise:"} {
		if strings.HasPrefix(text, prefix) {
			text = strings.TrimSpace(strings.TrimPrefix(text, prefix))
			text = strings.TrimRight(text, ".")
			text = strings.TrimSpace(text)
			stripped = true
		}
	}
	if !stripped || text == "" {
		return ""
	}
	return text
}

// relationshipSheetTruthPromiseMatch matches the promise sentence on
// "What is true now?" and the follow-up sentence under "What should happen next?".
// actionTypeSearchLabels are the words on What should happen next. The stored
// follow-up type still uses underscores.
var actionTypeSearchLabels = []struct {
	phrase     string
	actionType string
}{
	{"warm follow-up", "warm_follow_up"},
	{"proposal nudge", "proposal_nudge"},
	{"referral reconnect", "referral_reconnect"},
	{"customer risk", "customer_risk"},
	{"meeting follow-up", "meeting_follow_up"},
	{"meeting recap", "meeting_recap"},
	{"crm update", "crm_update"},
	{"follow-up task", "follow_up_task"},
	{"calendar hold", "calendar_hold"},
	{"promise follow-up", "commitment_rescue"},
}

func relationshipSheetActionLabelMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for _, item := range actionTypeSearchLabels {
		if !queryHasPhrase(item.phrase, needle) {
			continue
		}
		preds = append(preds, relationship.HasActionsWith(
			revenueaction.ActionTypeEQ(item.actionType),
			revenueaction.QueueStatusEQ(QueueOpen),
		))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// relationshipAttentionBandMatch is the urgency badge on the attention queue.
// High and critical read "At risk", normal reads "Watch", and low reads "Stable".
// A dismissed or snoozed row is off that queue, so it stays out of the search.
func relationshipAttentionBandMatch(needle string) predicate.Relationship {
	var band predicate.RelationshipAttentionItem
	switch needle {
	case "at risk":
		band = relationshipattentionitem.UrgencyBandIn("high", "critical")
	case "watch":
		band = relationshipattentionitem.UrgencyBandEQ("normal")
	case "stable":
		band = relationshipattentionitem.UrgencyBandEQ("low")
	default:
		return nil
	}
	return relationship.HasAttentionItemsWith(
		band,
		relationshipattentionitem.StatusEQ("open"),
	)
}

func relationshipSheetTruthPromiseMatch(needle string, now time.Time) predicate.Relationship {
	var preds []predicate.Relationship
	// The highlight is labeled Open promises and counts every confirmed open
	// promise, including one the card badges At risk because it is due soon.
	// "Open promise:" on What is true now is only a promise that is not at risk.
	if needle == "open promises" {
		preds = append(preds, relationship.HasCommitmentsWith(countedOpenPromise()))
	} else if sheetPhraseMatches("open promise", needle) || strings.Contains(needle, "open promises") {
		preds = append(preds, relationship.HasCommitmentsWith(openTruthCommitment(now)))
	}
	// The promise card says At risk. That badge is the clock, not the stored status.
	if needle == "at risk" ||
		sheetPhraseMatches("at risk promise", needle) ||
		sheetPhraseMatches("promise at risk", needle) ||
		sheetPhraseMatches("promises at risk", needle) ||
		sheetPhraseMatches("promises are at risk", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(atRiskTruthCommitment(now)))
	}
	// The same card says They owe us, We owe them, or We both owe.
	if queryHasPhrase("they owe us", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.DirectionEQ("promised_by_them")))
	}
	if queryHasPhrase("we owe them", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.DirectionEQ("promised_by_me")))
	}
	if queryHasPhrase("we both owe", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.DirectionEQ("mutual")))
	}
	if sheetPhraseMatches("no follow-up is drafted", needle) {
		preds = append(preds, relationship.And(
			relationship.Not(relationship.HasActionsWith(revenueaction.QueueStatusEQ(QueueOpen))),
			relationship.HasCommitmentsWith(visibleTruthCommitment()),
		))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func overdueCommitmentAny(now time.Time) predicate.Commitment {
	return commitment.And(
		overdueCommitmentEligible(),
		commitment.DueAtLTE(now.UTC()),
	)
}

func overdueCommitmentWindow(now time.Time, days int) predicate.Commitment {
	if days < 1 {
		days = 1
	}
	var window predicate.Commitment
	if days == 1 {
		window = commitment.And(
			commitment.DueAtLTE(now.UTC()),
			commitment.DueAtGT(now.UTC().Add(-48*time.Hour)),
		)
	} else {
		newest := now.UTC().Add(-time.Duration(days) * 24 * time.Hour)
		oldest := now.UTC().Add(-time.Duration(days+1) * 24 * time.Hour)
		window = commitment.And(
			commitment.DueAtLTE(newest),
			commitment.DueAtGT(oldest),
		)
	}
	return commitment.And(overdueCommitmentEligible(), window)
}

func overdueCommitmentEligible() predicate.Commitment {
	return commitment.And(
		commitment.StatusEQ("open"),
		commitment.DueAtNotNil(),
		commitment.Or(
			commitment.UserConfirmedEQ(true),
			commitment.Not(commitment.AcceptanceEQ("candidate")),
		),
	)
}

func relationshipRiskCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" && compare != "<>" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldRisks)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb))", column))
			} else {
				b.WriteString(fmt.Sprintf("json_array_length(coalesce(%s, '[]'))", column))
			}
			b.WriteString(" ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
}

// relationshipDegradedCanonicalSet is the company whose degraded connectors
// are exactly these canonical sources, in the same set the attention sentence
// joins.
func relationshipDegradedCanonicalSet(sources []string) predicate.Relationship {
	wanted := make(map[string]bool, len(sources))
	for _, source := range sources {
		wanted[canonicalSource(source)] = true
	}
	preds := make([]predicate.Relationship, 0, 3)
	for _, family := range []string{"google", "hubspot", "slack"} {
		match := relationshipHasDegradedCanonical(family)
		if wanted[family] {
			preds = append(preds, match)
			continue
		}
		preds = append(preds, relationship.Not(match))
	}
	return relationship.And(preds...)
}

func relationshipHasDegradedCanonical(canonical string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipsourcestatus.Table)
			b.WriteString(" AS stop WHERE stop.")
			b.WriteString(relationshipsourcestatus.WorkspaceColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.WorkspaceColumn))
			b.WriteString(" AND (stop.")
			b.WriteString(relationshipsourcestatus.FieldStatus)
			b.WriteString(" <> 'live' OR stop.")
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			b.WriteString(" <> 'complete' OR NOT ")
			writeAliasMissingScopesEmpty(b, s, "stop")
			b.WriteString(") AND lower(stop.")
			b.WriteString(relationshipsourcestatus.FieldSource)
			b.WriteString(") IN (")
			switch canonical {
			case "google":
				b.WriteString("'gmail', 'calendar', 'google'")
			case "slack":
				b.WriteString("'slack'")
			default:
				b.WriteString("'hubspot', 'crm'")
			}
			b.WriteString(") AND ")
			writeDependentSource(b, s, "stop")
			b.WriteString(")")
		}))
	})
}

// relationshipHasDegradedDependency is a connector the company uses that is not
// live and complete. That company gets a source warning instead of the
// "no next step" attention sentence.
func relationshipHasDegradedDependency() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipsourcestatus.Table)
			b.WriteString(" AS stop WHERE stop.")
			b.WriteString(relationshipsourcestatus.WorkspaceColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.WorkspaceColumn))
			b.WriteString(" AND (stop.")
			b.WriteString(relationshipsourcestatus.FieldStatus)
			b.WriteString(" <> 'live' OR stop.")
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			b.WriteString(" <> 'complete' OR NOT ")
			writeAliasMissingScopesEmpty(b, s, "stop")
			b.WriteString(") AND ")
			writeDependentSource(b, s, "stop")
			b.WriteString(")")
		}))
	})
}

func writeAliasMissingScopesEmpty(b *sql.Builder, s *sql.Selector, alias string) {
	column := alias + "." + relationshipsourcestatus.FieldMissingScopes
	if s.Dialect() == dialect.Postgres {
		b.WriteString(fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb)) = 0", column))
		return
	}
	b.WriteString(fmt.Sprintf("json_array_length(coalesce(%s, '[]')) = 0", column))
}

func observationSummaryBlank() predicate.RelationshipObservation {
	return predicate.RelationshipObservation(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(relationshipobservation.FieldSummary)))
		}))
	})
}

func communicationSubjectBlank() predicate.CommunicationInteraction {
	return communicationinteraction.And(
		communicationinteraction.DeletedEQ(false),
		predicate.CommunicationInteraction(func(s *sql.Selector) {
			s.Where(sql.P(func(b *sql.Builder) {
				b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(communicationinteraction.FieldSubject)))
			}))
		}),
	)
}

func relationshipTextBlank(field string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(field)))
		}))
	})
}

// relationshipCategoriesBlank matches a category cell that reads "Not filled in".
// A list of blank tags is the same as no list.
func relationshipCategoriesBlank() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldCompanyCategories)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf(
					"NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(%s, '[]'::jsonb)) AS category WHERE trim(category) <> '')",
					column,
				))
				return
			}
			b.WriteString(fmt.Sprintf(
				"NOT EXISTS (SELECT 1 FROM json_each(coalesce(%s, '[]')) WHERE trim(json_each.value) <> '')",
				column,
			))
		}))
	})
}

func relationshipParticipantCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != "<>" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"(SELECT count(*) FROM %s WHERE %s = %s) %s ",
				relationshipparticipant.Table,
				relationshipparticipant.RelationshipColumn,
				s.C(relationship.FieldID),
				compare,
			))
			b.Arg(n)
		}))
	})
}

func relationshipOpenActionCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != "<>" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"(SELECT count(*) FROM %s WHERE %s = %s AND %s = '%s') %s ",
				revenueaction.Table,
				revenueaction.RelationshipColumn,
				s.C(relationship.FieldID),
				revenueaction.FieldQueueStatus,
				QueueOpen,
				compare,
			))
			b.Arg(n)
		}))
	})
}

// relationshipSheetMailMatch matches the mail section on the company sheet.
// An empty mailbox says "No Gmail threads linked yet." A thread with no
// subject says "Email conversation," a blank address says "Gmail," a missing
// time says "Unknown date," and the reply state says who speaks next. The
// count line is "1 message" or "N messages." A one-word fragment of a longer
// sentence stays out, so "gmail" finds a thread whose party line is the
// fallback and does not mean a company with no mail.
func relationshipSheetMailMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	// A confirmed meeting keeps the mailbox empty and adds "Confirmed
	// meetings are in Activity." The shorter sentence is the mailbox
	// with no meeting in Activity.
	longMail := "no gmail threads linked yet. confirmed meetings are in activity."
	shortMail := "no gmail threads linked yet"
	switch {
	case labelPhraseMatches(longMail, needle):
		preds = append(preds, relationship.And(
			relationshipMailThreadCount("=", 0),
			relationshipHasMeetingObservation(),
		))
	case labelPhraseMatches(shortMail, needle):
		preds = append(preds, relationship.And(
			relationshipMailThreadCount("=", 0),
			relationship.Not(relationshipHasMeetingObservation()),
		))
	case sheetPhraseMatches(shortMail, needle):
		preds = append(preds, relationshipMailThreadCount("=", 0))
	}
	if sheetPhraseMatches("email conversation", needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailThreadSubjectBlank()))
	}
	if needle == "gmail" {
		preds = append(preds, relationship.HasMailThreadsWith(mailThreadCounterpartyBlank()))
	}
	if n, ok := exactMailMessageCount(needle); ok {
		preds = append(preds, relationship.HasMailThreadsWith(mailthread.MessageCountEQ(n)))
	}
	if needleHasAddressPartyLine(needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailThreadAddressPartyLine(needle)))
	}
	if sheetPhraseMatches("unknown date", needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailthread.LastActivityAtIsNil()))
	}
	if sheetPhraseMatches("needs a reply", needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailthread.ReplyStateEQ("needs_reply")))
	}
	if sheetPhraseMatches("waiting on them", needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailthread.ReplyStateEQ("awaiting_reply")))
	}
	if sheetPhraseMatches("quiet", needle) {
		preds = append(preds, relationship.HasMailThreadsWith(mailthread.ReplyStateEQ("quiet")))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// relationshipSheetEmptyCopyMatch matches the empty lines on the company
// sheet. The mail timeline is communication records, not Gmail threads.
// Activity history is observations. What changed is snapshots. A meeting
// observation or a promise lengthens the empty line, so the shorter
// sentence stays on the company that has neither.
func relationshipSheetEmptyCopyMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	longTimeline := "no gmail or calendar events yet. confirmed meetings are in activity."
	shortTimeline := "no gmail or calendar events yet."
	switch {
	case labelPhraseMatches(longTimeline, needle):
		preds = append(preds, relationship.And(
			relationship.Not(relationshipHasVisibleCommunication()),
			relationshipHasMeetingObservation(),
		))
	case labelPhraseMatches(shortTimeline, needle):
		preds = append(preds, relationship.And(
			relationship.Not(relationshipHasVisibleCommunication()),
			relationship.Not(relationshipHasMeetingObservation()),
		))
	}
	if labelPhraseMatches("nothing recorded yet.", needle) {
		preds = append(preds, relationship.Not(relationship.HasObservations()))
	}
	// The promise card and the Promises section both use this line when
	// the company has no commitments. "recorded" is also an activity heading.
	if labelPhraseMatches("no commitments recorded for this company yet.", needle) {
		preds = append(preds, relationship.Not(relationship.HasCommitments()))
	}
	longChange := "no account details have changed yet. promises and meetings are in the sections below."
	shortChange := "no account details have changed yet."
	switch {
	case labelPhraseMatches(longChange, needle):
		preds = append(preds, relationship.And(
			relationship.Not(relationship.HasSnapshots()),
			relationship.Or(
				relationship.HasObservations(),
				relationship.HasCommitments(),
			),
		))
	case labelPhraseMatches(shortChange, needle):
		preds = append(preds, relationship.And(
			relationship.Not(relationship.HasSnapshots()),
			relationship.Not(relationship.HasObservations()),
			relationship.Not(relationship.HasCommitments()),
		))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// sheetEmptySentenceOwnsActivity is true when the query is an empty-sheet
// sentence that happens to contain an activity heading. "recorded" and
// "calendar" are those headings.
func sheetEmptySentenceOwnsActivity(needle string) bool {
	for _, phrase := range []string{
		"no gmail or calendar events yet.",
		"nothing recorded yet.",
		"no commitments recorded for this company yet.",
	} {
		if labelPhraseMatches(phrase, needle) {
			return true
		}
	}
	return false
}

func relationshipHasMeetingObservation() predicate.Relationship {
	return relationship.HasObservationsWith(relationshipobservation.SourceEQ("meeting"))
}

func relationshipHasVisibleCommunication() predicate.Relationship {
	return relationship.HasCommunicationInteractionsWith(communicationinteraction.DeletedEQ(false))
}

// relationshipSheetReviewMatch matches the review line on the company sheet.
// A company at version 0 with no later acknowledgement reads "Not reviewed yet."
// Acknowledging the current version reads "Nothing changed since your last
// review" and "Nothing new since your last review." The acknowledgement is
// the signed-in person's, so another reviewer's row does not change this search.
func relationshipSheetReviewMatch(userID uuid.UUID, needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if sheetPhraseMatches("not reviewed yet", needle) {
		preds = append(preds, relationshipNotReviewedYet(userID))
	}
	if sheetPhraseMatches("nothing changed since your last review", needle) ||
		sheetPhraseMatches("nothing new since your last review", needle) {
		preds = append(preds, relationshipReviewedUnchanged(userID))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipNotReviewedYet(userID uuid.UUID) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.And(
			sql.EQ(s.C(relationship.FieldStateVersion), 0),
			sql.Not(relationshipAcknowledgementExists(s, userID, false)),
		))
	})
}

func relationshipReviewedUnchanged(userID uuid.UUID) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(relationshipAcknowledgementExists(s, userID, true))
	})
}

func relationshipAcknowledgementExists(s *sql.Selector, userID uuid.UUID, coversCurrent bool) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		b.WriteString(fmt.Sprintf(
			"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s = ",
			relationshipreviewacknowledgement.Table,
			relationshipreviewacknowledgement.RelationshipColumn,
			s.C(relationship.FieldID),
			relationshipreviewacknowledgement.UserColumn,
		))
		b.Arg(userID.String())
		b.WriteString(fmt.Sprintf(" AND %s > 0", relationshipreviewacknowledgement.FieldStateVersion))
		if coversCurrent {
			b.WriteString(fmt.Sprintf(
				" AND %s >= %s",
				relationshipreviewacknowledgement.FieldStateVersion,
				s.C(relationship.FieldStateVersion),
			))
		}
		b.WriteByte(')')
	})
}

// relationshipHasSupportedStateAnswer is a stage, health, engagement, or
// sentiment the sheet can show. A confirmed open promise is a separate
// answer. A user correction stands on its own. Any other claim needs an
// observation.
func relationshipHasSupportedStateAnswer(now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			col := relationshipassertion.FieldSupportingObservationIds
			evidence := ""
			if s.Dialect() == dialect.Postgres {
				evidence = fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb)) > 0", col)
			} else {
				evidence = fmt.Sprintf("json_array_length(coalesce(%s, '[]')) > 0", col)
			}
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s IN ('lifecycle', 'health', 'engagement', 'sentiment') AND %s IN ('accepted', 'active') AND %s <= ",
				relationshipassertion.Table,
				relationshipassertion.RelationshipColumn,
				s.C(relationship.FieldID),
				relationshipassertion.FieldDimension,
				relationshipassertion.FieldStatus,
				relationshipassertion.FieldValidFrom,
			))
			b.Arg(now)
			b.WriteString(fmt.Sprintf(
				" AND (%s IS NULL OR %s > ",
				relationshipassertion.FieldValidTo,
				relationshipassertion.FieldValidTo,
			))
			b.Arg(now)
			b.WriteString(fmt.Sprintf(
				") AND (%s = 'user_correction' OR %s IS NOT NULL OR %s))",
				relationshipassertion.FieldSourceType,
				relationshipassertion.ObservationColumn,
				evidence,
			))
		}))
	})
}

// relationshipSheetDetailCountMatch matches the source badge on the company
// sheet and the trust question under it. The badge counts a correction as a
// source. The trust question counts only a detail whose observation still
// exists, so a correction with nothing to open reads "0 of 8".
func relationshipSheetDetailCountMatch(needle string) predicate.Relationship {
	total := len(relationshipProjectionDimensions)
	now := time.Now()
	var preds []predicate.Relationship
	for n := 0; n <= total; n++ {
		// The badge says "0 of 8 account details have a source". A shared
		// tail such as "details have a source" is inside every count, and
		// treating it as each count returned every company.
		have := fmt.Sprintf("%d of %d account details have a source", n, total)
		if labelPhraseMatches(have, needle) {
			preds = append(preds, relationshipSupportedDetailCount(n, now))
		}
		come := fmt.Sprintf("%d of %d account details come from a source you can open.", n, total)
		if labelPhraseMatches(come, needle) {
			preds = append(preds, relationshipOpenableDetailCount(n, now))
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

// relationshipOpenableDetailCount matches details the sheet can open. The
// observation has to belong to the company. A cited id with no row, and a
// correction with no observation, stay at zero.
func relationshipOpenableDetailCount(n int, now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT count(DISTINCT open_assertion.")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(") FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" AS open_assertion WHERE open_assertion.")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND open_assertion.")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(" IN (")
			for i, dimension := range relationshipProjectionDimensions {
				if i > 0 {
					b.WriteString(", ")
				}
				b.Arg(dimension)
			}
			b.WriteString(") AND open_assertion.")
			b.WriteString(relationshipassertion.FieldStatus)
			b.WriteString(" IN ('accepted', 'active') AND open_assertion.")
			b.WriteString(relationshipassertion.FieldValidFrom)
			b.WriteString(" <= ")
			b.Arg(now)
			b.WriteString(" AND (open_assertion.")
			b.WriteString(relationshipassertion.FieldValidTo)
			b.WriteString(" IS NULL OR open_assertion.")
			b.WriteString(relationshipassertion.FieldValidTo)
			b.WriteString(" > ")
			b.Arg(now)
			b.WriteString(") AND EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipobservation.Table)
			b.WriteString(" AS open_obs WHERE open_obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = open_assertion.")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" AND (open_obs.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" = open_assertion.")
			b.WriteString(relationshipassertion.ObservationColumn)
			b.WriteString(" OR ")
			writeOpenAssertionListsObservation(b, s)
			b.WriteString("))) = ")
			b.Arg(n)
		}))
	})
}

func writeOpenAssertionListsObservation(b *sql.Builder, s *sql.Selector) {
	column := "open_assertion." + relationshipassertion.FieldSupportingObservationIds
	if s.Dialect() == dialect.Postgres {
		b.WriteString("EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(")
		b.WriteString(column)
		b.WriteString(", '[]'::jsonb)) AS ref(value) WHERE ref.value = open_obs.")
		b.WriteString(relationshipobservation.FieldID)
		b.WriteString("::text)")
		return
	}
	b.WriteString("EXISTS (SELECT 1 FROM json_each(coalesce(")
	b.WriteString(column)
	b.WriteString(", '[]')) WHERE json_each.value = open_obs.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(")")
}

func relationshipSupportedDetailCount(n int, now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT count(DISTINCT ")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(") FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(" IN (")
			for i, dimension := range relationshipProjectionDimensions {
				if i > 0 {
					b.WriteString(", ")
				}
				b.Arg(dimension)
			}
			b.WriteString(") AND ")
			writeSupportedAssertionTail(b, s, now)
			b.WriteString(") = ")
			b.Arg(n)
		}))
	})
}

// relationshipSheetDetailSourceMatch matches the badges under "See where each
// detail came from". A correction says a person confirmed it. A claim with no
// observation says there is nothing to open. An empty detail says nothing
// connected has filled it in.
func relationshipSheetDetailSourceMatch(needle string) predicate.Relationship {
	now := time.Now()
	var preds []predicate.Relationship
	for phrase, sourceType := range map[string]string{
		"confirmed by a person":   "user_correction",
		"from a connected source": "source_fact",
		"from a workspace rule":   "deterministic",
		"public research":         "external_research",
		"suggested":               "ai_inference",
	} {
		if sheetPhraseMatches(phrase, needle) {
			preds = append(preds, relationshipHasDetailSource(sourceType, now))
		}
	}
	if needle == "not filled in yet" {
		preds = append(preds, relationship.Not(
			relationshipSupportedDetailCount(len(relationshipProjectionDimensions), now),
		))
	}
	if sheetPhraseMatches("nothing connected has filled this in.", needle) {
		preds = append(preds, relationshipHasUnfilledDetail(now))
	}
	if sheetPhraseMatches("this detail has no source you can open.", needle) {
		preds = append(preds, relationshipHasDetailWithoutEvidence(now))
	}
	if sheetPhraseMatches("needs refresh", needle) {
		preds = append(preds, relationshipShowsNeedsRefresh(now))
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipHasDetailSource(sourceType string, now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			b.WriteString(relationshipassertion.FieldSourceType)
			b.WriteString(" = ")
			b.Arg(sourceType)
			b.WriteString(" AND ")
			writeProjectionDimensionIn(b)
			b.WriteString(" AND ")
			writeSupportedAssertionTail(b, s, now)
			b.WriteString(")")
		}))
	})
}

// relationshipShowsNeedsRefresh matches the "Needs refresh" badge. A detail
// needs it when its evidence comes from a connector that is incomplete, or
// from a connector account that has no status row.
func relationshipShowsNeedsRefresh(now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" AS fresh_assertion JOIN ")
			b.WriteString(relationshipobservation.Table)
			b.WriteString(" AS fresh_obs ON fresh_obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = fresh_assertion.")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" AND (fresh_assertion.")
			b.WriteString(relationshipassertion.ObservationColumn)
			b.WriteString(" = fresh_obs.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" OR ")
			writeAssertionListsObservation(b, s)
			b.WriteString(") WHERE fresh_assertion.")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND fresh_assertion.")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(" IN (")
			for i, dimension := range relationshipProjectionDimensions {
				if i > 0 {
					b.WriteString(", ")
				}
				b.Arg(dimension)
			}
			b.WriteString(") AND fresh_assertion.")
			b.WriteString(relationshipassertion.FieldStatus)
			b.WriteString(" IN ('accepted', 'active') AND fresh_assertion.")
			b.WriteString(relationshipassertion.FieldValidFrom)
			b.WriteString(" <= ")
			b.Arg(now)
			b.WriteString(" AND (fresh_assertion.")
			b.WriteString(relationshipassertion.FieldValidTo)
			b.WriteString(" IS NULL OR fresh_assertion.")
			b.WriteString(relationshipassertion.FieldValidTo)
			b.WriteString(" > ")
			b.Arg(now)
			b.WriteString(") AND ")
			writeCanonicalSourceSQL(b, "fresh_obs."+relationshipobservation.FieldSource)
			b.WriteString(" IN ('google', 'slack', 'hubspot') AND ")
			writeObservationNeedsRefresh(b, s)
			b.WriteString(")")
		}))
	})
}

func writeAssertionListsObservation(b *sql.Builder, s *sql.Selector) {
	column := "fresh_assertion." + relationshipassertion.FieldSupportingObservationIds
	if s.Dialect() == dialect.Postgres {
		b.WriteString("EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(")
		b.WriteString(column)
		b.WriteString(", '[]'::jsonb)) AS ref(value) WHERE ref.value = fresh_obs.")
		b.WriteString(relationshipobservation.FieldID)
		b.WriteString("::text)")
		return
	}
	b.WriteString("EXISTS (SELECT 1 FROM json_each(coalesce(")
	b.WriteString(column)
	b.WriteString(", '[]')) WHERE json_each.value = fresh_obs.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(")")
}

func writeCanonicalSourceSQL(b *sql.Builder, column string) {
	b.WriteString("CASE lower(")
	b.WriteString(column)
	b.WriteString(") WHEN 'gmail' THEN 'google' WHEN 'calendar' THEN 'google' WHEN 'crm' THEN 'hubspot' ELSE lower(")
	b.WriteString(column)
	b.WriteString(") END")
}

func writeSourceAccountKey(b *sql.Builder, column string) {
	b.WriteString("lower(coalesce(nullif(trim(")
	b.WriteString(column)
	b.WriteString("), ''), 'default'))")
}

func writeObservationNeedsRefresh(b *sql.Builder, s *sql.Selector) {
	b.WriteString("(")
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(relationshipsourcestatus.Table)
	b.WriteString(" AS fresh_stop WHERE fresh_stop.")
	b.WriteString(relationshipsourcestatus.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.WorkspaceColumn))
	b.WriteString(" AND ")
	writeCanonicalSourceSQL(b, "fresh_stop."+relationshipsourcestatus.FieldSource)
	b.WriteString(" = ")
	writeCanonicalSourceSQL(b, "fresh_obs."+relationshipobservation.FieldSource)
	b.WriteString(" AND ")
	writeSourceAccountKey(b, "fresh_stop."+relationshipsourcestatus.FieldSourceAccountID)
	b.WriteString(" = ")
	writeSourceAccountKey(b, "fresh_obs."+relationshipobservation.FieldSourceAccountID)
	b.WriteString(" AND fresh_stop.")
	b.WriteString(relationshipsourcestatus.FieldCompleteness)
	b.WriteString(" <> 'complete') OR (NOT EXISTS (SELECT 1 FROM ")
	b.WriteString(relationshipsourcestatus.Table)
	b.WriteString(" AS fresh_stop WHERE fresh_stop.")
	b.WriteString(relationshipsourcestatus.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.WorkspaceColumn))
	b.WriteString(" AND ")
	writeCanonicalSourceSQL(b, "fresh_stop."+relationshipsourcestatus.FieldSource)
	b.WriteString(" = ")
	writeCanonicalSourceSQL(b, "fresh_obs."+relationshipobservation.FieldSource)
	b.WriteString(" AND ")
	writeSourceAccountKey(b, "fresh_stop."+relationshipsourcestatus.FieldSourceAccountID)
	b.WriteString(" = ")
	writeSourceAccountKey(b, "fresh_obs."+relationshipobservation.FieldSourceAccountID)
	b.WriteString(") AND NOT ((SELECT count(*) FROM ")
	b.WriteString(relationshipsourcestatus.Table)
	b.WriteString(" AS fresh_stop WHERE fresh_stop.")
	b.WriteString(relationshipsourcestatus.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.WorkspaceColumn))
	b.WriteString(" AND ")
	writeCanonicalSourceSQL(b, "fresh_stop."+relationshipsourcestatus.FieldSource)
	b.WriteString(" = ")
	writeCanonicalSourceSQL(b, "fresh_obs."+relationshipobservation.FieldSource)
	b.WriteString(") = 1 AND EXISTS (SELECT 1 FROM ")
	b.WriteString(relationshipsourcestatus.Table)
	b.WriteString(" AS fresh_stop WHERE fresh_stop.")
	b.WriteString(relationshipsourcestatus.WorkspaceColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.WorkspaceColumn))
	b.WriteString(" AND ")
	writeCanonicalSourceSQL(b, "fresh_stop."+relationshipsourcestatus.FieldSource)
	b.WriteString(" = ")
	writeCanonicalSourceSQL(b, "fresh_obs."+relationshipobservation.FieldSource)
	b.WriteString(" AND fresh_stop.")
	b.WriteString(relationshipsourcestatus.FieldCompleteness)
	b.WriteString(" = 'complete'))))")
}

func relationshipHasUnfilledDetail(now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		parts := make([]*sql.Predicate, 0, len(relationshipProjectionDimensions))
		for _, dimension := range relationshipProjectionDimensions {
			dim := dimension
			parts = append(parts, sql.Not(sql.P(func(b *sql.Builder) {
				b.WriteString("EXISTS (SELECT 1 FROM ")
				b.WriteString(relationshipassertion.Table)
				b.WriteString(" WHERE ")
				b.WriteString(relationshipassertion.RelationshipColumn)
				b.WriteString(" = ")
				b.WriteString(s.C(relationship.FieldID))
				b.WriteString(" AND ")
				b.WriteString(relationshipassertion.FieldDimension)
				b.WriteString(" = ")
				b.Arg(dim)
				b.WriteString(" AND ")
				writeCurrentAssertionWindow(b, now)
				b.WriteString(")")
			})))
		}
		s.Where(sql.Or(parts...))
	})
}

func relationshipHasDetailWithoutEvidence(now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			col := relationshipassertion.FieldSupportingObservationIds
			empty := fmt.Sprintf("json_array_length(coalesce(%s, '[]')) = 0", col)
			if s.Dialect() == dialect.Postgres {
				empty = fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb)) = 0", col)
			}
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			writeProjectionDimensionIn(b)
			b.WriteString(" AND ")
			writeCurrentAssertionWindow(b, now)
			b.WriteString(" AND ")
			b.WriteString(relationshipassertion.FieldSourceType)
			b.WriteString(" <> 'user_correction' AND ")
			b.WriteString(relationshipassertion.ObservationColumn)
			b.WriteString(" IS NULL AND ")
			b.WriteString(empty)
			b.WriteString(")")
		}))
	})
}

func writeProjectionDimensionIn(b *sql.Builder) {
	b.WriteString(relationshipassertion.FieldDimension)
	b.WriteString(" IN (")
	for i, dimension := range relationshipProjectionDimensions {
		if i > 0 {
			b.WriteString(", ")
		}
		b.Arg(dimension)
	}
	b.WriteByte(')')
}

func writeCurrentAssertionWindow(b *sql.Builder, now time.Time) {
	b.WriteString(relationshipassertion.FieldStatus)
	b.WriteString(" IN ('accepted', 'active') AND ")
	b.WriteString(relationshipassertion.FieldValidFrom)
	b.WriteString(" <= ")
	b.Arg(now)
	b.WriteString(" AND (")
	b.WriteString(relationshipassertion.FieldValidTo)
	b.WriteString(" IS NULL OR ")
	b.WriteString(relationshipassertion.FieldValidTo)
	b.WriteString(" > ")
	b.Arg(now)
	b.WriteByte(')')
}

// relationshipHasSupportedDimension matches a stage the company record will
// show. A user correction counts, and so does an assertion that cites evidence.
func relationshipHasSupportedDimension(dimension string, now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipassertion.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipassertion.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND ")
			b.WriteString(relationshipassertion.FieldDimension)
			b.WriteString(" = ")
			b.Arg(dimension)
			b.WriteString(" AND ")
			writeSupportedAssertionTail(b, s, now)
			b.WriteString(")")
		}))
	})
}

func writeSupportedAssertionTail(b *sql.Builder, s *sql.Selector, now time.Time) {
	col := relationshipassertion.FieldSupportingObservationIds
	evidence := fmt.Sprintf("json_array_length(coalesce(%s, '[]')) > 0", col)
	if s.Dialect() == dialect.Postgres {
		evidence = fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb)) > 0", col)
	}
	b.WriteString(relationshipassertion.FieldStatus)
	b.WriteString(" IN ('accepted', 'active') AND ")
	b.WriteString(relationshipassertion.FieldValidFrom)
	b.WriteString(" <= ")
	b.Arg(now)
	b.WriteString(" AND (")
	b.WriteString(relationshipassertion.FieldValidTo)
	b.WriteString(" IS NULL OR ")
	b.WriteString(relationshipassertion.FieldValidTo)
	b.WriteString(" > ")
	b.Arg(now)
	b.WriteString(") AND (")
	b.WriteString(relationshipassertion.FieldSourceType)
	b.WriteString(" = 'user_correction' OR ")
	b.WriteString(relationshipassertion.ObservationColumn)
	b.WriteString(" IS NOT NULL OR ")
	b.WriteString(evidence)
	b.WriteByte(')')
}

// relationshipSheetCompletenessMatch matches the sentences under the company
// sheet heading. A company with no connector says to connect a source. A
// company that already names one says the remaining details have no evidence.
// A short fragment such as "source" is not that sentence.
func relationshipSheetCompletenessMatch(needle string) predicate.Relationship {
	now := time.Now()
	var preds []predicate.Relationship
	if sheetPhraseMatches("connect a source before these details can fill in.", needle) {
		preds = append(preds, relationshipConnectSourceCopy(now))
	}
	if sheetPhraseMatches("one or more material values have no accessible supporting evidence.", needle) ||
		sheetPhraseMatches("some details have no source you can open.", needle) ||
		sheetPhraseMatches("account details have no source you can open.", needle) {
		preds = append(preds, relationshipMaterialGapCopy(now))
	}
	detailTotal := len(relationshipProjectionDimensions)
	for supported := 1; supported < detailTotal; supported++ {
		rest := detailTotal - supported
		phrase := fmt.Sprintf("%d account details still need a source.", rest)
		if rest == 1 {
			phrase = "1 account detail still needs a source."
		}
		if sheetPhraseMatches(phrase, needle) {
			preds = append(preds, relationshipRemainingDetailCopy(supported, now))
		}
	}
	// Zero supported details use their own heading. "Some details are still
	// missing" is the heading once at least one detail has a source.
	if sheetPhraseMatches("no account details have a source yet", needle) {
		preds = append(preds, relationship.And(
			relationshipShowsPartialHeading(now),
			relationshipSupportedDetailCount(0, now),
		))
	}
	if sheetPhraseMatches("some details are still missing", needle) {
		preds = append(preds, relationship.And(
			relationshipShowsPartialHeading(now),
			relationship.Not(relationshipSupportedDetailCount(0, now)),
		))
	}
	if sheetPhraseMatches("details are current", needle) {
		preds = append(preds, relationshipShowsCurrentHeading(now))
	}
	if sheetPhraseMatches("needs a review before you act", needle) ||
		sheetPhraseMatches("identity review is required before acting on this relationship.", needle) {
		preds = append(preds, relationshipShowsAmbiguousHeading(now))
	}
	if sheetPhraseMatches("details need a refresh", needle) ||
		sheetPhraseMatches("a required source is stale or disconnected.", needle) ||
		sheetPhraseMatches("a source needs reconnecting.", needle) {
		preds = append(preds, relationshipShowsStaleHeading(now))
	}
	if sheetPhraseMatches("updating from connected sources", needle) {
		preds = append(preds, relationshipShowsRebuildingHeading(now))
	}
	if sheetPhraseMatches("a required source is rebuilding; partial state is visible.", needle) ||
		sheetPhraseMatches("a source is still updating, so only some details are shown.", needle) {
		preds = append(preds, relationshipShowsSourceRebuilding(now))
	}
	if sheetPhraseMatches("accepted evidence is waiting for the durable relationship projector.", needle) {
		preds = append(preds, relationship.And(
			relationshipHasDueProjection(now),
			relationship.Not(relationshipHasDeadProjection(now)),
		))
	}
	if sheetPhraseMatches("relationship projection requires operator repair before this state is safe to act on.", needle) {
		preds = append(preds, relationshipHasDeadProjection(now))
	}
	for n := 1; n <= 20; n++ {
		phrases := []string{
			fmt.Sprintf("%d identity reviews block acting.", n),
			fmt.Sprintf("%d possible duplicates must be reviewed before you act.", n),
		}
		if n == 1 {
			phrases = []string{
				"1 identity review blocks acting.",
				"1 possible duplicate must be reviewed before you act.",
			}
		}
		for _, phrase := range phrases {
			if sheetPhraseMatches(phrase, needle) {
				preds = append(preds, relationshipIdentityReviewCount(n))
				break
			}
		}
	}
	switch len(preds) {
	case 0:
		return nil
	case 1:
		return preds[0]
	default:
		return relationship.Or(preds...)
	}
}

func relationshipConnectSourceCopy(now time.Time) predicate.Relationship {
	return relationship.And(
		relationship.Not(relationshipHasSourceDependency()),
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationship.Not(relationshipGmailExplanation(now)),
		// A correction already filled a detail. That company no longer says
		// every detail is waiting on a connector.
		relationshipSupportedDetailCount(0, now),
	)
}

func relationshipMaterialGapCopy(now time.Time) predicate.Relationship {
	return relationshipMaterialGapAt(0, now)
}

func relationshipMaterialGapAt(supported int, now time.Time) predicate.Relationship {
	return relationship.And(
		relationshipHasSourceDependency(),
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationship.Not(relationshipHasEarlySourceStop()),
		relationshipSupportedDetailCount(supported, now),
		relationship.Not(relationshipGmailExplanation(now)),
	)
}

// relationshipRemainingDetailCopy matches the sheet once some details have a
// source and the rest do not. A reconnect or a rebuild uses its own sentence.
func relationshipRemainingDetailCopy(supported int, now time.Time) predicate.Relationship {
	return relationship.Or(
		relationship.And(
			relationship.Not(relationshipHasSourceDependency()),
			relationship.Not(relationshipHasUnresolvedIdentity()),
			relationship.Not(relationshipHasBlockingProjection(now)),
			relationship.Not(relationshipGmailExplanation(now)),
			relationshipSupportedDetailCount(supported, now),
		),
		relationshipMaterialGapAt(supported, now),
	)
}

// relationshipShowsPartialHeading is the heading "Some details are still missing".
// A review block, a stale connector, a projector wait, and a fully current
// company each use a different heading.
func relationshipShowsPartialHeading(now time.Time) predicate.Relationship {
	return relationship.And(
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationship.Not(relationshipHasEarlySourceStop()),
		relationship.Not(relationship.And(
			relationshipSupportedDetailCount(len(relationshipProjectionDimensions), now),
			relationshipDependenciesAreCurrent(),
		)),
	)
}

// relationshipShowsCurrentHeading is the heading "Details are current".
func relationshipShowsCurrentHeading(now time.Time) predicate.Relationship {
	return relationship.And(
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationship.Not(relationshipHasEarlySourceStop()),
		relationshipSupportedDetailCount(len(relationshipProjectionDimensions), now),
		relationshipDependenciesAreCurrent(),
	)
}

// relationshipShowsAmbiguousHeading is "Needs a review before you act" and the
// sentence under it. A projector wait replaces both.
func relationshipShowsAmbiguousHeading(now time.Time) predicate.Relationship {
	return relationship.And(
		relationshipHasUnresolvedIdentity(),
		relationship.Not(relationshipHasBlockingProjection(now)),
	)
}

func relationshipIdentityReviewCount(n int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT count(*) FROM ")
			b.WriteString(relationshipidentitycandidate.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipidentitycandidate.FieldStatus)
			b.WriteString(fmt.Sprintf(
				" IN ('%s', '%s', '%s') AND (%s = %s OR %s = %s)) = ",
				identityPending,
				identityDeferred,
				identityResolving,
				relationshipidentitycandidate.ProposedRelationshipColumn,
				s.C(relationship.FieldID),
				relationshipidentitycandidate.ExistingRelationshipColumn,
				s.C(relationship.FieldID),
			))
			b.Arg(n)
		}))
	})
}

// relationshipDependenciesAreCurrent is true when every connector the company
// names has a complete status row and no stored missing scope. A company with
// no connector is not current.
func relationshipDependenciesAreCurrent() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.And(
			sql.Or(
				relationshipDependsOnGoogle(s),
				relationshipDependsOnSlack(s),
				relationshipDependsOnHubSpot(s),
			),
			sql.Or(sql.Not(relationshipDependsOnGoogle(s)), relationshipSourceGroupCurrent(s, "gmail", "calendar", "google")),
			sql.Or(sql.Not(relationshipDependsOnSlack(s)), relationshipSourceGroupCurrent(s, "slack")),
			sql.Or(sql.Not(relationshipDependsOnHubSpot(s)), relationshipSourceGroupCurrent(s, "hubspot", "crm")),
		))
	})
}

func relationshipSourceGroupCurrent(s *sql.Selector, sources ...string) *sql.Predicate {
	return sql.And(
		relationshipSourceGroupState(s, true, sources...),
		sql.Not(relationshipSourceGroupState(s, false, sources...)),
	)
}

func relationshipSourceGroupState(s *sql.Selector, current bool, sources ...string) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		b.WriteString("EXISTS (SELECT 1 FROM ")
		b.WriteString(relationshipsourcestatus.Table)
		b.WriteString(" WHERE ")
		b.WriteString(relationshipsourcestatus.WorkspaceColumn)
		b.WriteString(" = ")
		b.WriteString(s.C(relationship.WorkspaceColumn))
		b.WriteString(" AND lower(")
		b.WriteString(relationshipsourcestatus.Table)
		b.WriteByte('.')
		b.WriteString(relationshipsourcestatus.FieldSource)
		b.WriteString(") IN (")
		for i, source := range sources {
			if i > 0 {
				b.WriteString(", ")
			}
			b.Arg(source)
		}
		b.WriteString(") AND ")
		if current {
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			b.WriteString(" = 'complete' AND ")
			writeMissingScopesEmpty(b, s)
		} else {
			b.WriteByte('(')
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			b.WriteString(" <> 'complete' OR NOT ")
			writeMissingScopesEmpty(b, s)
			b.WriteByte(')')
		}
		b.WriteByte(')')
	})
}

func writeMissingScopesEmpty(b *sql.Builder, s *sql.Selector) {
	column := relationshipsourcestatus.Table + "." + relationshipsourcestatus.FieldMissingScopes
	if s.Dialect() == dialect.Postgres {
		b.WriteString(fmt.Sprintf("jsonb_array_length(coalesce(%s, '[]'::jsonb)) = 0", column))
		return
	}
	b.WriteString(fmt.Sprintf("json_array_length(coalesce(%s, '[]')) = 0", column))
}

// relationshipGmailExplanation is the paragraph that replaces completeness
// copy when Gmail threads are linked and no detail has a source yet.
func relationshipGmailExplanation(now time.Time) predicate.Relationship {
	return relationship.And(
		relationshipHasMailThreads(),
		relationshipSupportedDetailCount(0, now),
	)
}

func relationshipHasMailThreads() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM %s WHERE %s = %s)",
				mailthread.Table,
				mailthread.RelationshipColumn,
				s.C(relationship.FieldID),
			))
		}))
	})
}

func relationshipHasUnresolvedIdentity() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM %s WHERE %s IN ('%s', '%s', '%s') AND (%s = %s OR %s = %s))",
				relationshipidentitycandidate.Table,
				relationshipidentitycandidate.FieldStatus,
				identityPending,
				identityDeferred,
				identityResolving,
				relationshipidentitycandidate.ProposedRelationshipColumn,
				s.C(relationship.FieldID),
				relationshipidentitycandidate.ExistingRelationshipColumn,
				s.C(relationship.FieldID),
			))
		}))
	})
}

func relationshipHasBlockingProjection(now time.Time) predicate.Relationship {
	return relationship.Or(
		relationshipHasDeadProjection(now),
		relationshipHasDueProjection(now),
	)
}

func relationshipHasDeadProjection(now time.Time) predicate.Relationship {
	return relationshipProjectionIn(now, "dead")
}

func relationshipHasDueProjection(now time.Time) predicate.Relationship {
	return relationshipProjectionIn(now, "pending", "running", "failed")
}

func relationshipProjectionIn(now time.Time, statuses ...string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s <= ",
				relationshipprojectionjob.Table,
				relationshipprojectionjob.RelationshipColumn,
				s.C(relationship.FieldID),
				relationshipprojectionjob.FieldEvaluatedAt,
			))
			b.Arg(now)
			b.WriteString(fmt.Sprintf(" AND %s IN (", relationshipprojectionjob.FieldStatus))
			for i, status := range statuses {
				if i > 0 {
					b.WriteString(", ")
				}
				b.Arg(status)
			}
			b.WriteString("))")
		}))
	})
}

// relationshipShowsStaleHeading is "Details need a refresh". The first connector
// stop is stale or disconnected, and a projector wait has not replaced it.
func relationshipShowsStaleHeading(now time.Time) predicate.Relationship {
	return relationship.And(
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationshipFirstSourceStop(false),
	)
}

// relationshipShowsSourceRebuilding is the rebuilding sentence for a connector.
// A projector wait uses the same heading and a different sentence.
func relationshipShowsSourceRebuilding(now time.Time) predicate.Relationship {
	return relationship.And(
		relationship.Not(relationshipHasUnresolvedIdentity()),
		relationship.Not(relationshipHasBlockingProjection(now)),
		relationshipFirstSourceStop(true),
	)
}

// relationshipShowsRebuildingHeading is "Updating from connected sources".
func relationshipShowsRebuildingHeading(now time.Time) predicate.Relationship {
	return relationship.Or(
		relationshipHasDeadProjection(now),
		relationshipHasDueProjection(now),
		relationshipShowsSourceRebuilding(now),
	)
}

func relationshipHasSourceDependency() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.Or(
			relationshipDependsOnGoogle(s),
			relationshipDependsOnSlack(s),
			relationshipDependsOnHubSpot(s),
		))
	})
}

func relationshipDependsOnGoogle(s *sql.Selector) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		writeRelationshipDependsOn(b, s, []string{"gmail", "calendar", "google"}, []string{"email", "gmail", "calendar"})
	})
}

func relationshipDependsOnSlack(s *sql.Selector) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		writeRelationshipDependsOn(b, s, []string{"slack"}, []string{"slack"})
	})
}

func relationshipDependsOnHubSpot(s *sql.Selector) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		writeRelationshipDependsOn(b, s, []string{"hubspot", "crm"}, []string{"hubspot", "crm", "crm_task", "task"})
	})
}

func writeRelationshipDependsOn(b *sql.Builder, s *sql.Selector, sources, channels []string) {
	b.WriteByte('(')
	writeObservationSourceIn(b, s, sources)
	b.WriteString(" OR ")
	writeResourceRefSource(b, s, sources)
	b.WriteString(" OR ")
	writeOpenActionChannelIn(b, s, channels)
	b.WriteByte(')')
}

func writeObservationSourceIn(b *sql.Builder, s *sql.Selector, sources []string) {
	b.WriteString(fmt.Sprintf(
		"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND lower(%s) IN (",
		relationshipobservation.Table,
		relationshipobservation.RelationshipColumn,
		s.C(relationship.FieldID),
		relationshipobservation.FieldSource,
	))
	for i, source := range sources {
		if i > 0 {
			b.WriteString(", ")
		}
		b.Arg(source)
	}
	b.WriteString("))")
}

func writeOpenActionChannelIn(b *sql.Builder, s *sql.Selector, channels []string) {
	b.WriteString(fmt.Sprintf(
		"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s = ",
		revenueaction.Table,
		revenueaction.RelationshipColumn,
		s.C(relationship.FieldID),
		revenueaction.FieldQueueStatus,
	))
	b.Arg(QueueOpen)
	b.WriteString(fmt.Sprintf(" AND lower(%s) IN (", revenueaction.FieldChannel))
	for i, channel := range channels {
		if i > 0 {
			b.WriteString(", ")
		}
		b.Arg(channel)
	}
	b.WriteString("))")
}

func writeResourceRefSource(b *sql.Builder, s *sql.Selector, sources []string) {
	column := s.C(relationship.FieldResourceRefs)
	if s.Dialect() == dialect.Postgres {
		b.WriteString(fmt.Sprintf(
			"EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(%s, '[]'::jsonb)) AS ref(value) WHERE ",
			column,
		))
	} else {
		b.WriteString(fmt.Sprintf(
			"EXISTS (SELECT 1 FROM json_each(coalesce(%s, '[]')) AS ref WHERE ",
			column,
		))
	}
	for i, source := range sources {
		if i > 0 {
			b.WriteString(" OR ")
		}
		b.WriteString("lower(ref.value) LIKE ")
		b.Arg(source + ":%")
		b.WriteString(" OR lower(ref.value) LIKE ")
		b.Arg("%/" + source + "/%")
	}
	b.WriteByte(')')
}

func relationshipHasEarlySourceStop() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM %s WHERE %s = %s AND %s IN ('stale', 'disconnected', 'rebuilding') AND (",
				relationshipsourcestatus.Table,
				relationshipsourcestatus.WorkspaceColumn,
				s.C(relationship.WorkspaceColumn),
				relationshipsourcestatus.FieldCompleteness,
			))
			statusSource := relationshipsourcestatus.Table + "." + relationshipsourcestatus.FieldSource
			b.WriteString("(lower(")
			b.WriteString(statusSource)
			b.WriteString(") IN ('gmail', 'calendar', 'google') AND ")
			writeRelationshipDependsOn(b, s, []string{"gmail", "calendar", "google"}, []string{"email", "gmail", "calendar"})
			b.WriteString(") OR (lower(")
			b.WriteString(statusSource)
			b.WriteString(") = 'slack' AND ")
			writeRelationshipDependsOn(b, s, []string{"slack"}, []string{"slack"})
			b.WriteString(") OR (lower(")
			b.WriteString(statusSource)
			b.WriteString(") IN ('hubspot', 'crm') AND ")
			writeRelationshipDependsOn(b, s, []string{"hubspot", "crm"}, []string{"hubspot", "crm", "crm_task", "task"})
			b.WriteString(")))")
		}))
	})
}

// relationshipFirstSourceStop matches the earliest connector row that stops
// completeness. rebuilding selects a rebuild. Otherwise the stop is stale or
// disconnected. Rows are ordered by source, then account, matching the sheet.
func relationshipFirstSourceStop(rebuilding bool) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipsourcestatus.Table)
			b.WriteString(" AS stop WHERE stop.")
			b.WriteString(relationshipsourcestatus.WorkspaceColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.WorkspaceColumn))
			b.WriteString(" AND stop.")
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			if rebuilding {
				b.WriteString(" = 'rebuilding'")
			} else {
				b.WriteString(" IN ('stale', 'disconnected')")
			}
			b.WriteString(" AND ")
			writeDependentSource(b, s, "stop")
			b.WriteString(" AND NOT EXISTS (SELECT 1 FROM ")
			b.WriteString(relationshipsourcestatus.Table)
			b.WriteString(" AS earlier WHERE earlier.")
			b.WriteString(relationshipsourcestatus.WorkspaceColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.WorkspaceColumn))
			b.WriteString(" AND earlier.")
			b.WriteString(relationshipsourcestatus.FieldCompleteness)
			b.WriteString(" IN ('stale', 'disconnected', 'rebuilding') AND ")
			writeDependentSource(b, s, "earlier")
			b.WriteString(" AND (lower(earlier.")
			b.WriteString(relationshipsourcestatus.FieldSource)
			b.WriteString(") < lower(stop.")
			b.WriteString(relationshipsourcestatus.FieldSource)
			b.WriteString(") OR (lower(earlier.")
			b.WriteString(relationshipsourcestatus.FieldSource)
			b.WriteString(") = lower(stop.")
			b.WriteString(relationshipsourcestatus.FieldSource)
			b.WriteString(") AND lower(earlier.")
			b.WriteString(relationshipsourcestatus.FieldSourceAccountID)
			b.WriteString(") < lower(stop.")
			b.WriteString(relationshipsourcestatus.FieldSourceAccountID)
			b.WriteString(")))))")
		}))
	})
}

func writeDependentSource(b *sql.Builder, s *sql.Selector, alias string) {
	statusSource := alias + "." + relationshipsourcestatus.FieldSource
	b.WriteString("((lower(")
	b.WriteString(statusSource)
	b.WriteString(") IN ('gmail', 'calendar', 'google') AND ")
	writeRelationshipDependsOn(b, s, []string{"gmail", "calendar", "google"}, []string{"email", "gmail", "calendar"})
	b.WriteString(") OR (lower(")
	b.WriteString(statusSource)
	b.WriteString(") = 'slack' AND ")
	writeRelationshipDependsOn(b, s, []string{"slack"}, []string{"slack"})
	b.WriteString(") OR (lower(")
	b.WriteString(statusSource)
	b.WriteString(") IN ('hubspot', 'crm') AND ")
	writeRelationshipDependsOn(b, s, []string{"hubspot", "crm"}, []string{"hubspot", "crm", "crm_task", "task"})
	b.WriteString("))")
}

// labelPhraseMatches is the sentence on the company row, or a longer question
// that still contains that sentence. A word from the middle is not the
// sentence. "email" sits inside both "1 email thread" and "email threads",
// and treating it as both used to return every company.
func labelPhraseMatches(phrase, needle string) bool {
	phrase = normalizePersonSearch(phrase)
	needle = normalizePersonSearch(needle)
	if phrase == "" || needle == "" {
		return false
	}
	if needle == phrase {
		return true
	}
	return len(phrase) >= 8 && strings.Contains(needle, phrase)
}

func sheetPhraseMatches(phrase, needle string) bool {
	if needle == "" {
		return false
	}
	// The search box folds hyphens, underscores, and periods into spaces
	// before this comparison. The printed sentence has to fold the same way,
	// or "Low-confidence material claim" never matches the words on the card.
	phrase = normalizePersonSearch(phrase)
	if needle == phrase {
		return true
	}
	if len(needle) < 8 {
		return false
	}
	return strings.Contains(phrase, needle)
}

func mailThreadSubjectBlank() predicate.MailThread {
	return mailThreadTextBlank(mailthread.FieldSubject)
}

func mailThreadCounterpartyBlank() predicate.MailThread {
	return mailThreadTextBlank(mailthread.FieldCounterpartyEmail)
}

// mailThreadAddressPartyLine matches the second line of an email that names
// an address. The sheet prints "ada@birch.example · 1 message". A missing
// address prints "Gmail" instead, so that row stays out of this line.
func mailThreadAddressPartyLine(needle string) predicate.MailThread {
	text := normalizePersonSearch(needle)
	return predicate.MailThread(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			email := fmt.Sprintf("trim(coalesce(%s, ''))", s.C(mailthread.FieldCounterpartyEmail))
			count := s.C(mailthread.FieldMessageCount)
			label := fmt.Sprintf(
				"CASE WHEN %s = 1 THEN '1 message' ELSE CAST(%s AS TEXT) || ' messages' END",
				count, count,
			)
			party := fmt.Sprintf("replace(replace(replace(lower(%s), '-', ' '), '_', ' '), '.', ' ')", email)
			phrase := party + " || ' · ' || " + label
			if s.Dialect() == dialect.Postgres {
				b.WriteString("strpos(lower(")
				b.WriteString(email)
				b.WriteString("), '@') > 0 AND strpos(")
				b.Arg(text)
				b.WriteString(", ")
				b.WriteString(phrase)
				b.WriteString(") > 0")
				return
			}
			b.WriteString("instr(lower(")
			b.WriteString(email)
			b.WriteString("), '@') > 0 AND instr(")
			b.Arg(text)
			b.WriteString(", ")
			b.WriteString(phrase)
			b.WriteString(") > 0")
		}))
	})
}

func needleHasAddressPartyLine(needle string) bool {
	text := normalizePersonSearch(needle)
	const marker = " · "
	for {
		index := strings.Index(text, marker)
		if index < 0 {
			return false
		}
		if messageCountSuffix(text[index+len(marker):]) {
			return true
		}
		text = text[index+len(marker):]
	}
}

func messageCountSuffix(body string) bool {
	i := 0
	for i < len(body) && body[i] >= '0' && body[i] <= '9' {
		i++
	}
	if i == 0 || i >= len(body) || body[i] != ' ' {
		return false
	}
	n, err := strconv.Atoi(body[:i])
	if err != nil || n < 0 || strconv.Itoa(n) != body[:i] {
		return false
	}
	word := "messages"
	if n == 1 {
		word = "message"
	}
	unit := body[i+1:]
	return unit == word || strings.HasPrefix(unit, word+" ")
}

// mailThreadTextBlank matches a thread field the sheet prints as a fallback.
// Spaces are the same as an empty value.
func mailThreadTextBlank(field string) predicate.MailThread {
	return predicate.MailThread(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(field)))
		}))
	})
}

func exactMailMessageCount(needle string) (int, bool) {
	var n int
	if _, err := fmt.Sscanf(needle, "%d message", &n); err != nil || n < 0 {
		return 0, false
	}
	label := fmt.Sprintf("%d messages", n)
	if n == 1 {
		label = "1 message"
	}
	if needle != label {
		return 0, false
	}
	return n, true
}

func relationshipMailThreadCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != "<>" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"(SELECT count(*) FROM %s WHERE %s = %s) %s ",
				mailthread.Table,
				mailthread.RelationshipColumn,
				s.C(relationship.FieldID),
				compare,
			))
			b.Arg(n)
		}))
	})
}

// GetRelationship returns one relationship with its actions and commitments.
func (s *Service) GetRelationship(ctx context.Context, id uuid.UUID) (*ent.Relationship, error) {
	rel, err := s.client.Relationship.Query().
		Where(relationship.IDEQ(id)).
		WithCommitments().
		// The canonical person travels with the participant so the detail view can
		// show one enriched human rather than a bare name and address.
		WithParticipants(func(q *ent.RelationshipParticipantQuery) {
			q.WithPerson()
		}).
		WithMailThreads(func(q *ent.MailThreadQuery) {
			q.Order(ent.Desc(mailthread.FieldLastActivityAt))
		}).
		WithActions(func(q *ent.RevenueActionQuery) {
			q.WithEvidences().Order(
				ent.Desc(revenueaction.FieldPriorityScore),
				ent.Asc(revenueaction.FieldID),
			)
		}).
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, ErrNotFound
	}
	return rel, err
}

// --- action creation ---------------------------------------------------------

// ActionInput creates a queue action. Detector defaults to "manual"; scan
// detectors (WP3) pass their own detector and dedupe key.
type ActionInput struct {
	RelationshipID   uuid.UUID
	ActionType       string
	Channel          string
	Detector         string
	DedupeKey        string
	Reason           string
	RecipientEmail   string
	ProposedSubject  string
	ProposedMessage  string
	SenderAccountRef string
	ExecutionMode    string // draft (default) | send
	PriorityScore    int
	PriorityParts    map[string]int
	DueAt            *time.Time
}

// content returns the revision-hash content for the input as revision 1.
func (in ActionInput) content(assigned uuid.UUID) RevisionContent {
	return RevisionContent{
		ActionType:       in.ActionType,
		Channel:          in.Channel,
		RecipientEmail:   in.RecipientEmail,
		ProposedSubject:  in.ProposedSubject,
		ProposedMessage:  in.ProposedMessage,
		SenderAccountRef: in.SenderAccountRef,
		AssignedUserID:   assigned.String(),
		ExecutionMode:    in.ExecutionMode,
	}
}

// CreateAction proposes a new queue action with revision 1 and an immutable
// revision snapshot. The dedupe key keeps detector reruns from duplicating
// queue items; a duplicate returns the existing action.
func (s *Service) CreateAction(ctx context.Context, u *ent.User, in ActionInput) (*ent.RevenueAction, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	in.ProposedSubject = strings.TrimSpace(in.ProposedSubject)
	in.ProposedMessage = strings.TrimSpace(in.ProposedMessage)
	if in.Reason == "" {
		return nil, fmt.Errorf("%w: reason is required", ErrInvalidInput)
	}
	if in.Detector == "" {
		in.Detector = DetectorManual
	}
	if in.ExecutionMode == "" {
		in.ExecutionMode = ExecModeDraft
	}
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceContribute)
	if err != nil {
		return nil, err
	}
	rel, err := s.client.Relationship.Query().
		Where(relationship.IDEQ(in.RelationshipID)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, fmt.Errorf("%w: relationship", ErrNotFound)
		}
		return nil, err
	}
	if unresolved, checkErr := s.relationshipHasUnresolvedIdentity(ctx, rel.ID); checkErr != nil {
		return nil, checkErr
	} else if unresolved {
		return nil, ErrIdentityUnresolved
	}
	if in.Detector != DetectorManual {
		if err := s.ensureRelationshipActionCompleteness(ctx, u, ws, rel.ID); err != nil {
			return nil, err
		}
	}
	if in.DedupeKey == "" {
		if in.Detector == DetectorManual {
			in.DedupeKey = "manual:" + uuid.NewString()
		} else {
			in.DedupeKey = fmt.Sprintf("%s:%s:%s:%s", in.Detector, in.ActionType, in.Channel, rel.ID)
		}
	}
	if in.PriorityScore < 0 {
		in.PriorityScore = 0
	}
	if in.PriorityScore > 100 {
		in.PriorityScore = 100
	}
	hash := in.content(u.ID).Hash()

	tx, err := s.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	txc := tx.Client()

	create := txc.RevenueAction.Create().
		SetWorkspace(ws).
		SetRelationship(rel).
		SetUser(u).
		SetActionType(in.ActionType).
		SetChannel(in.Channel).
		SetDetector(in.Detector).
		SetDedupeKey(in.DedupeKey).
		SetRevision(1).
		SetRevisionHash(hash).
		SetReason(in.Reason).
		SetExecutionMode(in.ExecutionMode).
		SetExecutionOwner(OwnerRowboat).
		SetAssignedUserID(u.ID).
		SetPriorityScore(in.PriorityScore)
	if in.RecipientEmail != "" {
		create.SetRecipientEmail(strings.ToLower(strings.TrimSpace(in.RecipientEmail)))
	}
	if in.ProposedSubject != "" {
		create.SetProposedSubject(in.ProposedSubject)
	}
	if in.ProposedMessage != "" {
		create.SetProposedMessage(in.ProposedMessage)
	}
	if in.SenderAccountRef != "" {
		create.SetSenderAccountRef(in.SenderAccountRef)
	}
	if len(in.PriorityParts) > 0 {
		raw, merr := json.Marshal(in.PriorityParts)
		if merr != nil {
			_ = tx.Rollback()
			return nil, merr
		}
		create.SetPriorityComponentsJSON(string(raw))
	}
	if in.DueAt != nil {
		create.SetDueAt(*in.DueAt)
	}
	action, err := create.Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		if ent.IsConstraintError(err) {
			// Duplicate dedupe key: detector rerun. Return the existing item.
			revenuemetrics.DuplicatesPrevented.WithLabelValues("create").Inc()
			return s.client.RevenueAction.Query().
				Where(revenueaction.DedupeKeyEQ(in.DedupeKey)).
				First(ctx)
		}
		if isValidationError(err) {
			return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
		}
		return nil, err
	}
	if err := s.snapshotRevision(ctx, txc, action, u); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	revenuemetrics.Actions.WithLabelValues(action.ActionType, action.QueueStatus).Inc()
	_ = s.RefreshRelationshipAttention(ctx, u)
	return action.Unwrap(), nil
}

// snapshotRevision writes the immutable revision row for the action's current
// content (part of every create/edit transaction).
func (s *Service) snapshotRevision(ctx context.Context, txc *ent.Client, action *ent.RevenueAction, u *ent.User) error {
	create := txc.RevenueActionRevision.Create().
		SetAction(action).
		SetUser(u).
		SetRevision(action.Revision).
		SetRevisionHash(action.RevisionHash).
		SetActionType(action.ActionType).
		SetChannel(action.Channel).
		SetReason(action.Reason).
		SetCreatedBy(u.ID)
	if action.RecipientEmail != "" {
		create.SetRecipientEmail(action.RecipientEmail)
	}
	if action.ProposedSubject != "" {
		create.SetProposedSubject(action.ProposedSubject)
	}
	if action.ProposedMessage != "" {
		create.SetProposedMessage(action.ProposedMessage)
	}
	if action.SenderAccountRef != "" {
		create.SetSenderAccountRef(action.SenderAccountRef)
	}
	if action.AssignedUserID != nil {
		create.SetAssignedUserID(*action.AssignedUserID)
	}
	return create.Exec(ctx)
}

// --- queue reads -------------------------------------------------------------

// ListFilter bounds the queue listing.
// Surface "task" keeps follow-up tasks. Surface "recovery" keeps every other
// open action. An empty surface keeps the mixed queue.
type ListFilter struct {
	QueueStatus string
	Limit       int
	Offset      int
	Surface     string
	// DueOrder is "asc" or "desc" for the task list. Empty keeps priority order.
	// Undated tasks stay last in either direction.
	DueOrder string
}

// ActionListPage is one queue page. HasMore is true only when another action
// exists past this page, so an exact page of 100 is not offered as if a 101st
// task or follow-up were waiting.
type ActionListPage struct {
	Actions []*ent.RevenueAction
	HasMore bool
}

// ListActions returns the caller's queue ordered by priority, then oldest
// first. Actions that share both stay in id order, so the next page does not
// repeat one and skip another.
func (s *Service) ListActions(ctx context.Context, u *ent.User, f ListFilter) ([]*ent.RevenueAction, error) {
	page, err := s.ListActionPage(ctx, u, f)
	if err != nil || page == nil {
		return nil, err
	}
	return page.Actions, nil
}

// ListActionPage is ListActions plus the end-of-list flag.
func (s *Service) ListActionPage(ctx context.Context, u *ent.User, f ListFilter) (*ActionListPage, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	if err := s.reopenDueSnoozes(ctx, ws.ID); err != nil {
		return nil, err
	}
	q := s.client.RevenueAction.Query().
		Where(revenueaction.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)))
	status := f.QueueStatus
	if status == "" {
		status = QueueOpen
	}
	if status != "all" {
		q = q.Where(revenueaction.QueueStatusEQ(status))
	}
	switch f.Surface {
	case "task":
		q = q.Where(
			revenueaction.ActionTypeEQ("follow_up_task"),
			revenueaction.ChannelEQ("task"),
		)
	case "recovery":
		// A task is both of those fields. Excluding only one would drop a
		// follow-up that happens to use the other value.
		q = q.Where(revenueaction.Or(
			revenueaction.ActionTypeNEQ("follow_up_task"),
			revenueaction.ChannelNEQ("task"),
		))
	}
	rows, err := q.WithRelationship().
		WithEvidences().
		Order(actionPageOrder(f)...).
		Limit(limit + 1).
		Offset(f.Offset).
		All(ctx)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	return &ActionListPage{Actions: rows, HasMore: hasMore}, nil
}

// actionPageOrder keeps recovery on priority. The task list can follow due
// date so a low-priority task that is due now is not stuck behind a full page
// of later work.
func actionPageOrder(f ListFilter) []revenueaction.OrderOption {
	if f.Surface == "task" && f.DueOrder == "asc" {
		return []revenueaction.OrderOption{
			revenueaction.ByDueAt(sql.OrderAsc(), sql.OrderNullsLast()),
			revenueaction.ByID(),
		}
	}
	if f.Surface == "task" && f.DueOrder == "desc" {
		return []revenueaction.OrderOption{
			revenueaction.ByDueAt(sql.OrderDesc(), sql.OrderNullsLast()),
			revenueaction.ByID(sql.OrderDesc()),
		}
	}
	return []revenueaction.OrderOption{
		revenueaction.ByPriorityScore(sql.OrderDesc()),
		revenueaction.ByCreatedAt(),
		revenueaction.ByID(),
	}
}

// ReopenDueSnoozes returns elapsed snoozes to the caller's open queue.
func (s *Service) ReopenDueSnoozes(ctx context.Context, u *ent.User) error {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return err
	}
	return s.reopenDueSnoozes(ctx, ws.ID)
}

func (s *Service) reopenDueSnoozes(ctx context.Context, workspaceID uuid.UUID) error {
	_, err := s.client.RevenueAction.Update().
		Where(
			revenueaction.HasWorkspaceWith(revenueworkspace.IDEQ(workspaceID)),
			revenueaction.QueueStatusEQ(QueueSnoozed),
			revenueaction.SnoozedUntilLTE(s.now()),
		).
		SetQueueStatus(QueueOpen).
		ClearSnoozedUntil().
		Save(ctx)
	return err
}

// GetAction returns one action with relationship context.
func (s *Service) GetAction(ctx context.Context, id uuid.UUID) (*ent.RevenueAction, error) {
	action, err := s.client.RevenueAction.Query().
		Where(revenueaction.IDEQ(id)).
		WithRelationship().
		WithEvidences().
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, ErrNotFound
	}
	return action, err
}

// Audit returns the full observe → decision → approval → execution → outcome
// chain for one action.
func (s *Service) Audit(ctx context.Context, id uuid.UUID) (*ent.RevenueAction, error) {
	action, err := s.client.RevenueAction.Query().
		Where(revenueaction.IDEQ(id)).
		WithRelationship().
		WithEvidences().
		WithRevisions(func(q *ent.RevenueActionRevisionQuery) {
			q.Order(ent.Asc("revision"))
		}).
		WithDecisions(func(q *ent.PolicyDecisionSnapshotQuery) {
			q.Order(ent.Asc(policydecisionsnapshot.FieldEvaluatedAt))
		}).
		WithOutcomes().
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, ErrNotFound
	}
	return action, err
}

// --- edit (invariant 3) ------------------------------------------------------

// EditInput carries editable action fields. Nil pointers keep the current value.
type EditInput struct {
	Reason           *string
	RecipientEmail   *string
	ProposedSubject  *string
	ProposedMessage  *string
	SenderAccountRef *string
	Channel          *string
	ActionType       *string
	ExecutionMode    *string
	DueAt            *time.Time
	ClearDueAt       bool
	PriorityScore    *int
}

// EditAction creates a new revision and invalidates the previous policy
// decision and approval (invariant 3). Editing is refused once execution has
// begun for the current revision.
func (s *Service) EditAction(ctx context.Context, u *ent.User, id uuid.UUID, in EditInput) (*ent.RevenueAction, error) {
	if _, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceContribute); err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	if action.ExecutionStatus != ExecPending {
		return nil, ErrNotEditable
	}

	apply := func(cur string, next *string) string {
		if next == nil {
			return cur
		}
		return *next
	}
	trimField := func(value *string) *string {
		if value == nil {
			return nil
		}
		trimmed := strings.TrimSpace(*value)
		return &trimmed
	}
	in.ProposedSubject = trimField(in.ProposedSubject)
	in.ProposedMessage = trimField(in.ProposedMessage)
	if in.Reason != nil {
		in.Reason = trimField(in.Reason)
		if *in.Reason == "" {
			return nil, fmt.Errorf("%w: reason is required", ErrInvalidInput)
		}
	}
	next := RevisionContent{
		ActionType:       apply(action.ActionType, in.ActionType),
		Channel:          apply(action.Channel, in.Channel),
		RecipientEmail:   strings.ToLower(strings.TrimSpace(apply(action.RecipientEmail, in.RecipientEmail))),
		ProposedSubject:  apply(action.ProposedSubject, in.ProposedSubject),
		ProposedMessage:  apply(action.ProposedMessage, in.ProposedMessage),
		SenderAccountRef: apply(action.SenderAccountRef, in.SenderAccountRef),
		ExecutionMode:    apply(action.ExecutionMode, in.ExecutionMode),
	}
	if action.AssignedUserID != nil {
		next.AssignedUserID = action.AssignedUserID.String()
	}
	hash := next.Hash()
	revisionChanged := hash != action.RevisionHash
	metadataChanged := in.Reason != nil && *in.Reason != action.Reason ||
		in.PriorityScore != nil && *in.PriorityScore != action.PriorityScore ||
		in.ClearDueAt && action.DueAt != nil ||
		in.DueAt != nil && (action.DueAt == nil || !in.DueAt.Equal(*action.DueAt))
	if !revisionChanged && !metadataChanged {
		return action, nil
	}

	tx, err := s.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	txc := tx.Client()

	// The old revision prevents metadata edits from racing a policy-bearing edit.
	upd := txc.RevenueAction.Update().
		Where(
			revenueaction.IDEQ(action.ID),
			revenueaction.RevisionEQ(action.Revision),
			revenueaction.ExecutionStatusEQ(ExecPending),
		)
	if revisionChanged {
		upd.SetRevision(action.Revision + 1).
			SetRevisionHash(hash).
			SetActionType(next.ActionType).
			SetChannel(next.Channel).
			SetRecipientEmail(next.RecipientEmail).
			SetProposedSubject(next.ProposedSubject).
			SetProposedMessage(next.ProposedMessage).
			SetSenderAccountRef(next.SenderAccountRef).
			SetExecutionMode(next.ExecutionMode).
			// Invalidate policy and approval (invariant 3).
			SetPolicyStatus(PolicyPending).
			SetApprovalStatus(ApprovalPending).
			ClearApprovedRevision().
			ClearApprovedDecisionID().
			ClearApprovedBy().
			ClearApprovedAt()
	}
	if in.Reason != nil {
		upd.SetReason(*in.Reason)
	}
	if in.PriorityScore != nil {
		upd.SetPriorityScore(*in.PriorityScore)
	}
	if in.ClearDueAt {
		upd.ClearDueAt()
	} else if in.DueAt != nil {
		upd.SetDueAt(in.DueAt.UTC())
	}
	n, err := upd.Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		if isValidationError(err) {
			return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
		}
		return nil, err
	}
	if n == 0 {
		_ = tx.Rollback()
		return nil, ErrConflict
	}
	updated, err := txc.RevenueAction.Query().Where(revenueaction.IDEQ(action.ID)).Only(ctx)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if revisionChanged {
		if err := s.snapshotRevision(ctx, txc, updated, u); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	_ = s.RefreshRelationshipAttention(ctx, u)
	return updated.Unwrap(), nil
}

// --- preflight (facade) ------------------------------------------------------

// Evaluate requests an OutboundConsole preflight for the action's current
// revision and stores the immutable decision snapshot. A fresh unexpired
// snapshot for the same revision is returned as-is (duplicate evaluate is
// free). Facade unavailability leaves policy_status=pending (fail closed).
func (s *Service) Evaluate(ctx context.Context, u *ent.User, id uuid.UUID) (*ent.PolicyDecisionSnapshot, error) {
	if _, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute); err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	ws, err := s.CurrentWorkspace(ctx, u)
	if err != nil {
		return nil, err
	}
	now := s.now()

	// Idempotency: an unexpired snapshot for this exact revision answers the
	// duplicate without provider cost.
	existing, err := s.client.PolicyDecisionSnapshot.Query().
		Where(
			policydecisionsnapshot.HasActionWith(revenueaction.IDEQ(action.ID)),
			policydecisionsnapshot.ActionRevisionEQ(action.Revision),
			policydecisionsnapshot.RevisionHashEQ(action.RevisionHash),
			policydecisionsnapshot.ExpiresAtGT(now),
		).
		Order(ent.Desc(policydecisionsnapshot.FieldEvaluatedAt)).
		First(ctx)
	if err == nil {
		revenuemetrics.DuplicatesPrevented.WithLabelValues("evaluate").Inc()
		return existing, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	rel, err := action.QueryRelationship().Only(ctx)
	if err != nil {
		return nil, err
	}

	req := EvaluateRequest{
		SchemaVersion:          SchemaVersion,
		RequestID:              uuid.NewString(),
		IdempotencyKey:         ExecutionIdempotencyKey(action.ID.String(), action.Revision),
		CorrelationID:          action.ID.String(),
		OutboundOrganizationID: ws.OutboundOrganizationID,
		Actor:                  EvaluateActor{WorkOSUserID: u.WorkosUserID},
		Action: EvaluateAction{
			ActionID:     action.ID.String(),
			Revision:     action.Revision,
			RevisionHash: action.RevisionHash,
			ActionType:   action.ActionType,
			Channel:      action.Channel,
			Recipient: EvaluateRecipient{
				OutboundLeadID: rel.OutboundLeadID,
				Email:          action.RecipientEmail,
				AccountDomain:  rel.AccountDomain,
			},
			RelationshipSignals: RelationshipSignals{
				LastContactAt: rel.LastTouchAt,
				ReasonCode:    action.Detector,
			},
		},
	}
	if ws.OutboundWorkspaceID != nil {
		req.OutboundWorkspaceID = *ws.OutboundWorkspaceID
	}

	if err := s.appendOutbox(ctx, s.client, ws, u, "revenue.action.preflight_requested.v1", action.ID,
		fmt.Sprintf("preflight_requested:%s:%d", action.ID, action.Revision),
		map[string]any{"revision": action.Revision}, now); err != nil {
		return nil, err
	}

	start := s.now()
	decision, err := s.facade.EvaluateRevenueAction(ctx, req)
	elapsed := s.now().Sub(start).Seconds()
	if err != nil {
		revenuemetrics.PreflightRequests.WithLabelValues("unavailable", "facade_error").Inc()
		revenuemetrics.PreflightDuration.WithLabelValues("unavailable").Observe(elapsed)
		// Fail closed: policy stays pending, nothing can be approved or sent.
		return nil, err
	}
	statusLabel := boundedStatus(decision.Status)
	revenuemetrics.PreflightRequests.WithLabelValues(statusLabel, reasonGroup(decision.ReasonCodes)).Inc()
	revenuemetrics.PreflightDuration.WithLabelValues(statusLabel).Observe(elapsed)

	// The decision must be about the exact revision we asked about.
	if decision.Revision != action.Revision || decision.RevisionHash != action.RevisionHash {
		return nil, fmt.Errorf("%w: decision revision mismatch", ErrFacadeUnavailable)
	}

	tx, err := s.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	txc := tx.Client()

	snapCreate := txc.PolicyDecisionSnapshot.Create().
		SetWorkspace(ws).
		SetAction(action).
		SetUser(u).
		SetActionRevision(decision.Revision).
		SetRevisionHash(decision.RevisionHash).
		SetStatus(decision.Status).
		SetReasonCodes(decision.ReasonCodes).
		SetEvaluatedAt(decision.EvaluatedAt).
		SetExpiresAt(decision.ExpiresAt).
		SetResponseHash(decision.ResponseHash)
	if decision.OutboundLead != "" {
		snapCreate.SetOutboundLeadID(decision.OutboundLead)
	}
	if len(decision.Verification) > 0 {
		snapCreate.SetVerificationJSON(string(decision.Verification))
	}
	if len(decision.Suppression) > 0 {
		snapCreate.SetSuppressionJSON(string(decision.Suppression))
	}
	if len(decision.Research) > 0 {
		snapCreate.SetResearchJSON(string(decision.Research))
	}
	if len(decision.CRM) > 0 {
		snapCreate.SetCrmJSON(string(decision.CRM))
	}
	snap, err := snapCreate.Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	// Apply the decision to the action's policy dimension, but only for the
	// same revision — a concurrent edit invalidates this evaluation. A fresh
	// evaluation also invalidates any prior approval: the operator approved a
	// specific decision, and this is a new one, so they must approve again
	// (this closes the "re-evaluate to review_required after approval, then
	// send" bypass). The idempotent short-circuit above already returns an
	// unchanged unexpired decision without reaching here, so a genuine
	// no-op re-evaluate never needlessly drops an approval.
	upd := txc.RevenueAction.Update().
		Where(
			revenueaction.IDEQ(action.ID),
			revenueaction.RevisionEQ(action.Revision),
		).
		SetPolicyStatus(decision.Status)
	if action.ApprovalStatus == ApprovalApproved {
		upd.SetApprovalStatus(ApprovalPending).
			ClearApprovedRevision().
			ClearApprovedDecisionID().
			ClearApprovedBy().
			ClearApprovedAt()
	}
	n, err := upd.Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if n == 0 {
		_ = tx.Rollback()
		return nil, ErrConflict
	}
	if err := s.appendOutboxTx(ctx, txc, ws, u, "revenue.action.preflight_completed.v1", action.ID,
		fmt.Sprintf("preflight_completed:%s:%d:%s", action.ID, action.Revision, decision.DecisionID),
		map[string]any{"revision": action.Revision, "status": decision.Status, "decisionId": decision.DecisionID}, now); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return snap, nil
}

// boundedStatus clamps a facade-supplied decision status to the known enum so
// a misbehaving or hostile facade cannot explode Prometheus label cardinality
// (RFC 030: never let unbounded provider strings become metric labels).
func boundedStatus(status string) string {
	switch status {
	case PolicyPassed, PolicyReviewRequired, PolicyBlocked:
		return status
	default:
		return "other"
	}
}

// knownReasonGroups is the allowlist of facade reason-code prefixes that may
// appear as a metric label. Anything else collapses to "other".
var knownReasonGroups = map[string]bool{
	"suppression": true, "verification": true, "research": true,
	"crm": true, "ownership": true, "policy": true, "workspace": true,
}

// reasonGroup collapses facade reason codes into a bounded metric label.
func reasonGroup(codes []string) string {
	if len(codes) == 0 {
		return "none"
	}
	// The first code's prefix (e.g. "suppression", "verification") is the
	// group; never the full code list, and only from a fixed allowlist so a
	// facade-controlled string can never become an unbounded/PII label.
	code := codes[0]
	if i := strings.IndexAny(code, "._:"); i > 0 {
		code = code[:i]
	}
	if knownReasonGroups[code] {
		return code
	}
	return "other"
}

// --- approve / reject (invariants 1, 2, 4, 5) --------------------------------

// Approve approves the action's current revision. Send-mode actions require a
// passed (or explicitly risk-accepted review_required) unexpired decision for
// the exact revision and hash; draft-mode actions require only that the
// action is not blocked — a draft lands in the operator's own mailbox and
// nothing leaves the boundary.
func (s *Service) Approve(ctx context.Context, u *ent.User, id uuid.UUID, acceptRisk bool) (*ent.RevenueAction, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute)
	if err != nil {
		return nil, err
	}
	if err := s.requireEntitled(ctx, u); err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.ensureActionIdentityResolved(ctx, action); err != nil {
		return nil, err
	}
	if err := s.ensureRelationshipActionCompleteness(ctx, u, ws, actionRelationshipID(action)); err != nil {
		return nil, err
	}
	if action.PolicyStatus == PolicyBlocked {
		return nil, ErrBlocked // invariant 1
	}
	if action.QueueStatus != QueueOpen {
		return nil, fmt.Errorf("%w: queue status %q", ErrConflict, action.QueueStatus)
	}

	var decisionID *uuid.UUID
	if action.ExecutionMode == ExecModeSend {
		snap, err := s.currentDecision(ctx, action)
		if err != nil {
			return nil, err
		}
		switch snap.Status {
		case PolicyPassed:
		case PolicyReviewRequired:
			if !acceptRisk {
				return nil, ErrReviewRequired // invariant 4
			}
		default:
			return nil, ErrBlocked
		}
		decisionID = &snap.ID
	}

	now := s.now()
	upd := s.client.RevenueAction.Update().
		Where(
			revenueaction.IDEQ(action.ID),
			revenueaction.RevisionEQ(action.Revision),
			revenueaction.ApprovalStatusEQ(ApprovalPending),
			revenueaction.PolicyStatusNEQ(PolicyBlocked),
		).
		SetApprovalStatus(ApprovalApproved).
		SetApprovedRevision(action.Revision). // invariant 2: bind to revision
		SetApprovedBy(u.ID).
		SetApprovedAt(now)
	if decisionID != nil {
		upd.SetApprovedDecisionID(*decisionID) // invariant 2: bind to decision
	}
	n, err := upd.Save(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		// Reload: an identical approval is idempotent, anything else conflicts.
		cur, gerr := s.GetAction(ctx, id)
		if gerr != nil {
			return nil, gerr
		}
		if cur.ApprovalStatus == ApprovalApproved &&
			cur.ApprovedRevision != 0 && cur.ApprovedRevision == cur.Revision {
			revenuemetrics.DuplicatesPrevented.WithLabelValues("approve").Inc()
			return cur, nil
		}
		return nil, ErrConflict
	}
	revenuemetrics.Decisions.WithLabelValues("approved").Inc()

	payload := map[string]any{"revision": action.Revision}
	if decisionID != nil {
		payload["decisionId"] = decisionID.String()
	}
	_ = s.appendOutbox(ctx, s.client, ws, u, "revenue.action.approved.v1", action.ID,
		fmt.Sprintf("approved:%s:%d", action.ID, action.Revision), payload, now)
	_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
		Name: "recommendation_decided", Outcome: "accepted", ReasonCode: "approved",
		CorrelationID: correlationID("action", action.ID), OccurredAt: now, Action: action,
	})
	return s.actionResultWithAttention(ctx, u, id)
}

// currentDecision loads the freshest decision snapshot for the action's exact
// current revision and hash, enforcing invariant 5 (expiry). Used by Approve
// to pick the decision to bind.
func (s *Service) currentDecision(ctx context.Context, action *ent.RevenueAction) (*ent.PolicyDecisionSnapshot, error) {
	snap, err := s.client.PolicyDecisionSnapshot.Query().
		Where(
			policydecisionsnapshot.HasActionWith(revenueaction.IDEQ(action.ID)),
			policydecisionsnapshot.ActionRevisionEQ(action.Revision),
			policydecisionsnapshot.RevisionHashEQ(action.RevisionHash),
		).
		Order(ent.Desc(policydecisionsnapshot.FieldEvaluatedAt)).
		First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, ErrNoDecision
		}
		return nil, err
	}
	if !snap.ExpiresAt.After(s.now()) {
		return nil, ErrDecisionExpired // invariant 5
	}
	return snap, nil
}

// boundDecision loads the EXACT decision the approval was bound to
// (invariant 2), re-checks it against the current revision/hash, verifies it
// has not expired (invariants 5, 9), and that its status still permits a send.
// It deliberately does not fall back to the newest snapshot: a re-evaluation
// after approval must go back through Approve, never be silently consumed at
// execution time.
func (s *Service) boundDecision(ctx context.Context, action *ent.RevenueAction) (*ent.PolicyDecisionSnapshot, error) {
	if action.ApprovedDecisionID == nil {
		return nil, ErrNotApproved
	}
	snap, err := s.client.PolicyDecisionSnapshot.Query().
		Where(policydecisionsnapshot.IDEQ(*action.ApprovedDecisionID)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, ErrNotApproved
		}
		return nil, err
	}
	// The bound decision must be for the revision we are about to send.
	if snap.ActionRevision != action.Revision || snap.RevisionHash != action.RevisionHash {
		return nil, ErrNotApproved
	}
	// review_required is acceptable only because Approve already required an
	// explicit risk acceptance to bind it; blocked can never be bound. Guard
	// anyway so a status is never trusted implicitly.
	if snap.Status != PolicyPassed && snap.Status != PolicyReviewRequired {
		return nil, ErrBlocked
	}
	if !snap.ExpiresAt.After(s.now()) {
		return nil, ErrDecisionExpired // invariant 5
	}
	return snap, nil
}

// Reject records a rejected approval for the current revision.
func (s *Service) Reject(ctx context.Context, u *ent.User, id uuid.UUID, reason string) (*ent.RevenueAction, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute)
	if err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	n, err := s.client.RevenueAction.Update().
		Where(
			revenueaction.IDEQ(action.ID),
			revenueaction.RevisionEQ(action.Revision),
			revenueaction.ApprovalStatusEQ(ApprovalPending),
		).
		SetApprovalStatus(ApprovalRejected).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrConflict
	}
	revenuemetrics.Decisions.WithLabelValues("rejected").Inc()
	_ = s.appendOutbox(ctx, s.client, ws, u, "revenue.action.rejected.v1", action.ID,
		fmt.Sprintf("rejected:%s:%d", action.ID, action.Revision),
		map[string]any{"revision": action.Revision, "reason": reason}, s.now())
	_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
		Name: "recommendation_decided", Outcome: "rejected", ReasonCode: "rejected",
		CorrelationID: correlationID("action", action.ID), OccurredAt: s.now(), Action: action,
	})
	return s.actionResultWithAttention(ctx, u, id)
}

// --- triage ------------------------------------------------------------------

// maxSnooze bounds snooze timestamps (RFC: "snooze until a bounded timestamp").
const maxSnooze = 90 * 24 * time.Hour

// Snooze parks the action until a bounded future timestamp.
func (s *Service) Snooze(ctx context.Context, u *ent.User, id uuid.UUID, until time.Time) (*ent.RevenueAction, error) {
	if _, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute); err != nil {
		return nil, err
	}
	now := s.now()
	if !until.After(now) || until.After(now.Add(maxSnooze)) {
		return nil, fmt.Errorf("%w: snooze must be in the future and within %s", ErrInvalidInput, maxSnooze)
	}
	n, err := s.client.RevenueAction.Update().
		Where(revenueaction.IDEQ(id), revenueaction.QueueStatusEQ(QueueOpen)).
		SetQueueStatus(QueueSnoozed).
		SetSnoozedUntil(until.UTC()).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrConflict
	}
	revenuemetrics.Decisions.WithLabelValues("snoozed").Inc()
	return s.actionResultWithAttention(ctx, u, id)
}

// Dismiss removes the action from the queue with a reason label and records
// the dismissed outcome.
func (s *Service) Dismiss(ctx context.Context, u *ent.User, id uuid.UUID, reason string) (*ent.RevenueAction, error) {
	if _, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute); err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	n, err := s.client.RevenueAction.Update().
		Where(revenueaction.IDEQ(id), revenueaction.QueueStatusIn(QueueOpen, QueueSnoozed)).
		SetQueueStatus(QueueDismissed).
		SetDismissReason(reason).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrConflict
	}
	revenuemetrics.Decisions.WithLabelValues("dismissed").Inc()
	_, _ = s.AppendOutcome(ctx, u, action.ID, OutcomeInput{
		Kind:          "dismissed",
		Source:        "user",
		SourceEventID: fmt.Sprintf("dismiss:%d", action.Revision),
		OccurredAt:    s.now(),
	})
	return s.actionResultWithAttention(ctx, u, id)
}

// --- execute (invariants 6, 7, 8, 11) ----------------------------------------

// Execute performs the approved action exactly once through the assigned
// execution owner. Draft mode works in any workspace mode; send mode requires
// a linked workspace and a still-unexpired decision.
func (s *Service) Execute(ctx context.Context, u *ent.User, id uuid.UUID) (*ent.RevenueAction, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceExecute)
	if err != nil {
		return nil, err
	}
	if err := s.requireEntitled(ctx, u); err != nil {
		return nil, err
	}
	action, err := s.GetAction(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.ensureActionIdentityResolved(ctx, action); err != nil {
		return nil, err
	}
	if capability := actionCapability(action.Channel); capability != "" {
		if err := s.requireWorkspaceFeature(ctx, ws, capability); err != nil {
			return nil, err
		}
	}
	if err := s.requireBetaActionReadiness(ctx, ws, action); err != nil {
		return nil, err
	}
	if err := s.ensureRelationshipActionCompleteness(ctx, u, ws, actionRelationshipID(action)); err != nil {
		return nil, err
	}
	if action.PolicyStatus == PolicyBlocked {
		return nil, ErrBlocked // invariant 1
	}
	if action.ApprovalStatus != ApprovalApproved ||
		action.ApprovedRevision == 0 || action.ApprovedRevision != action.Revision {
		return nil, ErrNotApproved // invariant 2
	}
	// Invariant 11: the sender must be the assigned user. Founder-mode
	// tenancy already scopes rows to the caller; the explicit check guards
	// the WP6 member-scoped upgrade.
	if action.AssignedUserID != nil && *action.AssignedUserID != u.ID {
		return nil, fmt.Errorf("%w: action is assigned to another member", ErrNotApproved)
	}
	if action.ExecutionMode == ExecModeSend {
		if ws.Mode != ModeLinked {
			return nil, ErrWorkspaceNotLinked
		}
		// Invariants 2, 4, 5, 9: the exact APPROVAL-BOUND decision — not
		// merely the newest snapshot — must still be valid and permissive at
		// execution time. A re-evaluation after approval invalidates the
		// approval (see Evaluate), so this cannot silently consume a decision
		// the operator never approved.
		if _, err := s.boundDecision(ctx, action); err != nil {
			return nil, err
		}
	}
	if strings.HasPrefix(action.DedupeKey, "mutual-action-plan:") {
		rel, err := action.Edges.RelationshipOrErr()
		if err != nil {
			return nil, err
		}
		policy, err := s.ResolveConversationPolicy(ctx, u, rel)
		if err != nil {
			return nil, err
		}
		decisionTime := s.now().UTC()
		decision := evaluateGovernanceDecision(
			policy, "external_share", "none",
			action.ID.String()+":"+action.RevisionHash+":"+decisionTime.Format(time.RFC3339Nano), decisionTime,
		)
		if _, err := appendConversationArtifact(ctx, s.client, ws, u, rel, conversationArtifactInput{
			Kind: "governance_decision", StableID: decision.DecisionID,
			Status:     map[bool]string{true: "allowed", false: "blocked"}[decision.Allowed],
			SubjectRef: action.ID.String(), EffectiveAt: decisionTime,
			EvidenceRefs: []string{"revenue-action-revision:" + action.RevisionHash}, Payload: decision,
		}); err != nil {
			return nil, err
		}
		if !decision.Allowed {
			return nil, fmt.Errorf("%w: %s", ErrBlocked, decision.Reason)
		}
	}

	// Idempotent short-circuit (invariant 7): duplicate execute returns the
	// existing result, never sends twice.
	if action.ExecutionStatus == ExecSent || action.ExecutionStatus == ExecRequested ||
		action.ExecutionStatus == ExecAmbiguous {
		revenuemetrics.DuplicatesPrevented.WithLabelValues("execute").Inc()
		return action, nil
	}

	// Invariant: an action removed from the active queue (dismissed/snoozed)
	// must not execute, even if it still carries a stale approval. A
	// successfully-sent action is queue_status=handled and is caught by the
	// idempotent short-circuit above, so here the queue must be open.
	if action.QueueStatus != QueueOpen {
		return nil, fmt.Errorf("%w: queue status %q", ErrConflict, action.QueueStatus)
	}

	idem := ExecutionIdempotencyKey(action.ID.String(), action.Revision)
	now := s.now()

	// Atomic consumption of the approval: exactly one caller flips
	// pending → requested for this revision (invariants 6 and 7).
	n, err := s.client.RevenueAction.Update().
		Where(
			revenueaction.IDEQ(action.ID),
			revenueaction.RevisionEQ(action.Revision),
			revenueaction.ExecutionStatusEQ(ExecPending),
			revenueaction.ApprovalStatusEQ(ApprovalApproved),
			revenueaction.QueueStatusEQ(QueueOpen),
		).
		SetExecutionStatus(ExecRequested).
		SetExecutionIdempotencyKey(idem).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		revenuemetrics.DuplicatesPrevented.WithLabelValues("execute").Inc()
		return s.GetAction(ctx, id)
	}
	_ = s.appendOutbox(ctx, s.client, ws, u, "revenue.action.execution_requested.v1", action.ID,
		"execution_requested:"+idem, map[string]any{"revision": action.Revision, "mode": action.ExecutionMode}, now)

	result, execErr := s.executor.Execute(ctx, ExecRequest{
		Action:         action,
		Workspace:      ws,
		UserID:         u.ID,
		Mode:           action.ExecutionMode,
		IdempotencyKey: idem,
	})

	switch {
	case execErr == nil:
		upd := s.client.RevenueAction.Update().
			Where(revenueaction.IDEQ(action.ID)).
			SetExecutionStatus(ExecSent).
			ClearExecutionError().
			SetExecutedAt(s.now()).
			SetQueueStatus(QueueHandled).
			SetHandledAt(s.now())
		if result != nil && result.ProviderMessageID != "" {
			upd.SetProviderMessageID(result.ProviderMessageID)
		}
		if result != nil && result.ProviderThreadID != "" {
			upd.SetProviderThreadID(result.ProviderThreadID)
		}
		if _, err := upd.Save(ctx); err != nil {
			return nil, err
		}
		revenuemetrics.Executions.WithLabelValues(action.ExecutionOwner, ExecSent, action.Channel).Inc()
		eventType, eventKey := "revenue.action.sent.v1", "sent:"
		if action.ExecutionMode == ExecModeDraft {
			eventType, eventKey = "revenue.action.drafted.v1", "drafted:"
		}
		_ = s.appendOutbox(ctx, s.client, ws, u, eventType, action.ID,
			eventKey+idem, map[string]any{"revision": action.Revision}, s.now())
		_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
			Name: "action_executed", Outcome: "succeeded", ReasonCode: "provider_receipt",
			CorrelationID: idem, Channel: action.Channel, OccurredAt: s.now(), Action: action,
		})
	case errors.Is(execErr, ErrAmbiguous):
		// Invariant 8: a lost result after submission is ambiguous, never an
		// automatic resend. Reconciliation checks provider state first.
		if _, err := s.client.RevenueAction.Update().
			Where(revenueaction.IDEQ(action.ID)).
			SetExecutionStatus(ExecAmbiguous).
			SetExecutionError(execErr.Error()).
			SetReconciliationStatus("pending").
			SetReconciliationAttempts(0).
			SetReconciliationNextAt(s.now().UTC()).
			ClearReconciliationCheckedAt().
			ClearReconciliationError().
			Save(ctx); err != nil {
			return nil, err
		}
		revenuemetrics.Executions.WithLabelValues(action.ExecutionOwner, ExecAmbiguous, action.Channel).Inc()
		_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
			Name: "action_executed", Outcome: "uncertain", ReasonCode: "provider_timeout",
			CorrelationID: idem, Channel: action.Channel, OccurredAt: s.now(), Action: action,
		})
	default:
		// A definite failure (nothing reached the provider — 4xx, missing
		// scope, dead token) returns the action to pending so the operator
		// can fix the cause and retry, or edit it. Only ErrAmbiguous (above)
		// is a terminal, non-retryable state, because there a message may
		// have been sent. The error string is retained for the UI.
		if _, err := s.client.RevenueAction.Update().
			Where(revenueaction.IDEQ(action.ID), revenueaction.ExecutionStatusEQ(ExecRequested)).
			SetExecutionStatus(ExecPending).
			SetExecutionError(execErr.Error()).
			Save(ctx); err != nil {
			return nil, err
		}
		revenuemetrics.Executions.WithLabelValues(action.ExecutionOwner, ExecFailed, action.Channel).Inc()
		_ = s.appendOutbox(ctx, s.client, ws, u, "revenue.action.failed.v1", action.ID,
			"failed:"+idem+":"+s.now().Format(time.RFC3339Nano), map[string]any{"revision": action.Revision}, s.now())
		_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
			Name: "action_executed", Outcome: "failed", ReasonCode: "provider_rejected",
			CorrelationID: idem, Channel: action.Channel, OccurredAt: s.now(), Action: action,
		})
	}
	return s.actionResultWithAttention(ctx, u, id)
}

// --- outcomes (invariant 10) -------------------------------------------------

// OutcomeInput records one observed action outcome.
type OutcomeInput struct {
	Kind          string
	Source        string
	SourceEventID string
	OccurredAt    time.Time
	Metadata      map[string]any
}

// AppendOutcome appends an outcome idempotently on (action, source,
// source_event_id). The duplicate returns the stored row.
func (s *Service) AppendOutcome(ctx context.Context, u *ent.User, actionID uuid.UUID, in OutcomeInput) (*ent.ActionOutcome, error) {
	action, err := s.GetAction(ctx, actionID)
	if err != nil {
		return nil, err
	}
	ws, err := s.CurrentWorkspace(ctx, u)
	if err != nil {
		return nil, err
	}
	if in.OccurredAt.IsZero() {
		in.OccurredAt = s.now()
	}
	tx, err := s.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	txc := tx.Client()
	create := txc.ActionOutcome.Create().
		SetWorkspace(ws).
		SetAction(action).
		SetUser(u).
		SetKind(in.Kind).
		SetSource(in.Source).
		SetSourceEventID(in.SourceEventID).
		SetOccurredAt(in.OccurredAt.UTC())
	if len(in.Metadata) > 0 {
		raw, merr := json.Marshal(in.Metadata)
		if merr != nil {
			return nil, merr
		}
		create.SetMetadataJSON(string(raw))
	}
	outcome, err := create.Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		if ent.IsConstraintError(err) {
			revenuemetrics.DuplicatesPrevented.WithLabelValues("outcome").Inc()
			return s.client.ActionOutcome.Query().
				Where(
					actionOutcomeForAction(action.ID),
					actionOutcomeSourceEvent(in.Source, in.SourceEventID),
				).
				First(ctx)
		}
		if isValidationError(err) {
			return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
		}
		return nil, err
	}
	rel, err := action.Edges.RelationshipOrErr()
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := appendOutcomeObservation(ctx, txc, ws, u, rel, action, in); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	revenuemetrics.Outcomes.WithLabelValues(in.Kind).Inc()
	_ = appendTrustEvent(ctx, s.client, ws, u, TrustEventInput{
		Name: "outcome_observed", Outcome: "succeeded",
		CorrelationID: correlationID("outcome", outcome.ID), Source: in.Source,
		OccurredAt: in.OccurredAt, Action: action,
	})
	_ = s.appendOutbox(ctx, s.client, ws, u, "revenue.action.outcome.v1", action.ID,
		fmt.Sprintf("outcome:%s:%s:%s", action.ID, in.Source, in.SourceEventID),
		map[string]any{"kind": in.Kind, "source": in.Source}, s.now())
	_ = s.RefreshRelationshipAttention(ctx, u)
	return outcome.Unwrap(), nil
}

func (s *Service) actionResultWithAttention(ctx context.Context, u *ent.User, id uuid.UUID) (*ent.RevenueAction, error) {
	_ = s.RefreshRelationshipAttention(ctx, u)
	return s.GetAction(ctx, id)
}

// appendOutcomeObservation publishes the categorical provider/user result into
// the same immutable relationship history used by email, meetings, Slack, and
// CRM evidence. Arbitrary outcome metadata stays out of this client-visible
// projection.
func appendOutcomeObservation(
	ctx context.Context,
	client *ent.Client,
	ws *ent.RevenueWorkspace,
	u *ent.User,
	rel *ent.Relationship,
	action *ent.RevenueAction,
	in OutcomeInput,
) error {
	source := strings.ToLower(strings.TrimSpace(in.Source))
	switch source {
	case "gmail", "calendar", "slack", "meeting", "crm", "hubspot", "user":
	case "outbound", "task":
		source = "user"
	default:
		source = "user"
	}
	facts := map[string]any{
		"outcome_kind": in.Kind, "provider_source": in.Source,
		"action_id": action.ID.String(), "recommendation_revision": action.Revision,
		"channel": action.Channel,
	}
	rawFacts, err := json.Marshal(facts)
	if err != nil {
		return err
	}
	externalID := fmt.Sprintf("action-outcome:%s:%s:%s", action.ID, in.Source, in.SourceEventID)
	digest := stdsha256.Sum256([]byte(externalID + "\x00" + in.Kind))
	_, err = client.RelationshipObservation.Create().
		SetWorkspace(ws).SetRelationship(rel).SetUser(u).
		SetSource(source).SetSourceAccountID("outcome").SetExternalID(externalID).
		SetSourceVersion(fmt.Sprintf("action-revision-%d", action.Revision)).
		SetEventType("action.outcome." + in.Kind).SetOccurredAt(in.OccurredAt.UTC()).SetReceivedAt(in.OccurredAt.UTC()).
		SetSummary(actionOutcomeSummary(in.Kind)).
		SetNormalizedFactsJSON(string(rawFacts)).SetContentHash(fmt.Sprintf("%x", digest[:])).
		Save(ctx)
	if err != nil {
		return err
	}
	if !outcomeCountsAsActivity(in.Kind) {
		return nil
	}
	current, err := client.Relationship.Get(ctx, rel.ID)
	if err != nil {
		return err
	}
	if current.LastTouchAt != nil && !in.OccurredAt.After(current.LastTouchAt.UTC()) {
		return nil
	}
	_, err = current.Update().SetLastTouchAt(in.OccurredAt.UTC()).Save(ctx)
	return err
}

// A dismissal or a correction is a review inside this workspace. It is not
// evidence that someone at the company was reached.
func outcomeCountsAsActivity(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "dismissed", "bad_recommendation", "corrected":
		return false
	default:
		return true
	}
}

func actionOutcomeSummary(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "sent":
		return "Message sent"
	case "delivered":
		return "Delivered"
	case "bounced":
		return "Bounced"
	case "replied":
		return "They replied"
	case "meeting_booked":
		return "Meeting booked"
	case "won":
		return "Won"
	case "lost":
		return "Lost"
	case "dismissed":
		return "Dismissed"
	case "bad_recommendation":
		return "Not a good suggestion"
	case "deal_advanced":
		return "Deal moved forward"
	case "onboarding_progressed":
		return "Onboarding moved forward"
	case "renewed":
		return "Renewed"
	case "escalated":
		return "Escalated"
	case "churned":
		return "They left"
	case "corrected":
		return "Corrected"
	default:
		return "Action recorded"
	}
}

// isValidationError reports whether err is an ent field validation error
// (bad enum value, range, etc.) rather than an infrastructure failure.
func isValidationError(err error) bool {
	var ve *ent.ValidationError
	return errors.As(err, &ve)
}
