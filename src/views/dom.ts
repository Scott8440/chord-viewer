// Elements a view has just written, or must find in what it was given. A missing one is a bug in the markup, so it
// fails at once with the selector, not later as "cannot read properties of null".

/** The first element under `root` matching `selector`; throws if there is none */
export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
