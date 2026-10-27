package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/outbound"
)

const (
	workOSListLimit    = 100
	workOSListMaxPages = 10
)

// WorkOSEnricher fetches user metadata from the WorkOS User Management API.
// A minimal HTTP client is used instead of the full workos-go SDK to keep the
// dependency surface small; the single endpoint we need is stable.
type WorkOSEnricher struct {
	apiKey  string
	baseURL string
	client  *outbound.Client
}

// NewWorkOSEnricher returns an Enricher backed by WorkOS, or NoopEnricher when
// no API key is configured (local dev). baseURL (WORKOS_BASE_URL) overrides
// https://api.workos.com; local end-to-end runs point it at devstack.
func NewWorkOSEnricher(apiKey, baseURL string) Enricher {
	if apiKey == "" {
		return NoopEnricher{}
	}
	if baseURL == "" {
		baseURL = "https://api.workos.com"
	}
	return &WorkOSEnricher{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		client: outbound.NewClient(outbound.Policy{
			Name:                  "workos-enricher",
			Timeout:               5 * time.Second,
			ResponseHeaderTimeout: 5 * time.Second,
			MaxConcurrent:         64,
			MaxResponseBytes:      1 << 20,
		}),
	}
}

// Email looks up the user's primary email via GET /user_management/users/{id}.
func (e *WorkOSEnricher) Email(ctx context.Context, workosUserID string) (string, error) {
	endpoint := e.baseURL + "/user_management/users/" + url.PathEscape(workosUserID)
	// #nosec G704 -- baseURL is operator-controlled configuration (WORKOS_BASE_URL); the id is path-escaped.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+e.apiKey)

	// #nosec G704 -- req targets the operator-configured WorkOS base URL above.
	resp, err := e.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workos: users lookup returned %d", resp.StatusCode)
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.Email, nil
}

// DeleteUser removes the WorkOS identity via DELETE /user_management/users/{id}.
// Account deletion needs this: ResolveUser recreates the local user mirror for
// any valid token, so an identity left in WorkOS can sign in again. A 404 means
// the identity is already gone.
func (e *WorkOSEnricher) DeleteUser(ctx context.Context, workosUserID string) error {
	endpoint := e.baseURL + "/user_management/users/" + url.PathEscape(workosUserID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.apiKey)

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusNotFound || (resp.StatusCode >= 200 && resp.StatusCode < 300) {
		return nil
	}
	return fmt.Errorf("workos: user delete returned %d", resp.StatusCode)
}

// ListAuthFactorTypes reads GET /user_management/users/{id}/auth_factors.
// The caller treats any error as "enrollment unknown" and refuses email OTP.
func (e *WorkOSEnricher) ListAuthFactorTypes(ctx context.Context, workosUserID string) ([]string, error) {
	seen := map[string]struct{}{}
	var types []string
	after := ""
	for page := 0; page < workOSListMaxPages; page++ {
		endpoint := e.baseURL + "/user_management/users/" + url.PathEscape(workosUserID) + "/auth_factors?limit=" + fmt.Sprint(workOSListLimit)
		if after != "" {
			endpoint += "&after=" + url.QueryEscape(after)
		}
		var body struct {
			Data []struct {
				Type string `json:"type"`
			} `json:"data"`
			ListMetadata struct {
				After string `json:"after"`
			} `json:"list_metadata"`
		}
		if err := e.getJSON(ctx, endpoint, &body); err != nil {
			return nil, err
		}
		for _, factor := range body.Data {
			if factor.Type == "" {
				continue
			}
			if _, ok := seen[factor.Type]; ok {
				continue
			}
			seen[factor.Type] = struct{}{}
			types = append(types, factor.Type)
		}
		if body.ListMetadata.After == "" || body.ListMetadata.After == after {
			return types, nil
		}
		after = body.ListMetadata.After
	}
	return nil, fmt.Errorf("workos: auth factor list exceeded %d pages", workOSListMaxPages)
}

// RevokeSessions lists the user's sessions and revokes each one. A session
// that is already gone (404) counts as revoked. Listing failure is returned
// so the caller can log that cookies may still be live.
func (e *WorkOSEnricher) RevokeSessions(ctx context.Context, workosUserID string) error {
	ids, err := e.listSessionIDs(ctx, workosUserID)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := e.revokeSession(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (e *WorkOSEnricher) listSessionIDs(ctx context.Context, workosUserID string) ([]string, error) {
	var ids []string
	after := ""
	for page := 0; page < workOSListMaxPages; page++ {
		endpoint := e.baseURL + "/user_management/users/" + url.PathEscape(workosUserID) + "/sessions?limit=" + fmt.Sprint(workOSListLimit)
		if after != "" {
			endpoint += "&after=" + url.QueryEscape(after)
		}
		var body struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
			ListMetadata struct {
				After string `json:"after"`
			} `json:"list_metadata"`
		}
		if err := e.getJSON(ctx, endpoint, &body); err != nil {
			return nil, err
		}
		for _, session := range body.Data {
			if session.ID != "" {
				ids = append(ids, session.ID)
			}
		}
		if body.ListMetadata.After == "" || body.ListMetadata.After == after {
			return ids, nil
		}
		after = body.ListMetadata.After
	}
	return nil, fmt.Errorf("workos: session list exceeded %d pages", workOSListMaxPages)
}

func (e *WorkOSEnricher) revokeSession(ctx context.Context, sessionID string) error {
	payload, err := json.Marshal(map[string]string{"session_id": sessionID})
	if err != nil {
		return err
	}
	endpoint := e.baseURL + "/user_management/sessions/revoke"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusNotFound || (resp.StatusCode >= 200 && resp.StatusCode < 300) {
		return nil
	}
	return fmt.Errorf("workos: session revoke returned %d", resp.StatusCode)
}

func (e *WorkOSEnricher) getJSON(ctx context.Context, endpoint string, dst any) error {
	// #nosec G704 -- baseURL is operator-controlled configuration (WORKOS_BASE_URL); ids are path-escaped.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.apiKey)
	// #nosec G704 -- req targets the operator-configured WorkOS base URL above.
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("workos: lookup returned %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(dst)
}
