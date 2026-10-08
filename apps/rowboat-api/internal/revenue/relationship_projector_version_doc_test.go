package revenue

import "testing"

func TestRelationshipProjectorVersionIsStoredOnSnapshotsAndAttention(t *testing.T) {
	if relationshipProjectorVersion != 2 {
		t.Fatalf("relationship projector version %d", relationshipProjectorVersion)
	}
	if relationshipAttentionDetectorVersion != 1 {
		t.Fatalf("attention detector version %d", relationshipAttentionDetectorVersion)
	}
	if missionControlDetectorVersion != 1 {
		t.Fatalf("mission control detector version %d", missionControlDetectorVersion)
	}
}
