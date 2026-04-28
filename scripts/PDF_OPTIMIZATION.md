# PDF Optimization (Ghostscript)

Bu gollanma `BooksDB` papkasyndaky PDF faýllary awtomat kompress etmek ucun.

## 1) Ghostscript gurnama

- Windows: `gswin64c` elyeterli bolmaly.
- Linux: `gs` elyeterli bolmaly.

Barlag:

```powershell
gswin64c -version
```

ya-da:

```bash
gs --version
```

## 2) Windows PowerShell (maslahat berilyan)

`BooksDB` -> `BooksDB_optimized` (original faýllara degmeýär):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\optimize-booksdb-pdf.ps1 `
  -SourceDir "BooksDB" `
  -OutputDir "BooksDB_optimized" `
  -Preset ebook `
  -MinSavingsPercent 0
```

`BooksDB` icinde in-place (gaty seresap ulanyn):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\optimize-booksdb-pdf.ps1 `
  -SourceDir "BooksDB" `
  -Preset ebook `
  -InPlace `
  -MinSavingsPercent 1
```

Test/plan only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\optimize-booksdb-pdf.ps1 `
  -SourceDir "BooksDB" `
  -DryRun `
  -MaxFiles 20
```

## 3) Linux/macOS

```bash
chmod +x ./scripts/optimize-booksdb-pdf.sh
./scripts/optimize-booksdb-pdf.sh BooksDB BooksDB_optimized ebook
```

## 4) Presetler

- `screen` - in kiçi göwrüm
- `ebook` - hil/gowrum balansy (maslahat)
- `printer` - has yokary hil
- `prepress` - in yokary hil, in uly göwrüm

## 5) Hasabatlar

PowerShell skripti `reports/` icinde:

- `pdf-opt-report_*.json`
- `pdf-opt-report_*.csv`

faýllaryny döredýär.
