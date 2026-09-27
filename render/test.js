#!/usr/bin/env node
/**
 * What this guards, and why each one is here.
 *
 * The renderer runs unattended on a Sunday evening and its output goes
 * straight onto a company Page on Monday morning. The things below are the
 * ones that would be wrong QUIETLY: a credit that stops saying "stock
 * picture", a slide that invents a number, a page that loses its links. A
 * broken layout announces itself; these do not.
 *
 *   node render/test.js
 */
const fs = require('fs');
const path = require('path');
const { buildHtml, creditLine } = require('./deck');

let pass = 0, fail = 0;
// Checks that wait on a promise register here; the result is printed once
// all of them have answered, so none can land after the verdict.
const pending = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         -> ' + detail : '')); }
};

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample', '2026-10-05.json'), 'utf8'));

console.log('THE CREDIT SAYS WHAT STEFAN DECIDED ON 2026-09-27');
{
  const owed = creditLine({ creator: 'Jim Evans', licenceLabel: 'CC BY-SA 4.0', source: 'wikimedia' });
  check('it always opens with "Stock picture", so no reader takes a library ' +
    'photo for the scene', owed.indexOf('Stock picture') === 0, owed);
  check('a licence that OWES a credit gets creator and licence, which is a ' +
    'proper attribution however small it is set',
    /Jim Evans/.test(owed) && /CC BY-SA 4\.0/.test(owed), owed);
  check('no picture, no credit line at all', creditLine(null) === '');

  // The two rungs of the ladder are different things and the reader is told
  // which one they are looking at.
  const subj = creditLine({ kind: 'subject', creator: 'Joseph Wolf',
    licenceLabel: 'Public domain', source: 'Wikimedia Commons' });
  check('A PICTURE OF THE STORY\'S SUBJECT says it is not the event itself, ' +
    'rather than calling itself stock', subj.indexOf('Not the event itself') === 0, subj);
  check('and it still names who made it and under what licence',
    /Joseph Wolf/.test(subj) && /Public domain/.test(subj), subj);

  // A GUESSED SUBJECT IS NOT ALLOWED TO PRODUCE A PICTURE. Three rounds of
  // guessing it from the sentence gave a US state for an Oregon wetland, a
  // wild boar for a pygmy hog, Europe for a rocket launch and a bottle of
  // perfume for a child in Cologne. Every one passed a "the story names
  // this" check, because the story did name it.
  const { subjectPicture } = require('./subject');
  pending.push(subjectPicture('A six-year-old in Cologne spotted a stolen car.', '', () => {})
    .then((p) => {
      check('NO NAMED SUBJECT, NO PICTURE: guessing it is what produced perfume ' +
        'for a story about Cologne', p === null, JSON.stringify(p));
    }));
}

console.log('\nTHE DECK CANNOT INVENT, CLIP OR LOSE ANYTHING');
{
  spec.slides.forEach((s) => { s.resolvedPicture = null; });
  const html = buildHtml(spec);

  check('one page per story, plus a cover and a closing page',
    (html.match(/class="page/g) || []).length === spec.slides.length + 2,
    String((html.match(/class="page/g) || []).length));

  // THE CLOSING PAGE SAYS WHERE THE STORIES ARE, and lists no outlets:
  // "no one cares what the news channels are" (Stefan, 2026-09-27).
  check('the closing page says, large, that the stories are linked in the post text',
    /class="pointer">All five stories are linked in the post text above\./.test(html));
  check('NO OUTLET NAME ON ANY PAGE, closing page and story footers included',
    spec.slides.every((s) => html.indexOf('>' + s.outlet + '<') < 0),
    JSON.stringify(spec.slides.map((s) => s.outlet)));

  // LINKEDIN DARKENS THE BOTTOM OF EVERY PAGE and puts its buttons over the
  // right edge (his screenshots, 2026-09-27), so the words stay out of both.
  check('NO PAGE NUMBER anywhere: LinkedIn prints "page 3 of 7" above the page',
    !/class="pg"/.test(html));
  check('the story pages carry no footer, only the thin yellow line',
    (html.match(/class="strip"/g) || []).length === spec.slides.length &&
    (html.match(/class="foot"/g) || []).length === 2);
  check('the words keep out of the button column and the fade',
    /\.body \{[^}]*padding: 58px 136px 184px 72px/.test(html) &&
    /\.body\.big \{[^}]*padding: 64px 136px 184px 72px/.test(html));

  check('the document title appears as a heading, because LinkedIn shows it ' +
    'over page one', html.indexOf(spec.title) >= 0);

  // The number graphic may only ever enlarge a figure the editor already
  // published. This asserts the direction that matters: nothing on a slide
  // that is not in the spec.
  const figures = [...html.matchAll(/class="fig big">([^<]+)</g)].map((m) => m[1]);
  check('every enlarged figure comes from the spec, none is computed here',
    figures.every((f) => spec.slides.some((s) => (s.numbers || []).includes(f))),
    JSON.stringify(figures));
  check('and only ONE figure per slide, because a relationship between two ' +
    'numbers is a claim the editor did not make',
    !/class="fig small"/.test(html));

  // The ghosted wordmark is gone: a page with nothing to show now gives its
  // space to the sentence instead of filling six tenths of a phone screen
  // with navy (Stefan, 2026-09-27).
  check('A SLIDE WITH NO PICTURE BECOMES A TYPOGRAPHIC PAGE, not an empty one',
    (html.match(/class="page text-only"/g) || []).length === spec.slides.length &&
    html.indexOf('class="mark"') < 0 && /class="body big"/.test(html),
    String((html.match(/class="page text-only"/g) || []).length));
  check('and a story with no figure at all still renders its page',
    html.indexOf(spec.slides[4].summary) >= 0);

  // Only PAGE ONE is overlaid by LinkedIn's own title and caption, so only
  // page one holds a clear zone. Repeating it on all seven cost a tenth of
  // every slide and said nothing (Stefan, 2026-09-27: "you should make
  // better use of the space").
  check('NO STORY PAGE carries the masthead any more: the picture runs to the ' +
    'top edge and the words get the rest',
    (html.match(/class="clear"/g) || []).length === 2 &&
    !/text-only"[\s\S]{0,80}class="clear"/.test(html),
    String((html.match(/class="clear"/g) || []).length));
  check('the cover keeps its clear zone, because only page one is overlaid ' +
    'by LinkedIn\'s own title', /page cover">\s*<div class="clear">/.test(html));

  check('the page is 4:5, not A4: A4 leaves black bars in the viewer',
    /size: 1080px 1350px/.test(html));

  // The zoom-out opens the text recap because LinkedIn previews the first
  // sentence. A carousel has no first sentence, so the cover is where the
  // same eye lands (Stefan, 2026-09-27).
  check('THE ZOOM-OUT IS ON THE COVER',
    html.indexOf(spec.zoomOut.replace(/^Zoom out:\s*/i, '')) >= 0);
  const fancy = buildHtml(Object.assign({}, spec, {
    zoomOut: '\u{1D419}\u{1D428}\u{1D428}\u{1D426} \u{1D428}\u{1D42E}\u{1D42D}: TB treatment saved lives.'
  }));
  check('LINKEDIN\'S BOLD LETTERS BECOME ORDINARY ONES on the slide, set bold ' +
    'by the slide itself, so the cover never mixes two typefaces',
    /<strong>Zoom out:<\/strong> TB treatment saved lives\./.test(fancy) &&
    !/[\u{1D400}-\u{1D7FF}]/u.test(fancy));
  const noZoom = buildHtml(Object.assign({}, spec, { zoomOut: '' }));
  check('and nothing verified means no line at all, never a filled slot',
    !/class="zoom"/.test(noZoom));
  const withCredits = buildHtml(Object.assign({}, spec, {
    slides: spec.slides.map((s, i) => Object.assign({}, s, i < 2
      ? { resolvedPicture: { creator: 'Maker ' + i, licenceLabel: 'Public domain', source: 'Wikimedia Commons' } }
      : {}))
  }));
  check('NO EM-DASH anywhere a reader can see it (rule R04), including the ' +
    'picture credits on the closing page',
    /class="credits"/.test(withCredits) && withCredits.indexOf('\u2014') < 0);
}

console.log('\nA SUBJECT FILED UNDER ANOTHER NAME STILL GETS ITS PICTURE');
{
  // Offline: every request is answered from this table, so the test says
  // what the code asks for and cannot pass on a lucky network day.
  const answers = [
    [/wbsearchentities/, { search: [] }],
    [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'Dike Kokaral', pageprops: { wikibase_item: 'Q1166032' } } } } }],
    [/wbgetentities/, { entities: { Q1166032: { labels: { en: { value: 'Dike Kokaral' } }, descriptions: { en: { value: 'dam in Kazakhstan' } } } } }],
    [/wbgetclaims/, { claims: { P18: [{ rank: 'normal', mainsnak: { datavalue: { value: 'Dike Kokaral.jpg' } } }] } }],
  ];
  const asked = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    asked.push(url);
    const hit = answers.find(([re]) => re.test(url));
    return { ok: !!hit, status: hit ? 200 : 404, json: async () => (hit ? hit[1] : {}) };
  };
  const { subjectPicture } = require('./subject');
  pending.push(subjectPicture('Kazakhstan\'s Kok-Aral Dam raised the sea.', 'Kok-Aral Dam', () => {})
    .catch(() => null)
    .then(() => {
      global.fetch = realFetch;
      check('"Kok-Aral Dam" is asked of Wikipedia first, which leads to the entry ' +
        'filed as "Dike Kokaral", and THAT entry\'s picture is looked up',
        asked.some((u) => /en\.wikipedia\.org/.test(u)) &&
        asked.some((u) => /wbgetclaims.*Q1166032/.test(u)));
    }));
}

// Offline stub for the next two blocks: every request is answered from a
// table, and unanswered requests fail, so a test cannot pass by luck.
function stubFetch(answers, asked) {
  return async (url) => {
    asked.push(url);
    const hit = answers.find(([re]) => re.test(url));
    return { ok: !!hit, status: hit ? 200 : 404, json: async () => (hit ? hit[1] : {}) };
  };
}

console.log('\nONE CANDIDATE, EXACT, NEVER THE NEXT SEARCH RESULT (108-story test)');
{
  const { subjectPicture } = require('./subject');
  const realFetch = global.fetch;

  // "Spectrum" is a disambiguation page: the laser photo came from here.
  const askedA = [];
  const answersA = [
    [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'Spectrum', pageprops: { disambiguation: '' } } } } }],
    [/wbsearchentities/, { search: [{ id: 'Q5', label: 'visible spectrum', match: { text: 'spectrum' } }] }],
  ];
  // Waits for every earlier network check, because they all swap the same
  // global fetch and must not overlap.
  pending.push(Promise.all(pending.slice())
    .then(() => { global.fetch = stubFetch(answersA, askedA); })
    .then(() => subjectPicture('The Spectrum rocket reached orbit.', 'Spectrum', () => {}))
    .then((p) => {
      check('AN AMBIGUOUS NAME GETS NO PICTURE: "Spectrum" was a laser for a rocket',
        p === null && !askedA.some((u) => /wbsearchentities|wbgetclaims/.test(u)), JSON.stringify(askedA));
    })
    .then(() => {
      // No article under that name, and the search's first answer is a
      // different thing: the skyscraper for "Amazon", the castle for "KEEP".
      const askedB = [];
      global.fetch = stubFetch([
        [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '-1': { title: 'KEEP', missing: '' } } } }],
        [/wbsearchentities/, { search: [{ id: 'Q9', label: 'castle keep', match: { text: 'keep' } }] }],
        [/wbgetclaims/, { claims: { P18: [{ rank: 'normal', mainsnak: { datavalue: { value: 'Castle.jpg' } } }] } }],
      ], askedB);
      return subjectPicture('The KEEP programme helps stroke patients.', 'KEEP programme', () => {})
        .then((p) => {
          check('A SEARCH RESULT THAT IS NOT AN EXACT MATCH IS REFUSED, not used',
            p === null && !askedB.some((u) => /wbgetclaims/.test(u)), JSON.stringify(askedB));
          check('and only ONE result is ever asked for, so there is no "next one" to fall to',
            askedB.filter((u) => /wbsearchentities/.test(u)).every((u) => /limit=1\b/.test(u)));
        });
    })
    .then(() => {
      // The right entry exists but is a setting: it must end there, not move on.
      const askedC = [];
      global.fetch = stubFetch([
        [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'Bhutan', pageprops: { wikibase_item: 'Q917' } } } } }],
        [/wbgetentities/, { entities: { Q917: { labels: { en: { value: 'Bhutan' } }, descriptions: { en: { value: 'sovereign state in South Asia' } } } } }],
      ], askedC);
      return subjectPicture('Bhutan eliminated rabies.', 'Bhutan', () => {})
        .then((p) => {
          check('A REJECTED SETTING ENDS THE SEARCH: no second candidate is tried',
            p === null && !askedC.some((u) => /wbsearchentities|wbgetclaims/.test(u)), JSON.stringify(askedC));
        });
    })
    .finally(() => { global.fetch = realFetch; }));
}

console.log('\nTHE CHECK JUDGES THE SUBJECT, AND A LICENCE MUST FIT ON A SLIDE');
{
  // Reads the question the check sends, without calling any model.
  const src = require('fs').readFileSync(require.resolve('./editor-check'), 'utf8');
  check('A PHOTO OF THE NAMED SPECIES IS A YES even when the story is about one ' +
    'young animal: the first live run refused the elephant for being an adult',
    /THE SUBJECT, NOT THE MOMENT/.test(src) && /young one/.test(src));
  check('and a different species, place or person is still a NO',
    /a different species/.test(src) && /merely shares the name is a NO/.test(src));

  const askedL = [];
  const answersL = [
    [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'African elephant', pageprops: { wikibase_item: 'Q185038' } } } } }],
    [/wbgetentities/, { entities: { Q185038: { labels: { en: { value: 'African elephant' } }, descriptions: { en: { value: 'genus of mammals' } } } } }],
    [/wbgetclaims/, { claims: { P18: [
      { rank: 'normal', mainsnak: { datavalue: { value: 'Elephant.jpg' } } },
      { rank: 'normal', mainsnak: { datavalue: { value: 'Elephant2.jpg' } } }] } }],
    [/commons\.wikimedia\.org.*Elephant2/, { query: { pages: { '1': { imageinfo: [{ thumburl: 'https://x/e2.jpg', extmetadata: {
      LicenseShortName: { value: 'Public domain' } } }] } } } }],
    [/commons\.wikimedia\.org/, { query: { pages: { '1': { imageinfo: [{ thumburl: 'https://x/e.jpg', extmetadata: {
      LicenseShortName: { value: 'GFDL 1.2' }, AttributionRequired: { value: 'true' } } }] } } } }],
  ];
  const { subjectPicture } = require('./subject');
  pending.push(Promise.all(pending.slice())
    .then(() => { const rf = global.fetch; global.fetch = stubFetch(answersL, askedL);
      return subjectPicture('An elephant calf was raised.', 'African elephant', () => {})
        .finally(() => { global.fetch = rf; }); })
    .then((p) => {
      check('A GFDL PICTURE IS REFUSED, and the SAME entry\'s next photo is used ' +
        'instead (the public-domain elephant), never a different entry',
        p && p.imageUrl === 'https://x/e2.jpg' && p.licenceLabel === 'Public domain' &&
        askedL.filter((u) => /wbsearchentities/.test(u)).length === 0, JSON.stringify(p));
    }));
}

console.log('\nTHE CREDIT CARRIES A NAME OR NOTHING');
{
  const { cleanCreator } = require('./subject');
  check('A NOTE IS NOT A NAME: "No machine-readable author provided..." is dropped',
    cleanCreator('No machine-readable author provided. Benjism89 assumed (based on copyright claims).') === '');
  check('a real name passes untouched', cleanCreator('Giles Laurent') === 'Giles Laurent');
  const long = cleanCreator('National Oceanic and Atmospheric Administration Fisheries Science Center photographers team');
  check('A LONG NAME IS CUT AT A WORD, never inside one',
    long.length <= 60 && /Fisheries$|Science$|Center$|Administration$|Atmospheric$/.test(long), long);
  const pd = creditLine({ kind: 'subject', creator: '', licenceLabel: 'Public domain', source: 'Wikimedia Commons' });
  check('a public-domain photo with no name reads "... Public domain · Wikimedia Commons"',
    /Public domain · Wikimedia Commons$/.test(pd) && !/machine/.test(pd), pd);
}

console.log('\nNO CHECK, NO PICTURE');
{
  // The chooser with the check switched on and no key: the picture must be
  // left out. The first version kept it.
  const chooserPath = require.resolve('./chooser');
  const subjectPath = require.resolve('./subject');
  const keyBefore = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  pending.push(Promise.all(pending.slice()).then(async () => {
    const realSubject = require.cache[subjectPath].exports.subjectPicture;
    require.cache[subjectPath].exports.subjectPicture = async () => ({
      imageUrl: 'https://example.org/x.jpg', subject: 'Deimos', licenceLabel: 'Public domain' });
    delete require.cache[chooserPath];
    const { choosePicture } = require('./chooser');
    const lines = [];
    const pic = await choosePicture({ summary: 'Deimos was mapped.', picture: { subject: 'Deimos' } },
      (l) => lines.push(l));
    require.cache[subjectPath].exports.subjectPicture = realSubject;
    if (keyBefore) process.env.ANTHROPIC_API_KEY = keyBefore;
    check('WITH THE CHECK ON AND NO KEY, THE PICTURE IS LEFT OUT (a number instead)',
      pic === null && lines.some((l) => /could not run, so the picture is left out/.test(l)),
      lines.join(' | '));
  }));
}

console.log('\nTHE SWITCHES ARE READABLE AND SAY WHAT THEY COST');
{
  const { rules } = require('./chooser');
  const r = rules();
  check('the subject picture is the rung that is ON', r.subjectPicture.enabled === true);
  check('THE LIBRARY SEARCH IS OFF: Stefan, 2026-09-27, a picture that is only ' +
    'thematically right is rejected', r.librarysearch.enabled === false);
  check('the editor check is ON (Stefan\'s OK, 2026-09-27, after the 108-story test)',
    r.editorCheck.enabled === true);
  check('every switch says in plain words what it is worth, so turning one on ' +
    'is an informed decision',
    [r.subjectPicture, r.librarysearch, r.editorCheck].every((x) => (x._why || '').length > 40));
}

Promise.all(pending).then(() => {
  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
