package openapidoc

const profileDescription = "Profile loads the saved display name, the default agent, and whether usage data is shared. Before a name is saved, the name and the agent are empty, usage sharing is off, notifications are off, and the theme follows the system."

func profilePreferences() obj {
	return obj{
		"displayName":        "",
		"defaultAgentSlug":   "",
		"shareUsageData":     false,
		"notificationLevel":  "off",
		"showModelReasoning": false,
		"theme":              "system",
	}
}
