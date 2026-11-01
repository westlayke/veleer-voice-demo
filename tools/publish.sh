#!/usr/bin/env bash
# Stamp the preview, or build the live page from it.
#   tools/publish.sh preview   stamps preview-flow.html and preview-version.json with the time (Eastern)
#   tools/publish.sh live      copies the preview to index.html + app/ and writes version.json
# Then run the tests, and commit and push only if they all pass.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/lint-comments.js   # a // comment that swallowed code fails the publish (Oct 25)
case "${1:-}" in
  preview)
    STAMP=$(TZ=America/New_York date +"%b %-d, %-I:%M %p ET"); B=$(date +%s)
    sed -i -e "s/^const BUILD = \"[^\"]*\", VERSION_FILE = \"preview-version.json\"/const BUILD = \"$STAMP\", VERSION_FILE = \"preview-version.json\"/" \
           -e "s/\(src\|href\)=\"preview\/\([a-z]*\.\(js\|css\)\)?b=[0-9]*\"/\1=\"preview\/\2?b=$B\"/g" preview-flow.html
    printf '{"build": "%s"}\n' "$STAMP" > preview-version.json
    # the state-machine page (Carverhill, Oct 31: "Go for phase 1"): the same preview plus XState and preview/machine.js, which only watch
    sed -e 's/<title>Citizens VCRM (preview)<\/title>/<title>Citizens VCRM (preview, state machine)<\/title>/' \
        -e "s|^<script src=\"preview/start.js?b=$B\"></script>|<script src=\"preview/vendor/xstate-5.33.3.umd.min.js\"></script>\n<script src=\"preview/machine.js?b=$B\"></script>\n&|" preview-flow.html > preview-sm.html
    grep -q 'preview/machine.js' preview-sm.html || { echo "preview-sm.html: machine.js not added" >&2; exit 1; }
    echo "preview stamped $STAMP (and preview-sm.html)" ;;
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
