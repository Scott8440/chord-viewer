// The reference section: a sidebar listing the pages (the open page's sections under it) beside the open page. A click
// in the sidebar scrolls to that section; while reading, the sidebar marks the section in view. Clicking a table row
// picks it out, fading the table's other rows. A page can have a key picker, showing only one key's rows.
import type { ReferencePage } from "../reference/pages";
import { esc } from "./html";

export interface ReferenceView {
  /** Shows a page (the first, if `id` isn't one) */
  show(pages: readonly ReferencePage[], id?: string): void;
  clear(): void;
}

/** `scroller` is what scrolls the page (the main area), for following the section in view */
export function createReferenceView(el: HTMLElement, scroller: HTMLElement): ReferenceView {
  let observer: IntersectionObserver | null = null;
  let pages: readonly ReferencePage[] = [];

  // A page's key picker: only that key's table rows, and no section introductions (the tables are what's wanted)
  el.addEventListener("change", e => {
    const pick = (e.target as HTMLElement).closest<HTMLSelectElement>("select[data-key-pick]");
    if (!pick) return;
    pick.blur(); // so Space stays the pedal
    showKey(pick.value);
  });
  function showKey(key: string) {
    const article = el.querySelector("article");
    if (!article) return;
    article.classList.toggle("keyPicked", key !== "");
    for (const row of article.querySelectorAll<HTMLElement>("tr[data-key]"))
      row.hidden = key !== "" && row.dataset.key !== key;
  }

  el.addEventListener("click", e => {
    // A table row: picks it out (the table's other rows fade); clicking it again puts the table back
    const row = (e.target as HTMLElement).closest<HTMLTableRowElement>(".refTable tbody tr");
    if (row) {
      const table = row.closest("table")!;
      const picked = !row.classList.contains("picked");
      for (const r of table.querySelectorAll("tbody tr.picked")) r.classList.remove("picked");
      row.classList.toggle("picked", picked);
      table.classList.toggle("hasPick", picked);
      return;
    }
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-ref]");
    if (!link) return;
    e.preventDefault();
    link.blur(); // so Space stays the pedal
    const [pageId, sectionId] = link.dataset.ref!.split("/");
    const open = el.querySelector<HTMLElement>("article")?.dataset.page;
    if (pageId !== open) show(pages, pageId);
    const target = sectionId ? el.querySelector(`#ref-${CSS.escape(sectionId)}`) : el.querySelector("article");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /** Marks the sidebar link of the section nearest the top of the view */
  function follow() {
    observer?.disconnect();
    const sections = [...el.querySelectorAll<HTMLElement>("article section")];
    const visible = new Set<string>();
    observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const current = sections.find(s => visible.has(s.id));
        if (!current) return;
        for (const a of el.querySelectorAll<HTMLElement>("nav a[data-section]"))
          a.classList.toggle("current", `ref-${a.dataset.section}` === current.id);
      },
      // A section counts once it reaches the top third of the view
      { root: scroller, rootMargin: "0px 0px -66% 0px" },
    );
    sections.forEach(s => observer!.observe(s));
  }

  function show(all: readonly ReferencePage[], id?: string) {
    pages = all;
    const page = all.find(p => p.id === id) ?? all[0];
    if (!page) return;
    const nav = all
      .map(p => {
        const sections =
          p === page
            ? `<ol>${p.sections.map(s => `<li><a href="#ref-${esc(s.id)}" data-ref="${esc(p.id)}/${esc(s.id)}" data-section="${esc(s.id)}">${esc(s.title)}</a></li>`).join("")}</ol>`
            : "";
        return `<li><a href="#" class="refPageLink${p === page ? " open" : ""}" data-ref="${esc(p.id)}">${esc(p.title)}</a>${sections}</li>`;
      })
      .join("");
    // Page content is the app's own (src/reference/), written as HTML
    const article =
      `<article data-page="${esc(page.id)}"><h1>${esc(page.title)}</h1>${page.intro ?? ""}` +
      page.sections.map(s => `<section id="ref-${esc(s.id)}"><h2>${esc(s.title)}</h2>${s.html}</section>`).join("") +
      `</article>`;
    el.innerHTML = `<nav aria-label="Reference contents"><div class="refNavTitle">Reference</div><ul>${nav}</ul></nav>${article}`;
    follow();
  }

  return {
    show,
    clear() {
      observer?.disconnect();
      observer = null;
      el.innerHTML = "";
    },
  };
}
