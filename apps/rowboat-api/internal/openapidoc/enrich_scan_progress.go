package openapidoc

const scanProgressDescription = "Reading your last 6 months polls this audit while it runs. The page shows how many conversations have been read."

const (
	scanProgressID        = "4d8dfa9b-a7b2-46ea-982c-622a914c00e5"
	scanProgressStartedAt = "2026-07-23T12:00:00Z"
)

func scanProgressExample() obj {
	return obj{
		"id":                   scanProgressID,
		"status":               "running",
		"mode":                 "local",
		"lookbackDays":         180,
		"threadsSeen":          412,
		"candidatesSeen":       0,
		"relationshipsCreated": 0,
		"evidencesCreated":     0,
		"actionsCreated":       0,
		"commitmentsCreated":   0,
		"threadsDeepRead":      412,
		"threadsSnippetOnly":   0,
		"threadsSkipped":       0,
		"startedAt":            scanProgressStartedAt,
	}
}

func scanProgressParam() obj {
	param := pathParam("scanId", "The audit Reading your last 6 months is polling.", uuidSchema("Scan id.", scanProgressID))
	param["example"] = scanProgressID
	return param
}

func scanProgressOperation() obj {
	return operation(
		"Revenue",
		"Reading your last 6 months",
		scanProgressDescription,
		"getRevenueLeakScan",
		bearer(),
		[]any{scanProgressParam()},
		nil,
		obj{
			"200": jsonResponse("Reading your last 6 months.", ref("RevenueLeakScan"), scanProgressExample()),
			"401": responseRef("401"),
			"404": responseRef("404"),
		},
	)
}
