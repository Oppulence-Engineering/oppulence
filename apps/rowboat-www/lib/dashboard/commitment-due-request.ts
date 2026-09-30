type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

/**
 * Home's overdue count is past-due promises. The register is usually
 * unmounted when that count is clicked, so the "Due soon or overdue"
 * filter has to be waiting when the register mounts.
 */
export function requestDueCommitments(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  pending = false;
  for (const listener of listeners) listener();
}

export function subscribeDueCommitments(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}
