// The page's elements, by id.
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** A button's click action, after taking focus off it so Space (the pedal) doesn't press it again */
export function onPress(id: string, action: () => void) {
  const el = $(id);
  el.onclick = () => {
    el.blur();
    action();
  };
}
