package revenue

import (
	"encoding/json"
	"testing"
)

func TestDocumentedGmailObservationContentHash(t *testing.T) {
	observation, err := AdaptGmailEvent(AdapterEvent{
		EventType: "commitment_created",
		Summary:   "We promised to send the security packet.",
	})
	if err != nil {
		t.Fatal(err)
	}
	factsJSON, err := json.Marshal(observation.Facts)
	if err != nil {
		t.Fatal(err)
	}
	if string(factsJSON) != `{"adapter":"gmail"}` {
		t.Fatalf("facts %s", factsJSON)
	}
	if string(observation.Payload) != "null" {
		t.Fatalf("payload %s", observation.Payload)
	}
	got := observationContentHash(observation.Summary, factsJSON, observation.Payload)
	const want = "c649f448e463924ae2a0923fcc6d409bc5a808004027b16bfbea961336650984"
	if got != want {
		t.Fatalf("content hash %s", got)
	}
}
