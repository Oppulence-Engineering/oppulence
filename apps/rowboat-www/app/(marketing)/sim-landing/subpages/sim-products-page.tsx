import { cn } from "@/lib/sim/cn";

import { platformPages } from "../../marketing-data";
import { JsonLd } from "../../marketing-primitives";
import { breadcrumbJsonLd } from "../../metadata";
import { SimCtaLink } from "../primitives";
import { HOME_INSET, HOME_TYPE, LANDING_CONTENT_WIDTH } from "../tokens";
import { PlatformExplorer } from "./solutions-product/platform-explorer";
import { SimProductNav } from "./sim-platform-page";

export function SimProductsPage() {
  return (
    <div className={LANDING_CONTENT_WIDTH} data-products-page>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
        ])}
      />
      <div className={HOME_INSET}>
        <SimProductNav />
        <section aria-labelledby="products-heading" className="pt-14 pb-10 lg:pt-20">
          <h1 className={cn(HOME_TYPE.h1, "max-w-[17ch] text-balance")} id="products-heading">
            Start where your work happens.
          </h1>
          <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-[var(--text-secondary)]">
            A browser workspace, a native app, and a voice companion. Each has a different job.
            Start with the one you need; add the others when they help.
          </p>
        </section>
        <section
          aria-label="Choose your Oppulence product"
          className="grid border-y border-[var(--border)] md:grid-cols-3"
        >
          {platformPages.map((product) => (
            <article
              className="flex min-w-0 flex-col border-b border-[var(--border)] py-8 last:border-b-0 md:border-r md:border-b-0 md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
              key={product.slug}
            >
              <h2 className="text-4xl tracking-tight">{product.name.replace("Oppulence ", "")}</h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{product.eyebrow}</p>
              <p className="mt-5 text-base leading-relaxed text-[var(--text-secondary)]">
                {product.summary}
              </p>
              <p className="mt-5 text-sm text-[var(--text-secondary)]">{product.specs[0].detail}</p>
              <div className="mt-auto pt-7">
                <SimCtaLink href={`/${product.slug}`} withArrow>
                  Explore {product.name.replace("Oppulence ", "")}
                </SimCtaLink>
              </div>
            </article>
          ))}
        </section>
        <section aria-labelledby="connected-heading" className="py-14 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <h2 className={cn(HOME_TYPE.h2, "max-w-[22ch]")} id="connected-heading">
              From the first thought to the next reply.
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-[var(--text-secondary)]">
              <p>
                Review relationships and assistant work on Web. Bring local files and native tools
                into the task on Desktop. Use Voice to capture a thought or dictate without
                switching apps.
              </p>
              <p>
                We are connecting these experiences around shared relationship context and action
                history. The five-part navigation and the complete Voice handoff are in development.
              </p>
            </div>
          </div>
          <div className="relative mt-10 h-[480px] overflow-hidden rounded-xl border border-[var(--border)] max-sm:h-[380px]">
            <PlatformExplorer />
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Illustrative layouts of the connected experience in development.
          </p>
        </section>
        <section
          aria-labelledby="choice-heading"
          className="grid gap-8 border-t border-[var(--border)] py-14 lg:grid-cols-2 lg:py-20"
        >
          <h2 className={cn(HOME_TYPE.h2, "max-w-[22ch]")} id="choice-heading">
            You do not have to install everything.
          </h2>
          <div>
            <p className="max-w-[54ch] text-base leading-relaxed text-[var(--text-secondary)]">
              Web works in your browser. Desktop and Voice are separate, optional downloads. Local
              notes and recordings do not become a shared library just because you sign in.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <SimCtaLink href="/web" withArrow>
                Explore Web
              </SimCtaLink>
              <SimCtaLink href="/guides/what-stays-on-device" variant="outline">
                Understand your data choices
              </SimCtaLink>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
