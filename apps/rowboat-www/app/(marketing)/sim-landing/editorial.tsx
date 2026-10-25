import Link from "next/link";

import { cn } from "@/lib/sim/cn";

import { HOME_INSET, HOME_TYPE, LANDING_CONTENT_WIDTH, LANDING_GUTTER } from "./tokens";

const applications = [
  {
    name: "Oppulence Web",
    href: "/web",
    role: "Your work, organized.",
    body: "Start in your browser. Review relationships, source material, prepared work, and approvals without installing an app.",
  },
  {
    name: "Oppulence Desktop",
    href: "/desktop",
    role: "Your full working environment.",
    body: "Add local files, a Markdown vault, an embedded browser, keyboard navigation, and native tools for deeper work.",
  },
  {
    name: "Oppulence Voice",
    href: "/voice-app",
    role: "Your assistant within reach.",
    body: "An optional companion for dictation, meeting recording, and thought capture. The shared Ask Oppulence connection is in development.",
  },
] as const;

const journey = [
  {
    title: "Before the meeting",
    body: "Bring prior emails, previous meetings, relevant notes, and open questions into a short brief.",
  },
  {
    title: "During the conversation",
    body: "Capture with appropriate consent and a visible recording indicator. Stay focused on the person speaking.",
  },
  {
    title: "After the call",
    body: "Review the transcript, correct speakers and relationship matches, and choose what becomes shared context.",
  },
  {
    title: "When the next email arrives",
    body: "Prepare a reply with the relevant meeting and earlier correspondence beside it. Check the sources and uncertain claims.",
  },
  {
    title: "Until the work is done",
    body: "Approve the next step, check its result, and keep the request visible while you wait for a response.",
  },
] as const;

export function SimAgentMomentum() {
  return (
    <section
      aria-label="One assistant across Web, Desktop, and Voice"
      className={cn("border-b border-[var(--border)]", LANDING_CONTENT_WIDTH, LANDING_GUTTER)}
      id="agent-momentum"
    >
      <div className={cn(HOME_INSET, "py-12 max-sm:py-8")}>
        <h2 className={cn("max-w-[25ch] text-balance text-[var(--text-primary)]", HOME_TYPE.h2)}>
          Start on the web. Add what you need.
        </h2>
        <p className={cn("mt-6 max-w-[54ch] text-[var(--text-body)]", HOME_TYPE.lead)}>
          Your work moves between a browser, your computer, and conversations. We are building one
          assistant that keeps the people, context, and next steps connected across all three.
        </p>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {applications.map((app) => (
            <article key={app.name}>
              <h3 className="text-[18px] text-[var(--text-primary)]">
                <Link
                  className="underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                  href={app.href}
                >
                  {app.name}
                </Link>
              </h3>
              <p className="mt-2 text-[15px] font-medium text-[var(--text-primary)]">{app.role}</p>
              <p className="mt-2 text-[15px] leading-[1.55] text-[var(--text-secondary)]">
                {app.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SimProblemEditorial() {
  return (
    <section
      className={cn("border-b border-[var(--border)]", LANDING_CONTENT_WIDTH, LANDING_GUTTER)}
      id="problem"
    >
      <div className={cn(HOME_INSET, "py-16 max-sm:py-10")}>
        <h2 className={cn("max-w-[24ch] text-balance text-[var(--text-primary)]", HOME_TYPE.h2)}>
          The next email should remember the last meeting.
        </h2>
        <p className={cn("mt-6 max-w-[46ch] text-pretty text-[var(--text-body)]", HOME_TYPE.lead)}>
          A customer asks about the rollout. You discussed the deadline on a call, sent the plan
          last week, and wrote down one concern afterward. We are bringing that context beside the
          reply, with the source of each detail clear.
        </p>
        <ol className="mt-12 border-t border-[var(--border)]">
          {journey.map((step, index) => (
            <li className="grid gap-2 border-b border-[var(--border)] py-6" key={step.title}>
              <h3 className="text-[18px] font-medium text-[var(--text-primary)]">
                {index + 1}. {step.title}
              </h3>
              <p className="max-w-[54ch] text-[15px] leading-[1.55] text-[var(--text-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[60ch] text-[14px] leading-[1.55] text-[var(--text-secondary)]">
          In development: the full journey from Voice capture to relationship history, plus shared
          Web and Desktop navigation. The previews show how these pieces will fit together.
        </p>
      </div>
    </section>
  );
}

/** @deprecated Use SimAgentMomentum and SimProblemEditorial. */
export function SimEditorial() {
  return (
    <>
      <SimAgentMomentum />
      <SimProblemEditorial />
    </>
  );
}
