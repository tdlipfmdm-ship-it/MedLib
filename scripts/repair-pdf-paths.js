"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, "assets", "data", "library.source.json");
const REPORT_PATH = path.join(ROOT, "reports", "pdfpath-repair-report.json");
const BOOKS_DB_DIR = path.join(ROOT, "BooksDB");
const DRY_RUN = process.argv.includes("--dry-run");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function walkPdfs(dirPath, out) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkPdfs(full, out);
      continue;
    }
    if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
      out.push(full);
    }
  }
}

function relPosix(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function basenameNoExt(p) {
  const base = path.posix.basename(String(p || "").replace(/\\/g, "/"));
  return base.replace(/\.pdf$/i, "");
}

function extractLeadingNumber(p) {
  const normalized = String(p || "").replace(/\\/g, "/");
  const m = normalized.match(/^BooksDB\/\s*(\d{1,4})(?=[\s._-]|$)/i);
  return m ? String(Number(m[1])) : "";
}

function cp1251ByteFromCodePoint(cp) {
  if (cp >= 0x00 && cp <= 0x7f) return cp;
  if (cp >= 0x0410 && cp <= 0x044f) return cp - 0x0350;
  const map = {
    0x0402: 0x80,
    0x0403: 0x81,
    0x201a: 0x82,
    0x0453: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x20ac: 0x88,
    0x2030: 0x89,
    0x0409: 0x8a,
    0x2039: 0x8b,
    0x040a: 0x8c,
    0x040c: 0x8d,
    0x040b: 0x8e,
    0x040f: 0x8f,
    0x0452: 0x90,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x2122: 0x99,
    0x0459: 0x9a,
    0x203a: 0x9b,
    0x045a: 0x9c,
    0x045c: 0x9d,
    0x045b: 0x9e,
    0x045f: 0x9f,
    0x00a0: 0xa0,
    0x040e: 0xa1,
    0x045e: 0xa2,
    0x0408: 0xa3,
    0x00a4: 0xa4,
    0x0490: 0xa5,
    0x00a6: 0xa6,
    0x00a7: 0xa7,
    0x0401: 0xa8,
    0x00a9: 0xa9,
    0x0404: 0xaa,
    0x00ab: 0xab,
    0x00ac: 0xac,
    0x00ad: 0xad,
    0x00ae: 0xae,
    0x0407: 0xaf,
    0x00b0: 0xb0,
    0x00b1: 0xb1,
    0x0406: 0xb2,
    0x0456: 0xb3,
    0x0491: 0xb4,
    0x00b5: 0xb5,
    0x00b6: 0xb6,
    0x00b7: 0xb7,
    0x0451: 0xb8,
    0x2116: 0xb9,
    0x0454: 0xba,
    0x00bb: 0xbb,
    0x0458: 0xbc,
    0x0405: 0xbd,
    0x0455: 0xbe,
    0x0457: 0xbf,
  };
  return Object.prototype.hasOwnProperty.call(map, cp) ? map[cp] : null;
}

function decodeMojibakeCp1251Utf8(input) {
  const text = String(input || "");
  if (!text) return "";
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const b = cp1251ByteFromCodePoint(cp);
    if (b === null) return "";
    bytes.push(b);
  }
  const out = Buffer.from(bytes).toString("utf8");
  if (!out || out.includes("\uFFFD")) return "";
  return out;
}

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´"]/g, "")
    .replace(/[_/\\.-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateCyrillic(input) {
  const src = String(input || "");
  if (!src) return "";
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
    і: "i",
    ї: "i",
    є: "e",
    ґ: "g",
  };
  let out = "";
  for (const ch of src) {
    const lower = ch.toLowerCase();
    out += Object.prototype.hasOwnProperty.call(map, lower) ? map[lower] : ch;
  }
  return out;
}

function getNormalizedVariants(input) {
  const source = String(input || "");
  const variants = new Set();
  const addVariant = (v) => {
    const n = normalizeText(v);
    if (n) variants.add(n);
  };
  addVariant(source);
  addVariant(transliterateCyrillic(source));
  const fixed1 = decodeMojibakeCp1251Utf8(source);
  if (fixed1 && fixed1 !== source) {
    addVariant(fixed1);
    addVariant(transliterateCyrillic(fixed1));
  }
  const fixed2 = fixed1 ? decodeMojibakeCp1251Utf8(fixed1) : "";
  if (fixed2 && fixed2 !== fixed1) {
    addVariant(fixed2);
    addVariant(transliterateCyrillic(fixed2));
  }
  return Array.from(variants);
}

const STOP_WORDS = new Set([
  "booksdb",
  "pdf",
  "book",
  "kitap",
  "tom",
  "chast",
  "part",
  "edition",
  "izd",
]);

function tokenSetFromVariants(variants) {
  const out = new Set();
  for (const v of variants) {
    const parts = String(v || "").split(/\s+/).filter(Boolean);
    for (const token of parts) {
      if (token.length < 2) continue;
      if (STOP_WORDS.has(token)) continue;
      out.add(token);
    }
  }
  return out;
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

function partialTokenOverlap(setA, setB) {
  const source = Array.from(setA).filter((t) => t.length >= 4);
  if (!source.length || !setB.size) return 0;
  let hits = 0;
  for (const tokenA of source) {
    let found = false;
    for (const tokenB of setB) {
      if (tokenB.includes(tokenA) || tokenA.includes(tokenB)) {
        found = true;
        break;
      }
    }
    if (found) hits += 1;
  }
  return hits / source.length;
}

function bigrams(text) {
  const t = String(text || "");
  if (t.length < 2) return [];
  const arr = [];
  for (let i = 0; i < t.length - 1; i += 1) arr.push(t.slice(i, i + 2));
  return arr;
}

function diceCoefficient(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  if (!gx.length || !gy.length) return 0;
  const counts = new Map();
  for (const g of gx) counts.set(g, (counts.get(g) || 0) + 1);
  let inter = 0;
  for (const g of gy) {
    const n = counts.get(g) || 0;
    if (n > 0) {
      inter += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * inter) / (gx.length + gy.length);
}

function maxDice(variants, target) {
  let best = 0;
  for (const v of variants) {
    const d = diceCoefficient(v, target);
    if (d > best) best = d;
  }
  return best;
}

function scoreCandidate(state, candidate, prefix, totalCandidates, mode) {
  const pathWeight = mode === "global-fallback" ? 1.2 : 4.2;
  const diceWeight = mode === "global-fallback" ? 0.9 : 2.6;
  const contextWeight = mode === "global-fallback" ? 4.4 : 1.5;
  const pathPartialWeight = mode === "global-fallback" ? 1.8 : 1.0;
  const contextPartialWeight = mode === "global-fallback" ? 1.0 : 0.6;
  let score = 0;
  if (prefix && candidate.prefix === prefix) score += 2.5;
  score += pathWeight * jaccard(state.pathTokens, candidate.tokens);
  score += diceWeight * maxDice(state.pathVariants, candidate.normBase);
  score += contextWeight * jaccard(state.contextTokens, candidate.tokens);
  score += pathPartialWeight * partialTokenOverlap(state.pathTokens, candidate.tokens);
  score += contextPartialWeight * partialTokenOverlap(state.contextTokens, candidate.tokens);
  if (state.normRawPath && candidate.normRel === state.normRawPath) score += 6;
  if (state.pathVariants.some((v) => v && candidate.normBase.includes(v))) score += 1.2;
  if (state.pathVariants.some((v) => v && v.includes(candidate.normBase))) score += 0.8;
  if (totalCandidates > 1 && state.pathTokens.size <= 1) score -= 0.6;
  return score;
}

function buildCandidate(fullPath) {
  const rel = relPosix(fullPath);
  const base = path.posix.basename(rel);
  const baseNo = basenameNoExt(base);
  const baseVariants = getNormalizedVariants(baseNo);
  return {
    rel,
    base,
    prefix: extractLeadingNumber(rel),
    normRel: normalizeText(rel),
    normBase: normalizeText(baseNo),
    tokens: tokenSetFromVariants(baseVariants),
  };
}

function chooseMatch(book, brokenPath, byPrefix, allCandidates) {
  const prefix = extractLeadingNumber(brokenPath);
  let candidates = prefix ? byPrefix.get(prefix) || [] : [];
  const usedGlobalFallback = !candidates.length;
  if (!candidates.length) candidates = allCandidates;

  if (!candidates.length) {
    return { ok: false, reason: "no-candidates", prefix };
  }

  if (prefix && candidates.length === 1) {
    return {
      ok: true,
      candidate: candidates[0],
      reason: "prefix-unique",
      prefix,
      score: 999,
      margin: 999,
    };
  }

  const rawPath = String(brokenPath || "");
  const pathForMatch = basenameNoExt(rawPath);
  const pathVariants = getNormalizedVariants(pathForMatch);
  const pathTokens = tokenSetFromVariants(pathVariants);
  const contextVariants = getNormalizedVariants(
    [book.title || "", book.author || "", book.searchText || ""].join(" ")
  );
  const contextTokens = tokenSetFromVariants(contextVariants);
  const state = {
    pathVariants,
    pathTokens,
    contextTokens,
    normRawPath: normalizeText(rawPath),
  };

  if (usedGlobalFallback) {
    const narrowed = candidates.filter((candidate) => {
      const pathOverlap = jaccard(state.pathTokens, candidate.tokens);
      const ctxOverlap = jaccard(state.contextTokens, candidate.tokens);
      return pathOverlap > 0 || ctxOverlap > 0;
    });
    if (narrowed.length) candidates = narrowed;
  }

  const mode = usedGlobalFallback ? "global-fallback" : "prefix";
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(state, candidate, prefix, candidates.length, mode),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const margin = top && second ? top.score - second.score : top ? top.score : 0;

  if (!top) return { ok: false, reason: "no-top-candidate", prefix };

  if (!prefix || usedGlobalFallback) {
    const okNoPrefix =
      (top.score >= 2.2 && margin >= 0.2) || (top.score >= 1.5 && margin >= 0.9);
    return okNoPrefix
      ? {
          ok: true,
          candidate: top.candidate,
          reason: "no-prefix-fuzzy",
          prefix,
          score: top.score,
          margin,
        }
      : {
          ok: false,
          reason: "no-prefix-low-confidence",
          prefix,
          score: top.score,
          margin,
          topCandidates: scored.slice(0, 3).map((s) => ({
            path: s.candidate.rel,
            score: Number(s.score.toFixed(3)),
          })),
        };
  }

  const okPrefixMulti =
    top.score >= 2.3 && (margin >= 0.28 || top.score >= 4.8 || candidates.length <= 2);
  return okPrefixMulti
    ? {
        ok: true,
        candidate: top.candidate,
        reason: "prefix-fuzzy",
        prefix,
        score: top.score,
        margin,
      }
    : {
        ok: false,
        reason: "prefix-low-confidence",
        prefix,
        score: top.score,
        margin,
        topCandidates: scored.slice(0, 3).map((s) => ({
          path: s.candidate.rel,
          score: Number(s.score.toFixed(3)),
        })),
      };
}

function main() {
  const source = readJson(SOURCE_PATH);
  const books = Array.isArray(source.books) ? source.books : [];

  const pdfFullPaths = [];
  walkPdfs(BOOKS_DB_DIR, pdfFullPaths);
  const allCandidates = pdfFullPaths.map(buildCandidate);
  const byPrefix = new Map();
  for (const candidate of allCandidates) {
    if (!candidate.prefix) continue;
    if (!byPrefix.has(candidate.prefix)) byPrefix.set(candidate.prefix, []);
    byPrefix.get(candidate.prefix).push(candidate);
  }

  let checkedMissing = 0;
  let fixed = 0;
  const unresolved = [];
  const changes = [];

  for (const book of books) {
    const current = String(book.pdfPath || "").trim();
    if (!current) continue;

    const currentFull = path.join(ROOT, current);
    if (fs.existsSync(currentFull)) continue;

    checkedMissing += 1;
    const match = chooseMatch(book, current, byPrefix, allCandidates);
    if (!match.ok || !match.candidate) {
      unresolved.push({
        id: book.id,
        title: book.title,
        oldPdfPath: current,
        reason: match.reason,
        prefix: match.prefix || "",
        score: Number((match.score || 0).toFixed(3)),
        margin: Number((match.margin || 0).toFixed(3)),
        topCandidates: match.topCandidates || [],
      });
      continue;
    }

    const next = match.candidate.rel;
    if (next !== current) {
      book.pdfPath = next;
      fixed += 1;
      changes.push({
        id: book.id,
        title: book.title,
        oldPdfPath: current,
        newPdfPath: next,
        matchReason: match.reason,
        score: Number((match.score || 0).toFixed(3)),
        margin: Number((match.margin || 0).toFixed(3)),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    booksTotal: books.length,
    pdfFilesInBooksDB: allCandidates.length,
    missingPathsChecked: checkedMissing,
    fixedCount: fixed,
    unresolvedCount: unresolved.length,
    unresolved,
    changes,
  };

  ensureDir(path.join(ROOT, "reports"));
  writeJson(REPORT_PATH, report);

  if (!DRY_RUN && fixed > 0) {
    writeJson(SOURCE_PATH, source);
  }

  const lines = [
    `SOURCE=${path.relative(ROOT, SOURCE_PATH).replace(/\\/g, "/")}`,
    `REPORT=${path.relative(ROOT, REPORT_PATH).replace(/\\/g, "/")}`,
    `DRY_RUN=${DRY_RUN}`,
    `BOOKS_TOTAL=${books.length}`,
    `PDF_FILES=${allCandidates.length}`,
    `MISSING_CHECKED=${checkedMissing}`,
    `FIXED=${fixed}`,
    `UNRESOLVED=${unresolved.length}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

main();
