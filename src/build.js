// Inlines tonal + VexFlow into src/app.html to produce a single offline file.
const fs = require("fs");
const path = require("path");
const nm = path.join(__dirname, "..", "node_modules");
const safe = s => s.replace(/<\/script/gi, "<\\/script");
let html = fs.readFileSync(path.join(__dirname, "app.html"), "utf8");
html = html.replace("/*__TONAL__*/", () => safe(fs.readFileSync(path.join(nm, "tonal/browser/tonal.min.js"), "utf8")));
html = html.replace("/*__VEXFLOW__*/", () => safe(fs.readFileSync(path.join(nm, "vexflow/build/cjs/vexflow-bravura.js"), "utf8")));
fs.mkdirSync(path.join(__dirname, "..", "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "dist", "chord-display.html"), html);
console.log("Wrote dist/chord-display.html", html.length, "bytes");
