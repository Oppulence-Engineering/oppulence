type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Sidebar Workflows is already the selected focus while a workflow is open.
 * The URL focus does not change, so the canvas has to be told to show the list.
 */
export function requestWorkflowLibrary(): void {
  for (const listener of listeners) listener();
}

export function subscribeWorkflowLibrary(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
