import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";

import { SimPlatformPage } from "../sim-landing/subpages/sim-platform-page";
import { getPlatformPage } from "../marketing-data";
import { marketingMetadata } from "../metadata";

const page = getPlatformPage("desktop");

export const metadata = marketingMetadata({
  title: `${page?.name} — ${page?.title}`,
  description: page?.summary ?? "Explore Oppulence desktop.",
  path: "/desktop",
});

export default async function OppulenceDesktopPage() {
  "use cache";
  cacheLife("days");
  if (!page) notFound();
  return <SimPlatformPage page={page} />;
}
