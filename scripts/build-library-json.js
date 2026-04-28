"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "assets", "data");
const SOURCE_FILE = path.join(DATA_DIR, "library.source.json");
const OUTPUT_FILE = path.join(DATA_DIR, "library.json");
const OUTPUT_INDEX_FILE = path.join(DATA_DIR, "library.index.json");
const FALLBACK_FILE = OUTPUT_FILE;
const PDF_MODE = String(process.env.MEDLIB_PDF_MODE || "linked").toLowerCase();
const INCLUDE_PDF_LINKS = PDF_MODE !== "none";

const LANGUAGE_ID_BY_CODE = {
  "BELLI DÄL": "fb4b8a5e-552b-42c2-a9a4-e5f6902a1d3a",
  DE: "09d3d900-9979-410c-95f5-99440d35de12",
  EN: "b9815f3d-8170-4edf-a441-493f27e3fb86",
  RU: "ea35bf27-4d9d-4d2d-b097-ad1a48acd0d1",
  TM: "50d58a36-ce94-4fac-9234-17a898af8d69",
};

const LANGUAGE_NAME_BY_ID = {
  "fb4b8a5e-552b-42c2-a9a4-e5f6902a1d3a": "Belli däl",
  "09d3d900-9979-410c-95f5-99440d35de12": "DE",
  "b9815f3d-8170-4edf-a441-493f27e3fb86": "EN",
  "ea35bf27-4d9d-4d2d-b097-ad1a48acd0d1": "RU",
  "50d58a36-ce94-4fac-9234-17a898af8d69": "TM",
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanPath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function writeJson(filePath, value, options = {}) {
  const pretty = options.pretty !== false;
  const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  fs.writeFileSync(filePath, json + "\n", "utf8");
}

function normalizeLangCode(value) {
  const raw = clean(value).toUpperCase();
  if (!raw) return "";
  if (raw === "UNKNOWN" || raw === "BELLI DÄL") return "Belli däl";
  if (["RU", "EN", "TM", "DE"].includes(raw)) return raw;
  return raw.slice(0, 8);
}

function getLangMeta(langIdRaw, langCodeRaw) {
  const normalizedCode = normalizeLangCode(langCodeRaw);
  if (langIdRaw && LANGUAGE_NAME_BY_ID[langIdRaw]) {
    const code = normalizedCode === "Belli däl" ? "" : normalizedCode;
    return {
      id: langIdRaw,
      code: code || clean(LANGUAGE_NAME_BY_ID[langIdRaw]),
      name: clean(LANGUAGE_NAME_BY_ID[langIdRaw]),
    };
  }

  if (!normalizedCode || normalizedCode === "Belli däl") {
    const id = LANGUAGE_ID_BY_CODE["BELLI DÄL"];
    return { id, code: "", name: LANGUAGE_NAME_BY_ID[id] };
  }

  const id = LANGUAGE_ID_BY_CODE[normalizedCode] || LANGUAGE_ID_BY_CODE["BELLI DÄL"];
  return { id, code: normalizedCode, name: LANGUAGE_NAME_BY_ID[id] || normalizedCode };
}

function toYearText(year, yearTextRaw) {
  if (Number.isFinite(Number(year)) && Number(year) > 0) {
    return String(Number(year));
  }
  const text = clean(yearTextRaw);
  return text || "";
}

function toYear(year, yearTextRaw) {
  if (Number.isFinite(Number(year)) && Number(year) > 0) return Number(year);
  const match = clean(yearTextRaw).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function buildReaderHref(bookId, title, pdfPath) {
  if (!clean(pdfPath)) return "";
  const from = "book.html?id=" + encodeURIComponent(bookId);
  return (
    "reader.html?book=" +
    encodeURIComponent(bookId) +
    "&pdf=" +
    encodeURIComponent(pdfPath) +
    "&from=" +
    encodeURIComponent(from) +
    "&title=" +
    encodeURIComponent(title || "")
  );
}

function normalizeBook(book, categoryNameById) {
  if (!book || !clean(book.id)) return null;

  const id = clean(book.id);
  const title = clean(book.title || "Kitap");
  const author = clean(book.author || "Awtor görkezilmedik");
  const year = toYear(book.year, book.yearText);
  const yearText = toYearText(book.year, book.yearText);

  const lang = getLangMeta(book.langId, book.langCode || (book.meta || {}).language);
  const categoryIds = Array.isArray(book.categoryIds)
    ? book.categoryIds.map(clean).filter(Boolean)
    : [];
  const categoryNamesInput = Array.isArray(book.categoryNames) ? book.categoryNames : [];
  const categoryNames = categoryIds.map(function (catId, idx) {
    return clean(categoryNamesInput[idx] || categoryNameById.get(catId) || catId);
  });

  categoryIds.forEach(function (catId, idx) {
    const catName = clean(categoryNames[idx] || catId);
    if (catName && !categoryNameById.has(catId)) {
      categoryNameById.set(catId, catName);
    }
  });

  const pdfPath = cleanPath(book.pdfPath);
  const coverThumb = clean((book.cover || {}).thumb || "assets/covers/thumbs/" + id + ".webp");
  const coverFull = clean((book.cover || {}).full || "assets/covers/" + id + ".webp");

  const searchText =
    clean(book.searchText) ||
    clean(
      [
        title,
        author,
        lang.code || lang.name,
        categoryNames.join(" "),
        yearText,
        path.basename(pdfPath || ""),
      ].join(" ")
    );

  const normalized = {
    id,
    title,
    author,
    year,
    yearText,
    langId: lang.id,
    langCode: lang.code,
    langName: lang.name,
    categoryIds,
    categoryNames,
    searchText,
    cover: {
      thumb: coverThumb,
      full: coverFull,
    },
    links: {
      detail: "book.html?id=" + encodeURIComponent(id),
      legacyDetail: clean((book.links || {}).legacyDetail || "books/" + id + ".html"),
    },
    meta: {
      publisher: clean((book.meta || {}).publisher),
      city: clean((book.meta || {}).city),
      pages: clean((book.meta || {}).pages),
      isbn: clean((book.meta || {}).isbn),
      language: clean((book.meta || {}).language || lang.code || lang.name),
    },
    summary: clean(book.summary),
    summaryMeta: clean(book.summaryMeta),
    table: book.table && typeof book.table === "object" ? book.table : {},
  };

  if (INCLUDE_PDF_LINKS) {
    normalized.links.reader = buildReaderHref(id, title, pdfPath);
    normalized.pdfPath = pdfPath;
  }

  return normalized;
}

function buildIndexes(books, source) {
  const categoryCount = new Map();
  const categoryNameById = new Map();
  const langCount = new Map();

  (source.categories || []).forEach(function (cat) {
    const id = clean(cat.id);
    const name = clean(cat.name);
    if (id && name) categoryNameById.set(id, name);
  });

  books.forEach(function (book) {
    (book.categoryIds || []).forEach(function (catId, idx) {
      const catName = clean((book.categoryNames || [])[idx] || catId);
      if (catId && catName && !categoryNameById.has(catId)) {
        categoryNameById.set(catId, catName);
      }
      categoryCount.set(catId, (categoryCount.get(catId) || 0) + 1);
    });
    if (book.langId) {
      langCount.set(book.langId, (langCount.get(book.langId) || 0) + 1);
    }
  });

  const categories = Array.from(categoryNameById.entries())
    .map(function (entry) {
      const id = entry[0];
      const name = entry[1];
      return {
        id,
        name,
        count: categoryCount.get(id) || 0,
        link: "books.html?cat=" + encodeURIComponent(id),
        legacyLink: "categories/" + id + ".html",
      };
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name, "tk");
    });

  const baseLangIds = Object.keys(LANGUAGE_NAME_BY_ID);
  const extraLangIds = Array.from(langCount.keys()).filter(function (id) {
    return !LANGUAGE_NAME_BY_ID[id];
  });
  const allLangIds = baseLangIds.concat(extraLangIds);

  const languages = allLangIds
    .map(function (id) {
      return {
        id,
        name: clean(
          LANGUAGE_NAME_BY_ID[id] ||
            ((source.languages || []).find(function (x) {
              return clean(x.id) === id;
            }) || {}).name ||
            id
        ),
        count: langCount.get(id) || 0,
        link: "books.html?lang=" + encodeURIComponent(id),
        legacyLink: "languages/" + id + ".html",
      };
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name, "tk");
    });

  return { categories, languages };
}

function normalizeSource(source) {
  const rawBooks = Array.isArray(source.books) ? source.books : [];
  const categoryNameById = new Map();

  (source.categories || []).forEach(function (cat) {
    const id = clean(cat.id);
    const name = clean(cat.name);
    if (id && name) categoryNameById.set(id, name);
  });

  const books = rawBooks
    .map(function (book) {
      return normalizeBook(book, categoryNameById);
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return a.title.localeCompare(b.title, "tk");
    });

  const indexes = buildIndexes(books, source);

  return {
    generatedAt: new Date().toISOString(),
    updatedAt: clean(source.updatedAt) || clean(new Date().toISOString()),
    stats: {
      books: books.length,
      categories: indexes.categories.length,
      languages: indexes.languages.length,
    },
    languages: indexes.languages,
    categories: indexes.categories,
    books,
  };
}

function toIndexBook(book) {
  return {
    id: clean(book.id),
    title: clean(book.title),
    author: clean(book.author),
    year: Number.isFinite(Number(book.year)) ? Number(book.year) : null,
    yearText: clean(book.yearText),
    langId: clean(book.langId),
    langCode: clean(book.langCode),
    categoryIds: Array.isArray(book.categoryIds) ? book.categoryIds.map(clean).filter(Boolean) : [],
    categoryNames: Array.isArray(book.categoryNames)
      ? book.categoryNames.map(clean).filter(Boolean)
      : [],
    searchText: clean(book.searchText),
    cover: {
      thumb: clean((book.cover || {}).thumb),
    },
  };
}

function buildIndexDataset(fullData) {
  const data = fullData && typeof fullData === "object" ? fullData : {};
  const books = Array.isArray(data.books) ? data.books.map(toIndexBook) : [];

  return {
    generatedAt: clean(data.generatedAt),
    updatedAt: clean(data.updatedAt),
    stats: {
      books: Number((data.stats || {}).books) || books.length,
      categories: Number((data.stats || {}).categories) || (Array.isArray(data.categories) ? data.categories.length : 0),
      languages: Number((data.stats || {}).languages) || (Array.isArray(data.languages) ? data.languages.length : 0),
    },
    languages: Array.isArray(data.languages) ? data.languages : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    books,
  };
}

function loadSource() {
  const source = readJson(SOURCE_FILE);
  if (source && Array.isArray(source.books)) return source;

  const fallback = readJson(FALLBACK_FILE);
  if (fallback && Array.isArray(fallback.books)) {
    return fallback;
  }
  throw new Error("`assets/data/library.source.json` ýa-da `assets/data/library.json` tapylmady.");
}

function main() {
  ensureDir(DATA_DIR);
  const source = loadSource();
  const normalized = normalizeSource(source);
  const indexDataset = buildIndexDataset(normalized);

  writeJson(OUTPUT_FILE, normalized, { pretty: false });
  writeJson(OUTPUT_INDEX_FILE, indexDataset, { pretty: false });

  if (!fs.existsSync(SOURCE_FILE)) {
    writeJson(SOURCE_FILE, normalized);
  }

  console.log(
    JSON.stringify(
      {
        source: path.relative(ROOT, fs.existsSync(SOURCE_FILE) ? SOURCE_FILE : FALLBACK_FILE),
        output: path.relative(ROOT, OUTPUT_FILE),
        outputIndex: path.relative(ROOT, OUTPUT_INDEX_FILE),
        pdfMode: PDF_MODE,
        books: normalized.stats.books,
        categories: normalized.stats.categories,
        languages: normalized.stats.languages,
      },
      null,
      2
    )
  );
}

main();
