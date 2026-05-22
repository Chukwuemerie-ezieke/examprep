// One-shot icon generator for PWA — Harmony Digital Consults brand
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outDir = path.join(__dirname, "..", "client", "public");
fs.mkdirSync(outDir, { recursive: true });

// "Any" icon: full shield centered in transparent square, with safe margin.
const anySvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A8E9B"/>
      <stop offset="1" stop-color="#0F4856"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E8B547"/>
      <stop offset="1" stop-color="#C8941F"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="#f7f3ec"/>
  <g transform="translate(56 36) scale(4.0)">
    <path d="M50 4 L92 18 L92 58 C92 78 75 96 50 104 C25 96 8 78 8 58 L8 18 Z" fill="url(#g)"/>
    <text x="50" y="60" text-anchor="middle" font-family="'Plus Jakarta Sans','Inter',sans-serif" font-weight="800" font-size="40" fill="#ffffff">HD</text>
    <path d="M22 80 Q50 72 78 80 Q50 88 22 80 Z" fill="url(#gold)"/>
  </g>
</svg>`;

// Maskable: solid brand background fills entire canvas (safe area = inner 80%).
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A8E9B"/>
      <stop offset="1" stop-color="#0F4856"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E8B547"/>
      <stop offset="1" stop-color="#C8941F"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="#0F4856"/>
  <g transform="translate(106 86) scale(3.0)">
    <path d="M50 4 L92 18 L92 58 C92 78 75 96 50 104 C25 96 8 78 8 58 L8 18 Z" fill="url(#g)"/>
    <text x="50" y="60" text-anchor="middle" font-family="'Plus Jakarta Sans','Inter',sans-serif" font-weight="800" font-size="40" fill="#ffffff">HD</text>
    <path d="M22 80 Q50 72 78 80 Q50 88 22 80 Z" fill="url(#gold)"/>
  </g>
</svg>`;

async function run() {
  await sharp(Buffer.from(anySvg)).resize(192, 192).png().toFile(path.join(outDir, "icon-192.png"));
  await sharp(Buffer.from(anySvg)).resize(512, 512).png().toFile(path.join(outDir, "icon-512.png"));
  await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(path.join(outDir, "icon-maskable.png"));
  // Also overwrite the legacy favicon.png with the new logo
  await sharp(Buffer.from(anySvg)).resize(64, 64).png().toFile(path.join(outDir, "favicon.png"));
  console.log("Icons generated.");
}
run().catch((e) => { console.error(e); process.exit(1); });
