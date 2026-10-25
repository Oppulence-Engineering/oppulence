"use client";

import Image from "next/image";
import Link from "next/link";
import { type ComponentType, useState } from "react";

import { cn } from "@/lib/sim/cn";

import { IsoIntegrateIllustration, IsoMonitorIllustration, type IsoTone } from "./iso-marks";
import {
  HOME_INSET,
  HOME_TYPE,
  LANDING_CONTENT_WIDTH,
  LANDING_GUTTER,
  LANDING_STAGE_WINDOW_RADIUS,
  LANDING_WINDOW_SHADOW,
} from "./tokens";
import { SimPlacementFrame } from "./primitives";
import { PLATFORM_LOOP_DESIGN } from "./shared/platform-loop-constants";
import { ResponsiveDesignStage } from "./shared/responsive-design-stage";

const MARK_SIZE = 112;
const MARK_PLACEMENT = "pointer-events-none -ml-2";
const GROW_HOVERED = "md:grow-[1.25]";
const GROW_IDLE = "md:grow-[0.75]";
const WINDOW_PLACEMENT = "top-0 left-8 w-[135cqw] max-sm:left-5 md:w-[67.5cqw]";

interface PlatformSuiteCard {
  href: string;
  headingId: string;
  name: string;
  description: string;
  tone: "mid" | "dark";
  src: string;
  Mark: ComponentType<{ size?: number; tone?: IsoTone; className?: string }>;
}

const cards: PlatformSuiteCard[] = [
  {
    href: "/features/account-mission-control",
    headingId: "platform-find",
    name: "Bring the history into view",
    description:
      "Find the relevant conversation, meeting, and open question before you prepare a reply.",
    tone: "dark",
    src: "/marketing/relationship-web-list.png",
    Mark: IsoIntegrateIllustration,
  },
  {
    href: "/features/governed-actions",
    headingId: "platform-gate",
    name: "Review the next step",
    description:
      "Read the proposed reply beside its sources. Correct it, approve it, or leave it for later.",
    tone: "mid",
    src: "/marketing/desktop-email.png",
    Mark: IsoMonitorIllustration,
  },
];

/** Sim `PlatformSuite` — two cards that widen on hover. */
export function SimPlatformSuite() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  return (
    <section
      aria-labelledby="platform-heading"
      className={cn("flex flex-col", LANDING_CONTENT_WIDTH, LANDING_GUTTER)}
      id="platform"
    >
      <div className={cn(HOME_INSET, "flex flex-col gap-20 max-sm:gap-10 max-lg:gap-14")}>
        <div className="flex flex-col items-center gap-8 text-center max-sm:gap-5">
          <h2
            className={cn("text-balance text-[var(--text-primary)]", HOME_TYPE.h2Display)}
            id="platform-heading"
          >
            The context behind a better reply.
          </h2>
          <p className={cn("max-w-[48rem] text-balance text-[var(--text-body)]", HOME_TYPE.body)}>
            A useful assistant connects what was said to what happens next. Source review and
            approval are the foundation of the email-first experience we are building.
          </p>
        </div>

        <div className="flex flex-col gap-4 overflow-hidden [container-type:inline-size] md:flex-row lg:aspect-[2/1]">
          {cards.map((card, index) => {
            const dark = card.tone === "dark";
            const idle = hoveredCard !== null && hoveredCard !== index;
            return (
              <div
                className={cn(
                  "relative flex min-h-[420px] flex-col overflow-hidden rounded-[12px] motion-reduce:transition-none max-sm:min-h-[360px] md:basis-0 md:transition-[flex-grow] lg:min-h-0 md:[transition-duration:280ms] md:[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                  hoveredCard === null && "md:grow",
                  hoveredCard === index && GROW_HOVERED,
                  idle && GROW_IDLE,
                )}
                data-iso-hover=""
                data-platform-card={index}
                key={card.name}
              >
                <SimPlacementFrame className="absolute inset-0" tone={card.tone} />
                <div
                  className={cn(
                    "relative flex flex-1 flex-col transition-opacity duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  )}
                  data-platform-card-content=""
                >
                  <div className="flex max-w-[20rem] flex-col gap-3 px-8 pt-8">
                    <card.Mark
                      className={MARK_PLACEMENT}
                      size={MARK_SIZE}
                      tone={dark ? "dark" : "light"}
                    />
                    <h3
                      className={cn(
                        HOME_TYPE.h3,
                        dark
                          ? "text-[var(--text-inverse)] dark:text-[var(--text-primary)]"
                          : "text-[var(--text-primary)]",
                      )}
                      id={card.headingId}
                    >
                      <Link
                        className="outline-none after:absolute after:inset-0 after:z-10 after:rounded-[12px] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-[var(--text-secondary)] focus-visible:after:outline-offset-[-2px]"
                        href={card.href}
                        onBlur={() => setHoveredCard(null)}
                        onFocus={() => setHoveredCard(index)}
                        onMouseEnter={() => setHoveredCard(index)}
                        onMouseLeave={() => setHoveredCard(null)}
                      >
                        {card.name}
                      </Link>
                    </h3>
                    <p
                      className={cn(
                        HOME_TYPE.body,
                        dark
                          ? "text-[var(--surface-6)] dark:text-[var(--text-body)]"
                          : "text-[var(--text-body)]",
                      )}
                    >
                      {card.description}
                    </p>
                  </div>
                  <div className="relative mt-8 flex-1">
                    <div
                      aria-hidden="true"
                      className={cn(
                        "sim-product-preview absolute aspect-[1280/735] overflow-hidden bg-[var(--surface-1)]",
                        LANDING_STAGE_WINDOW_RADIUS,
                        LANDING_WINDOW_SHADOW,
                        WINDOW_PLACEMENT,
                      )}
                      data-product-preview=""
                      inert
                    >
                      <ResponsiveDesignStage
                        align="start"
                        className="absolute inset-0"
                        contentClassName="relative h-full w-full"
                        height={PLATFORM_LOOP_DESIGN.height}
                        width={PLATFORM_LOOP_DESIGN.width}
                      >
                        <Image
                          alt=""
                          className="object-cover object-top"
                          fill
                          sizes="540px"
                          src={card.src}
                        />
                      </ResponsiveDesignStage>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
