#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-BooksDB}"
OUTPUT_DIR="${2:-BooksDB_optimized}"
PRESET="${3:-ebook}" # screen|ebook|printer|prepress|default

if ! command -v gs >/dev/null 2>&1; then
  echo "Ghostscript (gs) tapylmady. Ilki gurun." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

total=0
saved_bytes=0
orig_bytes=0
out_bytes=0

while IFS= read -r -d '' file; do
  rel="${file#$SOURCE_DIR/}"
  out="$OUTPUT_DIR/$rel"
  out_dir="$(dirname "$out")"
  mkdir -p "$out_dir"

  gs -sDEVICE=pdfwrite \
    -dCompatibilityLevel=1.4 \
    "-dPDFSETTINGS=/$PRESET" \
    -dDetectDuplicateImages=true \
    -dCompressFonts=true \
    -dSubsetFonts=true \
    -dEmbedAllFonts=true \
    -dNOPAUSE -dQUIET -dBATCH \
    "-sOutputFile=$out" "$file"

  o=$(stat -c%s "$file")
  n=$(stat -c%s "$out")
  total=$((total + 1))
  orig_bytes=$((orig_bytes + o))

  if [ "$n" -lt "$o" ]; then
    out_bytes=$((out_bytes + n))
    saved_bytes=$((saved_bytes + (o - n)))
  else
    cp -f "$file" "$out"
    out_bytes=$((out_bytes + o))
  fi
done < <(find "$SOURCE_DIR" -type f \( -iname "*.pdf" \) -print0 | sort -z)

if [ "$orig_bytes" -gt 0 ]; then
  saved_percent=$(awk "BEGIN { printf \"%.2f\", ($saved_bytes / $orig_bytes) * 100 }")
else
  saved_percent="0.00"
fi

echo "FILES=$total"
echo "ORIGINAL_BYTES=$orig_bytes"
echo "OUTPUT_BYTES=$out_bytes"
echo "SAVED_BYTES=$saved_bytes"
echo "SAVED_PERCENT=$saved_percent"
