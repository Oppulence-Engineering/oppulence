const PUBLIC_API_BASE_ENV_KEYS = [
  "OPPULENCE_WWW_PUBLIC_API_BASE_URL",
  "ROWBOATX_PUBLIC_API_BASE_URL",
  "OPPULENCE_WWW_API_PROXY_URL",
  "ROWBOATX_API_PROXY_URL",
  "ROWBOATX_API_BASE_URL",
];

export function publicOppulenceApiURL(pathname: string): URL {
  return new URL(pathname, publicOppulenceApiBaseURL());
}

export function publicOppulenceApiBaseURL(): URL {
  const base =
    PUBLIC_API_BASE_ENV_KEYS.map((key) => process.env[key]?.trim()).find(Boolean) ??
    "https://api.oppulence.io";

  return new URL(`${base.replace(/\/+$/, "")}/`);
}
