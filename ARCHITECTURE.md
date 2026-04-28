# MedLIB Arhitektura (Şablon + JSON)

Bu saýt indi runtime wagtynda statik `books/*.html`, `categories/*.html`, `languages/*.html` kontentine daýanmaýar.
Şol faýllar diňe köne linkler üçin awto-redirect hökmünde ulanylýar.

## Esasy gurluş

- Şablon sahypalar:
  - `index.html`
  - `books.html`
  - `categories.html`
  - `languages.html`
  - `book.html`
- Data model:
  - `assets/data/library.source.json` (esasy çeşme)
  - `assets/data/library.json`
- Render motory:
  - `assets/catalog.js`
- Katalog tizleşdiriji worker:
  - `assets/catalog-filter-worker.js`
- Auth/favorites/reader we UI-logika:
  - `assets/app.js`

## Maglumat täzelenişi

Gündelik ulanyş üçin:

```bash
node scripts/build-site.js
```

Bu komandalar edýär:

1. `library.source.json` -> `library.json` normalizasiýa
2. köne `books/categories/languages/*.html` üçin redirect faýllary regenerasiýa

Diňe modeli täzeden gurmak üçin:

```bash
node scripts/build-library-json.js
```

## Tehniki peýda

- Runtime-da diňe birnäçe şablon sahypa dolandyrylýar.
- Katalog, kategoriýa we dil sahypalary JSON modelden awto-render bolýar.
- `books.html` kartalary bölekleýin (chunked) render edilýär, bu uly katalogda UI doňmagyny azaldýar.
- `library.json` üçin gysga wagtlaýyn `sessionStorage` cache ulanylýar (okama tizligini ýokarlandyrýar).
- `books.html` filter/sort hasaplamasy Web Worker arkaly aýratyn akymda ýerine ýetirilýär.
- Filter/sort/favorites/auth logikasy merkezi JS bilen işleýär.
- Kontent täzelenende diňe bir JSON regenerasiýasy ýeterlik.

## PDF optimizasiya (BooksDB)

BooksDB ucun Ghostscript esasly awtomat optimizator:

- `scripts/optimize-booksdb-pdf.ps1` (Windows, esasy)
- `scripts/optimize-booksdb-pdf.sh` (Linux/macOS)
- `scripts/PDF_OPTIMIZATION.md` (ulanys gollanmasy)
