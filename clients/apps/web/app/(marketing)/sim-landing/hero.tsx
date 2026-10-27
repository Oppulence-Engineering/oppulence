import Link from "next/link";

import { cn } from "@/lib/sim/cn";

import { SimHeroPlatformStage } from "./hero-platform-stage";
import { HOME_INSET, HOME_TYPE, LANDING_CONTENT_WIDTH, LANDING_GUTTER } from "./tokens";
import { SimHeroCta } from "./primitives";

/** Sim `Hero` + painted `HeroPlatformStage` using Oppulence copy and animated product loop. */
export function SimHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className={cn(
        "flex flex-col items-start pt-24 text-left max-sm:pt-14 max-xl:pt-20",
        LANDING_CONTENT_WIDTH,
        LANDING_GUTTER,
      )}
      id="hero"
    >
      <p className="sr-only">
        Oppulence is an email-first personal assistant built around your relationships. It connects
        email, meetings, and notes so you can review the context, prepare a reply, and follow
        through.
      </p>

      <div className={HOME_INSET}>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(380px,440px)] gap-16 text-left [align-items:last_baseline] max-[1400px]:grid-cols-1 max-[1400px]:items-start max-[1400px]:gap-8">
          <div className="flex min-w-0 flex-col items-start gap-6">
            <Link
              className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] pr-3 pl-2 text-[13px] duration-150 hover:bg-[var(--surface-3)]"
              href="/products"
            >
              <span className="h-4 shrink-0 rounded-full bg-transparent px-1.5 font-medium text-[10px] uppercase leading-none tracking-[0.06em] text-[var(--text-secondary)]">
                Oppulence
              </span>
              <span className="truncate font-medium text-[var(--text-primary)]">
                Web, Desktop, and Voice
              </span>
            </Link>

            <h1
              className={cn(
                "max-w-[960px] text-balance text-[var(--text-primary)] max-[1728px]:text-[64px]",
                HOME_TYPE.h1,
              )}
              id="hero-heading"
            >
              One assistant,
              <br />
              wherever you work.
            </h1>
          </div>

          <div className="flex min-w-0 flex-col items-start gap-8 max-[1400px]:max-w-[640px]">
            <p className="max-w-[44ch] text-pretty font-normal text-[18px] leading-[1.5] text-[var(--text-body)] max-sm:text-[16px]">
              An email-first personal assistant that brings your relationships, meetings, and notes
              into the work at hand. Find the context, prepare the reply, and keep the next step in
              view.
            </p>
            <div className="max-sm:w-full">
              <SimHeroCta size="display" />
            </div>
          </div>
        </div>
      </div>

      <SimHeroPlatformStage />
    </section>
  );
}
