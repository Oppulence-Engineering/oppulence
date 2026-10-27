import type { Metadata } from "next";

import { SITE_NAME, SITE_URL } from "@/app/(marketing)/site";

const DEFAULT_OG_IMAGE = "/marketing/oppulence-icon.png";

/**
 * Canonical origin for metadata, sitemap, and structured data.
 *
 * Self-hosted deployments can override with `NEXT_PUBLIC_SITE_URL` for staging
 * previews without rewriting marketing copy.
 */
export const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL);

/**
 * Shared metadata defaults modeled on the Better Auth docs app: every public
 * route gets `metadataBase`, Open Graph, Twitter cards, and icons unless it
 * explicitly overrides them.
 */
export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    metadataBase: baseUrl,
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: baseUrl.href,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: DEFAULT_OG_IMAGE,
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      images: DEFAULT_OG_IMAGE,
      ...override.twitter,
    },
    // Tab and touch icons use the small app/icon.png and app/apple-icon.png
    // files. The 512px social image is 180 KB and slowed every first load.
    icons:
      override.icons ??
      ({
        icon: [{ url: "/icon.png", sizes: "96x96" }],
        apple: "/apple-icon.png",
      } satisfies Metadata["icons"]),
  };
}
