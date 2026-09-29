package auth

// CurrentTermsVersion is the effective date of the published Terms of Service
// (apps/rowboat-www/app/(legal)/terms/page.tsx, EFFECTIVE). First sight of a
// verified token records it. A later published date is recorded the next time
// the user is seen, because the Terms treat continued use as acceptance.
const CurrentTermsVersion = "2026-09-08"
