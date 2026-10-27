package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"github.com/google/uuid"

	"github.com/PlaybookMediaLLC/oppulence/server/ent"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/actionoutcome"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/agentdefinition"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/agentdefinitionhistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/billingretention"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/commitment"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/commitmentdependency"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/commitmentevent"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/conversationintelligenceartifact"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/deletedidentity"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/entity"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/entityidentifier"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/entityresourceref"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/llmusage"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/llmusagehistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/mcpconnection"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/mcpconnectionhistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/oauthconnection"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/oauthconnectionhistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/person"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/personattribute"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/personidentity"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/personmergecandidate"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/personsuppression"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/policydecisionsnapshot"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationship"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipassertion"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipattentionitem"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipidentity"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipidentitycandidate"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipidentitydecision"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshiplineageevent"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipobservation"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipparticipant"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipprojectionjob"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipreviewacknowledgement"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipsourcestatus"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/relationshipstatesnapshot"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueaction"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueactionrevision"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueevidence"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueleakscan"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueoutboxevent"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenuetrustevent"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueworkspace"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/revenueworkspacemember"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/subscription"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/subscriptionhistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/tenantevidencekey"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/user"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/userhistory"
	"github.com/PlaybookMediaLLC/oppulence/server/ent/workspacefeaturecontrol"
	"github.com/PlaybookMediaLLC/oppulence/server/internal/auth"
)

// WorkspaceTransfer gives a shared workspace to a new owner during account
// deletion, so the other members keep their data.
type WorkspaceTransfer struct {
	WorkspaceID uuid.UUID
	SuccessorID uuid.UUID
}

// ErrWorkspaceTransferConflict means that a workspace owner or the chosen
// successor changed between planning and deleting the account.
var ErrWorkspaceTransferConflict = errors.New("db: workspace transfer target changed")

// ErrAccountNotFound means that the user row was already gone.
var ErrAccountNotFound = errors.New("db: account not found")

// workspaceAuthoredTable is a workspace-scoped table whose user column records
// the author. In a workspace that survives the deletion, the author's rows move
// to the workspace owner instead of cascading away with the author.
type workspaceAuthoredTable struct {
	typ             string
	table           string
	userColumn      string
	workspaceColumn string
	// uniqueWith holds the other columns of a unique index that includes the
	// user column. A row that would collide with a row of the new owner is
	// not moved, and the cascade deletes it.
	uniqueWith []string
}

var workspaceAuthoredTables = []workspaceAuthoredTable{
	{typ: ent.TypeRevenueLeakScan, table: revenueleakscan.Table, userColumn: revenueleakscan.UserColumn, workspaceColumn: revenueleakscan.WorkspaceColumn},
	{typ: ent.TypeRelationship, table: relationship.Table, userColumn: relationship.UserColumn, workspaceColumn: relationship.WorkspaceColumn},
	{typ: ent.TypeRelationshipAttentionItem, table: relationshipattentionitem.Table, userColumn: relationshipattentionitem.UserColumn, workspaceColumn: relationshipattentionitem.WorkspaceColumn},
	{typ: ent.TypeRelationshipParticipant, table: relationshipparticipant.Table, userColumn: relationshipparticipant.UserColumn, workspaceColumn: relationshipparticipant.WorkspaceColumn},
	{typ: ent.TypeRelationshipIdentity, table: relationshipidentity.Table, userColumn: relationshipidentity.UserColumn, workspaceColumn: relationshipidentity.WorkspaceColumn},
	{typ: ent.TypeRelationshipIdentityCandidate, table: relationshipidentitycandidate.Table, userColumn: relationshipidentitycandidate.UserColumn, workspaceColumn: relationshipidentitycandidate.WorkspaceColumn},
	{typ: ent.TypeRelationshipIdentityDecision, table: relationshipidentitydecision.Table, userColumn: relationshipidentitydecision.UserColumn, workspaceColumn: relationshipidentitydecision.WorkspaceColumn},
	{typ: ent.TypeRelationshipLineageEvent, table: relationshiplineageevent.Table, userColumn: relationshiplineageevent.UserColumn, workspaceColumn: relationshiplineageevent.WorkspaceColumn},
	{typ: ent.TypeRelationshipObservation, table: relationshipobservation.Table, userColumn: relationshipobservation.UserColumn, workspaceColumn: relationshipobservation.WorkspaceColumn},
	{typ: ent.TypeRelationshipAssertion, table: relationshipassertion.Table, userColumn: relationshipassertion.UserColumn, workspaceColumn: relationshipassertion.WorkspaceColumn},
	{typ: ent.TypeRelationshipProjectionJob, table: relationshipprojectionjob.Table, userColumn: relationshipprojectionjob.UserColumn, workspaceColumn: relationshipprojectionjob.WorkspaceColumn},
	// Unique index: (state_version, relationship_id, user_relationship_review_acknowledgements).
	{typ: ent.TypeRelationshipReviewAcknowledgement, table: relationshipreviewacknowledgement.Table, userColumn: relationshipreviewacknowledgement.UserColumn, workspaceColumn: relationshipreviewacknowledgement.WorkspaceColumn, uniqueWith: []string{"state_version", "relationship_id"}},
	{typ: ent.TypeRelationshipStateSnapshot, table: relationshipstatesnapshot.Table, userColumn: relationshipstatesnapshot.UserColumn, workspaceColumn: relationshipstatesnapshot.WorkspaceColumn},
	{typ: ent.TypeRelationshipSourceStatus, table: relationshipsourcestatus.Table, userColumn: relationshipsourcestatus.UserColumn, workspaceColumn: relationshipsourcestatus.WorkspaceColumn},
	{typ: ent.TypeRevenueEvidence, table: revenueevidence.Table, userColumn: revenueevidence.UserColumn, workspaceColumn: revenueevidence.WorkspaceColumn},
	{typ: ent.TypeCommitment, table: commitment.Table, userColumn: commitment.UserColumn, workspaceColumn: commitment.WorkspaceColumn},
	{typ: ent.TypeCommitmentEvent, table: commitmentevent.Table, userColumn: commitmentevent.UserColumn, workspaceColumn: commitmentevent.WorkspaceColumn},
	{typ: ent.TypeCommitmentDependency, table: commitmentdependency.Table, userColumn: commitmentdependency.UserColumn, workspaceColumn: commitmentdependency.WorkspaceColumn},
	{typ: ent.TypeConversationIntelligenceArtifact, table: conversationintelligenceartifact.Table, userColumn: conversationintelligenceartifact.UserColumn, workspaceColumn: conversationintelligenceartifact.WorkspaceColumn},
	{typ: ent.TypeRevenueAction, table: revenueaction.Table, userColumn: revenueaction.UserColumn, workspaceColumn: revenueaction.WorkspaceColumn},
	{typ: ent.TypePolicyDecisionSnapshot, table: policydecisionsnapshot.Table, userColumn: policydecisionsnapshot.UserColumn, workspaceColumn: policydecisionsnapshot.WorkspaceColumn},
	{typ: ent.TypeActionOutcome, table: actionoutcome.Table, userColumn: actionoutcome.UserColumn, workspaceColumn: actionoutcome.WorkspaceColumn},
	{typ: ent.TypeRevenueOutboxEvent, table: revenueoutboxevent.Table, userColumn: revenueoutboxevent.UserColumn, workspaceColumn: revenueoutboxevent.WorkspaceColumn},
	{typ: ent.TypeTenantEvidenceKey, table: tenantevidencekey.Table, userColumn: tenantevidencekey.UserColumn, workspaceColumn: tenantevidencekey.WorkspaceColumn},
	{typ: ent.TypeWorkspaceFeatureControl, table: workspacefeaturecontrol.Table, userColumn: workspacefeaturecontrol.UserColumn, workspaceColumn: workspacefeaturecontrol.WorkspaceColumn},
	{typ: ent.TypeRevenueTrustEvent, table: revenuetrustevent.Table, userColumn: revenuetrustevent.UserColumn, workspaceColumn: revenuetrustevent.WorkspaceColumn},
	{typ: ent.TypePerson, table: person.Table, userColumn: person.UserColumn, workspaceColumn: person.WorkspaceColumn},
	{typ: ent.TypePersonIdentity, table: personidentity.Table, userColumn: personidentity.UserColumn, workspaceColumn: personidentity.WorkspaceColumn},
	{typ: ent.TypePersonSuppression, table: personsuppression.Table, userColumn: personsuppression.UserColumn, workspaceColumn: personsuppression.WorkspaceColumn},
	{typ: ent.TypePersonAttribute, table: personattribute.Table, userColumn: personattribute.UserColumn, workspaceColumn: personattribute.WorkspaceColumn},
	{typ: ent.TypePersonMergeCandidate, table: personmergecandidate.Table, userColumn: personmergecandidate.UserColumn, workspaceColumn: personmergecandidate.WorkspaceColumn},
	{typ: ent.TypeEntity, table: entity.Table, userColumn: entity.UserColumn, workspaceColumn: entity.WorkspaceColumn},
	{typ: ent.TypeEntityResourceRef, table: entityresourceref.Table, userColumn: entityresourceref.UserColumn, workspaceColumn: entityresourceref.WorkspaceColumn},
	{typ: ent.TypeEntityIdentifier, table: entityidentifier.Table, userColumn: entityidentifier.UserColumn, workspaceColumn: entityidentifier.WorkspaceColumn},
}

// historyTables have no foreign key to their source table, so the cascade
// does not reach them. Their rows are removed through the source rows.
var historyTables = []struct {
	history    string
	source     string
	userColumn string
}{
	{subscriptionhistory.Table, subscription.Table, subscription.UserColumn},
	{llmusagehistory.Table, llmusage.Table, llmusage.UserColumn},
	{mcpconnectionhistory.Table, mcpconnection.Table, mcpconnection.UserColumn},
	{oauthconnectionhistory.Table, oauthconnection.Table, oauthconnection.UserColumn},
	{agentdefinitionhistory.Table, agentdefinition.Table, agentdefinition.UserColumn},
}

// DeleteAccount removes the user and everything the user owns in one
// transaction. It runs as raw SQL: user edges are immutable in Ent, the ORM
// rejects deletes of append-only records, and ON DELETE CASCADE does the rest.
//
// The order is important:
//  1. Shared workspaces move to their successors.
//  2. In every workspace that survives, the user's authored rows move to the
//     workspace owner, so the cascade does not delete shared data.
//  3. History rows go while their source rows still identify the user.
//  4. Subscription facts the privacy policy keeps for tax and disputes are
//     copied into billing_retentions. That table has no user foreign key.
//  5. The user row goes, and the database cascades the delete.
//  6. The user's own history rows go (they hold the email).
//  7. A tombstone records the deleted identity, so a token issued before the
//     deletion cannot create the account again.
func (d *DB) DeleteAccount(ctx context.Context, userID uuid.UUID, transfers []WorkspaceTransfer) error {
	tx, err := d.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	exec := func(query string, args ...any) (int64, error) {
		result, err := tx.ExecContext(ctx, d.rebind(query), args...)
		if err != nil {
			return 0, err
		}
		return result.RowsAffected()
	}

	ws, wsOwner, wsID := revenueworkspace.Table, revenueworkspace.UserColumn, revenueworkspace.FieldID
	for _, t := range transfers {
		// Identifiers come only from generated constants, never from input.
		n, err := exec(fmt.Sprintf(`UPDATE "%s" SET "%s" = ? WHERE "%s" = ? AND "%s" = ?`, ws, wsOwner, wsID, wsOwner), t.SuccessorID, t.WorkspaceID, userID) // #nosec G201
		if err != nil {
			return fmt.Errorf("transfer workspace %s: %w", t.WorkspaceID, err)
		}
		if n != 1 {
			return ErrWorkspaceTransferConflict
		}
		n, err = exec(fmt.Sprintf(`UPDATE "%s" SET "%s" = 'owner' WHERE "%s" = ? AND "%s" = ? AND "%s" = 'active'`,
			revenueworkspacemember.Table, revenueworkspacemember.FieldRole, revenueworkspacemember.WorkspaceColumn,
			revenueworkspacemember.UserColumn, revenueworkspacemember.FieldStatus), t.WorkspaceID, t.SuccessorID) // #nosec G201
		if err != nil {
			return fmt.Errorf("promote successor in workspace %s: %w", t.WorkspaceID, err)
		}
		if n != 1 {
			return ErrWorkspaceTransferConflict
		}
	}

	for _, t := range workspaceAuthoredTables {
		ownerOfRow := fmt.Sprintf(`(SELECT w."%s" FROM "%s" w WHERE w."%s" = "%s"."%s")`, wsOwner, ws, wsID, t.table, t.workspaceColumn)
		query := fmt.Sprintf(`UPDATE "%s" SET "%s" = %s WHERE "%s" = ? AND "%s" IN (SELECT "%s" FROM "%s" WHERE "%s" <> ?)`,
			t.table, t.userColumn, ownerOfRow, t.userColumn, t.workspaceColumn, wsID, ws, wsOwner) // #nosec G201
		if len(t.uniqueWith) > 0 {
			same := make([]string, 0, len(t.uniqueWith))
			for _, column := range t.uniqueWith {
				same = append(same, fmt.Sprintf(`o."%s" = "%s"."%s"`, column, t.table, column))
			}
			query += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "%s" o WHERE o."%s" = %s AND %s)`,
				t.table, t.userColumn, ownerOfRow, strings.Join(same, " AND ")) // #nosec G201
		}
		if _, err := exec(query, userID, userID); err != nil {
			return fmt.Errorf("reassign %s: %w", t.table, err)
		}
	}

	// Revisions are scoped through their action, not through a workspace column.
	revisions, actions := revenueactionrevision.Table, revenueaction.Table
	actionOwner := fmt.Sprintf(`SELECT w."%s" FROM "%s" a JOIN "%s" w ON w."%s" = a."%s" WHERE a."%s" = "%s"."%s"`,
		wsOwner, actions, ws, wsID, revenueaction.WorkspaceColumn, revenueaction.FieldID, revisions, revenueactionrevision.ActionColumn)
	sharedActions := fmt.Sprintf(`SELECT a."%s" FROM "%s" a JOIN "%s" w ON w."%s" = a."%s" WHERE w."%s" <> ?`,
		revenueaction.FieldID, actions, ws, wsID, revenueaction.WorkspaceColumn, wsOwner)
	if _, err := exec(fmt.Sprintf(`UPDATE "%s" SET "%s" = (%s) WHERE "%s" = ? AND "%s" IN (%s)`,
		revisions, revenueactionrevision.UserColumn, actionOwner, revenueactionrevision.UserColumn, revenueactionrevision.ActionColumn, sharedActions), userID, userID); err != nil { // #nosec G201
		return fmt.Errorf("reassign %s: %w", revisions, err)
	}

	for _, h := range historyTables {
		if _, err := exec(fmt.Sprintf(`DELETE FROM "%s" WHERE "ref" IN (SELECT "id" FROM "%s" WHERE "%s" = ?)`, h.history, h.source, h.userColumn), userID); err != nil { // #nosec G201
			return fmt.Errorf("purge %s: %w", h.history, err)
		}
	}

	now := time.Now().UTC()
	if err := retainBillingFacts(exec, userID, now); err != nil {
		return err
	}

	var workosUserID string
	err = tx.QueryRowContext(ctx, d.rebind(fmt.Sprintf(`DELETE FROM "%s" WHERE "%s" = ? RETURNING "%s"`,
		user.Table, user.FieldID, user.FieldWorkosUserID)), userID).Scan(&workosUserID) // #nosec G201
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAccountNotFound
	}
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if _, err := exec(fmt.Sprintf(`DELETE FROM "%s" WHERE "%s" = ?`, userhistory.Table, userhistory.FieldRef), userID); err != nil { // #nosec G201
		return fmt.Errorf("purge %s: %w", userhistory.Table, err)
	}
	if _, err := exec(fmt.Sprintf(`INSERT INTO "%s" ("%s", "%s", "%s", "%s") VALUES (?, ?, ?, ?) ON CONFLICT ("%s") DO NOTHING`,
		deletedidentity.Table, deletedidentity.FieldID, deletedidentity.FieldKeyHash, deletedidentity.FieldCreatedAt,
		deletedidentity.FieldUpdatedAt, deletedidentity.FieldKeyHash),
		uuid.New(), auth.DeletedIdentityKey(workosUserID), now, now); err != nil { // #nosec G201
		return fmt.Errorf("record deleted identity: %w", err)
	}
	return tx.Commit()
}

// retainBillingFacts copies the live subscription row into billing_retentions
// before the user delete cascades it away. A user with no subscription inserts
// nothing. The copy has no email and no payment-method data.
func retainBillingFacts(exec func(string, ...any) (int64, error), userID uuid.UUID, now time.Time) error {
	query := fmt.Sprintf(`INSERT INTO "%s" ("%s", "%s", "%s", "%s", "%s", "%s", "%s", "%s", "%s")
SELECT ?, ?, ?, "%s", "%s", "%s", "%s", "%s", ?
FROM "%s" WHERE "%s" = ?`,
		billingretention.Table,
		billingretention.FieldID,
		billingretention.FieldCreatedAt,
		billingretention.FieldUpdatedAt,
		billingretention.FieldPlan,
		billingretention.FieldStatus,
		billingretention.FieldStripeCustomerID,
		billingretention.FieldStripeSubscriptionID,
		billingretention.FieldTrialExpiresAt,
		billingretention.FieldRetainedAt,
		subscription.FieldPlan,
		subscription.FieldStatus,
		subscription.FieldStripeCustomerID,
		subscription.FieldStripeSubscriptionID,
		subscription.FieldTrialExpiresAt,
		subscription.Table,
		subscription.UserColumn,
	) // #nosec G201 -- identifiers are generated constants
	if _, err := exec(query, uuid.New(), now, now, now, userID); err != nil {
		return fmt.Errorf("retain billing facts: %w", err)
	}
	return nil
}

// rebind turns "?" placeholders into "$n" for PostgreSQL.
func (d *DB) rebind(query string) string {
	if d.Dialect != dialect.Postgres {
		return query
	}
	var b strings.Builder
	position := 0
	for _, r := range query {
		if r == '?' {
			position++
			fmt.Fprintf(&b, "$%d", position)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
