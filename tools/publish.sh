#!/usr/bin/env bash
# Stamp the preview, or build the live page from it.
#   tools/publish.sh preview   stamps preview-flow.html and preview-version.json with the time (Eastern)
#   tools/publish.sh live      copies the preview to index.html + app/ and writes version.json
# Then run the tests, and commit and push only if they all pass.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  preview)
    STAMP=$(TZ=America/New_York date +"%b %-d, %-I:%M %p ET"); B=$(date +%s)
    sed -i -e "s/^const BUILD = \"[^\"]*\", VERSION_FILE = \"preview-version.json\"/const BUILD = \"$STAMP\", VERSION_FILE = \"preview-version.json\"/" \
           -e "s/\(src\|href\)=\"preview\/\([a-z]*\.\(js\|css\)\)?b=[0-9]*\"/\1=\"preview\/\2?b=$B\"/g" preview-flow.html
    printf '{"build": "%s"}\n' "$STAMP" > preview-version.json
    echo "preview stamped $STAMP" ;;
  live)
    rm -rf app && cp -r preview app
    sed -e 's/ (preview)<\/title>/<\/title>/' \
        -e "s/const BUILD = \"\([^\"]*\)\", VERSION_FILE = \"preview-version.json\"/const BUILD = \"\1\", VERSION_FILE = \"version.json\"/" \
        -e 's/\(src\|href\)="preview\//\1="app\//g' preview-flow.html > index.html
    STAMP=$(sed -n 's/^const BUILD = "\([^"]*\)".*/\1/p' index.html)
    printf '{"build": "%s"}\n' "$STAMP" > version.json
    echo "live built from preview $STAMP" ;;
  *) echo "usage: tools/publish.sh preview|live" >&2; exit 1 ;;
esac
