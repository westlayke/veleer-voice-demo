# Veleer voice demo

A click-through phone demo of Veleer: one investor goes from new contact to recorded pledge in a two-way voice conversation with Grok (xAI). Grok asks for anything missing and puts each draft on screen; nothing is saved until the officer taps Save.

The xAI API key is never stored in this repository. Enter it in Settings (the gear), or open the page once with `#xai=YOUR_KEY` added to the address; it is then kept in that browser only. Restart the demo from Settings.

## How changes are tracked

Every change to the demo is a commit here, so any earlier version can be seen or restored. Changes are requested in the Citizens Alliance project, shown first in the preview (`preview-flow.html`), and copied to the live page (`index.html`) only when someone says "make it live".

Each commit message ends with these lines (template in `.gitmessage`):

```
Requested by: <name of the person who asked, from their message in the project>
Reason: <why they want it, in their words>
Approved for live by: <name, on Go live commits only>
Conversation: <link to the project conversation>
```

GitHub shows the repository owner as the author of every commit; the person who asked is the "Requested by" line. The same who, when and why also goes in the Voice demo change log document.

To list the history with who asked and why: `git log --format='%ad %s%n%(trailers:key=Requested by,key=Reason,key=Approved for live by)' --date=format:'%Y-%m-%d %H:%M'`
