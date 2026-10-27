package openapidoc

import (
	"crypto/sha256"
	"encoding/hex"
)

// Download support file loads GET /v1/relationship-beta/diagnostics. Support
// references are diagnosticRef: kind, then sha256, then 24 hex characters of
// sha256("tfa-"+kind+":"+id). These use the published workspace id, the
// published source connection id, and that connection's Google account.
const (
	supportFileWorkspaceID  = "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	supportFileConnectionID = "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	supportFileAccount      = "google:me@company.com"
	supportFileGeneratedAt  = "2026-08-01T15:00:00Z"
)

func supportFileRef(kind, id string) string {
	digest := sha256.Sum256([]byte("tfa-" + kind + ":" + id))
	return kind + ":sha256:" + hex.EncodeToString(digest[:12])
}

func supportFileExample() obj {
	return obj{
		"schemaVersion": "tfa-support-v1",
		"generatedAt":   supportFileGeneratedAt,
		"workspaceRef":  supportFileRef("workspace", supportFileWorkspaceID),
		"features": []any{obj{
			"capability":   "action_gmail",
			"enabled":      false,
			"rolloutStage": "internal_read_only",
			"reasonCode":   "internal_canary",
		}},
		"sources": []any{obj{
			"connectionRef":     supportFileRef("connection", supportFileConnectionID),
			"source":            "google",
			"sourceAccountRef":  supportFileRef("source-account", supportFileAccount),
			"status":            "degraded",
			"completeness":      "stale",
			"backfillPhase":     "failed",
			"backfillCompleted": 20,
			"backfillTotal":     100,
			"lagSeconds":        900,
			"missingScopeCount": 0,
			"errorCode":         "provider_outage",
			"retryCount":        2,
		}},
		"counts": obj{
			"relationships":      0,
			"identityReview":     0,
			"projectionPending":  0,
			"projectionDead":     0,
			"attentionOpen":      0,
			"approvalPending":    0,
			"executionUncertain": 0,
		},
		"trustFunnel": []any{obj{
			"eventName": "mission_control_opened",
			"outcome":   "viewed",
			"count":     12,
		}},
		"checks": []any{
			obj{"code": "source_health", "status": "attention", "explanation": "One or more source connections require repair or backfill.", "count": 1},
			obj{"code": "identity_review", "status": "pass", "explanation": "No identity ambiguity is awaiting review.", "count": 0},
			obj{"code": "projection_dead_letter", "status": "pass", "explanation": "No relationship projection is dead-lettered.", "count": 0},
			obj{"code": "execution_uncertainty", "status": "pass", "explanation": "No external action awaits uncertainty review.", "count": 0},
			obj{"code": "release_owner_signoff", "status": "pass", "explanation": "Governed design-partner execution is either disabled or explicitly signed off.", "count": 0},
		},
	}
}
