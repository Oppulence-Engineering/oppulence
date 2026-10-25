import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/sim/cn";

import { platformPages, type PlatformPage } from "../../marketing-data";
import { JsonLd } from "../../marketing-primitives";
import { breadcrumbJsonLd } from "../../metadata";
import { SimCtaLink } from "../primitives";
import { HOME_INSET, HOME_TYPE, LANDING_CONTENT_WIDTH } from "../tokens";
import { SimSubpageFaqSection } from "./sim-subpage-faq";

export function SimProductNav({ active }: { active?: string }) {
  return (
    <nav
      aria-label="Products"
      className="flex flex-wrap items-center gap-x-6 border-b border-[var(--border)] py-3 text-sm"
    >
      <Link
        aria-current={!active ? "page" : undefined}
        className="flex min-h-11 items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        href="/products"
      >
        All products
      </Link>
      {platformPages.map((product) => (
        <Link
          aria-current={active === product.slug ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center border-b-2 border-transparent",
            active === product.slug
              ? "border-[var(--text-primary)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
          href={`/${product.slug}`}
          key={product.slug}
        >
          {product.name.replace("Oppulence ", "")}
        </Link>
      ))}
    </nav>
  );
}

export function SimPlatformPage({ page }: { page: PlatformPage }) {
  return (
    <div className={LANDING_CONTENT_WIDTH} data-product-page={page.slug}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
          { name: page.name, path: `/${page.slug}` },
        ])}
      />
      <div className={HOME_INSET}>
        <SimProductNav active={page.slug} />
        <section
          aria-labelledby="product-heading"
          className="grid items-center gap-10 py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-24"
        >
          <div className="min-w-0">
            <h1
              className="max-w-[16ch] text-balance text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.05] tracking-[-0.035em] text-[var(--text-primary)]"
              id="product-heading"
            >
              {page.title}
            </h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{page.name}. </span>
              {page.lede}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SimCtaLink href={page.cta.href} withArrow>
                {page.cta.label}
              </SimCtaLink>
              <SimCtaLink href="#capabilities" variant="outline">
                Explore {page.name.replace("Oppulence ", "")}
              </SimCtaLink>
            </div>
          </div>
          <figure className="min-w-0">
            <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              <Image
                alt={page.screenshotAlt}
                className="object-contain"
                fill
                priority
                sizes="(max-width: 1023px) 90vw, 45vw"
                src={page.screenshot}
              />
            </div>
            <figcaption className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {page.name} · Product preview{page.slug === "voice-app" ? "" : " with example data"}
            </figcaption>
          </figure>
        </section>
        <dl className="grid gap-6 border-y border-[var(--border)] py-7 md:grid-cols-3">
          {page.specs.map((spec) => (
            <div key={spec.term}>
              <dt className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                {spec.term}
              </dt>
              <dd className="text-base text-[var(--text-primary)]">{spec.detail}</dd>
            </div>
          ))}
        </dl>
        <section
          aria-labelledby="availability-heading"
          className="grid gap-6 py-10 md:grid-cols-[1fr_2fr]"
        >
          <h2 className="text-xl tracking-tight" id="availability-heading">
            What you can use today
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-[var(--text-secondary)]">
            <p>{page.availability.current}</p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">In development. </span>
              {page.availability.planned}
            </p>
          </div>
        </section>
        <div className="scroll-mt-24" id="capabilities">
          {page.sections.map((section, index) => (
            <section
              aria-labelledby={`capability-${index}`}
              className="grid items-center gap-8 border-t border-[var(--border)] py-14 lg:grid-cols-2 lg:gap-16 lg:py-20"
              key={section.title}
            >
              <div className={cn("min-w-0", index % 2 === 0 && "lg:order-2")}>
                <h2
                  className={cn(HOME_TYPE.h2, "max-w-[22ch] text-balance")}
                  id={`capability-${index}`}
                >
                  {section.title}
                </h2>
                {section.status ? (
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">{section.status}</p>
                ) : null}
                <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[var(--text-secondary)]">
                  {section.body}
                </p>
                <ul className="mt-6 space-y-3 border-l border-[var(--border)] pl-5 text-sm leading-relaxed text-[var(--text-primary)]">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
              <figure className="min-w-0">
                <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                  <Image
                    alt={section.alt}
                    className="object-contain"
                    fill
                    sizes="(max-width: 1023px) 90vw, 45vw"
                    src={section.screenshot}
                  />
                </div>
                <figcaption className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {section.alt}
                </figcaption>
              </figure>
            </section>
          ))}
        </div>
        <section
          aria-labelledby="setup-heading"
          className="border-t border-[var(--border)] py-14 lg:py-20"
        >
          <h2 className={HOME_TYPE.h2} id="setup-heading">
            Get started with {page.name}.
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {page.setup.map((step, index) => (
              <li className="border-t border-[var(--border)] pt-5" key={step.title}>
                <p aria-hidden="true" className="mb-5 text-sm text-[var(--text-secondary)]">
                  0{index + 1}
                </p>
                <h3 className="text-lg tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <SimSubpageFaqSection
          className="pb-14 lg:pb-20"
          faqs={page.faqs}
          heading={`Questions about ${page.name}`}
        />
        <section
          aria-labelledby="product-start-heading"
          className="border-y border-[var(--border)] py-14 lg:py-20"
        >
          <h2 className={cn(HOME_TYPE.h2, "max-w-[24ch] text-balance")} id="product-start-heading">
            {page.closing.title}
          </h2>
          <p className="mt-5 max-w-[54ch] text-lg leading-relaxed text-[var(--text-secondary)]">
            {page.closing.body}
          </p>
          <div className="mt-7">
            <SimCtaLink href={page.cta.href} withArrow>
              {page.cta.label}
            </SimCtaLink>
          </div>
        </section>
        <aside aria-labelledby="other-products-heading" className="py-12">
          <h2 className="mb-6 text-xl" id="other-products-heading">
            Add another way to work, when you need it.
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            {platformPages
              .filter((product) => product.slug !== page.slug)
              .map((product) => (
                <div key={product.slug}>
                  <h3 className="text-lg">{product.name}</h3>
                  <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                    {product.summary}
                  </p>
                  <SimCtaLink
                    className="mt-4"
                    href={`/${product.slug}`}
                    variant="outline"
                    withArrow
                  >
                    Explore {product.name.replace("Oppulence ", "")}
                  </SimCtaLink>
                </div>
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
