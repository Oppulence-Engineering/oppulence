/**
 * A control with role="combobox" does not take its accessible name from the
 * text drawn inside it. Chrome treats that text as the current value and
 * leaves the name blank, so three filters on one row are announced as three
 * empty menus. The name has to carry both the category and the selected
 * choice: after someone picks "Failed", "Failed" alone no longer says
 * whether that menu filters status, trigger, or where the run happened.
 */
export function comboboxFilterName(category: string, current: string): string {
  const choice = current.trim();
  return choice ? `${category}, ${choice}` : category;
}
