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
    await page.close();
    return { report, closingRight };
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

Promise.all(pending).then(() => {
  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
