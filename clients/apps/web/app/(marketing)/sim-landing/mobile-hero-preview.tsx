const blocks = [
  {
    title: "Recall the meeting",
    body: "Find the conversation behind the question.",
  },
  {
    title: "Prepare the reply",
    body: "Review the draft beside its sources.",
  },
  {
    title: "Follow through",
    body: "Approve the action and check the result.",
  },
] as const;

/** Keep every workflow step readable without scaling a desktop diagram. */
export function SimMobileHeroPreview() {
  return (
    <ol
      aria-label="Planned workflow: meeting context, reviewed reply, tracked follow-up"
      className="mt-12 grid w-full list-none gap-6 border-y border-[var(--border)] py-6 sm:grid-cols-3 lg:hidden"
    >
      {blocks.map((block, index) => (
        <li key={block.title}>
          <p className="text-base font-medium text-[var(--text-primary)]">
            {index + 1}. {block.title}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-body)]">{block.body}</p>
        </li>
      ))}
    </ol>
  );
}
