// Package googlechannel encodes account identity in Google Calendar and Drive
// watch IDs using only characters accepted by Google's channel API.
package googlechannel

import (
	"encoding/base64"
	"strings"

	"github.com/google/uuid"
)

// New returns a channel ID with an account token and a unique renewal ID.
// Raw URL base64 excludes '+' so '+' can delimit the components unambiguously.
func New(kind, email string) string {
	account := base64.RawURLEncoding.EncodeToString([]byte(strings.ToLower(strings.TrimSpace(email))))
	return kind + "+" + account + "+" + uuid.NewString()
}

// Account extracts an account from a channel ID of the expected kind. The old
// colon format remains readable for channels registered before this change.
func Account(channelID, kind string) string {
	if parts := strings.SplitN(channelID, "+", 3); len(parts) == 3 && parts[0] == kind && parts[2] != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
		return strings.ToLower(strings.TrimSpace(string(decoded)))
	}
	if parts := strings.SplitN(channelID, ":", 3); len(parts) == 3 && parts[0] == kind && parts[2] != "" {
		return strings.ToLower(strings.TrimSpace(parts[1]))
	}
	return ""
}
