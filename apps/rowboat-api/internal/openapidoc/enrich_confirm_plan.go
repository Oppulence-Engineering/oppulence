package openapidoc

const confirmPlanDescription = "Confirm plan records that the other person confirmed the shared plan. The owner's records stay unchanged."

const confirmPlanRequestDescription = "Confirmation of the shared plan."

const confirmPlanRecorded = "The confirmation is recorded."

const confirmPlanResponseID = "db8dfa9b-a7b2-46ea-982c-622a914c00e5"

func confirmPlanRequestExample() obj {
	return obj{
		"responseId": confirmPlanResponseID,
		"kind":       "confirm",
		"comment":    "",
	}
}

func confirmPlanResponseSchema() obj {
	return objectSchema("Recorded plan confirmation.", obj{
		"responseId": stringSchema("The response that was recorded.", confirmPlanResponseID, obj{"format": "uuid"}),
		"recorded":   boolSchema("The confirmation is stored for the plan owner.", true),
	}, "responseId", "recorded")
}

func confirmPlanResponseExample() obj {
	return obj{
		"responseId": confirmPlanResponseID,
		"recorded":   true,
	}
}
