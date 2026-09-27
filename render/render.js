#!/usr/bin/env node
/**
 * Turns one carousel spec into the PDF the Monday post is built from.
 *
 *   node render/render.js carousel/2026-10-05.json
 *
 * Writes carousel/<monday>.pdf and carousel/<monday>.png beside the spec.
 * The Apps Script project waits for the PDF to appear at its public address
 * and then hands it to Buffer; it never reads this code and this code never
 * touches Buffer, LinkedIn or any Google account. The only thing crossing
 * between them is the JSON in and the PDF out.
 *
 * --no-pictures renders with number graphics only, which is the fast way to
 * check a layout change without spending Openverse requests.
 */

const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./deck');
const { choosePicture } = require('./chooser');

const log = (m) => console.log(m);

async function main() {
  const specPath = process.argv[2];
  const noPictures = process.argv.includes('--no-pictures');
  if (!specPath) {
    console.error('usage: node render/render.js <spec.json> [--no-pictures]');
    process.exit(2);
  }

  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!spec.monday || !Array.isArray(spec.slides) || !spec.slides.length) {
    throw new Error('the spec carries no monday or no slides');
  }
  if (!spec.title) throw new Error('the spec carries no title, and Buffer refuses a document post without one');
  log(`Rendering ${spec.monday}: ${spec.slides.length} stories, title "${spec.title}"`);

  for (const slide of spec.slides) {
    if (noPictures) { slide.resolvedPicture = null; continue; }
    log(`Slide ${slide.n}: ${String(slide.summary || '').slice(0, 64)}...`);
    slide.resolvedPicture = await choosePicture(slide, log);
    if (!slide.resolvedPicture) {
      log(`  -> no picture of the subject, the slide uses the story's own ` +
        `number: ${JSON.stringify((slide.numbers || [])[0] || null)}`);
    }
  }

  const outDir = path.dirname(specPath);
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    // ---- Pictures down to slide size, BEFORE the deck is built ----------
    // The first render weighed 13.5 MB, because a library photograph is
    // often 4000px wide and Chrome embeds whatever bytes it is given. The
    // picture area is 1080 x 540, so everything above that is weight a
    // reader waits for and Buffer may refuse. Done in the browser we already
    // launch rather than with an image library: no native dependency to
    // install in CI, and the encoder is the same one that draws the page.
    const shrink = await browser.newPage();
    for (const slide of spec.slides) {
      const pic = slide.resolvedPicture;
      if (!pic || !pic.dataUri) continue;
      const before = pic.dataUri.length;
      pic.dataUri = await shrink.evaluate(async (uri) => {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = uri; });
        const targetW = Math.min(1080, img.naturalWidth);
        const scale = targetW / img.naturalWidth;
        const c = document.createElement('canvas');
        c.width = targetW; c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.82);
      }, pic.dataUri);
      log(`  picture ${slide.n}: ${Math.round(before / 1024)} KB -> ` +
        `${Math.round(pic.dataUri.length / 1024)} KB`);
    }
    await shrink.close();

    const html = buildHtml(spec);
    const htmlPath = path.join(outDir, `${spec.monday}.html`);
    fs.writeFileSync(htmlPath, html);

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle0' });
    // Google Fonts must be in before anything is measured, or the first page
    // renders in the fallback face and the rest do not.
    await page.evaluateHandle('document.fonts.ready');

    // ---- Nothing may be cut off by the yellow band ----------------------
    // The first render clipped "by one person deciding to do it." behind the
    // foot. Editors write to meaning, not to a character count, so the
    // layout has to yield rather than the sentence. Each page's text is
    // stepped down until it fits, and a page that still does not fit at the
    // floor is reported rather than shipped quietly.
    const tight = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.page').forEach((pg, i) => {
        const body = pg.querySelector('.body');
        if (!body) return;
        const fits = () => body.scrollHeight <= body.clientHeight;
        const big = body.classList.contains('big');
        // THE FLOOR IS 34px, which is about 12px on a phone. Below that
        // Stefan could not read it (2026-09-27), so the type stops
        // shrinking there and the warning below fires instead.
        const sizes = big
          ? [[80, 46], [72, 44], [64, 42], [56, 38], [48, 36], [42, 34]]
          : [[62, 42], [56, 40], [50, 38], [46, 36], [42, 35], [38, 34]];
        const sum = body.querySelector('.summary');
        const pr = body.querySelector('.proves');
        for (const [a, b] of sizes) {
          if (sum) sum.style.fontSize = a + 'px';
          if (pr) pr.style.fontSize = b + 'px';
          if (fits()) return;
        }
        if (!fits()) out.push(i + 1);
      });
      return out;
    });
    if (tight.length) {
      log(`  WARNING: page(s) ${tight.join(', ')} still overflow at the smallest ` +
        `type. The deck is still written; look at those pages.`);
    }

    const pdfPath = path.join(outDir, `${spec.monday}.pdf`);
    await page.pdf({
      path: pdfPath,
      width: '1080px',
      height: '1350px',
      printBackground: true,
      pageRanges: `1-${spec.slides.length + 2}`
    });

    // The cover, as a PNG, for Buffer's optional thumbnail. The probe showed
    // LinkedIn's full-screen viewer ignores it, but the closed state in the
    // feed has never been read, so it costs nothing to provide one.
    const coverPath = path.join(outDir, `${spec.monday}.png`);
    await page.screenshot({ path: coverPath, clip: { x: 0, y: 0, width: 1080, height: 1350 } });

    const pdfBytes = fs.statSync(pdfPath).size;
    log(`Wrote ${pdfPath} (${pdfBytes} bytes) and ${coverPath}`);
    if (pdfBytes < 5000) throw new Error('the PDF is suspiciously small, refusing to publish it');
  } finally {
    await browser.close();
    // The intermediate HTML is a build artefact, not something to commit.
    if (!process.env.KEEP_HTML) {
      try { fs.unlinkSync(htmlPath); } catch (e) { /* nothing to clean up */ }
    }
  }
}

main().catch((e) => {
  console.error('Render failed: ' + e.stack);
  process.exit(1);
});
