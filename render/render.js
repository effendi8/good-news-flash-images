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
const { fitInBrowser, describe } = require('./fit');

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

    // ---- Nothing may sit in LinkedIn's fade or under its buttons ---------
    // The first render clipped "by one person deciding to do it." behind the
    // foot. Editors write to meaning, not to a character count, so the
    // layout has to yield rather than the sentence. fit.js steps every page
    // (cover and closing page included, which the first version never
    // measured) and then measures every word. A page that still overflows
    // after every step is a render FAILURE: no PDF is written, the workflow
    // commits nothing, and the Monday recap goes out as the text post it
    // always was. That fail-safe is designed; a clipped deck on the Page is
    // not.
    const report = await fitInBrowser(page);
    for (const rep of report) log('  ' + describe(rep));
    const cut = report.filter((r) => r.cut);
    for (const r of cut) log(`  page ${r.page} summary now reads: ${r.summary}`);
    const over = report.filter((r) => r.overflow);
    if (over.length) {
      throw new Error(`page(s) ${over.map((r) => r.page).join(', ')} still carry words in ` +
        `the fade or the button column after every step; no deck written`);
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
