"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "assets", "data", "library.json");
const BOOKS_DIR = path.join(ROOT, "books");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const LANGUAGES_DIR = path.join(ROOT, "languages");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function createRedirectHtml(target) {
  const safeTarget = String(target || "").replace(/"/g, "%22");
  return (
    "<!doctype html><html lang='tk'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<meta http-equiv='refresh' content='0; url=" +
    safeTarget +
    "'>" +
    "<title>Ugrukdyrylyar...</title>" +
    "<script>location.replace(\"" +
    safeTarget +
    "\");</script>" +
    "</head><body><p>Ugrukdyrylyar... <a href='" +
    safeTarget +
    "'>Dowam et</a></p></body></html>"
  );
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error("assets/data/library.json tapylmady.");
  }

  const library = readJson(DATA_FILE);
  const books = Array.isArray(library.books) ? library.books : [];
  const categories = Array.isArray(library.categories) ? library.categories : [];
  const languages = Array.isArray(library.languages) ? library.languages : [];

  ensureDir(BOOKS_DIR);
  ensureDir(CATEGORIES_DIR);
  ensureDir(LANGUAGES_DIR);

  books.forEach((book) => {
    const id = String(book.id || "").trim();
    if (!id) return;
    const target = "../book.html?id=" + encodeURIComponent(id);
    writeFile(path.join(BOOKS_DIR, id + ".html"), createRedirectHtml(target));
  });

  categories.forEach((cat) => {
    const id = String(cat.id || "").trim();
    if (!id) return;
    const target = "../books.html?cat=" + encodeURIComponent(id);
    writeFile(path.join(CATEGORIES_DIR, id + ".html"), createRedirectHtml(target));
  });

  languages.forEach((lang) => {
    const id = String(lang.id || "").trim();
    if (!id) return;
    const target = "../books.html?lang=" + encodeURIComponent(id);
    writeFile(path.join(LANGUAGES_DIR, id + ".html"), createRedirectHtml(target));
  });

  console.log(
    JSON.stringify(
      {
        booksRedirects: books.length,
        categoryRedirects: categories.length,
        languageRedirects: languages.length,
      },
      null,
      2
    )
  );
}

main();
