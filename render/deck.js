/**
 * The deck, as one HTML document. One page per slide, 4:5 portrait.
 *
 * WHY HTML AND A BROWSER, and not Google Slides: drawing the deck inside the
 * Apps Script project would have needed a Google Slides permission, and any
 * new permission forces a re-consent that, if missed, silences every trigger.
 * That has already cost this project a recap and a whole publishing day
 * (2026-08-28 and 2026-09-18 to 09-21). Rendering here costs the live script
 * nothing, and a real browser engine gives exact page sizes, real fonts and
 * the hairline picture credit that Slides could only approximate.
 *
 * FOUR CONSTRAINTS LEARNED FROM THE REAL PROBE POST (2026-09-26), not from
 * documentation. They are not style preferences:
 *   1. 4:5 portrait. A4 leaves heavy black bars in LinkedIn's viewer.
 *   2. The top fifth of PAGE ONE stays free of anything that carries
 *      meaning: LinkedIn overlays the document title and the caption there.
 *      CORRECTED 2026-09-27 (Stefan): that overlay lands on the first page
 *      only, and the first version applied the rule to all seven. A fifth of
 *      every slide was held empty for nothing, carrying a masthead at 21px
 *      that measures about 8px on a phone. Page one keeps its clear zone;
 *      the other pages get a proper masthead and give the rest to the
 *      picture.
 *   3. The document title is displayed as a heading, so it is content.
 *   4. Nothing on a slide is clickable in the feed. Links are embedded
 *      anyway, because a reader who downloads the PDF does get them, and
 *      that costs nothing.
 */

const NAVY = '#003366';
const PAPER = '#F5F5F5';
const YELLOW = '#FFC107';
const GREEN = '#2E7D32';
const INK = '#14202E';

// 1080 x 1350 CSS pixels is 4:5 and is what page.pdf() is told to use.
const W = 1080;
const H = 1350;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * The hairline credit, placed exactly where Stefan chose on 2026-09-27
 * (option A of the mockup): rotated down the outer edge of the picture,
 * grey on the picture's own shadow.
 *
 * It carries "Stock picture" whenever the photograph is not of the event,
 * which for a library picture is always. That was his second decision the
 * same morning, and it is there for the Page's credibility rather than for
 * the law: a reader on a page that promises checked facts must not mistake
 * a library photo for the scene.
 *
 * Whether a credit is legally OWED is decided by the licence, and the
 * picture chooser prefers licences that owe nothing. When one is owed the
 * string carries creator and licence, which is a proper credit however
 * small it is set. Small is fine; hidden is not, and this is not hidden.
 */
function creditLine(pic) {
  if (!pic) return '';
  // THE FIRST WORDS TELL THE READER WHAT THEY ARE LOOKING AT, and the two
  // rungs of the picture ladder deserve different words. A library picture
  // found by searching words is a stock picture, which is what Stefan chose
  // to call it. A picture of the story's actual subject is not stock, but it
  // is still not a photograph of the event, and on a page that promises
  // checked facts that distinction is the one the reader needs. So it says
  // so plainly. Wording flagged to Stefan 2026-09-27; his to change.
  const bits = [pic.kind === 'subject' ? 'Not the event itself' : 'Stock picture'];
  if (pic.creator) bits.push(pic.creator);
  if (pic.licenceLabel) bits.push(pic.licenceLabel);
  if (pic.source) bits.push(pic.source);
  return bits.join(' · ');
}

/** A story slide: picture, the summary, what it proves, outlet and page. */
function storySlide(s, i, total) {
  const pic = s.resolvedPicture;
  const credit = creditLine(pic);

  // NO PICTURE MEANS A TYPOGRAPHIC PAGE, NOT AN EMPTY ONE (2026-09-27,
  // Stefan on his phone). The first version kept the picture's half of the
  // slide whatever happened and filled it with navy, a lone word in yellow,
  // or a ghosted wordmark. On a phone that reads as a page that failed to
  // load: six tenths of it saying nothing while the sentence is squeezed
  // into the bottom third and gets hard to read.
  //
  // A page with nothing to show should give its space to the words instead.
  // The figure, when there is one, sits ABOVE the sentence as part of the
  // same composition rather than marooned in its own block.
  if (!pic || !pic.dataUri) {
    const n = (s.numbers || [])[0];
    return `
  <section class="page text-only">
    <div class="body big">
      ${n ? `<p class="lead-figure">${esc(n)}</p>` : ''}
      <p class="summary">${esc(s.summary)}</p>
      ${s.proves ? `<p class="proves"><span>What it proves:</span> ${esc(s.proves)}</p>` : ''}
    </div>
    <div class="foot">
      <span class="src">${esc(s.outlet)}</span>
      <span class="pg">${i} / ${total}</span>
    </div>
  </section>`;
  }

  // NO MASTHEAD ON A STORY PAGE (2026-09-27, Stefan: "you should make better
  // use of the space"). The name was repeating on all seven pages and
  // costing a tenth of each one, to say something the reader already knows
  // by page three and which the cover, the closing page and the post itself
  // all say anyway. The picture now runs to the top edge and the words get
  // the rest. Only page one keeps a clear zone, because only page one is
  // overlaid by LinkedIn's own title.
  return `
  <section class="page">
    <div class="photo tall" style="background-image:url('${pic.dataUri}')">
      ${credit ? `<div class="whisper">${esc(credit)}</div>` : ''}
    </div>
    <div class="body">
      <p class="summary">${esc(s.summary)}</p>
      ${s.proves ? `<p class="proves"><span>What it proves:</span> ${esc(s.proves)}</p>` : ''}
    </div>
    <div class="foot">
      <span class="src">${esc(s.outlet)}</span>
      <span class="pg">${i} / ${total}</span>
    </div>
  </section>`;
}

/**
 * Step 3 of the picture rule: no free picture exists, so the picture is the
 * story's own verified numbers. Zero copyright surface by construction,
 * always available, and never the wrong picture.
 *
 * The figures are copied from the published summary by the Apps Script side.
 * Nothing here computes, rounds or infers a number: a graphic that invents a
 * figure is a fabricated claim wearing a design.
 */
function numberBlock(s) {
  // ONE figure, not two. The first draft showed the story's first two
  // numbers stacked, and "194" over "six" reads as two unrelated facts: the
  // relationship between them ("from six to 194") is in the sentence
  // underneath, and nothing here is allowed to assert a relationship the
  // editor did not write. One number is the honest amount of context this
  // block can carry on its own.
  const n = (s.numbers || [])[0];
  if (!n) {
    return `<div class="photo nopic"><div class="mark">Good News Daily</div></div>`;
  }
  return `<div class="photo nopic">
    <div class="figures">
      <div class="fig big">${esc(n)}</div>
      <div class="rule"></div>
    </div>
  </div>`;
}

function coverSlide(spec) {
  // THE ZOOM-OUT GOES ON THE COVER (Stefan, 2026-09-27). It is one sourced
  // "then versus now" fact, and in the text recap it is deliberately the
  // very first line, above the title, because LinkedIn previews the opening
  // sentence. A carousel has no opening sentence: the cover IS the preview.
  // So it sits under the title here, where the same eye lands.
  //
  // It is still carried in the post caption as well, unchanged. Saying it
  // twice costs nothing: almost nobody reads both, and the one who does
  // reads the same sentence.
  //
  // Empty is a real answer, not a gap to fill: the trend library refuses to
  // offer anything it cannot still verify, and the recap ships without the
  // line rather than with a stale number. The cover does the same.
  const zoom = String(spec.zoomOut || '').trim();
  return `
  <section class="page cover">
    <div class="clear"></div>
    <div class="cover-body">
      <div class="sun"></div>
      <h1>${esc(spec.title)}</h1>
      <p class="sub">The ${spec.slides.length} stories readers chose, ${esc(humanWeek(spec.monday))}</p>
      ${zoom ? `<p class="zoom">${esc(zoom)}</p>` : ''}
    </div>
    <div class="foot">
      <span class="src">Verified sources · published daily</span>
      <span class="pg">1 / ${spec.slides.length + 2}</span>
    </div>
  </section>`;
}

/**
 * The closing page. It carries the five addresses in full, because the
 * caption is the only click path a document post has, and the picture
 * credits as a list, which is belt and braces for the rare picture whose
 * licence demands one (Stefan, 2026-09-27: placement A "plus C's list on the
 * last page anyway").
 */
function closingSlide(spec) {
  const credits = spec.slides
    .map((s) => s.resolvedPicture)
    .filter((p) => p && (p.creator || p.source))
    .map((p) => [p.creator, p.licenceLabel, p.source].filter(Boolean).join(' · '));
  const unique = credits.filter((c, i) => credits.indexOf(c) === i);
  return `
  <section class="page closing">
    <div class="clear"><span class="kicker">Good News <em>Daily</em></span></div>
    <div class="body closing-body">
      <h2>Read any of them</h2>
      <p class="where">Every link is in the post text, just above this deck.</p>
      <ol class="links">
        ${spec.slides.map((s) => `<li><a href="${esc(s.url)}">${esc(s.outlet || shortUrl(s.url))}</a></li>`).join('')}
      </ol>
      ${spec.quote && spec.quote.text
        ? `<p class="quote">“${esc(spec.quote.text)}”<span>${esc(spec.quote.by)}</span></p>` : ''}
      ${unique.length ? `<p class="credits">Pictures: ${esc(unique.join(' — '))}</p>` : ''}
    </div>
    <div class="foot">
      <span class="src">Follow the Page for one good story a day</span>
      <span class="pg">${spec.slides.length + 2} / ${spec.slides.length + 2}</span>
    </div>
  </section>`;
}

function shortUrl(u) {
  return String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function humanWeek(monday) {
  const d = new Date(monday + 'T00:00:00Z');
  const back = new Date(d.getTime() - 7 * 86400000);
  const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `week of ${back.getUTCDate()} ${m[back.getUTCMonth()]}`;
}

function buildHtml(spec) {
  const total = spec.slides.length + 2;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<style>
  @page { size: ${W}px ${H}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${PAPER}; }
  body { font-family: Montserrat, "Helvetica Neue", Arial, sans-serif; color: ${INK}; }

  .page {
    width: ${W}px; height: ${H}px;
    display: flex; flex-direction: column;
    background: ${PAPER};
    page-break-after: always; break-after: page;
    overflow: hidden; position: relative;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  /* The masthead band. On PAGE ONE it is a clear zone a fifth of the page
     deep and carries nothing, because LinkedIn's viewer prints the document
     title and the caption over it. Everywhere else it is a masthead: half
     the depth, so the picture gets the difference, and set large enough to
     read on a phone, where a 1080px slide is about 400px wide. */
  .clear {
    height: ${Math.round(H * 0.105)}px;
    background: ${NAVY};
    display: flex; align-items: center; justify-content: center;
  }
  .cover .clear, .page.overlaid .clear {
    height: ${Math.round(H * 0.2)}px;
  }
  .kicker {
    font-size: 48px; letter-spacing: .14em; text-transform: uppercase;
    color: #fff; font-weight: 700;
  }
  .kicker em { font-style: normal; color: ${YELLOW}; }

  .photo {
    flex: 0 0 ${Math.round(H * 0.475)}px;
    background-size: cover; background-position: center;
    position: relative;
  }
  .photo.nopic {
    background: ${NAVY};
    display: flex; align-items: center; justify-content: center;
  }
  .figures { text-align: center; color: #fff; }
  .fig.big { font-size: 150px; font-weight: 700; line-height: 1; color: ${YELLOW}; }
  .fig.small { font-size: 44px; font-weight: 600; margin-top: 18px; color: rgba(255,255,255,.85); }
  .rule { width: 132px; height: 5px; background: rgba(255,255,255,.35); margin: 34px auto 0; }
  .mark { color: rgba(255,255,255,.3); font-size: 34px; letter-spacing: .2em; text-transform: uppercase; }

  /* The hairline credit, rotated down the outer edge of the picture.
     writing-mode rather than a rotate() transform: a rotated box keeps its
     ORIGINAL width for layout, so the first version hung off the bottom of
     the picture and ran down the body text on the paper below it. Vertical
     writing stays inside the box it is positioned in, which is the whole
     requirement: on the picture it credits, not next to it. */
  .whisper {
    position: absolute; right: 8px; bottom: 16px;
    writing-mode: vertical-rl; transform: rotate(180deg);
    max-height: calc(100% - 32px); overflow: hidden;
    font-size: 12px; letter-spacing: .03em; white-space: nowrap;
    color: rgba(255,255,255,.66); text-shadow: 0 0 3px rgba(0,0,0,.7);
  }

  /* min-height:0 lets this flex child actually shrink, and overflow:hidden
     is the last line of defence. Neither is the real fix: render.js measures
     every page and steps the type down until it fits, because a sentence cut
     off by the yellow band is a bug a reader sees. */
  .photo.tall { flex: 0 0 ${Math.round(H * 0.50)}px; }
  .body { flex: 1 1 auto; min-height: 0; padding: 58px 72px 38px; overflow: hidden; }
  /* A page with no picture: the words get the whole slide. */
  .body.big { display: flex; flex-direction: column; justify-content: center; padding: 64px 72px 54px; }
  .body.big .summary { font-size: 80px; line-height: 1.08; }
  .body.big .proves { font-size: 46px; margin-top: 56px; }
  .lead-figure {
    font-size: 120px; line-height: 1; font-weight: 700; color: ${NAVY};
    margin: 0 0 40px; letter-spacing: -.02em;
  }
  .summary { font-size: 62px; line-height: 1.14; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  /* 33px measured about 12px on his phone. Nothing on a slide may be set
     smaller than this (Stefan, 2026-09-27). */
  .proves { font-size: 42px; line-height: 1.3; margin: 42px 0 0; color: #2B3746; }
  .proves span { font-weight: 700; color: ${GREEN}; }

  .foot {
    flex: 0 0 104px; background: ${YELLOW}; color: #1A1508;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 72px; font-size: 30px; font-weight: 600;
  }

  .cover .clear { height: ${Math.round(H * 0.2)}px; }
  .cover-body { flex: 1 1 auto; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 0 84px; text-align: center; }
  .sun { width: 118px; height: 118px; border-radius: 50%; background: ${YELLOW};
    box-shadow: 0 0 0 12px rgba(255,193,7,.28); margin-bottom: 64px; }
  .cover h1 { font-size: 92px; line-height: 1.08; font-weight: 700; color: ${NAVY};
    margin: 0; letter-spacing: -.02em; }
  .cover .sub { font-size: 44px; color: ${GREEN}; font-style: italic; margin: 40px 0 0; }
  .cover .zoom {
    font-size: 38px; line-height: 1.34; color: #2B3746; margin: 52px 0 0;
    max-width: 24em; border-top: 5px solid ${YELLOW}; padding-top: 34px;
  }

  .closing-body h2 { font-size: 60px; font-weight: 700; color: ${NAVY}; margin: 0 0 34px; }
  .links { margin: 0; padding-left: 46px; }
  /* Outlet names, not addresses. NOTHING ON A SLIDE IS TAPPABLE in the feed
     (Stefan on his phone, 2026-09-27: "there is no way to click into the
     story"), so a wall of raw URLs looks like a link and is not one, which
     is worse than not showing it. The names say which five outlets, the
     line above says where the real links are, and the anchors underneath
     still work for anyone who downloads the file. */
  .links li { font-size: 38px; line-height: 1.7; }
  .where { font-size: 36px; color: ${GREEN}; font-style: italic; margin: 0 0 34px; }
  .links a { color: ${INK}; text-decoration: none; }
  .quote { font-size: 40px; font-style: italic; color: #2B3746; margin: 48px 0 0; line-height: 1.34; }
  .quote span { display: block; font-style: normal; font-weight: 600; margin-top: 14px; font-size: 32px; }
  /* The picture credits are the ONE thing that stays small on purpose: they
     are a legal record, not something anybody reads. */
  .credits { font-size: 20px; color: #6B7885; margin: 44px 0 0; line-height: 1.5; }
</style></head>
<body>
${coverSlide(spec)}
${spec.slides.map((s, i) => storySlide(s, i + 2, total)).join('\n')}
${closingSlide(spec)}
</body></html>`;
}

module.exports = { buildHtml, creditLine, W, H };
