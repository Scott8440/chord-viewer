// The page's elements, by id.
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
