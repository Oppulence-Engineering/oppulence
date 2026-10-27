package llm

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestStampOpenRouterPrivacyDeniesDataCollection(t *testing.T) {
	body := map[string]any{
		"model":    "anthropic/claude-haiku-4-5",
		"provider": map[string]any{"data_collection": "allow"},
	}
	header := make(http.Header)
	stampOpenRouterPrivacy("openrouter", body, header)

	provider, ok := body["provider"].(map[string]any)
	if !ok {
		t.Fatalf("provider = %#v, want a map", body["provider"])
	}
	if provider["data_collection"] != "deny" {
		t.Fatalf("data_collection = %#v, want deny (a caller must not re-enable collection)", provider["data_collection"])
	}
	if header.Get("HTTP-Referer") != openRouterReferer {
		t.Fatalf("referer = %q", header.Get("HTTP-Referer"))
	}
	if header.Get("X-Title") != openRouterTitle {
		t.Fatalf("title = %q", header.Get("X-Title"))
	}
	if header.Get("X-Title") == "Solomon AI" || header.Get("HTTP-Referer") == "https://app.solomon-ai.co" {
		t.Fatal("retired Solomon AI attribution is still set")
	}
}

func TestStampOpenRouterPrivacyBodyLeavesOtherProvidersAlone(t *testing.T) {
	raw := []byte(`{"model":"local","provider":{"data_collection":"allow"}}`)
	header := make(http.Header)
	got, err := stampOpenRouterPrivacyBody("openai", raw, header)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(raw) {
		t.Fatalf("body changed for a non-openrouter provider: %s", got)
	}
	if header.Get("X-Title") != "" {
		t.Fatalf("title set for a non-openrouter provider: %q", header.Get("X-Title"))
	}
}

func TestStampOpenRouterPrivacyBodyRewritesEncodedJSON(t *testing.T) {
	header := make(http.Header)
	got, err := stampOpenRouterPrivacyBody("openrouter", []byte(`{"model":"m"}`), header)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(got, &body); err != nil {
		t.Fatal(err)
	}
	provider, ok := body["provider"].(map[string]any)
	if !ok || provider["data_collection"] != "deny" {
		t.Fatalf("provider = %#v", body["provider"])
	}
}
