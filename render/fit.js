/**
 * Fits every page of the deck to the part of it a reader will actually see,
 * and then measures where every word ended up.
 *
 * WHY THIS IS ITS OWN FILE: render.js and test.js need the very same
 * stepping and the very same ruler, or the test proves nothing about the
 * deck that ships. fitDeck() runs INSIDE the browser page (puppeteer sends
 * its source over), so it must not reach for anything outside itself.
 *
 * THE TWO LIMITS come from Stefan's screenshots of the real viewer
 * (2026-09-27, constraint 5 in deck.js): LinkedIn darkens the bottom 184px
 * of every page and lays its buttons over the right 136px. So no glyph may
 * end below y = 1166 (1350 minus 184) and none may reach past x = 944 (1080
 * minus 136). The picture credit down the picture's edge is the one thing
 * allowed in the right column, because it sits on the picture, in the top
 * half, where the buttons are not.
 *
 * THE ORDER OF YIELDING, per page, and why:
 *   1. the type steps down to its floor of 34px (about 12px on a phone,
 *      below which Stefan could not read it);
 *   2. on a picture page the picture gives up height, 44 to 38 to 32 percent;
 *   3. still too much: the picture goes and the page becomes the typographic
 *      page it would have been with no picture at all. The words are the
 *      editor's, the picture is this renderer's choice, so the picture
 *      yields first;
 *   4. only then is the summary cut, whole sentences from its end, never
 *      inside a word and never the "What it proves" line, which carries the
 *      story's figure;
 *   5. the closing page's credit list drops to its short form (creator and
 *      licence, the source named once) before anything is clipped;
 *   6. and a page that STILL overflows is reported, and render.js refuses to
 *      write the deck. The Monday recap then goes out as the text post it
 *      always was, which is the designed fail-safe. A clipped sentence on a
 *      company Page is worse than no deck.
 */

const LIMITS = {
  W: 1080,
  H: 1350,
  fadeTop: 1166,       // 1350 - 184: no glyph may end at or below this
  buttonsLeft: 944,    // 1080 - 136: no glyph may reach past this
  buttonsTop: 900,     // the buttons sit in the right column from about here down
  pictureSteps: [44, 38, 32]  // percent of the page height a picture may take
};

/* eslint-disable no-var */
function fitDeck(L) {
  var H = L.H;
  var out = [];

  var fits = function (box) { return box.scrollHeight <= box.clientHeight + 1; };
  var setType = function (els, row) {
    els.forEach(function (el, i) { if (el) el.style.fontSize = row[i] + 'px'; });
  };
  // Tries each row of sizes and keeps the first that fits. Returns the row
  // or null. The last row is the floor; nothing is set below it.
  var stepType = function (box, els, table) {
    for (var i = 0; i < table.length; i++) {
      setType(els, table[i]);
      if (fits(box)) return table[i];
    }
    return null;
  };

  // Whole sentences only. A break is a full stop, question or exclamation
  // mark (optionally followed by a closing quote or bracket), then space,
  // then a capital, a digit or an opening quote. A capital letter directly
  // before the stop is not a break, so "U.S. Navy" and "J. Smith" stay whole.
  var sentences = function (t) {
    return t.split(/(?<=[^A-Z][.!?]["”')\]]?)\s+(?=["“(]?[A-Z0-9])/);
  };
  var cutLastSentence = function (el) {
    var parts = sentences(el.textContent.trim());
    if (parts.length < 2) return false;
    el.textContent = parts.slice(0, -1).join(' ');
    return true;
  };

  // The ruler: every run of non-space characters, as the browser laid it
  // out. Word boxes rather than element boxes, because a centred heading's
  // element spans the whole column while its glyphs do not, and because a
  // line's trailing space can hang past the box it wraps in.
  var measure = function (pg) {
    var pr = pg.getBoundingClientRect();
    var maxBottom = 0, maxRight = 0, bad = [];
    var walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var text = n.nodeValue;
      if (!text.trim()) continue;
      var el = n.parentElement;
      if (el.closest('.whisper')) continue;   // measured on its own below
      if (el.closest('[hidden]')) continue;
      var re = /\S+/g, m;
      while ((m = re.exec(text))) {
        var r = document.createRange();
        r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        var rects = r.getClientRects();
        for (var k = 0; k < rects.length; k++) {
          var b = rects[k];
          if (!b.width || !b.height) continue;
          var bottom = b.bottom - pr.top, right = b.right - pr.left;
          if (bottom > maxBottom) maxBottom = bottom;
          if (right > maxRight) maxRight = right;
          if (bottom > L.fadeTop) bad.push('"' + m[0] + '" ends at y=' + Math.round(bottom) + ' (fade from ' + L.fadeTop + ')');
          if (right > L.buttonsLeft) bad.push('"' + m[0] + '" reaches x=' + Math.round(right) + ' (buttons from ' + L.buttonsLeft + ')');
        }
      }
    }
    var w = pg.querySelector('.whisper');
    if (w) {
      var wb = w.getBoundingClientRect().bottom - pr.top;
      if (wb > L.buttonsTop) bad.push('the picture credit runs down into the button column (y=' + Math.round(wb) + ')');
    }
    return { maxBottom: Math.round(maxBottom), maxRight: Math.round(maxRight), bad: bad };
  };

  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) {
    var pg = pages[i];
    var rep = { page: i + 1, kind: 'story', type: null, picture: null, cut: 0, credits: null, fitted: false };
    var body, els, row;

    if (pg.classList.contains('cover')) {
      rep.kind = 'cover';
      body = pg.querySelector('.cover-body');
      els = [pg.querySelector('h1'), pg.querySelector('.sub'), pg.querySelector('.zoom')];
      // Title, subtitle and zoom-out type first; once the zoom-out is at
      // the floor the sun and the gaps around the zoom-out give up height,
      // because a smaller sun costs the reader nothing and smaller type
      // does. Columns: h1, sub, zoom, sun diameter, gap under the sun, gap
      // above the zoom-out's yellow rule.
      var sun = pg.querySelector('.sun'), zoom = pg.querySelector('.zoom');
      var coverTable = [
        [92, 44, 38, 118, 64, 52], [84, 42, 36, 118, 64, 52], [76, 40, 34, 118, 64, 52],
        [68, 38, 34, 96, 48, 40], [60, 36, 34, 80, 40, 32], [56, 34, 34, 72, 32, 24]];
      row = null;
      for (var c = 0; c < coverTable.length && !row; c++) {
        var cr = coverTable[c];
        setType(els, cr);
        if (sun) {
          sun.style.width = cr[3] + 'px'; sun.style.height = cr[3] + 'px';
          sun.style.flexBasis = cr[3] + 'px'; sun.style.marginBottom = cr[4] + 'px';
        }
        if (zoom) { zoom.style.marginTop = cr[5] + 'px'; zoom.style.paddingTop = Math.round(cr[5] * 0.65) + 'px'; }
        if (fits(body)) row = cr.slice(0, 3);
      }
      rep.type = row; rep.fitted = !!row;
    } else if (pg.classList.contains('closing')) {
      rep.kind = 'closing';
      body = pg.querySelector('.closing-body');
      els = [pg.querySelector('.pointer'), pg.querySelector('.quote'), pg.querySelector('.quote span')];
      var table = [[76, 54, 42], [70, 50, 40], [64, 46, 38], [58, 42, 36], [52, 38, 34]];
      row = stepType(body, els, table);
      rep.credits = pg.querySelector('.credits.full') ? 'full' : null;
      if (!row) {
        var full = pg.querySelector('.credits.full'), short = pg.querySelector('.credits.short');
        if (full && short) {
          full.hidden = true; short.hidden = false;
          rep.credits = 'short';
          row = stepType(body, els, table);
        }
      }
      rep.type = row; rep.fitted = !!row;
    } else {
      body = pg.querySelector('.body');
      var photo = pg.querySelector('.photo.tall');
      var sum = body.querySelector('.summary'), pr = body.querySelector('.proves');
      els = [sum, pr];
      var storyTable = [[62, 42], [56, 40], [50, 38], [46, 36], [42, 35], [38, 34]];
      var bigTable = [[80, 46], [72, 44], [64, 42], [56, 38], [48, 36], [42, 34]];
      row = null;
      if (photo) {
        for (var p = 0; p < L.pictureSteps.length && !row; p++) {
          photo.style.flexBasis = Math.round(H * L.pictureSteps[p] / 100) + 'px';
          row = stepType(body, els, storyTable);
          if (row) rep.picture = L.pictureSteps[p];
        }
        if (!row) {
          // The picture goes, the words stay: the page becomes the
          // typographic page a story without a picture gets anyway.
          photo.parentNode.removeChild(photo);
          pg.classList.add('text-only');
          body.classList.add('big');
          if (pg.dataset.figure) {
            var lead = document.createElement('p');
            lead.className = 'lead-figure';
            lead.textContent = pg.dataset.figure;
            body.insertBefore(lead, body.firstChild);
          }
          rep.picture = 'dropped';
        }
      }
      var big = body.classList.contains('big');
      if (!row) row = stepType(body, els, big ? bigTable : storyTable);
      while (!row && sum && cutLastSentence(sum)) {
        rep.cut++;
        row = stepType(body, els, big ? bigTable : storyTable);
      }
      rep.type = row; rep.fitted = !!row;
      if (sum) rep.summary = sum.textContent;
    }

    var mm = measure(pg);
    rep.maxBottom = mm.maxBottom; rep.maxRight = mm.maxRight; rep.bad = mm.bad;
    rep.overflow = !rep.fitted || mm.bad.length > 0;
    out.push(rep);
  }
  return out;
}

/** One line per page for the log, and the report itself for whoever asked. */
async function fitInBrowser(page) {
  const report = await page.evaluate(fitDeck, LIMITS);
  return report;
}

function describe(rep) {
  const bits = [`page ${rep.page} (${rep.kind})`];
  if (rep.type) bits.push(`type ${rep.type.join('/')}`);
  if (rep.picture === 'dropped') bits.push('picture dropped, words kept');
  else if (rep.picture && rep.picture !== LIMITS.pictureSteps[0]) bits.push(`picture ${rep.picture}%`);
  if (rep.cut) bits.push(`summary cut by ${rep.cut} sentence${rep.cut > 1 ? 's' : ''}`);
  if (rep.credits === 'short') bits.push('credits in short form');
  bits.push(`words end at y=${rep.maxBottom}, x=${rep.maxRight}`);
  if (rep.overflow) bits.push('STILL OVERFLOWS: ' + (rep.bad.slice(0, 3).join('; ') || 'does not fit at the floor'));
  return bits.join(', ');
}

module.exports = { fitDeck, fitInBrowser, describe, LIMITS };
