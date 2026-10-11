type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

/**
 * Recovery, tasks, and the promise register can ask for a company while
 * Companies is unmounted. The request waits until that surface mounts and
 * opens New company. A surface that is already open hears it immediately.
 */
export function requestCompanyCreate(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  pending = false;
  for (const listener of listeners) listener();
}

export function subscribeCompanyCreate(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Ask Companies to open New company, then switch to that surface. */
export function openCompanyCreate(openCompanies: () => void): void {
  requestCompanyCreate();
  openCompanies();
}
