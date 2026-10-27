import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";

import { SimPlatformPage } from "../sim-landing/subpages/sim-platform-page";
import { getPlatformPage } from "../marketing-data";
import { marketingMetadata } from "../metadata";

const page = getPlatformPage("web");

export const metadata = marketingMetadata({
  title: `${page?.name} — ${page?.title}`,
  description: page?.summary ?? "Explore Oppulence web.",
  path: "/web",
});

export default async function OppulenceWebPage() {
  "use cache";
  cacheLife("days");
  if (!page) notFound();
  return <SimPlatformPage page={page} />;
}
