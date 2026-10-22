import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// Keep the old output name: dist/chord-display.html
const renameHtml: Plugin = {
  name: "rename-html",
  enforce: "post",
  generateBundle(_, bundle) {
    const html = bundle["index.html"];
    if (html) html.fileName = "chord-display.html";
  },
};

export default defineConfig({
  base: "./",
  plugins: [viteSingleFile(), renameHtml],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
