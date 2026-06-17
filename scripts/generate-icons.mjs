// Generate favicons + app icons from public/brand/sentinel-mark-s.svg.
// Run via `npm run icons`.

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "public/brand/sentinel-mark-s.svg");
const outDir = resolve(root, "public");

const CARBON = { r: 0x16, g: 0x1b, b: 0x20, alpha: 1 };

async function render(svgBuf, size, padRatio = 0.14) {
  const inner = Math.max(1, Math.round(size * (1 - padRatio * 2)));
  const mark = await sharp(svgBuf, { density: 512 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: CARBON },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

async function write(name, buf) {
  await writeFile(resolve(outDir, name), buf);
  console.log("  ✓", name, `(${buf.length} B)`);
}

await mkdir(outDir, { recursive: true });
const svg = await readFile(src);

const targets = {
  "favicon-16.png": 16,
  "favicon-32.png": 32,
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
};

console.log("→ PNG icons");
for (const [name, size] of Object.entries(targets)) {
  await write(name, await render(svg, size, name.startsWith("apple") ? 0.18 : 0.14));
}

console.log("→ favicon.ico (16/32/48 multi-size)");
const sizes = [16, 32, 48];
const buffers = await Promise.all(sizes.map((s) => render(svg, s, 0.12)));
const ico = await pngToIco(buffers);
await write("favicon.ico", ico);

console.log("done.");
