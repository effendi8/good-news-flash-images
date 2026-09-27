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
 *   2. The top fifth of every page stays free of anything that carries
 *      meaning: LinkedIn overlays the document title and the caption there.
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
  const bits = ['Stock picture'];
  if (pic.creator) bits.push(pic.creator);
  if (pic.licenceLabel) bits.push(pic.licenceLabel);
  if (pic.source) bits.push(pic.source);
  return bits.join(' · ');
}

/** A story slide: picture, the summary, what it proves, outlet and page. */
function storySlide(s, i, total) {
  const pic = s.resolvedPicture;
  const credit = creditLine(pic);
  const picBlock = pic && pic.dataUri
    ? `<div class="photo" style="background-image:url('${pic.dataUri}')">
         ${credit ? `<div class="whisper">${esc(credit)}</div>` : ''}
       </div>`
    : numberBlock(s);
  return `
  <section class="page">
    <div class="clear"><span class="kicker">Good News Daily · the week's best</span></div>
    ${picBlock}
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
  return `
  <section class="page cover">
    <div class="clear"></div>
    <div class="cover-body">
      <div class="sun"></div>
      <h1>${esc(spec.title)}</h1>
      <p class="sub">The ${spec.slides.length} stories readers chose, ${esc(humanWeek(spec.monday))}</p>
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
    <div class="clear"><span class="kicker">Good News Daily</span></div>
    <div class="body closing-body">
      <h2>The stories, in full</h2>
      <ol class="links">
        ${spec.slides.map((s) => `<li><a href="${esc(s.url)}">${esc(shortUrl(s.url))}</a></li>`).join('')}
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

  /* Constraint 2: the top fifth carries nothing that matters, because
     LinkedIn's viewer prints the document title and the caption over it. */
  .clear {
    height: ${Math.round(H * 0.2)}px;
    background: ${NAVY};
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 34px;
  }
  .kicker {
    font-size: 21px; letter-spacing: .22em; text-transform: uppercase;
    color: rgba(255,255,255,.55); font-weight: 600;
  }

  .photo {
    flex: 0 0 ${Math.round(H * 0.40)}px;
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
  .body { flex: 1 1 auto; min-height: 0; padding: 54px 72px 34px; overflow: hidden; }
  .summary { font-size: 58px; line-height: 1.16; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  .proves { font-size: 33px; line-height: 1.34; margin: 40px 0 0; color: #3A4756; }
  .proves span { font-weight: 700; color: ${GREEN}; }

  .foot {
    flex: 0 0 96px; background: ${YELLOW}; color: #1A1508;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 72px; font-size: 26px; font-weight: 600;
  }

  .cover .clear { height: ${Math.round(H * 0.2)}px; }
  .cover-body { flex: 1 1 auto; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 0 84px; text-align: center; }
  .sun { width: 118px; height: 118px; border-radius: 50%; background: ${YELLOW};
    box-shadow: 0 0 0 12px rgba(255,193,7,.28); margin-bottom: 64px; }
  .cover h1 { font-size: 86px; line-height: 1.08; font-weight: 700; color: ${NAVY};
    margin: 0; letter-spacing: -.02em; }
  .cover .sub { font-size: 34px; color: ${GREEN}; font-style: italic; margin: 40px 0 0; }

  .closing-body h2 { font-size: 54px; font-weight: 700; color: ${NAVY}; margin: 0 0 34px; }
  .links { margin: 0; padding-left: 46px; }
  .links li { font-size: 27px; line-height: 1.7; word-break: break-all; }
  .links a { color: ${INK}; text-decoration: none; }
  .quote { font-size: 30px; font-style: italic; color: #3A4756; margin: 44px 0 0; line-height: 1.4; }
  .quote span { display: block; font-style: normal; font-weight: 600; margin-top: 12px; font-size: 25px; }
  .credits { font-size: 17px; color: #7C8895; margin: 40px 0 0; line-height: 1.5; }
</style></head>
<body>
${coverSlide(spec)}
${spec.slides.map((s, i) => storySlide(s, i + 2, total)).join('\n')}
${closingSlide(spec)}
</body></html>`;
}

module.exports = { buildHtml, creditLine, W, H };
