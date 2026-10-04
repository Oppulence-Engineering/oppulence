type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

/**
 * Home's overdue count is past-due promises in every direction. The register
 * is usually unmounted when that count is clicked, so the overdue slice has
 * to be waiting when the register mounts.
 *
 * Development mounts the register twice. Clearing the request on the first
 * subscribe drops it before the second mount, and the register opens on
 * "What we owe" instead of the past-due slice.
 */
export function requestDueCommitments(): void {
  pending = true;
  if (listeners.size === 0) return;
  for (const listener of listeners) listener();
}

/** The reader left the past-due slice, so a later visit should not reopen it. */
export function dismissDueCommitments(): void {
  pending = false;
}

export function subscribeDueCommitments(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pending) {
      queueMicrotask(() => {
        if (listeners.size === 0) pending = false;
      });
    }
  };
}
