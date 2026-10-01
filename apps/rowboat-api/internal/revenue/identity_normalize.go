package revenue

import (
	"net/url"
	"strings"
)

// Email address and domain normalization, shared by every path that turns an
// address into an identity.
//
// There is one distinction here, and it is the whole reason this file exists:
//
//	emailDomain()   answers "what host is this?"          — gmail.com is a fine answer
//	accountDomain() answers "does this identify an org?"  — gmail.com is never an answer
//
// A mail thread's domain is thread metadata, so mailindex.go wants the first and
// gmail.com is the correct value there. A Relationship.account_domain or a domain
// identity anchor is a claim about an organization, so those want the second.
// Collapsing them into one function is how two unrelated gmail.com people end up
// sharing one account.
//
// The public mailbox set is mirrored in apps/x/packages/shared/src/email-domain.ts,
// which must stay a superset of this one.

// publicMailboxDomains are providers whose domain names a *provider*, not an
// organization.
var publicMailboxDomains = map[string]struct{}{
	"gmail.com": {}, "googlemail.com": {}, "outlook.com": {}, "hotmail.com": {},
	"live.com": {}, "msn.com": {}, "icloud.com": {}, "me.com": {}, "mac.com": {},
	"yahoo.com": {}, "aol.com": {}, "proton.me": {}, "protonmail.com": {},
}

// isPublicMailboxDomain reports whether the domain names a mailbox provider
// rather than an organization. Public domains are never account anchors: two
// unrelated gmail.com people must not collapse into one relationship.
func isPublicMailboxDomain(domain string) bool {
	_, public := publicMailboxDomains[normalizeDomain(domain)]
	return public
}

// normalizeEmail lowercases and trims an address, unwrapping a "Name <addr>"
// wrapper. It is the single entry point for every address that becomes an
// identity anchor, so the sha256 key_hash stays stable across sources.
func normalizeEmail(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if closeAngle := strings.LastIndexByte(trimmed, '>'); closeAngle == len(trimmed)-1 {
		if openAngle := strings.LastIndexByte(trimmed[:closeAngle], '<'); openAngle >= 0 {
			trimmed = strings.TrimSpace(trimmed[openAngle+1 : closeAngle])
		}
	}
	return strings.ToLower(trimmed)
}

// emailDomain returns the raw domain of an address, lowercased and with a
// trailing dot stripped. It makes no claim that the domain identifies an
// organization.
func emailDomain(email string) string {
	normalized := normalizeEmail(email)
	at := strings.LastIndexByte(normalized, '@')
	if at < 1 || at == len(normalized)-1 {
		return ""
	}
	return normalizeDomain(normalized[at+1:])
}

// accountDomain returns emailDomain, or "" when the domain is a public mailbox.
// This is the question every caller that writes Relationship.account_domain or a
// domain identity anchor is actually asking.
func accountDomain(email string) string {
	domain := emailDomain(email)
	if domain == "" || isPublicMailboxDomain(domain) {
		return ""
	}
	return domain
}

// emailLocalPart returns the portion before "@", or "" for a malformed address.
func emailLocalPart(email string) string {
	normalized := normalizeEmail(email)
	at := strings.LastIndexByte(normalized, '@')
	if at < 1 {
		return ""
	}
	return normalized[:at]
}

func normalizeDomain(domain string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
}

// companyAccountDomain is what a person types into Company domain. A pasted
// site address ("https://www.northwind.example/pricing") or an email must
// become the host mail actually uses, or the company never matches a thread
// from @northwind.example.
func companyAccountDomain(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.Contains(trimmed, "@") {
		if domain := emailDomain(trimmed); domain != "" {
			return stripLeadingWWW(domain)
		}
	}
	if looksLikeWebAddress(trimmed) {
		host := hostFromWebAddress(trimmed)
		if host == "" {
			return ""
		}
		return stripLeadingWWW(strings.Trim(host, "."))
	}
	return stripLeadingWWW(strings.Trim(strings.ToLower(trimmed), "."))
}

func looksLikeWebAddress(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	return strings.Contains(lower, "://") ||
		strings.HasPrefix(lower, "//") ||
		strings.ContainsAny(lower, "/?#:")
}

func hostFromWebAddress(raw string) string {
	lower := strings.ToLower(strings.TrimSpace(raw))
	target := lower
	if !strings.Contains(lower, "://") {
		if strings.HasPrefix(lower, "//") {
			target = "https:" + lower
		} else {
			target = "https://" + lower
		}
	}
	parsed, err := url.Parse(target)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func stripLeadingWWW(host string) string {
	if !strings.HasPrefix(host, "www.") {
		return host
	}
	rest := strings.TrimPrefix(host, "www.")
	if strings.Contains(rest, ".") {
		return rest
	}
	return host
}
