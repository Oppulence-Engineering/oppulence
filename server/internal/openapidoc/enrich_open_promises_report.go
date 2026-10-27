package openapidoc

import (
	"time"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/revenue"
)

// Download the report loads GET /v1/revenue-leak-scans/{scanId}/report?format=md.
// The published scan is the one on RevenueLeakScan. The window is the six
// months Run Promise Leak Audit sends, and the file is that scan's Markdown.
const (
	openPromisesScanID       = "4d8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPromisesCommitmentID = "8b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	openPromisesGeneratedAt  = "2026-09-09T12:00:00Z"
	openPromisesDueAt        = "2026-09-14T17:00:00Z"
	openPromisesOccurredAt   = "2026-09-06T12:00:00Z"
	openPromisesLookbackDays = 180
)

func openPromisesReport() *revenue.OpenPromisesReport {
	due := time.Date(2026, 9, 14, 17, 0, 0, 0, time.UTC)
	occurred := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	return &revenue.OpenPromisesReport{
		GeneratedAt:   time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC),
		LookbackDays:  openPromisesLookbackDays,
		ThreadsSeen:   412,
		ScanStatus:    "completed",
		OutboundCount: 1,
		InboundCount:  0,
		ByAccount:     map[string]int{"Acme": 1},
		Truncated:     false,
		Items: []revenue.ReportItem{{
			CommitmentID: openPromisesCommitmentID,
			Account:      "Acme",
			Direction:    "promised_by_me",
			Text:         "Migration live by the 14th",
			State:        "at_risk",
			DueAt:        &due,
			DuePhrase:    "by the 14th",
			Owner:        "alex@example.com",
			SourceQuote:  "We will have the migration live by the 14th.",
			SourceURI:    "https://mail.google.com/thread-1",
			OccurredAt:   &occurred,
		}},
	}
}

func openPromisesReportExample() obj {
	return obj{
		"generatedAt":   openPromisesGeneratedAt,
		"lookbackDays":  openPromisesLookbackDays,
		"threadsSeen":   412,
		"scanStatus":    "completed",
		"outboundCount": 1,
		"inboundCount":  0,
		"byAccount":     obj{"Acme": 1},
		"truncated":     false,
		"items": []any{obj{
			"commitmentId": openPromisesCommitmentID,
			"account":      "Acme",
			"direction":    "promised_by_me",
			"text":         "Migration live by the 14th",
			"state":        "at_risk",
			"dueAt":        openPromisesDueAt,
			"duePhrase":    "by the 14th",
			"owner":        "alex@example.com",
			"sourceQuote":  "We will have the migration live by the 14th.",
			"sourceUri":    "https://mail.google.com/thread-1",
			"occurredAt":   openPromisesOccurredAt,
		}},
	}
}

func openPromisesReportParams() []any {
	return []any{
		obj{
			"name": "scanId", "in": "path", "required": true, "description": "Scan id.",
			"example": openPromisesScanID,
			"schema":  obj{"type": "string", "format": "uuid", "example": openPromisesScanID},
		},
		obj{
			"name": "format", "in": "query", "required": false,
			"description": "md for the file Download the report saves.",
			"example":     "md",
			"schema":      stringSchema("Export format.", "md"),
		},
	}
}

func openPromisesReportSchema() obj {
	return objectSchema("Open promises report.", obj{
		"generatedAt":   stringSchema("When the report was produced.", openPromisesGeneratedAt, obj{"format": "date-time"}),
		"lookbackDays":  intSchema("Scan window in days.", openPromisesLookbackDays),
		"threadsSeen":   intSchema("Conversations read.", 412),
		"scanStatus":    stringSchema("Scan status.", "completed"),
		"outboundCount": intSchema("Promises we made.", 1),
		"inboundCount":  intSchema("Promises made to us.", 0),
		"byAccount":     obj{"type": "object", "additionalProperties": obj{"type": "integer"}, "description": "Open promise count by account.", "example": obj{"Acme": 1}},
		"truncated":     boolSchema("Whether more than 200 matching promises exist.", false),
		"items": arraySchema("Open promises, at risk first.", objectSchema("Open promise.", obj{
			"commitmentId": stringSchema("Commitment id.", openPromisesCommitmentID),
			"account":      stringSchema("Counterparty account.", "Acme"),
			"direction":    stringSchema("Who owes the promise.", "promised_by_me"),
			"text":         stringSchema("The obligation.", "Migration live by the 14th"),
			"state":        stringSchema("Register state.", "at_risk"),
			"dueAt":        stringSchema("Resolved due time.", openPromisesDueAt, obj{"format": "date-time"}, nullable()),
			"duePhrase":    stringSchema("Due condition as stated.", "by the 14th"),
			"owner":        stringSchema("Promise owner.", "alex@example.com"),
			"sourceQuote":  stringSchema("The exact message that created it.", "We will have the migration live by the 14th."),
			"sourceUri":    stringSchema("Link to the source.", "https://mail.google.com/thread-1"),
			"occurredAt":   stringSchema("When the source was created.", openPromisesOccurredAt, obj{"format": "date-time"}),
		}, "commitmentId", "account", "direction", "text", "state")),
	}, "generatedAt", "lookbackDays", "threadsSeen", "scanStatus", "outboundCount", "inboundCount", "byAccount", "items", "truncated")
}

func openPromisesReportOperation() obj {
	response := jsonOrMarkdownResponse("The report.", openPromisesReportSchema(), openPromisesReportExample())
	asObj(asObj(response["content"])["text/markdown"])["example"] = openPromisesReport().Markdown()
	return operation(
		"Revenue",
		"Download the report",
		"Download the report saves this audit as Markdown. The request uses format md. The file names the open promises, who owes them, and the message that created each one.",
		"getOpenPromisesReport",
		bearer(),
		openPromisesReportParams(),
		nil,
		obj{
			"200": response,
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)
}
