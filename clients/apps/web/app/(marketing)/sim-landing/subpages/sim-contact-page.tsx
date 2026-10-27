import Link from "next/link";

import { cn } from "@/lib/sim/cn";

import { SimChevronArrow } from "../chevron-arrow";
import { LANDING_CONTENT_WIDTH, LANDING_GUTTER } from "../tokens";
import { SIM_SURFACE_CARD } from "./sim-surface-card";

const channels = [
  {
    title: "In-page support",
    body: "Use the support chat on this site for help with your account, connected sources, or choosing an app.",
    href: null,
  },
  {
    title: "Discord",
    body: "Join the community to discuss workflows and share product feedback.",
    href: "https://discord.gg/wajrgmJQ6b",
    external: true,
  },
  {
    title: "Email",
    body: "Email hello@oppulence.io for product questions or help getting started.",
    href: "mailto:hello@oppulence.io",
  },
  {
    title: "Security reports",
    body: "Use the responsible disclosure page, not a public channel.",
    href: "/responsible-disclosure",
  },
] as const;

function ChannelCard({
  title,
  body,
  href,
  external,
}: {
  title: string;
  body: string;
  href: string | null;
  external?: boolean;
}) {
  const cardClass = cn(
    SIM_SURFACE_CARD,
    "flex h-full flex-col gap-3 p-6 transition-colors hover-hover:hover:bg-[var(--surface-hover)]",
    href && "group/link",
  );

  const inner = (
    <>
      <strong className="text-[16px] text-[var(--text-primary)] leading-[1.3]">{title}</strong>
      <p className="text-[14px] text-[var(--text-secondary)] leading-[1.5]">{body}</p>
      {href ? <SimChevronArrow className="mt-auto" /> : null}
    </>
  );

  if (!href) {
    return <article className={cardClass}>{inner}</article>;
  }

  if (external) {
    return (
      <a className={cardClass} href={href} rel="noopener noreferrer" target="_blank">
        {inner}
      </a>
    );
  }

  return (
    <Link className={cardClass} href={href}>
      {inner}
    </Link>
  );
}

/** Sim contact split — value prop left, channel card right. No fake customer proof. */
export function SimContactPage() {
  return (
    <section
      aria-labelledby="contact-heading"
      className={cn(
        "grid w-full grid-cols-1 gap-y-10 pb-16 max-sm:gap-y-8 max-sm:pb-12 xl:grid-cols-2 xl:grid-rows-[auto_1fr] xl:gap-x-8 xl:gap-y-0",
        LANDING_CONTENT_WIDTH,
        LANDING_GUTTER,
      )}
      id="contact"
    >
      <div className="flex flex-col gap-5 xl:col-start-1 xl:row-start-1 xl:self-start">
        <p className="text-[12px] text-[var(--text-muted)] uppercase tracking-[0.08em]">
          [contact]
        </p>
        <h1
          className="max-w-[16ch] text-balance text-[48px] text-[var(--text-primary)] leading-[1.1] max-sm:text-[32px] max-xl:text-[40px]"
          id="contact-heading"
        >
          Talk to the Oppulence team.
        </h1>
        <p className="max-w-[46ch] text-pretty text-[var(--text-body)] text-lg leading-[1.5] max-sm:text-base">
          Tell us where you need help: email, meetings, local work, or voice capture. Use support
          chat or email for account questions, and the community for public discussion.
        </p>
      </div>

      <div className={cn(SIM_SURFACE_CARD, "min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1")}>
        <div className="flex flex-col gap-4 p-6 max-sm:p-5">
          <h2 className="text-[18px] text-[var(--text-primary)]">Reach the team</h2>
          <div className="grid gap-3">
            {channels.map((channel) => (
              <ChannelCard key={channel.title} {...channel} />
            ))}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] leading-[1.5]">
            You can start on the web without installing an app. See{" "}
            <Link
              className="text-[var(--text-body)] underline underline-offset-4"
              href="/resources"
            >
              resources
            </Link>{" "}
            for setup guides and product details.
          </p>
        </div>
      </div>
    </section>
  );
}
