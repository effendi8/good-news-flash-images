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
  // The cover's and the closing page's yellow footer sat wholly inside the
  // fade (audit 2026-09-27), so every page now carries the thin line and
  // the two lines the footer used to hold moved up into the body.
  check('NO PAGE carries a footer, only the thin yellow line; the two foot ' +
    'lines live in the body, above the fade',
    (html.match(/class="strip"/g) || []).length === spec.slides.length + 2 &&
    !/class="foot"/.test(html) &&
    /class="src">Verified sources/.test(html) && /class="src">Follow the Page/.test(html));
  check('the closing page keeps the same right column as every other page: ' +
    'its own padding-right override reached x=1008 under the buttons',
    !/\.closing-body \{[^}]*padding-right/.test(html));
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
    /class="credits[ "]/.test(withCredits) && withCredits.indexOf('\u2014') < 0);
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

console.log('\nA CALF STORY GETS A CALF, OF THE SAME ANIMAL (Stefan, 2026-10-05)');
{
  const { subjectPicture, youngWord } = require('./subject');
  const realFetch = global.fetch;
  check('"orphaned elephant calf" is read as a calf story', youngWord('Keeper cares for an orphaned elephant calf.') === 'calf');
  check('"young people" and "baby boom" are NOT young-animal stories',
    youngWord('Young people and the baby boom generation') === '');
  const base = [
    [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'African bush elephant', pageprops: { wikibase_item: 'Q36557' } } } } }],
    [/wbgetentities/, { entities: { Q36557: { labels: { en: { value: 'African bush elephant' } }, descriptions: { en: { value: 'species of elephant' } } } } }],
    [/list=search/, { query: { search: [{ title: 'File:Kruger 0137.jpg' }, { title: 'File:Elephant calf, North West.jpg' }] } }],
    [/wbgetclaims/, { claims: { P18: [{ rank: 'normal', mainsnak: { datavalue: { value: 'Adult bull.jpg' } } }] } }],
    [/prop=imageinfo/, { query: { pages: { '1': { imageinfo: [{ url: 'u', thumburl: 't', descriptionurl: 'd',
      extmetadata: { LicenseShortName: { value: 'Public domain' }, AttributionRequired: { value: 'false' }, Artist: { value: 'NPS' } } }] } } } }],
  ];
  const askedA = [], askedB = [];
  pending.push(Promise.all(pending.slice())
    .then(() => { global.fetch = stubFetch(base, askedA); })
    .then(() => subjectPicture('A keeper spent five months caring for an orphaned elephant calf.', 'African bush elephant', () => {}))
    .then((p) => {
      const search = askedA.find((u) => /list=search/.test(u)) || '';
      const firstFile = (askedA.find((u) => /prop=imageinfo/.test(u)) || '');
      check('a calf story asks Commons for photos TAGGED as this same entry that show a calf',
        /haswbstatement%3AP180%3DQ36557%20calf/.test(search), search);
      check('and the photo whose title names the calf is tried first, before the adult on the entry',
        !!p && /Elephant%20calf/.test(firstFile), firstFile);
    })
    .then(() => { global.fetch = stubFetch(base, askedB); })
    .then(() => subjectPicture('Rhino numbers reached 4,075.', 'African bush elephant', () => {}))
    .then(() => {
      check('a story with no young animal asks nothing extra: the entry\'s own picture as before',
        !askedB.some((u) => /list=search/.test(u)), JSON.stringify(askedB));
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

console.log('\nA CREDIT THAT IS OWED NEEDS A NAME');
{
  // Audit 2026-09-27: a CC BY-SA file whose author field is a note came
  // through with its name dropped and shipped without the attribution the
  // licence requires. Now such a file is refused and the next photo of the
  // same entry is tried; a public-domain file with no name is still fine.
  const askedO = [];
  const answersO = [
    [/en\.wikipedia\.org.*redirects=1/, { query: { pages: { '1': { title: 'African elephant', pageprops: { wikibase_item: 'Q185038' } } } } }],
    [/wbgetentities/, { entities: { Q185038: { labels: { en: { value: 'African elephant' } }, descriptions: { en: { value: 'genus of mammals' } } } } }],
    [/wbgetclaims/, { claims: { P18: [
      { rank: 'normal', mainsnak: { datavalue: { value: 'Elephant.jpg' } } },
      { rank: 'normal', mainsnak: { datavalue: { value: 'Elephant2.jpg' } } }] } }],
    [/commons\.wikimedia\.org.*Elephant2/, { query: { pages: { '1': { imageinfo: [{ thumburl: 'https://x/e2.jpg', extmetadata: {
      LicenseShortName: { value: 'CC BY-SA 4.0' }, AttributionRequired: { value: 'true' }, Artist: { value: 'Giles Laurent' } } }] } } } }],
    [/commons\.wikimedia\.org/, { query: { pages: { '1': { imageinfo: [{ thumburl: 'https://x/e.jpg', extmetadata: {
      LicenseShortName: { value: 'CC BY-SA 4.0' }, AttributionRequired: { value: 'true' },
      Artist: { value: 'No machine-readable author provided. Someone assumed (based on copyright claims).' } } }] } } } }],
  ];
  const { subjectPicture } = require('./subject');
  pending.push(Promise.all(pending.slice())
    .then(() => { const rf = global.fetch; global.fetch = stubFetch(answersO, askedO);
      return subjectPicture('An elephant calf was raised.', 'African elephant', () => {})
        .finally(() => { global.fetch = rf; }); })
    .then((p) => {
      check('A CC BY-SA FILE WITH NO USABLE AUTHOR IS REFUSED, and the entry\'s next ' +
        'photo, which names its author, is used',
        p && p.imageUrl === 'https://x/e2.jpg' && p.creator === 'Giles Laurent', JSON.stringify(p));
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

console.log('\nNOTHING IN THE FADE OR UNDER THE BUTTONS, MEASURED IN A BROWSER');
{
  // Audit 2026-09-27 measured three defects on the deck as it shipped: the
  // longest picture pages stepped to the floor and ran on into the fade
  // (and off the page), the closing page reached x=1008 under the buttons
  // and clipped its credits, and the cover was never measured at all. The
  // same fitter and the same ruler render.js uses run here, on the
  // worst-case spec, and every word has to land above y=1166 and left of
  // x=944. A test on element boxes would not do: the ruler looks at words.
  const os = require('os');
  const { execFileSync } = require('child_process');
  let fitter = null;
  try { fitter = require('./fit'); } catch (e) { /* the old renderer had none */ }
  check('THE RENDERER HAS ONE FITTER FOR EVERY PAGE, cover and closing page ' +
    'included, and this test uses the same one', !!fitter);

  const worst = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample', 'worst.json'), 'utf8'));
  const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  const owed = (i) => ({ kind: 'subject', dataUri: tiny, imageUrl: 'x', owedCredit: true,
    creator: 'National Oceanic and Atmospheric Administration Fisheries ' + i,
    licenceLabel: 'CC BY-SA 4.0', source: 'Wikimedia Commons' });
  const withPics = (sp) => Object.assign({}, sp, {
    slides: sp.slides.map((s, i) => Object.assign({}, s, { resolvedPicture: owed(i) })) });
  const withoutPics = (sp) => Object.assign({}, sp, {
    slides: sp.slides.map((s) => Object.assign({}, s, { resolvedPicture: null })) });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gnd-fit-'));
  const fitted = async (browser, sp, name) => {
    const file = path.join(tmp, name + '.html');
    fs.writeFileSync(file, buildHtml(sp));
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350 });
    await page.goto('file://' + file, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');
    const report = fitter ? await fitter.fitInBrowser(page) : [];
    const closingRight = await page.evaluate(() => {
      const b = document.querySelector('.closing-body');
      const pg = b && b.closest('.page');
      return b ? Math.round(b.getBoundingClientRect().right - pg.getBoundingClientRect().left - parseFloat(getComputedStyle(b).paddingRight)) : null;
    });
    // What every picture credit ended up as after fitting, and whether it
    // fits the picture's edge (audit 2026-10-13, finding 4).
    const whispers = await page.evaluate(() => Array.from(document.querySelectorAll('.whisper')).map((w) => ({
      text: w.textContent, forms: JSON.parse(w.dataset.credits || '[]'),
      fits: w.scrollHeight <= w.clientHeight + 1 })));
    await page.close();
    return { report, closingRight, whispers };
  };
  const clean = (r) => r.length && r.every((p) => !p.overflow);
  const worstOf = (r, key) => r.length ? Math.max(...r.map((p) => p[key])) : 'not measured';

  pending.push(Promise.all(pending.slice()).then(async () => {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      // Defect 1: the picture pages with a 300-360 character summary and a
      // 220-260 character proof line.
      const wp = await fitted(browser, withPics(worst), 'worst-pics');
      const stories = wp.report.filter((p) => p.kind === 'story');
      check('WORST-CASE PICTURE PAGES: every word above the fade and left of the ' +
        'buttons, the picture yielding before any word does',
        stories.length === 5 && clean(stories),
        'lowest word y=' + worstOf(stories, 'maxBottom') + ', rightmost x=' + worstOf(stories, 'maxRight'));
      check('and not one word of a summary or proof line was cut to get there',
        stories.length === 5 && stories.every((p) => !p.cut));

      // AUDIT 2026-10-13, FINDING 4: the rotated credit was clipped at about
      // 90 characters, mid-word. Each of these credits runs to about 110, so
      // at the picture's fitted height it has to come down to a form that
      // fits, ends at a whole word, and keeps the label and the licence.
      const wh = wp.whispers;
      check('A LONG PICTURE CREDIT IS SHORTENED AT A WORD, NOT CLIPPED: every credit on a ' +
        'worst-case picture page fits its picture edge, is one of the whole-word forms, ' +
        'and still says "Not the event itself" and "CC BY-SA 4.0"',
        wh.length > 0 && wh.every((w) => w.fits && w.forms.indexOf(w.text) >= 0 &&
          w.text.indexOf('Not the event itself') === 0 && /CC BY-SA 4\.0/.test(w.text)) &&
        wh.some((w) => w.text !== w.forms[0]),
        JSON.stringify(wh.map((w) => ({ text: w.text, fits: w.fits }))));
      check('and the source is what goes first: no shortened credit still names Wikimedia Commons ' +
        'while the creator has lost words',
        wh.every((w) => !(/…/.test(w.text) && /Wikimedia Commons/.test(w.text))));

      // Defect 2: five owed credits on the closing page.
      const closing = wp.report.filter((p) => p.kind === 'closing');
      check('CLOSING PAGE WITH FIVE OWED CREDITS: pointer, quote and credit list ' +
        'all above the fade, none under the buttons',
        clean(closing), closing.map((p) => (p.bad || []).slice(0, 2).join('; ')).join(' | '));
      check('the closing page\'s words stop at x=944 like every other page\'s',
        wp.closingRight !== null && wp.closingRight <= 944, 'content edge at x=' + wp.closingRight);

      // A longer quote on top of five owed credits: the credit list drops to
      // its short form (creator and licence, the source named once) rather
      // than anything being clipped, and every creator is still named.
      const longQuote = Object.assign({}, withPics(worst), { quote: {
        text: 'researchers community vaccination measured between announced hospital ' +
          'children percent recorded restoration programme researchers community ' +
          'vaccination measured between announced hospital children percent recorded ' +
          'restoration programme researchers.',
        by: 'Eleanor Roosevelt Longname Testperson of the Longer Institute' } });
      const lq = await fitted(browser, longQuote, 'long-quote');
      const lqc = lq.report.find((p) => p.kind === 'closing') || {};
      const lqHtml = buildHtml(longQuote);
      check('WHEN THE FULL CREDIT LIST WOULD NOT FIT IT DROPS TO THE SHORT FORM, and ' +
        'still fits, and every creator and licence is still on the page',
        lqc.credits === 'short' && !lqc.overflow &&
        /class="credits short" hidden>Pictures \(Wikimedia Commons\): National Oceanic[^<]*Fisheries 4 · CC BY-SA 4\.0</.test(lqHtml),
        JSON.stringify({ credits: lqc.credits, overflow: lqc.overflow, y: lqc.maxBottom }));

      // Defect 3: the cover, with the longest zoom-out line, and with the
      // real one from the sample week.
      const wn = await fitted(browser, withoutPics(worst), 'worst-nopic');
      const sn = await fitted(browser, withoutPics(spec), 'sample-nopic');
      const covers = wn.report.concat(sn.report).filter((p) => p.kind === 'cover');
      check('THE COVER IS MEASURED AND FITS, with the 204-character zoom-out and ' +
        'with the real one, foot line included',
        covers.length === 2 && clean(covers),
        covers.map((p) => 'y=' + p.maxBottom + ' ' + (p.bad || []).slice(0, 1)).join(' | '));
      check('and the whole worst-case deck, pictures or not, has no word below ' +
        'y=1166 or past x=944 on any of its pages',
        clean(wp.report) && clean(wn.report) && clean(sn.report));

      // The sentence cut: the very last resort before refusing, whole
      // sentences from the end of the summary, the proof line untouched.
      const sentence = 'Researchers measured the programme across forty hospitals and ' +
        'recorded a steady fall in cases among children over the two years it ran.';
      const longStory = Object.assign({}, worst.slides[0], { resolvedPicture: null,
        summary: Array(9).fill(sentence).join(' '), numbers: [] });
      const ls = await fitted(browser, Object.assign({}, worst, { slides: [longStory] }), 'long-story');
      const lp = ls.report.find((p) => p.kind === 'story') || {};
      check('A SUMMARY THAT CANNOT FIT AT THE FLOOR IS CUT AT A SENTENCE END, and only then',
        lp.cut >= 1 && !lp.overflow && lp.summary && /\.$/.test(lp.summary) &&
        longStory.summary.indexOf(lp.summary) === 0 &&
        longStory.summary.charAt(lp.summary.length) === ' ',
        JSON.stringify({ cut: lp.cut, ends: (lp.summary || '').slice(-40) }));
    } finally {
      await browser.close();
    }

    // The fail-safe, end to end: a page that cannot be made to fit means NO
    // deck. The first renderer logged a warning and shipped the clipped
    // pages; the Apps Script side then posted them. With no PDF the script
    // falls back to the text recap, which is what it is designed to do.
    const impossible = Object.assign({}, worst, { monday: '2099-01-04', slides: [Object.assign({},
      worst.slides[0], { summary: 'x'.repeat(40).concat(' ').repeat(80).trim() + '.' })] });
    const specFile = path.join(tmp, '2099-01-04.json');
    fs.writeFileSync(specFile, JSON.stringify(impossible));
    let code = 0, output = '';
    try {
      output = execFileSync(process.execPath, [path.join(__dirname, 'render.js'), specFile, '--no-pictures'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    } catch (e) { code = e.status; output = String(e.stdout) + String(e.stderr); }
    check('A DECK WITH A PAGE THAT CANNOT FIT IS REFUSED: non-zero exit and no PDF, ' +
      'never a warning and a clipped page',
      code !== 0 && !fs.existsSync(path.join(tmp, '2099-01-04.pdf')) && /no deck written/.test(output),
      'exit ' + code + ': ' + output.split('\n').filter((l) => /overflow|WARNING|no deck/i.test(l)).join(' / '));
  }));
}

console.log('\nA PREVIEW DECK CAN NEVER BECOME THE LIVE ONE (audit 2026-09-27, finding A)');
{
  const os = require('os');
  const { pick, writeReceipt, receiptPath } = require('./pick');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnd-pick-'));
  const put = (f, body) => fs.writeFileSync(path.join(dir, f), typeof body === 'string' ? body : JSON.stringify(body));
  const SHA = 'a'.repeat(40);

  put('2026-09-28.json', { monday: '2026-09-28', slides: [] });
  put('2026-09-28.pdf', 'old');
  check('an old week without askedAt and with its PDF is finished, never rendered again',
    pick(dir) === '', pick(dir));

  put('2026-10-12.json', { monday: '2026-10-12', askedAt: '2026-10-11T13:00:00Z', slides: [] });
  check('a new spec with no PDF is picked', /2026-10-12\.json$/.test(pick(dir)), pick(dir));

  put('2026-10-12.pdf', 'preview deck');
  writeReceipt(path.join(dir, '2026-10-12.json'), SHA);
  check('rendered and receipted: finished', pick(dir) === '', pick(dir));
  const r = JSON.parse(fs.readFileSync(receiptPath(path.join(dir, '2026-10-12.json')), 'utf8'));
  check('the receipt names the ask it answers and the commit holding the deck',
    r.askedAt === '2026-10-11T13:00:00Z' && r.sha === SHA && r.monday === '2026-10-12', JSON.stringify(r));

  // 19:30: the live tick writes its own spec over the preview.
  put('2026-10-12.json', { monday: '2026-10-12', askedAt: '2026-10-11T17:30:00Z', slides: [] });
  check('THE LIVE SPEC IS RENDERED EVEN THOUGH A PREVIEW PDF ALREADY EXISTS',
    /2026-10-12\.json$/.test(pick(dir)), pick(dir));

  let threw = false;
  try { writeReceipt(path.join(dir, '2026-10-12.json'), 'main'); } catch (e) { threw = true; }
  check('a receipt refuses anything that is not a full commit id (a branch name would move)', threw);

  check('the receipt is not .json, so the workflow never mistakes it for a spec',
    /\.receipt\.txt$/.test(receiptPath('carousel/2026-10-12.json')));
}

console.log('\nTHE SHELF: SYMBOL PICTURES STEFAN APPROVED, AND NOTHING ELSE (2026-10-12)');
{
  const os = require('os');
  const { eligible, recentlyUsed, shelfPicture, loadShelf } = require('./shelf');
  const sym = creditLine({ kind: 'shelf', creator: 'A. Person', licenceLabel: 'CC BY 4.0', source: 'Wikimedia Commons' });
  check('A SHELF PICTURE SAYS "Symbol picture" FIRST, so no reader takes it for the scene',
    sym.indexOf('Symbol picture') === 0, sym);

  const shelf = {
    concepts: ['home', 'rescue'],
    entries: [
      { id: 'home-1', concept: 'home', file: 'A.jpg', approved: true, checkedOn: '2026-10-12' },
      { id: 'home-2', concept: 'home', file: 'B.jpg', approved: false, checkedOn: '2026-10-12' },
      { id: 'home-3', concept: 'home', file: 'C.jpg', approved: true, checkedOn: '2025-09-01' },
      { id: 'home-4', concept: 'home', file: 'D.jpg', approved: true, checkedOn: '2026-10-01' },
      { id: 'rescue-1', concept: 'rescue', file: 'E.jpg', approved: true, checkedOn: '2026-10-12' }
    ]
  };
  const none = new Set();
  const ids = (a) => a.map((e) => e.id).join(',');
  check('ONLY APPROVED PICTURES: an entry without Stefan\'s tick is never used',
    !ids(eligible(shelf, 'home', '2026-10-19', none, none)).includes('home-2'));
  check('A CHECK OLDER THAN A YEAR IS NO CHECK: the stale entry is refused',
    !ids(eligible(shelf, 'home', '2026-10-19', none, none)).includes('home-3'));
  check('the two good ones remain, in the order they were approved',
    ids(eligible(shelf, 'home', '2026-10-19', none, none)) === 'home-1,home-4',
    ids(eligible(shelf, 'home', '2026-10-19', none, none)));
  check('A WORD NOT ON THE CLOSED LIST IS NO PICTURE, even if an entry carries it',
    eligible({ concepts: ['home'], entries: [{ id: 'x', concept: 'party', file: 'X.jpg', approved: true, checkedOn: '2026-10-12' }] },
      'party', '2026-10-19', none, none).length === 0);
  check('no concept, no picture', eligible(shelf, '', '2026-10-19', none, none).length === 0);
  check('the concept word is read case-blind and trimmed',
    ids(eligible(shelf, ' Rescue ', '2026-10-19', none, none)) === 'rescue-1');
  check('USED IN THE LAST EIGHT WEEKS: skipped',
    ids(eligible(shelf, 'home', '2026-10-19', new Set(['home-1']), none)) === 'home-4');
  check('NEVER TWICE IN ONE DECK',
    ids(eligible(shelf, 'home', '2026-10-19', none, new Set(['home-4']))) === 'home-1');
  check('all used up: nothing, so the slide shows its number',
    eligible(shelf, 'home', '2026-10-19', new Set(['home-1', 'home-4']), none).length === 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-'));
  const rec = (monday, id) => fs.writeFileSync(path.join(dir, monday + '.pictures.txt'),
    JSON.stringify({ monday, slides: [{ n: 1, kind: 'shelf', shelfId: id }, { n: 2, kind: 'number' }] }));
  rec('2026-10-05', 'two-weeks-ago');
  rec('2026-08-17', 'nine-weeks-ago');
  rec('2026-10-19', 'this-monday-preview');
  fs.writeFileSync(path.join(dir, '2026-09-28.pictures.txt'), 'not json');
  rec('2026-10-13', 'tuesday-preview');
  const used = recentlyUsed('2026-10-19', dir);
  check('the rotation reads the records of the last eight weeks',
    used.has('two-weeks-ago'), [...used].join(','));
  check('a record older than eight weeks rotates nothing', !used.has('nine-weeks-ago'));
  check('THIS Monday\'s own record (an earlier render) does not block its own pictures',
    !used.has('this-monday-preview'));
  check('an unreadable record is skipped, never fatal', used.size === 1, [...used].join(','));
  check('A PREVIEW DATED ON A WEEKDAY USES NOTHING UP: only Monday decks reach readers',
    !used.has('tuesday-preview'));

  check('the shipped shelf file reads, and every entry carries a concept from its own list',
    (() => { const sh = loadShelf(); return Array.isArray(sh.concepts) && sh.concepts.length > 0 &&
      sh.entries.every((e) => sh.concepts.includes(e.concept) && e.id && e.file); })());
  check('every shipped entry id is unique',
    (() => { const sh = loadShelf(); const i = sh.entries.map((e) => e.id); return new Set(i).size === i.length; })());

  // A file whose licence changed since Stefan approved it is refused, and the
  // next approved picture is used: the licence is re-read on every use.
  const slide = { picture: { concept: 'home' } };
  const fakeCommons = async (file) => {
    if (file === 'A.jpg') throw new Error('licence is not usable commercially: CC BY-NC');
    return { imageUrl: 'https://x/' + file, creator: 'Someone', licenceLabel: 'CC0', owedCredit: false, source: 'Wikimedia Commons' };
  };
  pending.push(shelfPicture(slide, '2026-10-19', new Set(), fakeCommons, () => {}, { shelf, usedRecently: none })
    .then((p) => {
      check('A SHELF FILE WHOSE LICENCE NO LONGER PASSES IS REFUSED, and the next approved one is used',
        p && p.shelfId === 'home-4' && p.kind === 'shelf', JSON.stringify(p));
    }));
  pending.push(shelfPicture({ picture: { concept: 'home' } }, '2026-10-19', new Set(), async () => { throw new Error('gone'); },
    () => {}, { shelf, usedRecently: none })
    .then((p) => check('every shelf file failing its check: no picture, never a throw', p === null)));

  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'picture-rules.json'), 'utf8'));
  check('the shelf rung is ON and the library search is still OFF',
    rules.shelf && rules.shelf.enabled === true && rules.librarysearch.enabled === false);
}

console.log('\nA BIG FILE IS NOT A WRONG FILE (2026-10-12, the oak)');
{
  const { inline, MAX_DOWNLOAD_BYTES } = require('./pictures');
  const realFetch = global.fetch;
  const bytes = (n, type) => async () => ({ ok: true, status: 200,
    headers: { get: () => type || 'image/png' }, arrayBuffer: async () => new ArrayBuffer(n) });
  pending.push(Promise.all(pending.slice())
    .then(() => { global.fetch = bytes(4594136); return inline('https://x/oak.png'); })
    .then((uri) => check('THE 4.6 MB OAK PNG IS DOWNLOADED: render.js shrinks it to a slide-size JPEG anyway',
      /^data:image\/png;base64,/.test(uri)), (e) => check('THE 4.6 MB OAK PNG IS DOWNLOADED', false, e.message))
    .then(() => { global.fetch = bytes(MAX_DOWNLOAD_BYTES + 1); return inline('https://x/huge.tif'); })
    .then(() => check('a runaway file above the ceiling is still refused', false),
      (e) => check('a runaway file above the ceiling is still refused', /too large/.test(e.message), e.message))
    .then(() => { global.fetch = realFetch; }));
}

console.log('\nTHE CREDIT ON THE PICTURE GETS SHORTER AT A WORD (audit 2026-10-13, finding 4)');
{
  const { creditVariants } = require('./deck');
  const pic = { kind: 'shelf', creator: 'National Oceanic and Atmospheric Administration Fisheries',
    licenceLabel: 'CC BY-SA 4.0', source: 'Wikimedia Commons' };
  const v = creditVariants ? creditVariants(pic) : [];
  check('the forms run from the full credit to the shortest, each one shorter than the last',
    v.length > 2 && v[0] === creditLine(pic) && v.every((x, i) => i === 0 || x.length < v[i - 1].length),
    JSON.stringify(v));
  check('EVERY FORM KEEPS "Symbol picture" AND THE LICENCE NAME',
    v.length > 0 && v.every((x) => x.indexOf('Symbol picture · ') === 0 && / · CC BY-SA 4\.0( · |$)/.test(x)), JSON.stringify(v));
  check('the source is dropped first, before the creator loses a single word',
    v[1] === 'Symbol picture · National Oceanic and Atmospheric Administration Fisheries · CC BY-SA 4.0', v[1]);
  check('A SHORTENED CREATOR ENDS AT A WHOLE WORD, marked with an ellipsis, never on "and"',
    v.slice(2, -1).length > 0 && v.slice(2, -1).every((x) => {
      const c = x.split(' · ')[1];
      return /^[A-Za-z ]+ …$/.test(c) && pic.creator.indexOf(c.slice(0, -2)) === 0 &&
        pic.creator.charAt(c.length - 2) === ' ' && !/ and …$/.test(c);
    }), JSON.stringify(v.slice(2, -1)));
  check('and the last resort is label and licence alone', v[v.length - 1] === 'Symbol picture · CC BY-SA 4.0');
  const html = buildHtml(Object.assign({}, spec, { slides: spec.slides.map((s, i) => Object.assign({}, s,
    { resolvedPicture: i === 0 ? Object.assign({ dataUri: 'data:image/jpeg;base64,AA==' }, pic) : null })) }));
  check('THE FULL CREDIT STAYS ON THE CLOSING PAGE, creator, licence and source, whatever the slide shows',
    html.indexOf('Pictures: National Oceanic and Atmospheric Administration Fisheries · CC BY-SA 4.0 · Wikimedia Commons') >= 0);
}

console.log('\nTHE DECK DOES NOT WAIT ON GOOGLE FONTS (audit 2026-10-13, finding 1)');
{
  spec.slides.forEach((s) => { s.resolvedPicture = null; });
  const html = buildHtml(spec);
  check('NO REMOTE ADDRESS ANYWHERE IN THE PAGE: a stalled font request used to end the job with no deck',
    !/https?:\/\//.test(html.replace(/<p[^>]*>[\s\S]*?<\/p>/g, '')), (html.match(/https?:\/\/[^'")\s]+/g) || []).join(' '));
  const files = [...html.matchAll(/src: url\('(file:[^']+)'\)/g)].map((m) => require('url').fileURLToPath(m[1]));
  check('the font is two files kept in render/fonts, upright and italic, and both are there',
    files.length === 2 && files.every((f) => fs.existsSync(f) && fs.statSync(f).size > 100000), JSON.stringify(files));
  check('and the font\'s licence travels with it (SIL Open Font License)',
    /SIL Open Font License/.test(fs.readFileSync(path.join(__dirname, 'fonts', 'OFL.txt'), 'utf8')));
  const os = require('os');
  pending.push(Promise.all(pending.slice()).then(async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gnd-font-')), 'deck.html');
    fs.writeFileSync(file, html);
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      // Every request that is not the page's own file is refused, which is
      // what a Sunday with Google Fonts down looks like to the renderer.
      await page.setRequestInterception(true);
      const remote = [];
      page.on('request', (r) => {
        if (/^(file|data):/.test(r.url())) r.continue(); else { remote.push(r.url()); r.abort(); }
      });
      await page.goto('file://' + file, { waitUntil: 'networkidle0', timeout: 15000 });
      await page.evaluateHandle('document.fonts.ready');
      const loaded = await page.evaluate(() => Array.from(document.fonts)
        .filter((f) => f.family.replace(/"/g, '') === 'Montserrat' && f.status === 'loaded').map((f) => f.style));
      check('WITH THE NETWORK CUT OFF, MONTSERRAT STILL LOADS, upright and italic, and nothing remote is asked for',
        loaded.indexOf('normal') >= 0 && loaded.indexOf('italic') >= 0 && remote.length === 0,
        JSON.stringify({ loaded, remote }));
    } finally {
      await browser.close();
    }
  }));
}

console.log('\nTHE PICTURE CHECK STOPS AT ITS CAP (audit 2026-10-13, finding 2)');
{
  const chooserPath = require.resolve('./chooser');
  const subjectPath = require.resolve('./subject');
  const editorPath = require.resolve('./editor-check');
  pending.push(Promise.all(pending.slice()).then(async () => {
    const realSubject = require.cache[subjectPath].exports.subjectPicture;
    const realEditor = require.cache[editorPath].exports.editorApproves;
    let asked = 0;
    require.cache[subjectPath].exports.subjectPicture = async () => ({ imageUrl: 'https://example.org/x.jpg',
      dataUri: 'data:image/jpeg;base64,AA==', subject: 'Deimos', licenceLabel: 'Public domain' });
    require.cache[editorPath].exports.editorApproves = async () => { asked++; return { ok: true, why: 'shows it' }; };
    delete require.cache[chooserPath];
    const { choosePicture, rules } = require('./chooser');
    const cap = rules().editorCheck.maxSlides;
    const ctx = { usedThisDeck: new Set(), editorChecks: 0 };
    const lines = [];
    const got = [];
    for (let i = 0; i < cap + 2; i++) {
      got.push(await choosePicture({ summary: 'Deimos was mapped.', picture: { subject: 'Deimos' } },
        (l) => lines.push(l), ctx));
    }
    require.cache[subjectPath].exports.subjectPicture = realSubject;
    require.cache[editorPath].exports.editorApproves = realEditor;
    delete require.cache[chooserPath];
    check('maxSlides IS READ: the editor is asked at most ' + cap + ' times in one deck, never more',
      typeof cap === 'number' && cap > 0 && asked === cap, 'asked ' + asked + ' times, cap ' + cap);
    check('a picture past the cap is LEFT OUT, the same rule as no key: no check, no picture',
      got.slice(0, cap).every((p) => p !== null) && got.slice(cap).every((p) => p === null) &&
      lines.some((l) => /its cap of/.test(l)), lines.filter((l) => /cap/.test(l)).join(' | '));
  }));
}

console.log('\nA LICENCE IS ACCEPTED BY NAME, NOT BY NOT BEING REFUSED (audit 2026-10-13, finding 3)');
{
  const { licenceLabel, commonsFile } = require('./subject');
  const L = licenceLabel || (() => 'not built');
  const yes = { 'PD': 'Public domain', 'Public domain': 'Public domain', 'PDM': 'Public domain', 'CC0': 'CC0',
    'CC BY-SA 4.0': 'CC BY-SA 4.0', 'CC BY 2.0': 'CC BY 2.0', 'CC BY-SA 3.0 de': 'CC BY-SA 3.0 de',
    'CC BY-SA 3.0 ee': 'CC BY-SA 3.0 ee', 'cc-by-sa-4.0': 'CC BY-SA 4.0', 'cc-by-3.0-de': 'CC BY 3.0 de' };
  check('PUBLIC DOMAIN, CC0, CC BY AND CC BY-SA PASS, any version or country, under their own names',
    Object.keys(yes).every((k) => L(k) === yes[k]), JSON.stringify(Object.keys(yes).map((k) => [k, L(k)])));
  const no = ['Attribution', 'CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 4.0', 'GFDL 1.2', 'GPL',
    'Free Art License', 'Copyrighted free use', 'FAL', ''];
  check('EVERYTHING ELSE IS REFUSED, including a bare "Attribution" and names nobody thought of',
    no.every((k) => L(k) === ''), JSON.stringify(no.map((k) => [k, L(k)])));

  const realFetch = global.fetch;
  const commons = (meta) => async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: { '1': {
    imageinfo: [{ thumburl: 'https://x/a.jpg', extmetadata: meta }] } } } }) });
  const meta = (shortName, code) => Object.assign({ LicenseShortName: { value: shortName },
    AttributionRequired: { value: 'true' }, Artist: { value: 'Ann Maker' } }, code ? { License: { value: code } } : {});
  const tryFile = (m) => { global.fetch = commons(m); return commonsFile('A.jpg', () => {}).then((p) => p, (e) => e); };
  pending.push(Promise.all(pending.slice())
    .then(async () => {
      const unknown = await tryFile(meta('Some Custom Licence'));
      const bare = await tryFile(meta('Attribution', 'attribution'));
      const mapped = await tryFile(meta('Attribution', 'cc-by-2.0'));
      const port = await tryFile(meta('CC BY-SA 3.0 de', 'cc-by-sa-3.0-de'));
      check('A LICENCE NAME NOBODY THOUGHT OF IS REFUSED: the old block-list let it through',
        unknown instanceof Error && /allow-list/.test(unknown.message), String(unknown && (unknown.message || unknown.licenceLabel)));
      check('A BARE "Attribution" WITH NOTHING BEHIND IT IS REFUSED, never printed on a slide as a licence',
        bare instanceof Error, String(bare && (bare.message || bare.licenceLabel)));
      check('"Attribution" whose machine code says cc-by-2.0 is printed as "CC BY 2.0"',
        mapped && mapped.licenceLabel === 'CC BY 2.0', String(mapped && (mapped.message || mapped.licenceLabel)));
      check('a country port passes under its own name: "CC BY-SA 3.0 de"',
        port && port.licenceLabel === 'CC BY-SA 3.0 de', String(port && (port.message || port.licenceLabel)));
    })
    .finally(() => { global.fetch = realFetch; }));
}

Promise.all(pending).then(() => {
  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
