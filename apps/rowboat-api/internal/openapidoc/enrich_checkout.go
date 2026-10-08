package openapidoc

const checkoutProDescription = "Upgrade to Pro opens checkout. The request asks for the Pro plan. This server has not configured checkout, so the request is refused."

func checkoutProRequest() obj {
	return obj{"plan": "pro"}
}

func checkoutUnconfigured() obj {
	example := problemExample(502, "Bad Gateway", "Stripe checkout is not configured", "provider_unconfigured")
	example["retryable"] = true
	return example
}

func checkoutProPath() obj {
	requestSchema := objectSchema("Plan the Upgrade to Pro button sends.", obj{
		"plan": stringEnum("Checkout plan.", "pro", "starter", "pro", "intelligence"),
	}, "plan")
	success := objectSchema("Address of the hosted checkout page.", obj{
		"url": obj{"type": "string", "description": "Hosted checkout address."},
	}, "url")
	return obj{
		"post": operation("Billing", "Upgrade to Pro", checkoutProDescription, "createCheckoutSession", bearer(), nil,
			jsonRequest("Pro plan.", requestSchema, checkoutProRequest()),
			obj{
				"200": jsonResponse("Checkout address.", success, nil),
				"400": responseRef("400"),
				"401": responseRef("401"),
				"502": problemResponse("Checkout is not configured.", ref("ErrorEnvelope"), checkoutUnconfigured()),
			}),
	}
}
