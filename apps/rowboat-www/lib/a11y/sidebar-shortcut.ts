/**
 * The shell toggles the sidebar on this key with no modifier. Titles and the
 * command palette share it so a hover tip cannot drift from the listener.
 *
 * `[ ]` reads as the space bar. A trailing `[` with no close looks truncated.
 */
export const SIDEBAR_TOGGLE_KEY = "[";

export function sidebarShortcutTitle(action: "Collapse sidebar" | "Toggle sidebar"): string {
  return `${action} ${SIDEBAR_TOGGLE_KEY}`;
}
