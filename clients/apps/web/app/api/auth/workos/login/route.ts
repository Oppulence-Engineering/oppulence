import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth/origin";

import { setPKCECookie } from "@/lib/auth/cookies";
import { parseSearchParams } from "@/lib/api/routes/parse";
import { WorkOSLoginQuerySchema } from "@/lib/api/routes/schemas/auth";
import { createPKCECookie, safeReturnTo } from "@/lib/auth/pkce";
import { getWorkOSLoginURL } from "@/lib/auth/rowboat-api";

export async function GET(request: NextRequest) {
  const query = parseSearchParams(request.nextUrl.searchParams, WorkOSLoginQuerySchema);
  const returnTo = safeReturnTo(query.success ? query.data.return_to : undefined);
  const pkce = createPKCECookie(returnTo);
  const origin = publicOrigin(request);
  const redirectURI = new URL("/api/auth/callback", origin).toString();

  try {
    // Account deletion asks for max_age=0. That parameter only re-authenticates
    // when the provider is AuthKit, so this request must not jump straight to
    // GoogleOAuth. prompt=login gives the local devstack a newer auth_time.
    const reauth = query.success && query.data.max_age === "0";
    const url = await getWorkOSLoginURL({
      redirectURI,
      state: pkce.state,
      codeChallenge: pkce.codeChallenge,
      provider: reauth ? "authkit" : process.env.ROWBOAT_WWW_WORKOS_PROVIDER,
      maxAge: reauth ? "0" : undefined,
      prompt: reauth ? "login" : undefined,
    });
    const response = NextResponse.redirect(url);
    setPKCECookie(response, pkce);
    return response;
  } catch (error) {
    console.error("Failed to create WorkOS sign-in URL", error);
    const fallback = new URL("/sign-in", origin);
    fallback.searchParams.set("error", "sign_in_unavailable");
    fallback.searchParams.set("return_to", returnTo);
    return NextResponse.redirect(fallback);
  }
}
