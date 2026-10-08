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
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/commitmentdependency"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationinteraction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationparticipant"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationprivacypolicy"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationprivacyrule"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationsharegrant"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/conversationintelligenceartifact"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/mailthread"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/person"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personattribute"
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
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipstatesnapshot"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueaction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueevidence"
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
		if access := relationshipSheetMailAccessMatch(u.ID, s.now(), needle); access != nil {
			parts = append(parts, access)
		}

		if linked := relationshipSheetGmailLinkedMatch(needle); linked != nil {
			parts = append(parts, linked)
		}
		if empty := relationshipSheetEmptyCopyMatch(needle); empty != nil {
			parts = append(parts, empty)
		}
		if none := relationshipSheetNoneRecordedMatch(needle); none != nil {
			parts = append(parts, none)
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
		if badges := relationshipSheetPromiseBadgeMatch(needle, searchedAt); badges != nil {
			parts = append(parts, badges)
		}

		if due := relationshipSheetPromiseDueMatch(needle); due != nil {
			parts = append(parts, due)
		}

		if overflow := relationshipSheetPromiseOverflowMatch(needle); overflow != nil {
			parts = append(parts, overflow)
		}
		if band := relationshipAttentionBandMatch(needle); band != nil {
			parts = append(parts, band)
		}
		if people := relationshipSheetPeopleMatch(needle); people != nil {
			parts = append(parts, people)
		}
		// "Nothing recorded yet" and "None recorded." contain "recorded",
		// and the calendar sentence contains "calendar". Those words are
		// also activity headings. The empty sentence is the company that
		// prints it. "You chose the value from Calendar." is the closed
		// contradiction, not every company that has a calendar event.
		if activity := relationshipSheetActivityMatch(needle); activity != nil && !sheetEmptySentenceOwnsActivity(needle) && !contradictionSentenceOwnsActivity(needle) {
			parts = append(parts, activity)
		}
		if subject := relationshipSheetActivitySubjectMatch(needle); subject != nil {
			parts = append(parts, subject)
		}

		if meetingNote := relationshipSheetMeetingNoteMatch(needle); meetingNote != nil {
			parts = append(parts, meetingNote)
		}

		if emptyActivity := relationshipSheetEmptyActivityMatch(needle); emptyActivity != nil {
			parts = append(parts, emptyActivity)
		}
		if actionLabel := relationshipSheetActionLabelMatch(needle); actionLabel != nil {
			parts = append(parts, actionLabel)
		}
		if badges := relationshipSheetRecommendationBadgeMatch(needle); badges != nil {
			parts = append(parts, badges)
		}

		if detector := relationshipSheetDetectorMatch(needle); detector != nil {
			parts = append(parts, detector)
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
		if duplicate := relationshipSheetDuplicateLineMatch(needle); duplicate != nil {
			parts = append(parts, duplicate)
		}

		if inbox := relationshipSheetDuplicateInboxMatch(needle); inbox != nil {
			parts = append(parts, inbox)
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
		if ranking := relationshipSheetRankingMatch(needle); ranking != nil {
			parts = append(parts, ranking)
		}
		if followUp := relationshipSheetFollowUpEmptyMatch(needle, searchedAt); followUp != nil {
			parts = append(parts, followUp)
		}
		if plan := relationshipSheetPlanEmptyMatch(needle); plan != nil {
			parts = append(parts, plan)
		}
		if card := relationshipSheetPlanCardMatch(needle); card != nil {
			parts = append(parts, card)
		}

		if planStatus := relationshipSheetPlanStatusMatch(needle); planStatus != nil {
			parts = append(parts, planStatus)
		}
		if deletion := relationshipSheetDeletionEmptyMatch(needle); deletion != nil {
			parts = append(parts, deletion)
		}
		if deletionButton := relationshipSheetDeletionButtonMatch(needle); deletionButton != nil {
			parts = append(parts, deletionButton)
		}
		if changes := relationshipSheetChangeHeadingMatch(needle); changes != nil {
			parts = append(parts, changes)
		}

		if timeline := relationshipSheetTimelineHeadingMatch(needle); timeline != nil {
			parts = append(parts, timeline)
		}

		if sections := relationshipSheetSectionCountMatch(needle); sections != nil {
			parts = append(parts, sections)
		}

		if changed := relationshipSheetRecommendationReasonMatch(needle); changed != nil {
			parts = append(parts, changed)
		}

		if excerpt := relationshipSheetEvidenceExcerptMatch(needle); excerpt != nil {
			parts = append(parts, excerpt)
		}
		if accepted := relationshipSheetAcceptedPromiseMatch(needle); accepted != nil {
			parts = append(parts, accepted)
		}
		if links := relationshipSheetPromiseLinkMatch(needle); links != nil {
			parts = append(parts, links)
		}

		if impact := relationshipSheetDuplicateImpactMatch(needle); impact != nil {
			parts = append(parts, impact)
		}
		if contradiction := relationshipSheetContradictionMatch(needle); contradiction != nil {
			parts = append(parts, contradiction)
		}
		if suggestion := relationshipSheetSuggestionMatch(needle); suggestion != nil {
			parts = append(parts, suggestion)
		}
		if uncertain := relationshipSheetUncertainClaimMatch(needle); uncertain != nil {
			parts = append(parts, uncertain)
		}

		if counted := relationshipSheetSuggestionCountMatch(needle, searchedAt); counted != nil {
			parts = append(parts, counted)
		}

		if earlier := relationshipSheetEarlierPageMatch(needle); earlier != nil {
			parts = append(parts, earlier)
		}

		if older := relationshipSheetOlderReviewMatch(needle); older != nil {
			parts = append(parts, older)
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
		if confirmed := relationshipSheetConfirmedMeetingMatch(needle); confirmed != nil {
			parts = append(parts, confirmed)
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
	if fields := relationshipSheetProfileFieldMatch(needle); fields != nil {
		preds = append(preds, fields)
	}

	if research, ok := publicResearchDetailCount(needle); ok {
		preds = append(preds, relationshipHasPublicResearchDetailCount(research))
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

// publicResearchDetailCount reads "Public research · 1 detail" and
// "Public research · N details". The people card prints that summary for
// every non-retracted public-research attribute. One detail stays singular.
func publicResearchDetailCount(needle string) (int, bool) {
	text := normalizePersonSearch(needle)
	const prefix = "public research · "
	index := strings.Index(text, prefix)
	if index < 0 {
		return 0, false
	}
	rest := strings.TrimSpace(text[index+len(prefix):])
	parts := strings.Fields(rest)
	if len(parts) < 2 {
		return 0, false
	}
	n, err := strconv.Atoi(parts[0])
	if err != nil || n < 1 || n > 500 {
		return 0, false
	}
	word := strings.TrimRight(parts[1], ".,;:?")
	if n == 1 && word == "detail" {
		return 1, true
	}
	if n > 1 && word == "details" {
		return n, true
	}
	return 0, false
}

func relationshipHasPublicResearchDetailCount(n int) predicate.Relationship {
	return relationship.HasParticipantsWith(
		relationshipparticipant.HasPersonWith(personPublicResearchCount(n)),
	)
}

func personPublicResearchCount(n int) predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"(SELECT count(*) FROM %s WHERE %s = %s AND %s = 'external_research' AND %s <> 'retracted') = ",
				personattribute.Table,
				personattribute.PersonColumn,
				s.C(person.FieldID),
				personattribute.FieldSourceType,
				personattribute.FieldStatus,
			))
			b.Arg(n)
		}))
	})
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

// relationshipSheetProfileFieldMatch matches the count under a person on the
// company sheet. The four fields are title, company, seniority, and location.
// Title falls back to the membership title when the person has none. A blank
// company name does not count, even when a domain is stored.
func relationshipSheetProfileFieldMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for n := 0; n <= 4; n++ {
		if !labelPhraseMatches(fmt.Sprintf("%d/4 profile fields", n), needle) {
			continue
		}
		preds = append(preds, relationship.HasParticipantsWith(participantProfileFieldCount(n)))
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

func participantProfileFieldCount(n int) predicate.RelationshipParticipant {
	return predicate.RelationshipParticipant(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(`(SELECT
				(CASE WHEN trim(coalesce(profile_part.%s, '')) <> '' OR trim(coalesce(profile_person.%s, '')) <> '' THEN 1 ELSE 0 END)
				+ (CASE WHEN trim(coalesce(profile_person.%s, '')) <> '' THEN 1 ELSE 0 END)
				+ (CASE WHEN trim(coalesce(profile_person.%s, '')) <> '' THEN 1 ELSE 0 END)
				+ (CASE WHEN trim(coalesce(profile_person.%s, '')) <> '' THEN 1 ELSE 0 END)
			FROM %s AS profile_part
			LEFT JOIN %s AS profile_person ON profile_person.%s = profile_part.%s
			WHERE profile_part.%s = %s) = `,
				relationshipparticipant.FieldTitle,
				person.FieldTitle,
				person.FieldOrgName,
				person.FieldSeniority,
				person.FieldLocation,
				relationshipparticipant.Table,
				person.Table,
				person.FieldID,
				relationshipparticipant.PersonColumn,
				relationshipparticipant.FieldID,
				s.C(relationshipparticipant.FieldID),
			))
			b.Arg(n)
		}))
	})
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

// relationshipSheetEmptyActivityMatch matches "Nothing else was saved with
// this activity." Opening an activity prints that when the saved note has no
// payload and the stored facts have nothing else to read. A meeting flag
// prints a different line, and a title or a promise still has something to read.
func relationshipSheetEmptyActivityMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("nothing else was saved with this activity.", needle) {
		return nil
	}
	return relationship.HasObservationsWith(observationSavedNothing())
}

func observationSavedNothing() predicate.RelationshipObservation {
	return predicate.RelationshipObservation(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			facts := s.C(relationshipobservation.FieldNormalizedFactsJSON)
			payload := s.C(relationshipobservation.FieldPayloadCiphertext)
			b.WriteString("(")
			b.WriteString(payload)
			b.WriteString(" IS NULL OR length(")
			b.WriteString(payload)
			b.WriteString(") = 0) AND (")
			b.WriteString(facts)
			b.WriteString(" IS NULL OR ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("btrim(")
			} else {
				b.WriteString("trim(")
			}
			b.WriteString(facts)
			b.WriteString(") IN ('', '{}') OR (")
			writeFactsAreObject(b, s, facts)
			b.WriteString(" AND ")
			writeMeetingLinkIsNotTrue(b, s, facts)
			b.WriteString(" AND ")
			writeFactTextBlank(b, s, facts, "content")
			b.WriteString(" AND ")
			writeFactDirectionBlank(b, s, facts)
			b.WriteString(" AND ")
			writeFactTextBlank(b, s, facts, "commitment_due_at")
			b.WriteString(" AND ")
			writeFactQuoteBlank(b, s, facts)
			b.WriteString(" AND ")
			writeFactParticipantToken(b, s, facts, "owner_participant_ref")
			b.WriteString(" AND ")
			writeFactParticipantToken(b, s, facts, "counterparty_participant_ref")
			b.WriteString(" AND ")
			writeFactParticipantToken(b, s, facts, "beneficiary_participant_ref")
			b.WriteString(" AND NOT ")
			writeVisibleExtraFact(b, s, facts)
			b.WriteString("))")
		}))
	})
}

func writeFactsAreObject(b *sql.Builder, s *sql.Selector, facts string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_typeof(")
		b.WriteString(facts)
		b.WriteString("::jsonb) = 'object'")
		return
	}
	b.WriteString("json_type(")
	b.WriteString(facts)
	b.WriteString(") = 'object'")
}

func writeMeetingLinkIsNotTrue(b *sql.Builder, s *sql.Selector, facts string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("((")
		b.WriteString(facts)
		b.WriteString("::jsonb->'meetingLinked') IS DISTINCT FROM 'true'::jsonb)")
		return
	}
	b.WriteString("ifnull(json_type(")
	b.WriteString(facts)
	b.WriteString(", '$.meetingLinked'), '') <> 'true'")
}

func writeFactText(b *sql.Builder, s *sql.Selector, facts, key string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("btrim(coalesce(")
		b.WriteString(facts)
		b.WriteString("::jsonb->>'")
		b.WriteString(key)
		b.WriteString("', ''))")
		return
	}
	b.WriteString("trim(coalesce(json_extract(")
	b.WriteString(facts)
	b.WriteString(", '$.")
	b.WriteString(key)
	b.WriteString("'), ''))")
}

func writeFactTextBlank(b *sql.Builder, s *sql.Selector, facts, key string) {
	writeFactText(b, s, facts, key)
	b.WriteString(" = ''")
}

func writeFactDirectionBlank(b *sql.Builder, s *sql.Selector, facts string) {
	writeFactText(b, s, facts, "commitment_direction")
	b.WriteString(" NOT IN ('promised_by_me', 'promised_by_them', 'mutual')")
}

func writeFactQuoteBlank(b *sql.Builder, s *sql.Selector, facts string) {
	b.WriteString("(")
	writeFactText(b, s, facts, "evidence_quote")
	b.WriteString(" = '' OR ")
	writeFactText(b, s, facts, "evidence_quote")
	b.WriteString(" = ")
	writeFactText(b, s, facts, "commitment_text")
	b.WriteString(")")
}

func writeFactParticipantToken(b *sql.Builder, s *sql.Selector, facts, key string) {
	b.WriteString("(")
	writeFactText(b, s, facts, key)
	b.WriteString(" = '' OR ")
	writeFactText(b, s, facts, key)
	if s.Dialect() == dialect.Postgres {
		b.WriteString(" ~ '^[a-z0-9_:-]*$'")
	} else {
		b.WriteString(" GLOB '[a-z0-9_:-]*'")
	}
	b.WriteString(")")
}

func writeVisibleExtraFact(b *sql.Builder, s *sql.Selector, facts string) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_each(CASE WHEN jsonb_typeof(")
		b.WriteString(facts)
		b.WriteString("::jsonb) = 'object' THEN ")
		b.WriteString(facts)
		b.WriteString("::jsonb ELSE '{}'::jsonb END) AS fact(key, value) WHERE fact.key NOT IN (")
		writeSilentFactKeys(b)
		b.WriteString(") AND (jsonb_typeof(fact.value) IN ('object', 'array', 'number', 'boolean') OR (jsonb_typeof(fact.value) = 'string' AND btrim(fact.value #>> '{}') <> '')))")
		return
	}
	b.WriteString("json_each(CASE WHEN json_type(")
	b.WriteString(facts)
	b.WriteString(") = 'object' THEN ")
	b.WriteString(facts)
	b.WriteString(" ELSE '{}' END) AS fact WHERE fact.key NOT IN (")
	writeSilentFactKeys(b)
	b.WriteString(") AND (fact.type IN ('object', 'array', 'integer', 'real', 'true', 'false') OR (fact.type = 'text' AND trim(fact.atom) <> '')))")
}

func writeSilentFactKeys(b *sql.Builder) {
	keys := []string{
		"noteId", "content", "meetingLinked", "liveLinked", "externalId", "contentHash",
		"outcome_kind", "provider_source", "action_id", "recommendation_revision", "channel",
		"user_confirmed", "commitment_id", "evidence_start_ms", "evidence_end_ms",
		"commitment_due_timezone", "commitment_direction", "commitment_due_at", "evidence_quote",
		"owner_participant_ref", "counterparty_participant_ref", "beneficiary_participant_ref",
	}
	for i, key := range keys {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString("'")
		b.WriteString(key)
		b.WriteString("'")
	}
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

// relationshipSheetMeetingNoteMatch matches the line under an opened activity.
// A note linked to a meeting says "Marked as a meeting note." The stored flag
// is a boolean. The string "true" is not that flag.
func relationshipSheetMeetingNoteMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("marked as a meeting note.", needle) {
		return nil
	}
	return relationship.HasObservationsWith(observationMeetingLinked())
}

func observationMeetingLinked() predicate.RelationshipObservation {
	return predicate.RelationshipObservation(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationshipobservation.FieldNormalizedFactsJSON)
			if s.Dialect() == dialect.Postgres {
				b.WriteString("(")
				b.WriteString(column)
				b.WriteString("::jsonb->'meetingLinked') = 'true'::jsonb")
				return
			}
			b.WriteString("json_type(")
			b.WriteString(column)
			b.WriteString(", '$.meetingLinked') = 'true'")
		}))
	})
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

// relationshipSheetRankingMatch matches the ranking inspection on the company
// sheet. The summary is "Inspect ranking factors". Each factor prints its
// label, a signed contribution, and the reason a person reads.
func relationshipSheetRankingMatch(needle string) predicate.Relationship {
	needle = normalizePersonSearch(needle)
	if needle == "" {
		return nil
	}
	if line, ok := rankingFactorLine(needle); ok {
		return relationshipHasRankingLine(line)
	}
	var preds []predicate.Relationship
	if labelPhraseMatches("inspect ranking factors", needle) {
		preds = append(preds, relationshipHasRecommendationEvaluation())
	}
	for _, item := range rankingFactorLabels {
		if labelPhraseMatches(item.label, needle) {
			preds = append(preds, relationshipHasRankingFactor(item.key))
		}
	}
	for _, item := range rankingPrintedReasons {
		if labelPhraseMatches(item.printed, needle) {
			preds = append(preds, relationshipHasRankingReason(item.stored))
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

type rankingFactorLabel struct {
	label string
	key   string
}

var rankingFactorLabels = []rankingFactorLabel{
	{label: "due date", key: "commitment_due_state"},
	{label: "source coverage", key: "source_completeness"},
	{label: "earlier outcomes", key: "outcome_learning"},
}

type rankingPrintedReason struct {
	printed string
	stored  []string
}

var rankingPrintedReasons = []rankingPrintedReason{
	{
		printed: "this promise is past due.",
		stored:  []string{"this promise is past due.", "an accepted commitment is overdue."},
	},
	{
		printed: "this promise is due now.",
		stored:  []string{"this promise is due now.", "an accepted commitment is due now."},
	},
	{
		printed: "how complete the sources are changes where this sits.",
		stored: []string{
			"how complete the sources are changes where this sits.",
			"fresh source coverage changes confidence in the queue position.",
			"more complete fresh evidence increases confidence in ordering.",
		},
	},
	{
		printed: "earlier results change the order. they do not approve the action.",
		stored: []string{
			"earlier results change the order. they do not approve the action.",
			"bounded prior decisions and outcomes adjust ordering, never authority.",
		},
	},
	{
		printed: "newer evidence matters more than older evidence.",
		stored: []string{
			"newer evidence matters more than older evidence.",
			"recent evidence is more actionable than stale evidence.",
		},
	},
	{
		printed: "you have kept this channel before.",
		stored: []string{
			"you have kept this channel before.",
			"the user has repeatedly retained this channel.",
		},
	},
}

type rankingLine struct {
	key          string
	contribution int
	reasons      []string
}

func rankingFactorLine(needle string) (rankingLine, bool) {
	var found rankingLine
	matched := false
	for _, label := range rankingFactorLabels {
		marker := label.label + ": +"
		search := needle
		for {
			index := strings.Index(search, marker)
			if index < 0 {
				break
			}
			rest := search[index+len(marker):]
			end := 0
			for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
				end++
			}
			if end == 0 {
				search = search[index+len(marker):]
				continue
			}
			contribution, err := strconv.Atoi(rest[:end])
			if err != nil {
				search = search[index+len(marker):]
				continue
			}
			after := rest[end:]
			var reasons []string
			for _, item := range rankingPrintedReasons {
				// The search box turns the sentence's period into a space.
				if strings.Contains(after, " · "+normalizePersonSearch(item.printed)) {
					reasons = item.stored
					break
				}
			}
			if len(reasons) == 0 {
				search = search[index+len(marker):]
				continue
			}
			line := rankingLine{key: label.key, contribution: contribution, reasons: reasons}
			if matched && (found.key != line.key || found.contribution != line.contribution) {
				return rankingLine{}, false
			}
			found = line
			matched = true
			search = rest[end:]
		}
	}
	return found, matched
}

func relationshipHasRecommendationEvaluation() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			writeLatestRecommendation(b, s)
			b.WriteString(")")
		}))
	})
}

func relationshipHasRankingFactor(key string) predicate.Relationship {
	return relationshipHasRankingFactorWhere(func(b *sql.Builder, s *sql.Selector) {
		writeRankingFactorText(b, s, "factor")
		b.WriteString(" = ")
		b.Arg(key)
	})
}

func relationshipHasRankingReason(stored []string) predicate.Relationship {
	return relationshipHasRankingFactorWhere(func(b *sql.Builder, s *sql.Selector) {
		b.WriteString("lower(trim(")
		writeRankingFactorText(b, s, "reason")
		b.WriteString(")) IN (")
		for i, reason := range stored {
			if i > 0 {
				b.WriteString(", ")
			}
			b.Arg(reason)
		}
		b.WriteString(")")
	})
}

func relationshipHasRankingLine(line rankingLine) predicate.Relationship {
	return relationshipHasRankingFactorWhere(func(b *sql.Builder, s *sql.Selector) {
		writeRankingFactorText(b, s, "factor")
		b.WriteString(" = ")
		b.Arg(line.key)
		b.WriteString(" AND ")
		writeRankingFactorNumber(b, s, "contribution")
		b.WriteString(" = ")
		b.Arg(line.contribution)
		b.WriteString(" AND lower(trim(")
		writeRankingFactorText(b, s, "reason")
		b.WriteString(")) IN (")
		for i, reason := range line.reasons {
			if i > 0 {
				b.WriteString(", ")
			}
			b.Arg(reason)
		}
		b.WriteString(")")
	})
}

func relationshipHasRankingFactorWhere(match func(*sql.Builder, *sql.Selector)) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := "eval." + conversationintelligenceartifact.FieldPayloadJSON
			b.WriteString("EXISTS (SELECT 1 FROM ")
			writeLatestRecommendation(b, s)
			b.WriteString(" AND ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("jsonb_typeof(")
				b.WriteString(column)
				b.WriteString("::jsonb->'factors') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(")
				b.WriteString(column)
				b.WriteString("::jsonb->'factors') AS factor WHERE ")
			} else {
				b.WriteString("json_valid(")
				b.WriteString(column)
				b.WriteString(") AND json_type(")
				b.WriteString(column)
				b.WriteString(", '$.factors') = 'array' AND EXISTS (SELECT 1 FROM json_each(")
				b.WriteString(column)
				b.WriteString(", '$.factors') AS factor WHERE ")
			}
			match(b, s)
			b.WriteString("))")
		}))
	})
}

func writeLatestRecommendation(b *sql.Builder, s *sql.Selector) {
	art := conversationintelligenceartifact.Table
	b.WriteString(art)
	b.WriteString(" AS eval WHERE eval.")
	b.WriteString(conversationintelligenceartifact.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.FieldID))
	b.WriteString(" AND eval.")
	b.WriteString(conversationintelligenceartifact.FieldKind)
	b.WriteString(" = 'recommendation_evaluation' AND eval.")
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
}

func writeRankingFactorText(b *sql.Builder, s *sql.Selector, field string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("factor->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(factor.value, '$.")
	b.WriteString(field)
	b.WriteString("')")
}

func writeRankingFactorNumber(b *sql.Builder, s *sql.Selector, field string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE((factor->>'")
		b.WriteString(field)
		b.WriteString("')::int, 0)")
		return
	}
	b.WriteString("CAST(COALESCE(json_extract(factor.value, '$.")
	b.WriteString(field)
	b.WriteString("'), 0) AS INTEGER)")
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

// relationshipSheetPlanCardMatch matches the shared-plan card. The heading is
// "Draft · Version 1" or "Approved in this workspace · Version 2". A draft or
// revised plan says "Approve this plan". An approved plan says "Draft an email
// to share this plan". Each step is the title, or "Send the packet · Ada Quill"
// when the owner is a person.
func relationshipSheetPlanCardMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if status, version, ok := planHeadingQuery(needle); ok {
		preds = append(preds, relationshipPlanHeading(status, version))
	} else if line := normalizePersonSearch(needle); line != "" {
		preds = append(preds, relationshipPlanStepLine(line))
	}
	if labelPhraseMatches("approve this plan", needle) {
		preds = append(preds, relationshipLatestPlanStatus("draft", "revised"))
	}
	if labelPhraseMatches("draft an email to share this plan", needle) {
		preds = append(preds, relationshipLatestPlanStatus("internally_approved"))
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

func planHeadingQuery(needle string) (status string, version int, ok bool) {
	text := normalizePersonSearch(needle)
	const marker = " · version "
	index := strings.LastIndex(text, marker)
	if index <= 0 {
		return "", 0, false
	}
	prefix := strings.TrimSpace(text[:index])
	labels := []struct{ label, status string }{
		{"approved in this workspace", "internally_approved"},
		{"they responded", "counterparty_responded"},
		{"cancelled", "cancelled"},
		{"finished", "completed"},
		{"revised", "revised"},
		{"unknown", ""},
		{"draft", "draft"},
	}
	for _, item := range labels {
		if prefix == item.label || strings.HasSuffix(prefix, " "+item.label) {
			status = item.status
			ok = true
			break
		}
	}
	if !ok {
		return "", 0, false
	}
	rest := text[index+len(marker):]
	end := 0
	for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
		end++
	}
	if end == 0 {
		return "", 0, false
	}
	version, err := strconv.Atoi(rest[:end])
	if err != nil || version < 1 || version > 500 || strings.TrimRight(rest[end:], ".,;?") != "" {
		return "", 0, false
	}
	return status, version, true
}

func relationshipPlanHeading(status string, version int) predicate.Relationship {
	return relationshipLatestPlan(func(b *sql.Builder, s *sql.Selector) {
		b.WriteString(" AND ")
		writePlanStatusExpr(b, s)
		if status == "" {
			b.WriteString(" IN ('', 'unknown')")
		} else {
			b.WriteString(" = ")
			b.Arg(status)
		}
		b.WriteString(" AND ")
		writePlanVersionExpr(b, s)
		b.WriteString(" = ")
		b.Arg(version)
	})
}

func relationshipLatestPlanStatus(statuses ...string) predicate.Relationship {
	return relationshipLatestPlan(func(b *sql.Builder, s *sql.Selector) {
		b.WriteString(" AND ")
		writePlanStatusExpr(b, s)
		b.WriteString(" IN (")
		for i, status := range statuses {
			if i > 0 {
				b.WriteString(", ")
			}
			b.Arg(status)
		}
		b.WriteString(")")
	})
}

func relationshipPlanStepLine(line string) predicate.Relationship {
	return relationshipLatestPlan(func(b *sql.Builder, s *sql.Selector) {
		b.WriteString(" AND ")
		writePlanStepMatch(b, s, line)
	})
}

func relationshipLatestPlan(extra func(*sql.Builder, *sql.Selector)) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(art)
			b.WriteString(" AS plan WHERE plan.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND plan.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = 'mutual_action_plan' AND plan.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(" = (SELECT MAX(newer.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(") FROM ")
			b.WriteString(art)
			b.WriteString(" AS newer WHERE newer.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.WorkspaceColumn)
			b.WriteString(")")
			extra(b, s)
			b.WriteString(")")
		}))
	})
}

func writePlanStatusExpr(b *sql.Builder, s *sql.Selector) {
	column := "plan." + conversationintelligenceartifact.FieldPayloadJSON
	b.WriteString("trim(coalesce(")
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->>'status'")
	} else {
		b.WriteString("json_extract(")
		b.WriteString(column)
		b.WriteString(", '$.status')")
	}
	b.WriteString(", ''))")
}

func writePlanVersionExpr(b *sql.Builder, s *sql.Selector) {
	column := "plan." + conversationintelligenceartifact.FieldPayloadJSON
	var raw string
	if s.Dialect() == dialect.Postgres {
		raw = fmt.Sprintf("CAST((%s::jsonb)->'currentRevision'->>'version' AS INTEGER)", column)
	} else {
		raw = fmt.Sprintf("CAST(json_extract(%s, '$.currentRevision.version') AS INTEGER)", column)
	}
	b.WriteString("CASE WHEN coalesce(")
	b.WriteString(raw)
	b.WriteString(", 0) <= 0 THEN 1 ELSE ")
	b.WriteString(raw)
	b.WriteString(" END")
}

func writePlanStepMatch(b *sql.Builder, s *sql.Selector, line string) {
	column := "plan." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof((")
		b.WriteString(column)
		b.WriteString("::jsonb)->'currentRevision'->'items') = 'array' THEN (")
		b.WriteString(column)
		b.WriteString("::jsonb)->'currentRevision'->'items' ELSE '[]'::jsonb END) AS item WHERE ")
		b.WriteString(planItemPrintedSQL(
			"item->>'title'",
			"item->>'ownerParticipantRef'",
			tokenOwnerSQL("item->>'ownerParticipantRef'"),
		))
		b.WriteString(" = ")
		b.Arg(line)
		b.WriteString(")")
		return
	}
	b.WriteString("EXISTS (SELECT 1 FROM json_each(coalesce(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.currentRevision.items'), '[]')) WHERE ")
	b.WriteString(planItemPrintedSQL(
		"json_extract(value, '$.title')",
		"json_extract(value, '$.ownerParticipantRef')",
		tokenOwnerSQL("json_extract(value, '$.ownerParticipantRef')"),
	))
	b.WriteString(" = ")
	b.Arg(line)
	b.WriteString(")")
}

func planItemPrintedSQL(title, owner, token string) string {
	normalizedTitle := normalizedSearchExpr(title)
	normalizedOwner := normalizedSearchExpr(owner)
	return fmt.Sprintf(`CASE WHEN trim(coalesce(%s, '')) = '' THEN 'untitled step' WHEN trim(coalesce(%s, '')) = '' OR trim(coalesce(%s, '')) = 'plan-participant' OR %s THEN %s ELSE %s || ' · ' || %s END`,
		title, owner, owner, token, normalizedTitle, normalizedTitle, normalizedOwner)
}

func tokenOwnerSQL(owner string) string {
	raw := fmt.Sprintf("trim(coalesce(%s, ''))", owner)
	stripped := raw
	for _, ch := range "abcdefghijklmnopqrstuvwxyz0123456789_-:" {
		stripped = fmt.Sprintf("replace(%s, '%c', '')", stripped, ch)
	}
	return fmt.Sprintf("(%s <> '' AND length(%s) = 0)", raw, stripped)
}

func normalizedSearchExpr(expr string) string {
	wrapped := fmt.Sprintf("lower(replace(replace(replace(trim(coalesce(%s, '')), '-', ' '), '_', ' '), '.', ' '))", expr)
	for i := 0; i < 3; i++ {
		wrapped = fmt.Sprintf("replace(%s, '  ', ' ')", wrapped)
	}
	return wrapped
}

// relationshipSheetSectionCountMatch matches the section headings that count
// every loaded row. Recommendations includes a dismissed action. Promises
// includes a closed promise. Email activity is mail threads, not meetings.
func relationshipSheetSectionCountMatch(needle string) predicate.Relationship {
	if n, ok := sheetSectionCount(needle, "email activity ("); ok {
		return relationshipMailThreadCount("=", n)
	}
	if n, ok := sheetSectionCount(needle, "people ("); ok {
		return relationshipLinkedCount(relationshipparticipant.Table, relationshipparticipant.RelationshipColumn, n)
	}
	if n, ok := sheetSectionCount(needle, "promises ("); ok {
		return relationshipLinkedCount(commitment.Table, commitment.RelationshipColumn, n)
	}
	if n, ok := sheetSectionCount(needle, "recommendations ("); ok {
		return relationshipLinkedCount(revenueaction.Table, revenueaction.RelationshipColumn, n)
	}
	return nil
}

func sheetSectionCount(needle, prefix string) (int, bool) {
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

func relationshipLinkedCount(table, column string, n int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(table)
			b.WriteString(" AS counted WHERE counted.")
			b.WriteString(column)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") = ")
			b.Arg(n)
		}))
	})
}

// relationshipSheetRecommendationReasonMatch matches the line under What
// changed. The sheet prints it only when the company has a saved reason.
func relationshipSheetRecommendationReasonMatch(needle string) predicate.Relationship {
	mode, reason, ok := recommendationReasonQuery(needle)
	if !ok {
		return nil
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationship.FieldStateReason)
			if mode == "any" {
				b.WriteString("trim(COALESCE(")
				b.WriteString(column)
				b.WriteString(", '')) <> ''")
				return
			}
			b.WriteString("lower(trim(replace(replace(replace(COALESCE(")
			b.WriteString(column)
			b.WriteString(", ''), '-', ' '), '_', ' '), '.', ' '))) = ")
			b.Arg(reason)
		}))
	})
}

func recommendationReasonQuery(needle string) (mode, reason string, ok bool) {
	text := normalizePersonSearch(needle)
	const prefix = "why the recommendation changed"
	if text == prefix || text == prefix+":" {
		return "any", "", true
	}
	const labeled = prefix + ": "
	if !strings.HasPrefix(text, labeled) {
		return "", "", false
	}
	reason = strings.TrimSpace(text[len(labeled):])
	if reason == "" {
		return "any", "", true
	}
	return "exact", reason, true
}

// relationshipSheetEvidenceExcerptMatch matches the quote under Inspect
// supporting words. A blank or missing excerpt prints the same sentence.
// A saved excerpt matches the words on that line, including the quotes.
func relationshipSheetEvidenceExcerptMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if labelPhraseMatches("evidence excerpt unavailable", needle) {
		preds = append(preds, relationship.HasActionsWith(revenueaction.HasEvidencesWith(evidenceExcerptBlank())))
	}
	if text := evidenceExcerptQuery(needle); text != "" {
		preds = append(preds, relationship.HasActionsWith(revenueaction.HasEvidencesWith(evidenceExcerptEquals(text))))
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

func evidenceExcerptQuery(needle string) string {
	return strings.TrimSpace(strings.Trim(needle, "\"'“”"))
}

func evidenceExcerptBlank() predicate.RevenueEvidence {
	return predicate.RevenueEvidence(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("trim(COALESCE(")
			b.WriteString(s.C(revenueevidence.FieldExcerpt))
			b.WriteString(", '')) = ''")
		}))
	})
}

func evidenceExcerptEquals(text string) predicate.RevenueEvidence {
	return predicate.RevenueEvidence(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("lower(trim(replace(replace(replace(COALESCE(")
			b.WriteString(s.C(revenueevidence.FieldExcerpt))
			b.WriteString(", ''), '-', ' '), '_', ' '), '.', ' '))) = ")
			b.Arg(text)
		}))
	})
}

// planStatusPhrase is a heading or button on the shared-plan card. The stored
// status is a token such as internally_approved. The card says the phrase.
type planStatusPhrase struct {
	phrase   string
	statuses []string
}

func planStatusPhrases() []planStatusPhrase {
	return []planStatusPhrase{
		{phrase: "approved in this workspace", statuses: []string{"internally_approved"}},
		{phrase: "draft an email to share this plan", statuses: []string{"internally_approved"}},
		{phrase: "they responded", statuses: []string{"counterparty_responded"}},
		{phrase: "finished", statuses: []string{"completed"}},
		{phrase: "cancelled", statuses: []string{"cancelled"}},
		{phrase: "draft", statuses: []string{"draft"}},
		{phrase: "revised", statuses: []string{"revised"}},
		{phrase: "shared", statuses: []string{"shared"}},
		{phrase: "approve this plan", statuses: []string{"draft", "revised"}},
	}
}

// relationshipSheetPlanStatusMatch matches the plan heading and the button
// under it. The heading is "Approved in this workspace · Version 2". A newer
// revision replaces an older status. The words come from the saved plan, not
// the artifact column, because that is what the sheet reads.
func relationshipSheetPlanStatusMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for _, item := range planStatusPhrases() {
		version, ok := planStatusQuery(item.phrase, needle)
		if !ok {
			continue
		}
		preds = append(preds, relationshipHasLatestPlan(item.statuses, version))
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

func planStatusQuery(phrase, needle string) (int, bool) {
	phrase = normalizePersonSearch(phrase)
	needle = normalizePersonSearch(needle)
	if phrase == "" || needle == "" || !planStatusPhraseMatches(phrase, needle) {
		return 0, false
	}
	return planHeadingVersion(needle), true
}

func planStatusPhraseMatches(phrase, needle string) bool {
	if needle == phrase || strings.Contains(needle, phrase+" ·") {
		return true
	}
	// "Deletion is finished" is a privacy receipt. "Finished" on a plan is
	// the completed status. The receipt must not open every completed plan.
	if phrase == "finished" {
		return strings.Contains(needle, "finished") && !strings.Contains(needle, "deletion is finished")
	}
	return len(phrase) >= 8 && strings.Contains(needle, phrase)
}

func planHeadingVersion(needle string) int {
	const mark = "· version "
	index := strings.LastIndex(needle, mark)
	if index < 0 {
		return 0
	}
	number := strings.TrimSpace(needle[index+len(mark):])
	version, err := strconv.Atoi(number)
	if err != nil || version < 1 {
		return 0
	}
	return version
}

func relationshipHasLatestPlan(statuses []string, version int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			art := conversationintelligenceartifact.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(art)
			b.WriteString(" AS plan WHERE plan.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND plan.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = 'mutual_action_plan' AND plan.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(" = (SELECT MAX(newer.")
			b.WriteString(conversationintelligenceartifact.FieldVersion)
			b.WriteString(") FROM ")
			b.WriteString(art)
			b.WriteString(" AS newer WHERE newer.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.FieldStableID)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.FieldKind)
			b.WriteString(" AND newer.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(" = plan.")
			b.WriteString(conversationintelligenceartifact.RelationshipColumn)
			b.WriteString(") AND lower(trim(")
			writePlanJSONText(b, s, "status")
			b.WriteString(")) IN (")
			for i, status := range statuses {
				if i > 0 {
					b.WriteString(", ")
				}
				b.Arg(status)
			}
			b.WriteString(")")
			writePlanVersionFilter(b, s, version)
			b.WriteString(")")
		}))
	})
}

func writePlanVersionFilter(b *sql.Builder, s *sql.Selector, version int) {
	if version == 0 {
		return
	}
	b.WriteString(" AND ")
	if version == 1 {
		// A missing revision still prints "Version 1".
		b.WriteString("(")
		writePlanJSONText(b, s, "currentRevision,version")
		b.WriteString(" IS NULL OR lower(trim(CAST(")
		writePlanJSONText(b, s, "currentRevision,version")
		b.WriteString(" AS TEXT))) IN ('', '0', '1'))")
		return
	}
	b.WriteString("lower(trim(CAST(")
	writePlanJSONText(b, s, "currentRevision,version")
	b.WriteString(" AS TEXT))) = ")
	b.Arg(strconv.Itoa(version))
}

func writePlanJSONText(b *sql.Builder, s *sql.Selector, path string) {
	column := "plan." + conversationintelligenceartifact.FieldPayloadJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb #>> ")
		b.Arg("{" + path + "}")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", ")
	b.Arg("$." + strings.ReplaceAll(path, ",", "."))
	b.WriteString(")")
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

// relationshipSheetDeletionButtonMatch matches the privacy button. It is the
// company that has mail, a visible meeting, a note, or any promise. A calendar
// event alone does not offer the delete.
func relationshipSheetDeletionButtonMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("delete conversation data", needle) {
		return nil
	}
	return relationship.Or(
		relationshipMailThreadCount("<>", 0),
		relationshipHasVisibleCommunication(),
		relationship.HasCommitments(),
		relationship.HasObservationsWith(relationshipobservation.SourceIn(
			"meeting", "desktop_note", "voice_note", "browser",
		)),
	)
}

// relationshipSheetChangeHeadingMatch matches the What changed heading and
// Show earlier changes. The first page is two snapshots, so three or more
// read "What changed (2+)" until the rest are loaded. The loaded list then
// prints the exact total, and only (2+) means there are more than two.
func relationshipSheetChangeHeadingMatch(needle string) predicate.Relationship {
	if labelPhraseMatches("show earlier changes", needle) {
		return relationshipSnapshotCount(">", 2)
	}
	compare, n, ok := relationshipChangeHeadingCount(needle)
	if !ok {
		return nil
	}
	return relationshipSnapshotCount(compare, n)
}

func relationshipChangeHeadingCount(needle string) (compare string, n int, ok bool) {
	const prefix = "what changed ("
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, ")") {
		return "", 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), ")")
	overflow := strings.HasSuffix(body, "+")
	body = strings.TrimSuffix(body, "+")
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 0 || strconv.Itoa(parsed) != body {
		return "", 0, false
	}
	if overflow {
		if parsed != 2 {
			return "", 0, false
		}
		return ">", 2, true
	}
	return "=", parsed, true
}

func relationshipSnapshotCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(relationshipstatesnapshot.Table)
			b.WriteString(" AS snap WHERE snap.")
			b.WriteString(relationshipstatesnapshot.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
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

// relationshipSheetPromiseLinkMatch matches the promise-link section. The
// heading is "Promise links (N)" and is omitted when nothing is linked. A
// blank endpoint prints "Unknown promise". The kind badge is Blocks, Requires,
// or Replaces, and only the exact badge is that kind.
func relationshipSheetPromiseLinkMatch(needle string) predicate.Relationship {
	needle = normalizePersonSearch(needle)
	if needle == "" {
		return nil
	}
	var preds []predicate.Relationship
	if strings.Contains(needle, "promise links (") {
		if n, ok := promiseLinkHeadingCount(needle); ok {
			preds = append(preds, relationshipCommitmentDependencyCount("=", n))
		}
	} else if labelPhraseMatches("promise links", needle) {
		preds = append(preds, relationshipCommitmentDependencyCount(">=", 1))
	}
	if labelPhraseMatches("unknown promise", needle) {
		preds = append(preds, relationshipHasUnknownPromiseEnd())
	}
	switch needle {
	case "blocks":
		preds = append(preds, relationship.HasCommitmentDependenciesWith(commitmentdependency.KindEQ("blocks")))
	case "requires":
		preds = append(preds, relationship.HasCommitmentDependenciesWith(commitmentdependency.KindEQ("requires")))
	case "replaces":
		preds = append(preds, relationship.HasCommitmentDependenciesWith(commitmentdependency.KindEQ("supersedes")))
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

func promiseLinkHeadingCount(needle string) (int, bool) {
	const marker = "promise links ("
	found := -1
	search := needle
	for {
		index := strings.Index(search, marker)
		if index < 0 {
			break
		}
		tail := search[index+len(marker):]
		end := strings.IndexByte(tail, ')')
		if end <= 0 {
			search = search[index+1:]
			continue
		}
		body := tail[:end]
		parsed, err := strconv.Atoi(body)
		if err != nil || parsed < 1 || strconv.Itoa(parsed) != body {
			search = search[index+1:]
			continue
		}
		phrase := fmt.Sprintf("promise links (%d)", parsed)
		if !labelPhraseMatches(phrase, needle) {
			search = search[index+1:]
			continue
		}
		if found >= 0 && found != parsed {
			return 0, false
		}
		found = parsed
		search = tail[end+1:]
	}
	if found < 1 {
		return 0, false
	}
	return found, true
}

func relationshipCommitmentDependencyCount(compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(commitmentdependency.Table)
			b.WriteString(" WHERE ")
			b.WriteString(commitmentdependency.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
}

func relationshipHasUnknownPromiseEnd() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(commitmentdependency.Table)
			b.WriteString(" AS dep WHERE dep.")
			b.WriteString(commitmentdependency.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND (")
			writeUnknownPromiseEnd(b, "dep."+commitmentdependency.FromCommitmentColumn)
			b.WriteString(" OR ")
			writeUnknownPromiseEnd(b, "dep."+commitmentdependency.ToCommitmentColumn)
			b.WriteString("))")
		}))
	})
}

func writeUnknownPromiseEnd(b *sql.Builder, idExpr string) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(commitment.Table)
	b.WriteString(" AS promise WHERE promise.")
	b.WriteString(commitment.FieldID)
	b.WriteString(" = ")
	b.WriteString(idExpr)
	b.WriteString(" AND (length(trim(promise.")
	b.WriteString(commitment.FieldText)
	b.WriteString(")) = 0 OR lower(trim(promise.")
	b.WriteString(commitment.FieldText)
	b.WriteString(")) = 'unknown promise'))")
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

// relationshipSheetDuplicateImpactMatch matches the duplicate-card badges and
// the review buttons. A zero count is omitted. Pending and deferred cards
// offer Keep separate, Move the evidence, and Decide later. Resolved cards
// keep the count badges and replace those buttons.
func relationshipSheetDuplicateImpactMatch(needle string) predicate.Relationship {
	needle = normalizePersonSearch(needle)
	if needle == "" {
		return nil
	}
	var preds []predicate.Relationship
	for _, item := range duplicateImpactBadges {
		n, numbered, ok := duplicateImpactCount(needle, item.one, item.many)
		if numbered {
			if ok {
				preds = append(preds, relationshipDuplicateImpact(item.key, "=", n))
			}
			continue
		}
		if labelPhraseMatches(item.many, needle) {
			preds = append(preds, relationshipDuplicateImpact(item.key, ">=", 2))
			continue
		}
		if labelPhraseMatches("1 "+item.one, needle) {
			preds = append(preds, relationshipDuplicateImpact(item.key, "=", 1))
		}
	}
	if labelPhraseMatches("keep separate", needle) ||
		labelPhraseMatches("move the evidence", needle) ||
		labelPhraseMatches("decide later", needle) {
		preds = append(preds, relationshipHasOpenDuplicateReview())
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

type duplicateImpactBadge struct {
	key  string
	one  string
	many string
}

var duplicateImpactBadges = []duplicateImpactBadge{
	{key: "observations", one: "recorded event", many: "recorded events"},
	{key: "assertions", one: "saved detail", many: "saved details"},
	{key: "evidence", one: "supporting record", many: "supporting records"},
}

func duplicateImpactCount(needle, one, many string) (n int, numbered bool, ok bool) {
	singular := "1 " + one
	found := -1
	if labelPhraseMatches(singular, needle) && !strings.Contains(needle, many) {
		found = 1
		numbered = true
	}
	marker := " " + many
	search := needle
	for {
		index := strings.Index(search, marker)
		if index < 0 {
			break
		}
		head := strings.TrimSpace(search[:index])
		number := head
		if space := strings.LastIndex(head, " "); space >= 0 {
			number = head[space+1:]
		}
		parsed, err := strconv.Atoi(number)
		if err != nil || strconv.Itoa(parsed) != number {
			search = search[index+1:]
			continue
		}
		numbered = true
		if parsed < 1 {
			return 0, true, false
		}
		phrase := fmt.Sprintf("%d %s", parsed, many)
		if parsed == 1 {
			phrase = singular
		}
		if !labelPhraseMatches(phrase, needle) {
			search = search[index+1:]
			continue
		}
		if found >= 0 && found != parsed {
			return 0, true, false
		}
		found = parsed
		search = search[index+len(marker):]
	}
	if found < 1 {
		return 0, numbered, false
	}
	return found, numbered, true
}

func relationshipDuplicateImpact(key, compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" {
		compare = "="
	}
	if n < 1 {
		return relationship.Not(relationshipMatchAll())
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			table := relationshipidentitycandidate.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(table)
			b.WriteString(" AS dup WHERE dup.")
			b.WriteString(relationshipidentitycandidate.FieldStatus)
			b.WriteString(" IN ('pending', 'deferred', 'resolved') AND (dup.")
			b.WriteString(relationshipidentitycandidate.ProposedRelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" OR dup.")
			b.WriteString(relationshipidentitycandidate.ExistingRelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") AND ")
			writeDuplicateImpactCount(b, s, "dup."+relationshipidentitycandidate.FieldImpactJSON, key)
			b.WriteString(" ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
			b.WriteString(")")
		}))
	})
}

func writeDuplicateImpactCount(b *sql.Builder, s *sql.Selector, column, key string) {
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE((")
		b.WriteString(column)
		b.WriteString("::jsonb->>'")
		b.WriteString(key)
		b.WriteString("')::int, 0)")
		return
	}
	b.WriteString("CAST(COALESCE(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(key)
	b.WriteString("'), 0) AS INTEGER)")
}

func relationshipHasOpenDuplicateReview() predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			table := relationshipidentitycandidate.Table
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(table)
			b.WriteString(" AS dup WHERE dup.")
			b.WriteString(relationshipidentitycandidate.FieldStatus)
			b.WriteString(" IN ('pending', 'deferred') AND (dup.")
			b.WriteString(relationshipidentitycandidate.ProposedRelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" OR dup.")
			b.WriteString(relationshipidentitycandidate.ExistingRelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString("))")
		}))
	})
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
	// labelOnly matches the full printed sentence. A word inside it, such as
	// "a meeting", stays on the activity heading that already uses that word.
	labelOnly bool
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
	// An open case prints "Choose the current value from N sources." A
	// resolved case prints who was chosen. The button stores that sentence.
	// An older row stored "Selected desktop_note as current evidence."
	for _, slug := range contradictionChosenSources() {
		label := contradictionChosenSourceLabel(slug)
		display := "You chose the value from " + label + "."
		phrases = append(phrases,
			contradictionSearchPhrase{
				phrase:    normalizePersonSearch(display),
				statusNot: "open",
				reason:    display,
				labelOnly: true,
			},
			contradictionSearchPhrase{
				phrase:    normalizePersonSearch(display),
				statusNot: "open",
				reason:    "Selected " + slug + " as current evidence.",
				labelOnly: true,
			},
		)
	}
	chose := "You chose the current value."
	phrases = append(phrases,
		contradictionSearchPhrase{
			phrase: normalizePersonSearch(chose), statusNot: "open", reason: chose, labelOnly: true,
		},
		contradictionSearchPhrase{
			phrase:    normalizePersonSearch(chose),
			statusNot: "open",
			reason:    "User selected the current value from a focused contradiction case.",
			labelOnly: true,
		},
	)
	disagree := "Two sources disagree. Choose which value is current."
	phrases = append(phrases,
		contradictionSearchPhrase{
			phrase: normalizePersonSearch(disagree), statusNot: "open", reason: disagree, labelOnly: true,
		},
		contradictionSearchPhrase{
			phrase:    normalizePersonSearch(disagree),
			statusNot: "open",
			reason:    "equally authoritative typed evidence overlaps with different values",
			labelOnly: true,
		},
	)
	return phrases
}

func contradictionChosenSources() []string {
	return []string{
		"user_correction", "source_fact", "deterministic", "ai_inference",
		"gmail", "google", "calendar", "slack", "hubspot", "meeting",
		"desktop_note", "voice_note", "browser", "crm", "user", "web", "composio",
	}
}

// contradictionChosenSourceLabel is the name on "You chose the value from …".
// Authority tokens win over the activity title, matching the company sheet.
func contradictionChosenSourceLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "user_correction":
		return "Your correction"
	case "source_fact":
		return "A connected source"
	case "deterministic":
		return "A rule"
	case "ai_inference":
		return "A suggestion"
	default:
		return graphSourceLabel(source)
	}
}

// contradictionSentenceOwnsActivity is true when the query is a closed-case
// sentence that also contains an activity heading, such as Calendar or A meeting.
func contradictionSentenceOwnsActivity(needle string) bool {
	for _, slug := range contradictionChosenSources() {
		if labelPhraseMatches("You chose the value from "+contradictionChosenSourceLabel(slug)+".", needle) {
			return true
		}
	}
	return false
}
// relationshipSheetContradictionMatch matches the suggestion "Two details disagree"
// and the sentence under it. A resolved disagreement prints a different sentence,
// so the open suggestion stays off that company. A closed case prints who chose
// the current value. An open case that still stores that reason does not.
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
			if item.labelOnly {
				if labelPhraseMatches(item.phrase, needle) {
					chosen = append(chosen, item)
				}
				continue
			}
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

// relationshipSheetUncertainClaimMatch matches the sentence under What changed.
// The sheet counts each claim on the newest observation page whose confidence
// or speaker confidence is still below 0.75. A saved correction for that side
// raises it to 1, so the claim is no longer uncertain.
func relationshipSheetUncertainClaimMatch(needle string) predicate.Relationship {
	n, ok := uncertainClaimCount(needle)
	if !ok {
		return nil
	}
	return relationshipUncertainClaimCount(n)
}

func uncertainClaimCount(needle string) (int, bool) {
	const singular = "1 material claim remains uncertain and queued for focused review"
	if needle == singular {
		return 1, true
	}
	const tail = " material claims remain uncertain and queued for focused review"
	if !strings.HasSuffix(needle, tail) {
		return 0, false
	}
	body := strings.TrimSuffix(needle, tail)
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 2 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	return parsed, true
}

func relationshipUncertainClaimCount(n int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			facts := "obs." + relationshipobservation.FieldNormalizedFactsJSON
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs")
			if s.Dialect() == dialect.Postgres {
				b.WriteString(", LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims') = 'array' THEN ")
				b.WriteString(facts)
				b.WriteString("::jsonb->'conversation_claims' ELSE '[]'::jsonb END) AS claim WHERE obs.")
			} else {
				b.WriteString(", json_each(CASE WHEN json_valid(")
				b.WriteString(facts)
				b.WriteString(") AND json_type(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') = 'array' THEN json_extract(")
				b.WriteString(facts)
				b.WriteString(", '$.conversation_claims') ELSE '[]' END) AS claim WHERE obs.")
			}
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND obs.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" IN (SELECT page.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" FROM ")
			b.WriteString(obs)
			b.WriteString(" AS page WHERE page.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" ORDER BY page.")
			b.WriteString(relationshipobservation.FieldOccurredAt)
			b.WriteString(" DESC, page.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" DESC LIMIT ")
			b.WriteString(strconv.Itoa(intelligenceObservationPage))
			b.WriteString(") AND (")
			writeUncertainClaimSide(b, s, "confidence", []string{"claim", "entity", "word"})
			b.WriteString(" OR ")
			writeUncertainClaimSide(b, s, "speakerConfidence", []string{"speaker"})
			b.WriteString(")) = ")
			b.Arg(n)
		}))
	})
}

func writeUncertainClaimSide(b *sql.Builder, s *sql.Selector, field string, kinds []string) {
	b.WriteString("(")
	b.WriteString(reviewClaimNumber(s, field))
	b.WriteString(" < 0.75 AND NOT ")
	writeUncertainClaimCorrection(b, s, kinds)
	b.WriteString(")")
}

func writeUncertainClaimCorrection(b *sql.Builder, s *sql.Selector, kinds []string) {
	fixFacts := "fix." + relationshipobservation.FieldNormalizedFactsJSON
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(relationshipobservation.Table)
	b.WriteString(" AS fix WHERE fix.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = obs.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" AND ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString(fixFacts)
		b.WriteString("::jsonb->'review_correction'->>'observation_id' = obs.")
		b.WriteString(relationshipobservation.FieldID)
		b.WriteString("::text AND ")
		b.WriteString(fixFacts)
		b.WriteString("::jsonb->'review_correction'->>'claim_id' = claim->>'id' AND ")
		b.WriteString(fixFacts)
		b.WriteString("::jsonb->'review_correction'->>'kind' IN (")
	} else {
		b.WriteString("json_extract(")
		b.WriteString(fixFacts)
		b.WriteString(", '$.review_correction.observation_id') = obs.")
		b.WriteString(relationshipobservation.FieldID)
		b.WriteString(" AND json_extract(")
		b.WriteString(fixFacts)
		b.WriteString(", '$.review_correction.claim_id') = json_extract(claim.value, '$.id') AND json_extract(")
		b.WriteString(fixFacts)
		b.WriteString(", '$.review_correction.kind') IN (")
	}
	for i, kind := range kinds {
		if i > 0 {
			b.WriteString(", ")
		}
		b.Arg(kind)
	}
	b.WriteString("))")
}

// relationshipSheetSuggestionCountMatch matches the Suggestions heading. The
// section is hidden when nothing is suggested, so Suggestions (0) matches
// nobody. The count is the cues on the first observation page.
func relationshipSheetSuggestionCountMatch(needle string, now time.Time) predicate.Relationship {
	n, ok := suggestionCountQuery(needle)
	if !ok {
		return nil
	}
	return relationshipSuggestionCount(n, now)
}

func suggestionCountQuery(needle string) (int, bool) {
	const prefix = "suggestions ("
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, ")") {
		return 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), ")")
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 1 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	return parsed, true
}

func relationshipSuggestionCount(n int, now time.Time) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(")
			writeOverdueCueCount(b, s, now)
			b.WriteString(" + ")
			writeClaimCueCount(b, s, "objection")
			b.WriteString(" + ")
			writeClaimCueCount(b, s, "risk")
			b.WriteString(" + ")
			writeRenewalCueCount(b, s)
			b.WriteString(" + ")
			writeMissingNextCueCount(b, s)
			b.WriteString(" + ")
			writeContradictionCueCount(b, s)
			b.WriteString(") = ")
			b.Arg(n)
		}))
	})
}

func writeOverdueCueCount(b *sql.Builder, s *sql.Selector, now time.Time) {
	b.WriteString("(SELECT COUNT(*) FROM ")
	b.WriteString(commitment.Table)
	b.WriteString(" AS promised WHERE promised.")
	b.WriteString(commitment.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.FieldID))
	b.WriteString(" AND promised.")
	b.WriteString(commitment.FieldStatus)
	b.WriteString(" = 'open' AND promised.")
	b.WriteString(commitment.FieldDueAt)
	b.WriteString(" IS NOT NULL AND promised.")
	b.WriteString(commitment.FieldDueAt)
	b.WriteString(" < ")
	b.Arg(now)
	b.WriteString(")")
}

func writeClaimCueCount(b *sql.Builder, s *sql.Selector, kind string) {
	b.WriteString("(CASE WHEN EXISTS (SELECT 1 FROM (SELECT obs.")
	b.WriteString(relationshipobservation.FieldNormalizedFactsJSON)
	b.WriteString(" FROM ")
	b.WriteString(relationshipobservation.Table)
	b.WriteString(" AS obs WHERE obs.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(s.C(relationship.FieldID))
	b.WriteString(" ORDER BY obs.")
	b.WriteString(relationshipobservation.FieldOccurredAt)
	b.WriteString(" DESC, obs.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(" DESC LIMIT ")
	b.WriteString(strconv.Itoa(intelligenceObservationPage))
	b.WriteString(") AS obs WHERE ")
	writeClaimKindExists(b, s, kind)
	b.WriteString(") THEN 1 ELSE 0 END)")
}

func writeClaimKindExists(b *sql.Builder, s *sql.Selector, kind string) {
	facts := "obs." + relationshipobservation.FieldNormalizedFactsJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_typeof(")
		b.WriteString(facts)
		b.WriteString("::jsonb->'conversation_claims') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(")
		b.WriteString(facts)
		b.WriteString("::jsonb->'conversation_claims') AS claim WHERE claim->>'kind' = ")
	} else {
		b.WriteString("json_valid(")
		b.WriteString(facts)
		b.WriteString(") AND json_type(")
		b.WriteString(facts)
		b.WriteString(", '$.conversation_claims') = 'array' AND EXISTS (SELECT 1 FROM json_each(")
		b.WriteString(facts)
		b.WriteString(", '$.conversation_claims') AS claim WHERE json_extract(claim.value, '$.kind') = ")
	}
	b.Arg(kind)
	b.WriteString(")")
}

func writeRenewalCueCount(b *sql.Builder, s *sql.Selector) {
	b.WriteString("(CASE WHEN ")
	b.WriteString(s.C(relationship.FieldLifecycle))
	b.WriteString(" = 'renewal' THEN 1 ELSE 0 END)")
}

func writeMissingNextCueCount(b *sql.Builder, s *sql.Selector) {
	b.WriteString("(CASE WHEN trim(coalesce(")
	b.WriteString(s.C(relationship.FieldNextAction))
	b.WriteString(", '')) = '' AND ")
	b.WriteString(s.C(relationship.FieldLifecycle))
	b.WriteString(" IN ('evaluation', 'contracting', 'onboarding', 'renewal') THEN 1 ELSE 0 END)")
}

func writeContradictionCueCount(b *sql.Builder, s *sql.Selector) {
	art := conversationintelligenceartifact.Table
	b.WriteString("(SELECT COUNT(*) FROM ")
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
	b.WriteString(") AND ")
	writeContradictionText(b, s, "status")
	b.WriteString(" = 'open' AND ")
	writeContradictionSideCount(b, s)
	b.WriteString(" >= 2)")
}

// The sheet asks for the rest of a list once the first page is full.
// Activity and mail use relationshipActivityPage and
// relationshipCommunicationPage. Changes use 2. Focused review uses the
// observation page.
const relationshipChangePage = 2

// relationshipSheetEarlierPageMatch matches the buttons that load the next
// page. A full first page does not print the button.
func relationshipSheetEarlierPageMatch(needle string) predicate.Relationship {
	switch needle {
	case "show earlier evidence":
		return relationshipRowCountAbove(relationshipobservation.Table, relationshipobservation.RelationshipColumn, intelligenceObservationPage, false)
	case "show earlier activity":
		return relationshipRowCountAbove(relationshipobservation.Table, relationshipobservation.RelationshipColumn, relationshipActivityPage, false)
	case "show earlier mail and meetings":
		return relationshipRowCountAbove(communicationinteraction.Table, communicationinteraction.RelationshipColumn, relationshipCommunicationPage, true)
	case "show earlier changes":
		return relationshipRowCountAbove(relationshipstatesnapshot.Table, relationshipstatesnapshot.RelationshipColumn, relationshipChangePage, false)
	default:
		return nil
	}
}

func relationshipRowCountAbove(table, column string, n int, visibleOnly bool) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(table)
			b.WriteString(" AS counted WHERE counted.")
			b.WriteString(column)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			if visibleOnly {
				b.WriteString(" AND counted.")
				b.WriteString(communicationinteraction.FieldDeleted)
				b.WriteString(" = ")
				b.Arg(false)
			}
			b.WriteString(") > ")
			b.Arg(n)
		}))
	})
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

// relationshipSheetOlderReviewMatch matches "Older conversations may still
// need review." The sheet prints that only when the newest page has no
// review item and another page of conversations is still unloaded. A claim
// or proposed change on that page prints a different sentence.
func relationshipSheetOlderReviewMatch(needle string) predicate.Relationship {
	if needle != "older conversations may still need review" {
		return nil
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			writeOlderReviewEmpty(b, s)
		}))
	})
}

func writeOlderReviewEmpty(b *sql.Builder, s *sql.Selector) {
	obs := relationshipobservation.Table
	rel := s.C(relationship.FieldID)
	b.WriteString("(SELECT COUNT(*) FROM ")
	b.WriteString(obs)
	b.WriteString(" AS counted WHERE counted.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(rel)
	b.WriteString(") > ")
	b.Arg(intelligenceObservationPage)
	b.WriteString(" AND NOT EXISTS (SELECT 1 FROM (SELECT paged_obs.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(" AS id, paged_obs.")
	b.WriteString(relationshipobservation.FieldNormalizedFactsJSON)
	b.WriteString(" AS facts FROM ")
	b.WriteString(obs)
	b.WriteString(" AS paged_obs WHERE paged_obs.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(rel)
	b.WriteString(" ORDER BY paged_obs.")
	b.WriteString(relationshipobservation.FieldOccurredAt)
	b.WriteString(" DESC, paged_obs.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(" DESC LIMIT ")
	b.WriteString(strconv.Itoa(intelligenceObservationPage))
	b.WriteString(") AS paged WHERE ")
	writePagedClaimReview(b, s, rel)
	b.WriteString(" OR ")
	writePagedCandidateReview(b, s, rel)
	b.WriteString(")")
}

func writePagedClaimReview(b *sql.Builder, s *sql.Selector, rel string) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_array_elements(CASE WHEN jsonb_typeof(paged.facts::jsonb->'conversation_claims') = 'array' THEN paged.facts::jsonb->'conversation_claims' ELSE '[]'::jsonb END) AS claim WHERE ")
	} else {
		b.WriteString("json_each(CASE WHEN json_valid(paged.facts) AND json_type(paged.facts, '$.conversation_claims') = 'array' THEN paged.facts ELSE '{\"conversation_claims\":[]}' END, '$.conversation_claims') AS claim WHERE ")
	}
	kind := "claim->>'kind'"
	if s.Dialect() != dialect.Postgres {
		kind = "json_extract(claim.value, '$.kind')"
	}
	confidence := reviewClaimNumber(s, "confidence")
	b.WriteString("((")
	b.WriteString(confidence)
	b.WriteString(" < 0.75 OR (")
	b.WriteString(kind)
	b.WriteString(" = 'stakeholder' AND ")
	b.WriteString(confidence)
	b.WriteString(" < 0.85)) AND NOT ")
	writeReviewCorrectionExists(b, s, rel, "confidence")
	b.WriteString(") OR (")
	writeReviewClaimCondition(b, s, "speaker")
	b.WriteString(" AND NOT ")
	writeReviewCorrectionExists(b, s, rel, "speaker")
	b.WriteString("))")
}

func writePagedCandidateReview(b *sql.Builder, s *sql.Selector, rel string) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("jsonb_array_elements(CASE WHEN jsonb_typeof(paged.facts::jsonb->'conversation_claim_candidates') = 'array' THEN paged.facts::jsonb->'conversation_claim_candidates' ELSE '[]'::jsonb END) AS candidate WHERE NOT ")
	} else {
		b.WriteString("json_each(CASE WHEN json_valid(paged.facts) AND json_type(paged.facts, '$.conversation_claim_candidates') = 'array' THEN paged.facts ELSE '{\"conversation_claim_candidates\":[]}' END, '$.conversation_claim_candidates') AS candidate WHERE NOT ")
	}
	writeCandidateDecisionClosed(b, s, rel)
	b.WriteString(")")
}

func writeReviewCorrectionExists(b *sql.Builder, s *sql.Selector, rel, side string) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(relationshipobservation.Table)
	b.WriteString(" AS corr WHERE corr.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(rel)
	b.WriteString(" AND ")
	writeObservationFactText(b, s, "corr", "review_correction", "observation_id")
	b.WriteString(" = ")
	writePagedObservationID(b, s)
	b.WriteString(" AND ")
	writeObservationFactText(b, s, "corr", "review_correction", "claim_id")
	b.WriteString(" = ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("claim->>'id'")
	} else {
		b.WriteString("json_extract(claim.value, '$.id')")
	}
	b.WriteString(" AND ")
	writeObservationFactText(b, s, "corr", "review_correction", "kind")
	if side == "speaker" {
		b.WriteString(" = ")
		b.Arg("speaker")
	} else {
		b.WriteString(" IN (")
		b.Arg("claim")
		b.WriteString(", ")
		b.Arg("entity")
		b.WriteString(", ")
		b.Arg("word")
		b.WriteString(")")
	}
	b.WriteString(")")
}

func writeCandidateDecisionClosed(b *sql.Builder, s *sql.Selector, rel string) {
	b.WriteString("EXISTS (SELECT 1 FROM (SELECT ")
	writeObservationFactText(b, s, "dec", "review_decision", "kind")
	b.WriteString(" AS kind FROM ")
	b.WriteString(relationshipobservation.Table)
	b.WriteString(" AS dec WHERE dec.")
	b.WriteString(relationshipobservation.RelationshipColumn)
	b.WriteString(" = ")
	b.WriteString(rel)
	b.WriteString(" AND ")
	writeObservationFactText(b, s, "dec", "review_decision", "observation_id")
	b.WriteString(" = ")
	writePagedObservationID(b, s)
	b.WriteString(" AND ")
	writeObservationFactText(b, s, "dec", "review_decision", "candidate_id")
	b.WriteString(" = ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("candidate->>'candidateId'")
	} else {
		b.WriteString("json_extract(candidate.value, '$.candidateId')")
	}
	b.WriteString(" ORDER BY dec.")
	b.WriteString(relationshipobservation.FieldOccurredAt)
	b.WriteString(" DESC, dec.")
	b.WriteString(relationshipobservation.FieldID)
	b.WriteString(" DESC LIMIT 1) AS latest WHERE latest.kind IN (")
	b.Arg("approve")
	b.WriteString(", ")
	b.Arg("correct")
	b.WriteString(", ")
	b.Arg("reject")
	b.WriteString("))")
}

func writePagedObservationID(b *sql.Builder, s *sql.Selector) {
	b.WriteString("paged.id")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("::text")
	}
}

func writeObservationFactText(b *sql.Builder, s *sql.Selector, alias, object, field string) {
	column := alias + "." + relationshipobservation.FieldNormalizedFactsJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString(column)
		b.WriteString("::jsonb->'")
		b.WriteString(object)
		b.WriteString("'->>'")
		b.WriteString(field)
		b.WriteString("'")
		return
	}
	b.WriteString("json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.")
	b.WriteString(object)
	b.WriteString(".")
	b.WriteString(field)
	b.WriteString("')")
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
	if n, ok := governanceReceiptRemainder(needle); ok {
		preds = append(preds, relationshipGovernanceReceiptPageCount(n))
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

// governanceReceiptPage is the first screen of consent receipts. It matches
// GOVERNANCE_RECEIPT_PAGE on the company sheet.
const governanceReceiptPage = 5

func governanceReceiptRemainder(needle string) (int, bool) {
	const prefix = "show the other "
	if !strings.HasPrefix(needle, prefix) {
		return 0, false
	}
	rest := strings.TrimPrefix(needle, prefix)
	singular := strings.HasSuffix(rest, " receipt")
	plural := strings.HasSuffix(rest, " receipts")
	if singular == plural {
		return 0, false
	}
	body := strings.TrimSuffix(rest, " receipts")
	if singular {
		body = strings.TrimSuffix(rest, " receipt")
	}
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 1 || strconv.Itoa(parsed) != body {
		return 0, false
	}
	if singular && parsed != 1 {
		return 0, false
	}
	if plural && parsed < 2 {
		return 0, false
	}
	return governanceReceiptPage + parsed, true
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

// relationshipGovernanceReceiptPageCount counts receipts on the newest
// observation page. That is the list the sheet uses before earlier evidence
// is loaded, which is when the overflow button is printed.
func relationshipGovernanceReceiptPageCount(n int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			obs := relationshipobservation.Table
			b.WriteString("(SELECT COUNT(*) FROM (SELECT CASE WHEN ")
			writeGovernanceText(b, s, "receiptId")
			b.WriteString(" <> '' THEN 1 ELSE 0 END AS has_receipt FROM ")
			b.WriteString(obs)
			b.WriteString(" AS obs WHERE obs.")
			b.WriteString(relationshipobservation.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" ORDER BY obs.")
			b.WriteString(relationshipobservation.FieldOccurredAt)
			b.WriteString(" DESC, obs.")
			b.WriteString(relationshipobservation.FieldID)
			b.WriteString(" DESC LIMIT ")
			b.WriteString(strconv.Itoa(intelligenceObservationPage))
			b.WriteString(") AS page WHERE has_receipt = 1) = ")
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

// relationshipSheetRecommendationBadgeMatch matches the badges on a
// recommendation. Policy reads "Review required", "Re-check needed",
// "Not checked", "Cleared", or "Blocked". A decided recommendation reads
// "Approved" or "Rejected". The corner chip reads "Draft" or "Send".
// Priority reads "High", "Medium", or "Low".
func relationshipSheetRecommendationBadgeMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for _, item := range []struct {
		phrase string
		status string
	}{
		{"review required", PolicyReviewRequired},
		{"re-check needed", PolicyStale},
		{"not checked", PolicyPending},
		{"cleared", PolicyPassed},
		{"blocked", PolicyBlocked},
	} {
		if recommendationBadgePhrase(item.phrase, needle) {
			preds = append(preds, relationship.HasActionsWith(revenueaction.PolicyStatusEQ(item.status)))
		}
	}
	for _, item := range []struct {
		phrase string
		status string
	}{
		{"approved", ApprovalApproved},
		{"rejected", ApprovalRejected},
	} {
		if recommendationBadgePhrase(item.phrase, needle) {
			preds = append(preds, relationship.HasActionsWith(revenueaction.ApprovalStatusEQ(item.status)))
		}
	}
	for _, item := range []struct {
		phrase string
		mode   string
	}{
		{"draft", ExecModeDraft},
		{"send", ExecModeSend},
	} {
		if recommendationBadgePhrase(item.phrase, needle) {
			preds = append(preds, relationship.HasActionsWith(revenueaction.ExecutionModeEQ(item.mode)))
		}
	}
	switch {
	case recommendationBadgePhrase("high", needle):
		preds = append(preds, relationship.HasActionsWith(revenueaction.PriorityScoreGTE(70)))
	case recommendationBadgePhrase("medium", needle):
		preds = append(preds, relationship.HasActionsWith(
			revenueaction.PriorityScoreGTE(40),
			revenueaction.PriorityScoreLT(70),
		))
	case recommendationBadgePhrase("low", needle):
		preds = append(preds, relationship.HasActionsWith(revenueaction.PriorityScoreLT(40)))
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

// recommendationBadgePhrase is the badge, or a longer question that still
// contains a specific badge. "Approved" is also the start of "Approved in
// this workspace", so the short badges match only the word itself.
func recommendationBadgePhrase(phrase, needle string) bool {
	phrase = normalizePersonSearch(phrase)
	needle = normalizePersonSearch(needle)
	if phrase == "" || needle == "" {
		return false
	}
	if needle == phrase {
		return true
	}
	if len(phrase) < 12 {
		return false
	}
	return strings.Contains(needle, phrase)
}

// detectorSearchLabels are the badges on a recommendation. The stored detector
// is a token such as waiting_on_me. The badge says "Waiting on you".
var detectorSearchLabels = []struct {
	phrase   string
	detector string
}{
	{"follow-up due", "requested_follow_up_due"},
	{"unanswered proposal", "unanswered_proposal"},
	{"waiting on you", "waiting_on_me"},
	{"dormant opportunity", "dormant_warm_opportunity"},
	{"neglected referral", "neglected_referral"},
	{"former customer", "former_customer_reconnect"},
	{"conversation action pack", "conversation_action_pack"},
	{"promise due", "commitment_due"},
	{"added by you", "manual"},
}

// relationshipSheetDetectorMatch matches the recommendation badge. A dismissed
// recommendation still shows the badge, so the queue status does not matter.
func relationshipSheetDetectorMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	for _, item := range detectorSearchLabels {
		if !labelPhraseMatches(item.phrase, needle) {
			continue
		}
		preds = append(preds, relationship.HasActionsWith(revenueaction.DetectorEQ(item.detector)))
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

// relationshipAttentionBandMatch is the urgency badge on the attention queue
// and the badge on the company card. High and critical read "At risk", normal
// reads "Watch", and low reads "Stable". The card also reads "Stable" when
// health is healthy, and "Needs you" when health is critical or needs
// attention. A dismissed or snoozed row is off the queue, so it stays out.
func relationshipAttentionBandMatch(needle string) predicate.Relationship {
	switch needle {
	case "at risk":
		return relationship.HasAttentionItemsWith(
			relationshipattentionitem.UrgencyBandIn("high", "critical"),
			relationshipattentionitem.StatusEQ("open"),
		)
	case "watch":
		return relationship.HasAttentionItemsWith(
			relationshipattentionitem.UrgencyBandEQ("normal"),
			relationshipattentionitem.StatusEQ("open"),
		)
	case "stable":
		return relationship.Or(
			relationship.HasAttentionItemsWith(
				relationshipattentionitem.UrgencyBandEQ("low"),
				relationshipattentionitem.StatusEQ("open"),
			),
			relationship.HealthEQ("healthy"),
		)
	case "needs you":
		return relationship.HealthIn("critical", "needs_attention")
	default:
		return nil
	}
}

// relationshipSheetConfirmedMeetingMatch matches the recommendation line
// "You confirmed this follow-up from the meeting." The sheet rewrites a
// stored reason that still names the source evidence path to that sentence.
// Searching the words on the card has to find both.
func relationshipSheetConfirmedMeetingMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("you confirmed this follow-up from the meeting.", needle) {
		return nil
	}
	return relationship.HasActionsWith(predicate.RevenueAction(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(revenueaction.FieldReason)
			b.WriteString("(lower(trim(")
			b.WriteString(column)
			b.WriteString(")) = 'you confirmed this follow-up from the meeting.' OR lower(trim(")
			b.WriteString(column)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(")) ~ '^you confirmed this follow-up from source evidence meeting/.+\\.$')")
				return
			}
			b.WriteString(")) GLOB 'you confirmed this follow-up from source evidence meeting/?*.')")
		}))
	}))
}

// relationshipSheetPromiseBadgeMatch matches the status badge on each promise.
// Kept, Waived, Missed, Cancelled, and Superseded are the stored status.
// Disputed and Review are the acceptance. Open is a confirmed promise that
// is not due inside 72 hours. At risk already has its own search.
func relationshipSheetPromiseBadgeMatch(needle string, now time.Time) predicate.Relationship {
	var preds []predicate.Relationship
	// "Kept" is also a retention word. Only the badge itself, not "no audio was kept".
	if needle == "kept" {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.StatusIn("fulfilled", "met")))
	}
	if needle == "waived" {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.StatusEQ("waived")))
	}
	if needle == "missed" {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.StatusEQ("missed")))
	}
	if needle == "review" {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.And(
			commitment.AcceptanceEQ("candidate"),
			commitment.StatusNotIn("fulfilled", "met", "waived", "missed", "cancelled", "superseded", "disputed"),
		)))
	}
	if needle == "open" {
		preds = append(preds, relationship.HasCommitmentsWith(openTruthCommitment(now)))
	}
	if labelPhraseMatches("cancelled", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.StatusEQ("cancelled")))
	}
	if labelPhraseMatches("superseded", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.StatusEQ("superseded")))
	}
	if labelPhraseMatches("disputed", needle) {
		preds = append(preds, relationship.HasCommitmentsWith(commitment.Or(
			commitment.StatusEQ("disputed"),
			commitment.AcceptanceEQ("disputed"),
		)))
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

// relationshipSheetPromiseDueMatch matches "Due: Oct 3, 2026" on the promise
// card. The day is the UTC day, the same one the sheet prints. A date with
// no "Due:" prefix matches only when the search is that day and nothing else.
func relationshipSheetPromiseDueMatch(needle string) predicate.Relationship {
	start, ok := promiseDueDayStart(needle)
	if !ok {
		return nil
	}
	return relationship.HasCommitmentsWith(commitment.And(
		commitment.DueAtGTE(start),
		commitment.DueAtLT(start.Add(24*time.Hour)),
	))
}

func promiseDueDayStart(needle string) (time.Time, bool) {
	needle = normalizePersonSearch(needle)
	const prefix = "due: "
	if i := strings.LastIndex(needle, prefix); i >= 0 {
		return parseLeadingDueDate(strings.TrimSpace(needle[i+len(prefix):]), true)
	}
	return parseLeadingDueDate(needle, false)
}

func parseLeadingDueDate(rest string, allowTrailing bool) (time.Time, bool) {
	parts := strings.Fields(rest)
	if len(parts) < 3 || (!allowTrailing && len(parts) != 3) {
		return time.Time{}, false
	}
	month, ok := promiseDueMonths[parts[0]]
	if !ok || !strings.HasSuffix(parts[1], ",") {
		return time.Time{}, false
	}
	day, err := strconv.Atoi(strings.TrimSuffix(parts[1], ","))
	if err != nil || day < 1 || day > 31 || parts[1] != strconv.Itoa(day)+"," {
		return time.Time{}, false
	}
	if len(parts[2]) != 4 {
		return time.Time{}, false
	}
	year, err := strconv.Atoi(parts[2])
	if err != nil || year < 1000 {
		return time.Time{}, false
	}
	start := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	if start.Year() != year || start.Month() != month || start.Day() != day {
		return time.Time{}, false
	}
	return start, true
}

var promiseDueMonths = map[string]time.Month{
	"jan": time.January,
	"feb": time.February,
	"mar": time.March,
	"apr": time.April,
	"may": time.May,
	"jun": time.June,
	"jul": time.July,
	"aug": time.August,
	"sep": time.September,
	"oct": time.October,
	"nov": time.November,
	"dec": time.December,
}

// relationshipSheetPromiseOverflowMatch matches "Show the other 1 promise"
// and "Show the other N promises". The overview previews three promises.
// The button counts the rest. Three or fewer prints no button.
func relationshipSheetPromiseOverflowMatch(needle string) predicate.Relationship {
	hidden, ok := promisePreviewHidden(needle)
	if !ok {
		return nil
	}
	return relationshipCommitmentCount(hidden + 3)
}

func promisePreviewHidden(needle string) (int, bool) {
	needle = normalizePersonSearch(needle)
	const singular = "show the other 1 promise"
	if strings.Contains(needle, singular) && !strings.Contains(needle, singular+"s") {
		return 1, true
	}
	const lead = "show the other "
	const tail = " promises"
	index := strings.LastIndex(needle, lead)
	if index < 0 {
		return 0, false
	}
	rest := needle[index+len(lead):]
	end := strings.Index(rest, tail)
	if end < 0 {
		return 0, false
	}
	number := rest[:end]
	if number == "" || strings.Contains(number, " ") {
		return 0, false
	}
	n, err := strconv.Atoi(number)
	if err != nil || n < 2 || strconv.Itoa(n) != number {
		return 0, false
	}
	after := rest[end+len(tail):]
	if after != "" && !strings.HasPrefix(after, " ") {
		return 0, false
	}
	return n, true
}

func relationshipCommitmentCount(n int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT count(*) FROM ")
			b.WriteString(commitment.Table)
			b.WriteString(" WHERE ")
			b.WriteString(commitment.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(") = ")
			b.Arg(n)
		}))
	})
}

// observationFactDirection is the activity line "Direction: We owe them"
// (and the two other sides). The sheet reads commitment_direction only when
// the note has no encrypted payload, and only the three stored tokens.
func observationFactDirection(direction string) predicate.RelationshipObservation {
	return predicate.RelationshipObservation(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			facts := s.C(relationshipobservation.FieldNormalizedFactsJSON)
			payload := s.C(relationshipobservation.FieldPayloadCiphertext)
			b.WriteString("(")
			b.WriteString(payload)
			b.WriteString(" IS NULL OR length(")
			b.WriteString(payload)
			b.WriteString(") = 0) AND ")
			if s.Dialect() == dialect.Postgres {
				b.WriteString("btrim(coalesce(")
				b.WriteString(facts)
				b.WriteString("::jsonb->>'commitment_direction', '')) = ")
			} else {
				b.WriteString("trim(coalesce(json_extract(")
				b.WriteString(facts)
				b.WriteString(", '$.commitment_direction'), '')) = ")
			}
			b.Arg(direction)
		}))
	})
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
	// The promise card says They owe us, We owe them, or We both owe. Opening
	// the activity prints the same words as "Direction: …" from the saved
	// note, even when that note never became a promise row.
	if queryHasPhrase("they owe us", needle) {
		preds = append(preds, relationship.Or(
			relationship.HasCommitmentsWith(commitment.DirectionEQ("promised_by_them")),
			relationship.HasObservationsWith(observationFactDirection("promised_by_them")),
		))
	}
	if queryHasPhrase("we owe them", needle) {
		preds = append(preds, relationship.Or(
			relationship.HasCommitmentsWith(commitment.DirectionEQ("promised_by_me")),
			relationship.HasObservationsWith(observationFactDirection("promised_by_me")),
		))
	}
	if queryHasPhrase("we both owe", needle) {
		preds = append(preds, relationship.Or(
			relationship.HasCommitmentsWith(commitment.DirectionEQ("mutual")),
			relationship.HasObservationsWith(observationFactDirection("mutual")),
		))
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
	return relationshipJSONArrayCount(relationship.FieldRisks, compare, n)
}

func relationshipMilestoneCount(compare string, n int) predicate.Relationship {
	return relationshipJSONArrayCount(relationship.FieldMilestones, compare, n)
}

func relationshipJSONArrayCount(field, compare string, n int) predicate.Relationship {
	if compare != "=" && compare != ">=" && compare != "<>" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(field)
			// A correction that only fills one list stores the other as JSON
			// null. The sheet still prints "None recorded." for that list.
			// jsonb_array_length rejects the null, so a missing list counts as 0.
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf(
					"CASE WHEN jsonb_typeof(%s) = 'array' THEN jsonb_array_length(%s) ELSE 0 END",
					column, column,
				))
			} else {
				b.WriteString(fmt.Sprintf("coalesce(json_array_length(%s), 0)", column))
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

// relationshipSheetMailAccessMatch matches the access line on an email or
// meeting row. The sheet prints that line for the person searching, so the
// same mail is "Your mailbox" for its owner and a different sentence for a
// teammate. A deleted row is not on the timeline.
func relationshipSheetMailAccessMatch(actor uuid.UUID, now time.Time, needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if labelPhraseMatches("your mailbox", needle) {
		preds = append(preds, relationshipMailAccess(actor, now, "mailbox_owner"))
	}
	if needle == "protected" {
		preds = append(preds, relationshipMailAccess(actor, now, "protected"))
	}
	if labelPhraseMatches("kept private", needle) {
		preds = append(preds, relationshipMailAccess(actor, now, "owner_private"))
	}
	if labelPhraseMatches("shared with you", needle) {
		preds = append(preds, relationshipMailAccess(actor, now, "explicit_grant"))
	}
	if labelPhraseMatches("shared in this workspace", needle) {
		preds = append(preds, relationshipMailAccess(actor, now, "owner_default"))
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

func relationshipMailAccess(actor uuid.UUID, now time.Time, reason string) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("EXISTS (SELECT 1 FROM ")
			b.WriteString(communicationinteraction.Table)
			b.WriteString(" AS mail WHERE mail.")
			b.WriteString(communicationinteraction.RelationshipColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			b.WriteString(" AND mail.")
			b.WriteString(communicationinteraction.FieldDeleted)
			b.WriteString(" = ")
			b.Arg(false)
			b.WriteString(" AND ")
			writeMailAccessReason(b, s, actor, now, reason)
			b.WriteString(")")
		}))
	})
}

func writeMailAccessReason(b *sql.Builder, s *sql.Selector, actor uuid.UUID, now time.Time, reason string) {
	switch reason {
	case "mailbox_owner":
		writeMailOwnerIs(b, s, actor, true)
	case "protected":
		writeMailOwnerIs(b, s, actor, false)
		b.WriteString(" AND ")
		writeMailProtected(b, s)
	case "owner_private":
		writeMailOwnerIs(b, s, actor, false)
		b.WriteString(" AND NOT ")
		writeMailProtected(b, s)
		b.WriteString(" AND ")
		writeMailKeptPrivate(b, s)
	case "explicit_grant":
		writeMailTeammateVisible(b, s, actor)
		b.WriteString(" AND ")
		writeMailGrant(b, s, actor, now)
	default:
		writeMailTeammateVisible(b, s, actor)
		b.WriteString(" AND NOT ")
		writeMailGrant(b, s, actor, now)
	}
}

func writeMailTeammateVisible(b *sql.Builder, s *sql.Selector, actor uuid.UUID) {
	writeMailOwnerIs(b, s, actor, false)
	b.WriteString(" AND NOT ")
	writeMailProtected(b, s)
	b.WriteString(" AND NOT ")
	writeMailKeptPrivate(b, s)
}

func writeMailOwnerIs(b *sql.Builder, s *sql.Selector, actor uuid.UUID, owner bool) {
	b.WriteString("mail.")
	b.WriteString(communicationinteraction.OwnerColumn)
	if s.Dialect() == dialect.Postgres {
		b.WriteString("::text")
	}
	if owner {
		b.WriteString(" = ")
	} else {
		b.WriteString(" <> ")
	}
	b.Arg(actor.String())
}

func writeMailProtected(b *sql.Builder, s *sql.Selector) {
	writeMailRuleMatch(b, s, "protected_address", "protected_domain")
}

func writeMailKeptPrivate(b *sql.Builder, s *sql.Selector) {
	b.WriteString("(")
	writeMailRuleMatch(b, s, "blocked_address", "blocked_domain")
	b.WriteString(" OR ")
	writeMailPrivatePolicy(b, s)
	b.WriteString(")")
}

func writeMailRuleMatch(b *sql.Builder, s *sql.Selector, addressKind, domainKind string) {
	email := "lower(trim(person." + communicationparticipant.FieldEmail + "))"
	value := "rule." + communicationprivacyrule.FieldValue
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(communicationprivacyrule.Table)
	b.WriteString(" AS rule, ")
	b.WriteString(communicationparticipant.Table)
	b.WriteString(" AS person WHERE rule.")
	b.WriteString(communicationprivacyrule.FieldActive)
	b.WriteString(" = ")
	b.Arg(true)
	b.WriteString(" AND rule.")
	b.WriteString(communicationprivacyrule.WorkspaceColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.WorkspaceColumn)
	b.WriteString(" AND rule.")
	b.WriteString(communicationprivacyrule.OwnerColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.OwnerColumn)
	b.WriteString(" AND person.")
	b.WriteString(communicationparticipant.InteractionColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.FieldID)
	b.WriteString(" AND ((rule.")
	b.WriteString(communicationprivacyrule.FieldKind)
	b.WriteString(" = ")
	b.Arg(addressKind)
	b.WriteString(" AND ")
	b.WriteString(email)
	b.WriteString(" = ")
	b.WriteString(value)
	b.WriteString(") OR (rule.")
	b.WriteString(communicationprivacyrule.FieldKind)
	b.WriteString(" = ")
	b.Arg(domainKind)
	b.WriteString(" AND length(")
	b.WriteString(email)
	b.WriteString(") > length(")
	b.WriteString(value)
	b.WriteString(") AND substr(")
	b.WriteString(email)
	b.WriteString(", length(")
	b.WriteString(email)
	b.WriteString(") - length(")
	b.WriteString(value)
	b.WriteString("), 1) = '@' AND substr(")
	b.WriteString(email)
	b.WriteString(", length(")
	b.WriteString(email)
	b.WriteString(") - length(")
	b.WriteString(value)
	b.WriteString(") + 1) = ")
	b.WriteString(value)
	b.WriteString(")))")
}

func writeMailPrivatePolicy(b *sql.Builder, s *sql.Selector) {
	b.WriteString("COALESCE((SELECT policy.")
	b.WriteString(communicationprivacypolicy.FieldMetadataVisibility)
	b.WriteString(" FROM ")
	b.WriteString(communicationprivacypolicy.Table)
	b.WriteString(" AS policy WHERE policy.")
	b.WriteString(communicationprivacypolicy.WorkspaceColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.WorkspaceColumn)
	b.WriteString(" AND policy.")
	b.WriteString(communicationprivacypolicy.OwnerColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.OwnerColumn)
	b.WriteString(" AND policy.")
	b.WriteString(communicationprivacypolicy.FieldSourceAccountID)
	b.WriteString(" = lower(trim(mail.")
	b.WriteString(communicationinteraction.FieldSourceAccountID)
	b.WriteString(")) LIMIT 1), (SELECT policy.")
	b.WriteString(communicationprivacypolicy.FieldMetadataVisibility)
	b.WriteString(" FROM ")
	b.WriteString(communicationprivacypolicy.Table)
	b.WriteString(" AS policy WHERE policy.")
	b.WriteString(communicationprivacypolicy.WorkspaceColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.WorkspaceColumn)
	b.WriteString(" AND policy.")
	b.WriteString(communicationprivacypolicy.FieldSourceAccountID)
	b.WriteString(" = ")
	b.Arg(workspaceCommunicationDefaultsAccount)
	b.WriteString(" ORDER BY policy.")
	b.WriteString(communicationprivacypolicy.FieldUpdatedAt)
	b.WriteString(" DESC LIMIT 1), ")
	b.Arg("workspace")
	b.WriteString(") = ")
	b.Arg("private")
}

func writeMailGrant(b *sql.Builder, s *sql.Selector, actor uuid.UUID, now time.Time) {
	b.WriteString("EXISTS (SELECT 1 FROM ")
	b.WriteString(communicationsharegrant.Table)
	b.WriteString(" AS grant_row WHERE grant_row.")
	b.WriteString(communicationsharegrant.WorkspaceColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.WorkspaceColumn)
	b.WriteString(" AND grant_row.")
	b.WriteString(communicationsharegrant.OwnerColumn)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.OwnerColumn)
	b.WriteString(" AND grant_row.")
	b.WriteString(communicationsharegrant.FieldRevokedAt)
	b.WriteString(" IS NULL AND (grant_row.")
	b.WriteString(communicationsharegrant.FieldExpiresAt)
	b.WriteString(" IS NULL OR grant_row.")
	b.WriteString(communicationsharegrant.FieldExpiresAt)
	b.WriteString(" > ")
	b.Arg(now.UTC())
	b.WriteString(") AND (grant_row.")
	b.WriteString(communicationsharegrant.GranteeColumn)
	b.WriteString(" IS NULL OR ")
	if s.Dialect() == dialect.Postgres {
		b.WriteString("grant_row.")
		b.WriteString(communicationsharegrant.GranteeColumn)
		b.WriteString("::text = ")
	} else {
		b.WriteString("grant_row.")
		b.WriteString(communicationsharegrant.GranteeColumn)
		b.WriteString(" = ")
	}
	b.Arg(actor.String())
	b.WriteString(") AND grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceID)
	b.WriteString(" <> '' AND ((grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceType)
	b.WriteString(" = 'message' AND grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceID)
	b.WriteString(" = mail.")
	b.WriteString(communicationinteraction.FieldProviderObjectID)
	b.WriteString(") OR (grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceType)
	b.WriteString(" = 'thread' AND grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceID)
	b.WriteString(" = ")
	writeMailThreadID(b, s)
	b.WriteString(") OR (grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceType)
	b.WriteString(" = 'relationship' AND grant_row.")
	b.WriteString(communicationsharegrant.FieldResourceID)
	b.WriteString(" = ")
	b.WriteString("mail.")
	b.WriteString(communicationinteraction.RelationshipColumn)
	if s.Dialect() == dialect.Postgres {
		b.WriteString("::text")
	}
	b.WriteString(")))")
}

func writeMailThreadID(b *sql.Builder, s *sql.Selector) {
	column := "mail." + communicationinteraction.FieldMetadataJSON
	if s.Dialect() == dialect.Postgres {
		b.WriteString("COALESCE(")
		b.WriteString(column)
		b.WriteString("::jsonb->>'threadId', '')")
		return
	}
	b.WriteString("COALESCE(json_extract(")
	b.WriteString(column)
	b.WriteString(", '$.threadId'), '')")
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

// relationshipSheetNoneRecordedMatch matches "None recorded." Risks,
// milestones, and the people section each print that line when the list
// is empty. A company that has a risk, a milestone, and a person does not.
func relationshipSheetNoneRecordedMatch(needle string) predicate.Relationship {
	if !labelPhraseMatches("none recorded.", needle) {
		return nil
	}
	return relationship.Or(
		relationshipRiskCount("=", 0),
		relationshipMilestoneCount("=", 0),
		relationshipParticipantCount("=", 0),
	)
}

// sheetEmptySentenceOwnsActivity is true when the query is an empty-sheet
// sentence that happens to contain an activity heading. "recorded" and
// "calendar" are those headings.
func sheetEmptySentenceOwnsActivity(needle string) bool {
	for _, phrase := range []string{
		"no gmail or calendar events yet.",
		"nothing recorded yet.",
		"no commitments recorded for this company yet.",
		"none recorded.",
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

// The sheet asks for 50 activity rows and 50 mail or meeting rows. A longer
// history prints (50+) and Show earlier until the rest of the rows are loaded.
const (
	relationshipActivityPage      = 50
	relationshipCommunicationPage = 50
)

// relationshipSheetTimelineHeadingMatch matches Activity history and Email &
// meeting timeline. A deleted mail record is not on the timeline. Show earlier
// is the first page when more than 50 rows exist.
func relationshipSheetTimelineHeadingMatch(needle string) predicate.Relationship {
	if labelPhraseMatches("show earlier activity", needle) {
		return relationshipObservationCount(">", relationshipActivityPage)
	}
	if labelPhraseMatches("show earlier mail and meetings", needle) {
		return relationshipVisibleCommunicationCount(">", relationshipCommunicationPage)
	}
	if compare, n, ok := countedSheetHeading(needle, "activity history (", relationshipActivityPage); ok {
		return relationshipObservationCount(compare, n)
	}
	if compare, n, ok := countedSheetHeading(needle, "email & meeting timeline (", relationshipCommunicationPage); ok {
		return relationshipVisibleCommunicationCount(compare, n)
	}
	return nil
}

func countedSheetHeading(needle, prefix string, page int) (compare string, n int, ok bool) {
	if !strings.HasPrefix(needle, prefix) || !strings.HasSuffix(needle, ")") {
		return "", 0, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(needle, prefix), ")")
	overflow := strings.HasSuffix(body, "+")
	body = strings.TrimSuffix(body, "+")
	parsed, err := strconv.Atoi(body)
	if err != nil || parsed < 0 || strconv.Itoa(parsed) != body {
		return "", 0, false
	}
	if overflow {
		if parsed != page {
			return "", 0, false
		}
		return ">", page, true
	}
	return "=", parsed, true
}

func relationshipObservationCount(compare string, n int) predicate.Relationship {
	return relationshipRowCount(relationshipobservation.Table, relationshipobservation.RelationshipColumn, compare, n, false)
}

func relationshipVisibleCommunicationCount(compare string, n int) predicate.Relationship {
	return relationshipRowCount(communicationinteraction.Table, communicationinteraction.RelationshipColumn, compare, n, true)
}

func relationshipRowCount(table, column, compare string, n int, visibleOnly bool) predicate.Relationship {
	if compare != "=" && compare != ">" {
		compare = "="
	}
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(table)
			b.WriteString(" AS counted WHERE counted.")
			b.WriteString(column)
			b.WriteString(" = ")
			b.WriteString(s.C(relationship.FieldID))
			if visibleOnly {
				b.WriteString(" AND counted.")
				b.WriteString(communicationinteraction.FieldDeleted)
				b.WriteString(" = ")
				b.Arg(false)
			}
			b.WriteString(") ")
			b.WriteString(compare)
			b.WriteString(" ")
			b.Arg(n)
		}))
	})
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

// relationshipSheetDuplicateLineMatch matches the duplicate card on the
// company sheet. The badge is "1 supporting detail · 80% match". The line
// under the two names is "Matched on Email from Gmail: ada@northwind.example"
// or "Matched on Domain: not shown" when the shared value is hidden.
func relationshipSheetDuplicateLineMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if details, percent, ok := duplicateMatchBadge(needle); ok {
		preds = append(preds, relationshipShowsDuplicateBadge(details, percent))
	}
	if kind, provider, preview, ok := duplicateMatchLine(needle); ok {
		preds = append(preds, relationshipShowsDuplicateAnchor(kind, provider, preview))
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

func duplicateMatchBadge(needle string) (details, percent int, ok bool) {
	text := normalizePersonSearch(needle)
	const marker = " supporting "
	index := strings.Index(text, marker)
	if index < 0 {
		return 0, 0, false
	}
	start := index
	for start > 0 && text[start-1] >= '0' && text[start-1] <= '9' {
		start--
	}
	if start == index || (start > 0 && text[start-1] != ' ') {
		return 0, 0, false
	}
	details, err := strconv.Atoi(text[start:index])
	if err != nil || details < 0 || details > 500 {
		return 0, 0, false
	}
	rest := text[index+len(marker):]
	word := "details"
	if details == 1 {
		word = "detail"
	}
	prefix := word + " · "
	if !strings.HasPrefix(rest, prefix) {
		return 0, 0, false
	}
	rest = rest[len(prefix):]
	end := 0
	for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0, 0, false
	}
	percent, err = strconv.Atoi(rest[:end])
	if err != nil || percent < 0 || percent > 100 || !strings.HasPrefix(rest[end:], "% match") {
		return 0, 0, false
	}
	return details, percent, true
}

func duplicateMatchLine(needle string) (kind, provider, preview string, ok bool) {
	text := normalizePersonSearch(needle)
	const prefix = "matched on "
	index := strings.Index(text, prefix)
	if index < 0 {
		return "", "", "", false
	}
	rest := text[index+len(prefix):]
	colon := strings.Index(rest, ":")
	if colon < 0 {
		return "", "", "", false
	}
	kind, provider, ok = duplicateMatchHead(strings.TrimSpace(rest[:colon]))
	if !ok {
		return "", "", "", false
	}
	preview = strings.TrimRight(strings.TrimSpace(rest[colon+1:]), ".,;?")
	if preview == "" {
		return "", "", "", false
	}
	return kind, provider, preview, true
}

func duplicateMatchHead(head string) (kind, provider string, ok bool) {
	kinds := []struct{ label, stored string }{
		{"a linked record", "resource_ref"},
		{"email", "email"},
		{"domain", "domain"},
	}
	for _, item := range kinds {
		if head == item.label {
			return item.stored, "", true
		}
		from := item.label + " from "
		if !strings.HasPrefix(head, from) {
			continue
		}
		source, known := identityProviderFromLabel(strings.TrimSpace(head[len(from):]))
		if !known {
			return "", "", false
		}
		return item.stored, source, true
	}
	return "", "", false
}

func identityProviderFromLabel(label string) (string, bool) {
	for _, item := range []struct{ label, source string }{
		{"a connected app", "composio"},
		{"a voice note", "voice_note"},
		{"added by you", "user"},
		{"the browser", "browser"},
		{"a meeting", "meeting"},
		{"the web", "web"},
		{"the crm", "crm"},
		{"hubspot", "hubspot"},
		{"calendar", "calendar"},
		{"google", "google"},
		{"gmail", "gmail"},
		{"slack", "slack"},
		{"a note", "desktop_note"},
	} {
		if label == item.label {
			return item.source, true
		}
	}
	return "", false
}

func relationshipShowsDuplicateBadge(details, percent int) predicate.Relationship {
	return relationshipEitherIdentityCandidate(
		sheetVisibleIdentityCandidate(),
		relationshipidentitycandidate.EvidenceCountEQ(details),
		identityConfidencePercent(percent),
	)
}

func relationshipShowsDuplicateAnchor(kind, provider, preview string) predicate.Relationship {
	preds := []predicate.RelationshipIdentityCandidate{
		sheetVisibleIdentityCandidate(),
		relationshipidentitycandidate.AnchorKindEQ(kind),
		identityPreviewEquals(preview),
	}
	if provider == "" {
		preds = append(preds, identityProviderBlank())
	} else {
		preds = append(preds, relationshipidentitycandidate.AnchorProviderEqualFold(provider))
	}
	return relationshipEitherIdentityCandidate(preds...)
}

func sheetVisibleIdentityCandidate() predicate.RelationshipIdentityCandidate {
	return relationshipidentitycandidate.StatusIn("pending", "deferred", "resolved")
}

func relationshipEitherIdentityCandidate(preds ...predicate.RelationshipIdentityCandidate) predicate.Relationship {
	match := relationshipidentitycandidate.And(preds...)
	return relationship.Or(
		relationship.HasProposedIdentityCandidatesWith(match),
		relationship.HasExistingIdentityCandidatesWith(match),
	)
}

func identityConfidencePercent(percent int) predicate.RelationshipIdentityCandidate {
	return predicate.RelationshipIdentityCandidate(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationshipidentitycandidate.FieldConfidence)
			// The badge is Math.round(confidence * 100). Postgres round() takes
			// numeric; SQLite round() takes the stored real.
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("CAST(ROUND((%s)::numeric * 100) AS INTEGER) = ", column))
			} else {
				b.WriteString(fmt.Sprintf("CAST(ROUND(%s * 100) AS INTEGER) = ", column))
			}
			b.Arg(percent)
		}))
	})
}

func identityProviderBlank() predicate.RelationshipIdentityCandidate {
	return predicate.RelationshipIdentityCandidate(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"trim(coalesce(%s, '')) = ''",
				s.C(relationshipidentitycandidate.FieldAnchorProvider),
			))
		}))
	})
}

func identityPreviewEquals(preview string) predicate.RelationshipIdentityCandidate {
	return predicate.RelationshipIdentityCandidate(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(relationshipidentitycandidate.FieldAnchorPreview)
			if preview == "not shown" {
				b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", column))
				return
			}
			b.WriteString(fmt.Sprintf(
				"lower(replace(replace(replace(trim(coalesce(%s, '')), '-', ' '), '_', ' '), '.', ' ')) = ",
				column,
			))
			b.Arg(preview)
		}))
	})
}

// relationshipSheetDuplicateInboxMatch matches the duplicate inbox on the
// company sheet. The heading is "Review possible duplicates". The line under
// it is "1 possible duplicate cannot receive actions until reviewed." The
// card names the pair as "Lumen Packet may match Harbor Ledger".
func relationshipSheetDuplicateInboxMatch(needle string) predicate.Relationship {
	var preds []predicate.Relationship
	if labelPhraseMatches("review possible duplicates", needle) || labelPhraseMatches("needs your review", needle) {
		preds = append(preds, relationshipVisibleDuplicateCountAtLeast(1))
	}
	if count, more, ok := duplicateInboxSentence(needle); ok {
		if more {
			preds = append(preds, relationshipVisibleDuplicateCountAtLeast(count+1))
		} else {
			preds = append(preds, relationshipVisibleDuplicateCount(count))
		}
	}
	if proposed, existing, ok := duplicateMayMatchNames(needle); ok {
		preds = append(preds, relationshipDuplicateNamePair(proposed, existing))
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

func duplicateInboxSentence(needle string) (count int, more bool, ok bool) {
	text := normalizePersonSearch(needle)
	const tail = " cannot receive actions until reviewed"
	index := strings.Index(text, tail)
	if index < 0 || strings.TrimRight(text[index+len(tail):], ".,;?") != "" {
		return 0, false, false
	}
	const marker = " possible duplicate"
	at := strings.LastIndex(text[:index], marker)
	if at < 0 {
		return 0, false, false
	}
	plural := text[at+len(marker):index] == "s"
	if text[at+len(marker):index] != "" && !plural {
		return 0, false, false
	}
	number := text[:at]
	if space := strings.LastIndex(number, " "); space >= 0 {
		number = number[space+1:]
	}
	more = strings.HasSuffix(number, "+")
	if more {
		number = strings.TrimSuffix(number, "+")
	}
	count, err := strconv.Atoi(number)
	if err != nil || count < 1 || count > 500 {
		return 0, false, false
	}
	if count == 1 && plural {
		return 0, false, false
	}
	if count != 1 && !plural {
		return 0, false, false
	}
	return count, more, true
}

func duplicateMayMatchNames(needle string) (proposed, existing string, ok bool) {
	text := normalizePersonSearch(needle)
	const marker = " may match "
	index := strings.Index(text, marker)
	if index <= 0 {
		return "", "", false
	}
	proposed = strings.TrimSpace(text[:index])
	existing = strings.TrimRight(strings.TrimSpace(text[index+len(marker):]), ".,;?")
	if proposed == "" || existing == "" || strings.Contains(existing, " may match ") {
		return "", "", false
	}
	return proposed, existing, true
}

func relationshipDuplicateNamePair(proposed, existing string) predicate.Relationship {
	visible := relationshipidentitycandidate.StatusIn(identityPending, identityDeferred, identityResolved)
	return relationship.Or(
		relationship.And(
			relationshipPrintedNameEquals(proposed),
			relationship.HasProposedIdentityCandidatesWith(
				visible,
				relationshipidentitycandidate.HasExistingRelationshipWith(relationshipPrintedNameEquals(existing)),
			),
		),
		relationship.And(
			relationshipPrintedNameEquals(existing),
			relationship.HasExistingIdentityCandidatesWith(
				visible,
				relationshipidentitycandidate.HasProposedRelationshipWith(relationshipPrintedNameEquals(proposed)),
			),
		),
	)
}

func relationshipVisibleDuplicateCount(count int) predicate.Relationship {
	return relationshipVisibleDuplicateCountOp("=", count)
}

func relationshipVisibleDuplicateCountAtLeast(count int) predicate.Relationship {
	return relationshipVisibleDuplicateCountOp(">=", count)
}

func relationshipVisibleDuplicateCountOp(op string, count int) predicate.Relationship {
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT count(*) FROM ")
			b.WriteString(relationshipidentitycandidate.Table)
			b.WriteString(" WHERE ")
			b.WriteString(relationshipidentitycandidate.FieldStatus)
			b.WriteString(fmt.Sprintf(
				" IN ('%s', '%s', '%s') AND (%s = %s OR %s = %s)) %s ",
				identityPending,
				identityDeferred,
				identityResolved,
				relationshipidentitycandidate.ProposedRelationshipColumn,
				s.C(relationship.FieldID),
				relationshipidentitycandidate.ExistingRelationshipColumn,
				s.C(relationship.FieldID),
				op,
			))
			b.Arg(count)
		}))
	})
}

// relationshipPrintedNameEquals matches the name the company sheet prints.
// A blank name, a name that is the domain, or an email-shaped name uses the
// domain's title. Anything else stays the typed name.
func relationshipPrintedNameEquals(name string) predicate.Relationship {
	want := normalizePersonSearch(name)
	return predicate.Relationship(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			display := s.C(relationship.FieldDisplayName)
			domain := s.C(relationship.FieldAccountDomain)
			title := domainHostLabelSQL(s.Dialect(), domain)
			shown := normalizedColumnSQL(display)
			b.WriteString("CASE WHEN trim(coalesce(")
			b.WriteString(domain)
			b.WriteString(", '')) <> '' AND ")
			b.WriteString(title)
			b.WriteString(" <> '' AND (trim(coalesce(")
			b.WriteString(display)
			b.WriteString(", '')) = '' OR lower(trim(")
			b.WriteString(display)
			b.WriteString(")) = lower(trim(")
			b.WriteString(domain)
			b.WriteString(")) OR (trim(")
			b.WriteString(display)
			b.WriteString(") NOT LIKE '% %' AND trim(")
			b.WriteString(display)
			b.WriteString(") LIKE '%@%.%')) THEN ")
			b.WriteString(title)
			b.WriteString(" WHEN ")
			b.WriteString(shown)
			b.WriteString(" <> '' THEN ")
			b.WriteString(shown)
			b.WriteString(" ELSE 'unknown company' END = ")
			b.Arg(want)
		}))
	})
}

func normalizedColumnSQL(column string) string {
	return collapseSpacesSQL(fmt.Sprintf(
		"lower(replace(replace(replace(trim(coalesce(%s, '')), '-', ' '), '_', ' '), '.', ' '))",
		column,
	))
}

func domainHostLabelSQL(dialectName, column string) string {
	var host string
	if dialectName == dialect.Postgres {
		host = fmt.Sprintf("split_part(trim(coalesce(%s, '')), '.', 1)", column)
	} else {
		host = fmt.Sprintf(
			"CASE WHEN instr(trim(coalesce(%s, '')), '.') = 0 THEN trim(coalesce(%s, '')) ELSE substr(trim(coalesce(%s, '')), 1, instr(trim(coalesce(%s, '')), '.') - 1) END",
			column, column, column, column,
		)
	}
	return collapseSpacesSQL(fmt.Sprintf("lower(replace(replace(%s, '-', ' '), '_', ' '))", host))
}

func collapseSpacesSQL(expr string) string {
	for i := 0; i < 3; i++ {
		expr = fmt.Sprintf("replace(%s, '  ', ' ')", expr)
	}
	return expr
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

// relationshipSheetGmailLinkedMatch matches the mission-control paragraph.
// It prints "1 Gmail thread is linked" or "N Gmail threads are linked", then
// "Health and status still need a clearer source." A supported account detail
// replaces that paragraph, and a company with no Gmail thread does not say it.
func relationshipSheetGmailLinkedMatch(needle string) predicate.Relationship {
	unsupported := relationshipSupportedDetailCount(0, time.Now())
	if n, ok := gmailLinkedThreadCount(needle); ok {
		return relationship.And(relationshipMailThreadCount("=", n), unsupported)
	}
	switch {
	case labelPhraseMatches("health and status still need a clearer source.", needle):
		return relationship.And(relationshipMailThreadCount("<>", 0), unsupported)
	case strings.Contains(normalizePersonSearch(needle), "gmail threads are linked"):
		return relationship.And(relationshipMailThreadCount(">=", 2), unsupported)
	case labelPhraseMatches("gmail thread is linked", needle):
		return relationship.And(relationshipMailThreadCount("=", 1), unsupported)
	default:
		return nil
	}
}

func gmailLinkedThreadCount(needle string) (int, bool) {
	text := normalizePersonSearch(needle)
	const singular = "1 gmail thread is linked"
	const plural = " gmail threads are linked"
	if strings.Contains(text, singular) && !strings.Contains(text, strings.TrimPrefix(plural, " ")) {
		return 1, true
	}
	index := strings.Index(text, plural)
	if index < 0 {
		return 0, false
	}
	prefix := strings.TrimSpace(text[:index])
	fields := strings.Fields(prefix)
	if len(fields) == 0 {
		return 0, false
	}
	n, err := strconv.Atoi(fields[len(fields)-1])
	if err != nil || n < 2 {
		return 0, false
	}
	return n, true
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
	if compare != "=" && compare != "<>" && compare != ">=" {
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
