// Runs every voicing in voicings.json through the built page's analyzer.
// Usage: npm run build && npm test   (needs `npx playwright install chromium` once)
const { chromium } = require("playwright");
const path = require("path");
const cases = require("./voicings.json");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "..", "dist", "chord-display.html"));
  let fail = 0;
  for (const c of cases) {
    const r = await page.evaluate(({ key, notes }) => {
      __chord.setKey(key);
      const r = __chord.analyze(notes);
      return { text: r.text, roman: r.roman || "" };
    }, c);
    const ok = r.text === c.expect && (!c.roman || r.roman === c.roman);
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${(c.key || "-").padEnd(9)} ${JSON.stringify(c.notes).padEnd(22)} got ${r.text}${r.roman ? " (" + r.roman + ")" : ""}  want ${c.expect}${c.roman ? " (" + c.roman + ")" : ""}`);
  }
  if (errors.length) console.log("Page errors:", errors);
  console.log(`\n${cases.length - fail}/${cases.length} passed`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
