// Generate public/og.png from public/brand/og-template.svg.
// Run via `npm run icons` (chained).

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "public/brand/og-template.svg");
const out = resolve(root, "public/og.png");

const svg = await readFile(src);
const buf = await sharp(svg, { density: 144 })
  .resize(1200, 630, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(out, buf);
console.log("  ✓ public/og.png", `(${buf.length} B)`);
