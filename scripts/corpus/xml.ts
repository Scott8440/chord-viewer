// A small XML parser, enough for MuseScore's .mscx files (well-formed, no DTDs): elements, attributes and text.
// Build-time only, so the app needs no XML library.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** The element's own text, entities decoded (text between child elements is joined) */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : ENTITIES[e] ?? m);

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = tag.exec(src));) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.text += decode(src.slice(last, m.index));
    last = tag.lastIndex;
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (!m[3]) continue;   // comment or declaration
    if (m[2]) {
      if (top.name !== m[3]) throw new Error(`Mismatched </${m[3]}> (open: <${top.name}>)`);
      top.text = top.text.trim();
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const el: XmlElement = { name: m[3], attrs, children: [], text: "" };
    top.children.push(el);
    if (!m[5]) stack.push(el);
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`);
  return root;
}

/** The first child with this name */
export const child = (el: XmlElement | undefined, name: string) => el?.children.find(c => c.name === name);
/** Every child with this name */
export const kids = (el: XmlElement | undefined, name: string) => el?.children.filter(c => c.name === name) ?? [];
/** A child's text, or undefined */
export const textOf = (el: XmlElement | undefined, name: string) => child(el, name)?.text;
