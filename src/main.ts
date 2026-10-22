// App shell: note state, MIDI and computer-keyboard input, staff and chord-name rendering.
// All music theory lives in theory.ts.
import "./style.css";
import * as VF from "vexflow/bravura";
import {
  analyze, buildKey, prettyAcc, spellNote, KEY_MAJORS, KEY_MINORS,
  type Analysis, type KeyContext,
} from "./theory";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let currentKey: KeyContext | null = null;

/* ---------------------------------------------------------------
   Note state
   held:      note -> Set of "source:channel" keys holding it down
   sustained: notes released while the pedal was down
   --------------------------------------------------------------- */
const held = new Map<number, Set<string>>();
const sustained = new Set<number>();
const pedalBySource = new Map<string, boolean>();   // "source:channel" -> bool
let lastResult: Analysis | null = null;

function pedalDown() {
  for (const v of pedalBySource.values()) if (v) return true;
  return false;
}

function noteOn(note: number, src: string) {
  if (!held.has(note)) held.set(note, new Set());
  held.get(note)!.add(src);
  sustained.delete(note);
  changed();
}

function noteOff(note: number, src: string) {
  const s = held.get(note);
  if (!s) return;
  s.delete(src);
  if (s.size === 0) {
    held.delete(note);
    if (pedalDown()) sustained.add(note);
  }
  changed();
}

function setPedal(src: string, down: boolean) {
  pedalBySource.set(src, down);
  if (!pedalDown()) sustained.clear();
  $("pedal").classList.toggle("down", pedalDown());
  changed();
}

function allOff(srcPrefix?: string) {
  for (const [note, s] of held) {
    for (const k of [...s]) if (!srcPrefix || k.startsWith(srcPrefix)) s.delete(k);
    if (s.size === 0) held.delete(note);
  }
  if (!srcPrefix) { sustained.clear(); pedalBySource.clear(); }
  $("pedal").classList.toggle("down", pedalDown());
  changed();
}

function soundingNotes() {
  const set = new Set(held.keys());
  if ($<HTMLInputElement>("optPedal").checked) for (const n of sustained) set.add(n);
  return [...set].sort((a, b) => a - b);
}

/* ---------------------------------------------------------------
   MIDI input
   --------------------------------------------------------------- */
const enabledInputs = new Map<string, boolean>();  // input.id -> bool

function handleMidi(input: MIDIInput, e: MIDIMessageEvent) {
  if (enabledInputs.get(input.id) === false || !e.data) return;
  const [status, d1, d2] = e.data;
  const type = status & 0xf0, ch = status & 0x0f;
  const src = input.id + ":" + ch;
  if (type === 0x90 && d2 > 0) noteOn(d1, src);
  else if (type === 0x80 || (type === 0x90 && d2 === 0)) noteOff(d1, src);
  else if (type === 0xb0) {
    if (d1 === 64) setPedal(src, d2 >= 64);
    else if (d1 === 120 || d1 === 123) allOff(input.id + ":");
  }
}

function renderInputs(access: MIDIAccess) {
  const box = $("inputs");
  box.innerHTML = "";
  let count = 0;
  for (const input of access.inputs.values()) {
    if (input.state !== "connected") continue;
    count++;
    if (!enabledInputs.has(input.id)) enabledInputs.set(input.id, true);
    input.onmidimessage = (e) => handleMidi(input, e);
    const label = document.createElement("label");
    label.className = "chip" + (enabledInputs.get(input.id) ? "" : " off");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = enabledInputs.get(input.id)!;
    cb.onchange = () => {
      enabledInputs.set(input.id, cb.checked);
      label.classList.toggle("off", !cb.checked);
      if (!cb.checked) allOff(input.id + ":");
    };
    label.append(cb, document.createTextNode(input.name || "MIDI input"));
    box.append(label);
  }
  setStatus(count ? "ok" : "", count ? `${count} input${count > 1 ? "s" : ""}` : "No MIDI inputs found — plug one in");
}

function setStatus(kind: string, text: string) {
  $("statusDot").className = "dot " + kind;
  $("statusText").textContent = text;
}

async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    setStatus("err", "This browser has no Web MIDI — use Chrome or Edge");
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    renderInputs(access);
    access.onstatechange = () => renderInputs(access);
  } catch {
    const framed = window.top !== window;
    setStatus("err", framed
      ? "MIDI blocked: this page is inside a preview. Open the file directly in Chrome or Edge."
      : "MIDI access denied. Allow MIDI in the address bar's site settings, then click Retry.");
    $("retry").hidden = false;
  }
}

/* ---------------------------------------------------------------
   Grand staff rendering (VexFlow)
   --------------------------------------------------------------- */
const STAFF_W = 300;
const LINE_SP = 10;

function drawStaff(notes: number[], result: Analysis | null) {
  const el = $<HTMLDivElement>("staff");
  el.innerHTML = "";
  const sustainedNow = new Set([...sustained].filter(n => !held.has(n)));
  const spelled = notes.map(n => ({ ...spellNote(n, result, currentKey), sus: sustainedNow.has(n) }));
  const treble = spelled.filter(n => n.midi >= 60);
  const bass = spelled.filter(n => n.midi < 60);

  // Fixed layout: always reserve ledger-line room for the full piano range
  // (C8 = step 56 above the treble's top line F5 = 38; A0 = step 5 below the bass's bottom line G2 = 18),
  // so the staff never moves when a very high or low note appears.
  const top = 34 + (56 - 38) * (LINE_SP / 2);
  const bottom = 34 + (18 - 5) * (LINE_SP / 2);
  const gap = 72;
  const trebleY = top, bassY = trebleY + 4 * LINE_SP + gap;
  const height = bassY + 4 * LINE_SP + bottom;
  const width = STAFF_W + 40;

  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const svg = el.querySelector("svg")!;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "min(100%, 620px)";
  svg.style.height = "auto";

  const opts = { space_above_staff_ln: 0, space_below_staff_ln: 0 };
  const tStave = new VF.Stave(26, trebleY, STAFF_W, opts).addClef("treble");
  const bStave = new VF.Stave(26, bassY, STAFF_W, opts).addClef("bass");
  if (currentKey) { tStave.addKeySignature(currentKey.vfKey); bStave.addKeySignature(currentKey.vfKey); }
  const startX = Math.max(tStave.getNoteStartX(), bStave.getNoteStartX());
  tStave.setNoteStartX(startX);
  bStave.setNoteStartX(startX);
  tStave.setContext(ctx).draw();
  bStave.setContext(ctx).draw();
  new VF.StaveConnector(tStave, bStave).setType("brace").setContext(ctx).draw();
  new VF.StaveConnector(tStave, bStave).setType("singleLeft").setContext(ctx).draw();
  new VF.StaveConnector(tStave, bStave).setType("singleRight").setContext(ctx).draw();

  // Both chords share one tick context pinned at a fixed x, so noteheads never
  // slide sideways (accidentals extend to the left of that point instead).
  const NOTE_X = 120;
  const tc = new VF.TickContext();
  const built: VF.StaveNote[] = [];
  const makeChord = (list: typeof spelled, clef: string, stave: VF.Stave) => {
    if (!list.length) return;
    const note = new VF.StaveNote({
      clef, duration: "w",
      keys: list.map(n => `${n.letter.toLowerCase()}${n.acc}/${n.octave}`),
    });
    list.forEach((n, i) => {
      // Show an accidental only where the note differs from the key signature
      const sig = currentKey ? (currentKey.sigAlter[n.letter] || 0) : 0;
      if (n.alter !== sig) note.addModifier(new VF.Accidental(n.alter === 0 ? "n" : n.acc), i);
      if (n.sus) note.setKeyStyle(i, { fillStyle: "#9a968c", strokeStyle: "#9a968c" });
    });
    note.setStave(stave).setContext(ctx);
    note.addToModifierContext(new VF.ModifierContext());
    tc.addTickable(note);
    built.push(note);
  };
  makeChord(treble, "treble", tStave);
  makeChord(bass, "bass", bStave);
  if (built.length) {
    tc.preFormat().setX(NOTE_X);
    built.forEach(n => n.draw());
  }
}

/* ---------------------------------------------------------------
   Chord name rendering
   --------------------------------------------------------------- */
function renderName(result: Analysis | null) {
  const nameEl = $("chordName");
  const subEl = $("chordSub");
  const altsEl = $("alts");
  const notesEl = $("notes");

  if (!result) {
    // Keep the last chord visible, faded
    nameEl.classList.toggle("stale", !!lastResult);
    if (!lastResult) { nameEl.innerHTML = ""; subEl.textContent = "Play something"; $("roman").textContent = ""; }
    notesEl.innerHTML = "";
    return;
  }
  lastResult = result;
  nameEl.classList.remove("stale");

  if (result.kind === "chord") {
    const b = result.best;
    const root = esc(b.root[0]) + (b.root.length > 1 ? `<span class="acc">${prettyAcc(b.root.slice(1))}</span>` : "");
    // Quality letters stay full size; numeric extensions get raised
    const m = b.type.match(/^(m(?!aj)|dim|aug|sus\d?|maj|M)?(.*)$/)!;
    const qual = m[1] || "", ext = m[2] || "";
    let html = root + esc(qual);
    if (ext) html += `<span class="ext">${esc(prettyAcc(ext))}</span>`;
    if (b.bass) html += `<span class="bass">/${esc(b.bass[0])}${b.bass.length > 1 ? `<span class="acc">${prettyAcc(b.bass.slice(1))}</span>` : ""}</span>`;
    nameEl.innerHTML = html;
  } else {
    nameEl.textContent = prettyAcc(result.text);
  }
  $("roman").textContent = result.roman || "";
  subEl.textContent = (result.sub || "").replace(/([A-G])(#{1,2}|b{1,2})/g, (_, l, acc) => l + prettyAcc(acc));
  altsEl.innerHTML = result.alts.map(a => `<span>${esc(prettyAcc(a))}</span>`).join("");
}

function renderNoteList(notes: number[], result: Analysis | null) {
  const notesEl = $("notes");
  if (!notes.length) { notesEl.innerHTML = ""; return; }
  notesEl.innerHTML = notes.map(n => {
    const s = spellNote(n, result, currentKey);
    const label = esc(prettyAcc(s.letter + s.acc) + s.octave);
    return held.has(n) ? `<b>${label}</b>` : `<span class="sus">${label}</span>`;
  }).join("  ");
}

function esc(s: unknown) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/* ---------------------------------------------------------------
   Update loop: staff redraws every frame something changes; the
   chord name waits for ~40ms of stillness so a rolled chord
   doesn't flicker through partial names.
   --------------------------------------------------------------- */
let frameQueued = false, nameTimer: ReturnType<typeof setTimeout> | undefined;

function changed() {
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      const notes = soundingNotes();
      const result = analyze(notes, currentKey);
      drawStaff(notes, result);
      renderNoteList(notes, result);
    });
  }
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => renderName(analyze(soundingNotes(), currentKey)), 40);
}

/* ---------------------------------------------------------------
   Computer keyboard input (for testing without a controller)
   --------------------------------------------------------------- */
const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16 };
let kbdOctave = 4;
const kbdDown = new Map<string, number>();
function showOct() { $("kbdOct").textContent = "Keyboard octave: C" + kbdOctave; }

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || target.tagName === "INPUT" || target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (e.key === "Escape") { allOff(); kbdDown.clear(); return; }
  if (e.repeat) { if (k in KEYMAP || k === " ") e.preventDefault(); return; }
  if (k === " ") { e.preventDefault(); setPedal("kbd", true); return; }
  if (k === "z") { kbdOctave = Math.max(0, kbdOctave - 1); showOct(); return; }
  if (k === "x") { kbdOctave = Math.min(8, kbdOctave + 1); showOct(); return; }
  if (k in KEYMAP) {
    const note = 12 * (kbdOctave + 1) + KEYMAP[k];
    kbdDown.set(k, note);
    noteOn(note, "kbd");
  }
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") { setPedal("kbd", false); return; }
  if (kbdDown.has(k)) { noteOff(kbdDown.get(k)!, "kbd"); kbdDown.delete(k); }
});
window.addEventListener("blur", () => { for (const n of kbdDown.values()) noteOff(n, "kbd"); kbdDown.clear(); setPedal("kbd", false); });

$("retry").onclick = () => { $("retry").hidden = true; setStatus("", "Requesting MIDI access…"); initMidi(); };
$("panic").onclick = () => { allOff(); kbdDown.clear(); };
$<HTMLInputElement>("optPedal").onchange = changed;

const keySel = $<HTMLSelectElement>("keySel");
function onKeyChange() {
  currentKey = buildKey(keySel.value);
  try { localStorage.setItem("chordDisplay.key", keySel.value); } catch {}
  lastResult = null;
  keySel.blur();   // so computer-key note input keeps working
  changed();
}

(function initKeySelect() {
  const opt = (value: string, text: string) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
  keySel.append(opt("", "None"));
  const gMaj = document.createElement("optgroup"); gMaj.label = "Major";
  KEY_MAJORS.forEach(t => gMaj.append(opt(t + ":major", prettyAcc(t) + " major")));
  const gMin = document.createElement("optgroup"); gMin.label = "Minor";
  KEY_MINORS.forEach(t => gMin.append(opt(t + ":minor", prettyAcc(t) + " minor")));
  keySel.append(gMaj, gMin);
  let saved = "";
  try { saved = localStorage.getItem("chordDisplay.key") || ""; } catch {}
  keySel.value = saved;
  if (keySel.value !== saved) keySel.value = "";
  currentKey = buildKey(keySel.value);
  keySel.onchange = onKeyChange;
})();

showOct();
changed();
initMidi();

// Exposed for testing in the console: __chord.analyze([60,64,67])
declare global {
  interface Window { __chord: unknown }
}
window.__chord = {
  setKey: (v: string) => { keySel.value = v; onKeyChange(); },
  analyze: (notes: number[]) => analyze(notes, currentKey),
  noteOn, noteOff, setPedal, allOff,
};
