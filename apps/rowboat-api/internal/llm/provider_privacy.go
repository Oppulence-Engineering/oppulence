package llm

import (
	"encoding/json"
	"net/http"
)

// Public attribution sent with hosted model calls. The privacy policy names
// Playbook Media, Inc. doing business as Oppulence. Upstream logs should not
// keep attributing this traffic to the previous product name.
const (
	openRouterReferer = "https://oppulence.io"
	openRouterTitle   = "Oppulence"
)

// stampOpenRouterPrivacy applies the privacy-policy promise that model
// providers do not train on customer content.
//
// OpenRouter's provider.data_collection=deny restricts routing to endpoints
// that do not collect prompts. A caller-supplied provider object is replaced:
// the client must not be able to turn collection back on. Attribution headers
// identify Oppulence rather than a retired brand.
func stampOpenRouterPrivacy(provider string, body map[string]any, header http.Header) {
	if provider != "openrouter" {
		return
	}
	body["provider"] = map[string]any{"data_collection": "deny"}
	header.Set("HTTP-Referer", openRouterReferer)
	header.Set("X-Title", openRouterTitle)
}

// stampOpenRouterPrivacyBody is stampOpenRouterPrivacy for callers that have
// already encoded the JSON body.
func stampOpenRouterPrivacyBody(provider string, raw []byte, header http.Header) ([]byte, error) {
	if provider != "openrouter" {
		return raw, nil
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	stampOpenRouterPrivacy(provider, body, header)
	return json.Marshal(body)
}
