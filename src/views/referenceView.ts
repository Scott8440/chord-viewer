// The reference section: a sidebar listing the pages (the open page's sections under it) beside the open page. A click
// in the sidebar scrolls to that section; while reading, the sidebar marks the section in view. Clicking a table row
// picks it out, fading the table's other rows. A page can have a key picker, showing only one key's rows, and cells
// that show something when clicked (`detail`).
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
    // An open detail belongs to a row that may now be hidden
    for (const table of article.querySelectorAll("table")) closeDetail(table);
    for (const row of article.querySelectorAll<HTMLElement>("tr[data-key]"))
      row.hidden = key !== "" && row.dataset.key !== key;
  }

  /** The detail row under a table's row, if one is open */
  const openDetail = (table: Element) => table.querySelector<HTMLTableRowElement>("tr.refDetailRow");
  /** Closes a table's detail row and unmarks its cell */
  function closeDetail(table: Element) {
    openDetail(table)?.remove();
    for (const c of table.querySelectorAll(".shown")) c.classList.remove("shown");
  }

  /**
   * A cell with something to show: toggles it (the cell shows its own short reveal), and opens what the page builds
   * for it in a row just under the cell's row, closing any other open in that table
   */
  function toggleDetail(cell: HTMLElement) {
    const page = pages.find(p => p.id === el.querySelector<HTMLElement>("article")?.dataset.page);
    const row = cell.closest("tr");
    const table = cell.closest("table");
    if (!page?.detail || !row || !table) return;
    const show = !cell.classList.contains("revealed");
    cell.classList.toggle("revealed", show);
    if (!show) {
      if (cell.classList.contains("shown")) closeDetail(table);
      return;
    }
    closeDetail(table);
    cell.classList.add("shown");
    const detail = document.createElement("tr");
    detail.className = "refDetailRow";
    // The box takes the table's width rather than widening it (its own width counts as nothing)
    detail.innerHTML = `<td colspan="${row.cells.length}"><div class="refDetailBox">${page.detail(cell.dataset.detail!)}</div></td>`;
    row.after(detail);
  }
  // Enter on a focused cell does what a click does (Space stays the pedal)
  el.addEventListener("keydown", e => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (cell && e.key === "Enter") {
      e.preventDefault();
      toggleDetail(cell);
    }
  });

  el.addEventListener("click", e => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (cell) {
      toggleDetail(cell);
      return;
    }
    // A table row: picks it out (the table's other rows fade); clicking it again puts the table back
    const row = (e.target as HTMLElement).closest<HTMLTableRowElement>(".refTable tbody tr");
    if (row?.classList.contains("refDetailRow")) return;
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
