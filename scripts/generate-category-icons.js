"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const LIB_FILE = path.join(ROOT, "assets", "data", "library.json");
const OUT_DIR = path.join(ROOT, "assets", "icons", "categories", "generated");
const MAP_FILE = path.join(ROOT, "assets", "icons", "categories", "generated-map.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hash(input) {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initials(name) {
  const src = clean(name);
  if (!src) return "UG";

  const parts = src
    .replace(/[^0-9A-Za-zА-Яа-яЁёÄäÖöÜüÝýŞşÇçŽžŇňİı]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "UG";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgForCategory(id, name) {
  const h = hash(id + "|" + name);
  const hueA = h % 360;
  const hueB = (hueA + 48) % 360;
  const hueC = (hueA + 112) % 360;
  const abbr = escapeXml(initials(name));
  const safeName = escapeXml(clean(name || id));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-labelledby="t-${id}">
  <title id="t-${id}">${safeName}</title>
  <defs>
    <linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA} 64% 44%)"/>
      <stop offset="100%" stop-color="hsl(${hueB} 68% 34%)"/>
    </linearGradient>
    <linearGradient id="b-${id}" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="hsl(${hueC} 76% 84% / 0.92)"/>
      <stop offset="100%" stop-color="hsl(${hueA} 80% 94% / 0.88)"/>
    </linearGradient>
  </defs>

  <rect x="6" y="6" width="84" height="84" rx="18" fill="url(#g-${id})"/>
  <rect x="12" y="12" width="72" height="72" rx="15" fill="url(#b-${id})"/>

  <circle cx="48" cy="36" r="18" fill="hsl(${hueB} 75% 27% / 0.88)"/>
  <path d="M48 24v9h9v6h-9v9h-6v-9h-9v-6h9v-9z" fill="#fff"/>

  <rect x="20" y="56" width="56" height="20" rx="8" fill="hsl(${hueA} 56% 30% / 0.9)"/>
  <text x="48" y="70" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">${abbr}</text>
</svg>
`;
}

function main() {
  const data = readJson(LIB_FILE);
  const categories = Array.isArray(data.categories) ? data.categories : [];
  ensureDir(OUT_DIR);

  const outMap = {};
  let count = 0;

  categories.forEach((cat) => {
    const id = clean(cat && cat.id);
    if (!id) return;
    const name = clean(cat && cat.name ? cat.name : id);
    const fileName = `${id}.svg`;
    const rel = `assets/icons/categories/generated/${fileName}`;
    const outPath = path.join(OUT_DIR, fileName);

    fs.writeFileSync(outPath, svgForCategory(id, name), "utf8");
    outMap[id] = rel;
    count += 1;
  });

  fs.writeFileSync(MAP_FILE, JSON.stringify(outMap, null, 2) + "\n", "utf8");
  console.log(`[icons] generated=${count}`);
  console.log(`[icons] dir=${OUT_DIR}`);
}

main();

