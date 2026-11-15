// The page's elements, by id.

/** The element with this id; throws if the page has none (index.html and the code disagree) */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

/** A button's click action, after taking focus off it so Space (the pedal) doesn't press it again */
export function onPress(id: string, action: () => void) {
  const el = $(id);
  el.onclick = () => {
    el.blur();
    action();
  };
}
