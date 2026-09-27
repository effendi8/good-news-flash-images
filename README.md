# Good News Daily, images and the Monday carousel

Two unrelated things live here, both public on purpose because the addresses
have to be fetchable by Buffer and by LinkedIn.

## `static/`

The eight brand images the daily post falls back on when an article page
offers no picture, plus the logo and banner. The live script reads these by
their raw address and never writes here.

## `carousel/` and `render/`

The Monday recap as a swipeable document post.

    the Apps Script project            this repo
    ------------------------           --------------------------------
    writes carousel/<monday>.json  ->  the workflow renders the deck
                                       and commits <monday>.pdf + .png
    polls the PDF's raw address    <-
    hands the PDF to Buffer

**Why the deck is drawn here and not in the script.** Drawing it in Apps
Script would have needed a Google Slides permission, and any new permission
forces a re-consent. A missed re-consent is the most expensive failure that
project has: it silenced every trigger on 2026-08-28 and again from
2026-09-18 to 09-21, costing a weekly recap and a whole publishing day.
Rendering here costs the live script nothing, and a real browser engine gives
exact 4:5 pages, real fonts and a hairline picture credit that Slides could
only approximate.

**The deck is never load-bearing.** If anything in this repo fails, is slow,
or never runs, the Monday recap publishes as the ordinary text post it has
always been. That fallback lives in the Apps Script project and is tested
there; nothing here can break a Monday.

### Running it by hand

    cd render && npm install
    node render.js sample/2026-10-05.json          # with pictures
    node render.js sample/2026-10-05.json --no-pictures
    node test.js

### The picture rules (Stefan, 2026-09-27)

Licences that owe no credit are asked for first (public domain, CC0), then
ones that do (CC BY, CC BY-SA), and if neither finds anything the slide shows
one figure the editor already published. Never the outlet's own photograph,
under any pass: linking to a publisher's photo is fine, copying it into our
file is not.

The credit is set as a hairline down the outer edge of the picture and always
begins "Stock picture", because the real risk with a library photo is not the
law, it is a reader on a fact-checked page taking it for the scene.
