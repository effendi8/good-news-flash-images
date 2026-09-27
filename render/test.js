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
  subjectPicture('A six-year-old in Cologne spotted a stolen car.', '', () => {})
    .then((p) => {
      check('NO NAMED SUBJECT, NO PICTURE: guessing it is what produced perfume ' +
        'for a story about Cologne', p === null, JSON.stringify(p));
      console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
      process.exit(fail ? 1 : 0);
    });
}

console.log('\nTHE DECK CANNOT INVENT, CLIP OR LOSE ANYTHING');
{
  spec.slides.forEach((s) => { s.resolvedPicture = null; });
  const html = buildHtml(spec);

  check('one page per story, plus a cover and a closing page',
    (html.match(/class="page/g) || []).length === spec.slides.length + 2,
    String((html.match(/class="page/g) || []).length));

  check('EVERY story URL survives into the closing page: the caption is the ' +
    'only click path a document post has',
    spec.slides.every((s) => html.indexOf(s.url) >= 0));

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

  check('a slide with neither picture nor numbers still renders a page',
    html.indexOf('class="mark"') >= 0);

  check('the top fifth of every page is the clear zone LinkedIn overlays',
    (html.match(/class="clear"/g) || []).length === spec.slides.length + 2);

  check('the page is 4:5, not A4: A4 leaves black bars in the viewer',
    /size: 1080px 1350px/.test(html));

  // The zoom-out opens the text recap because LinkedIn previews the first
  // sentence. A carousel has no first sentence, so the cover is where the
  // same eye lands (Stefan, 2026-09-27).
  check('THE ZOOM-OUT IS ON THE COVER', html.indexOf(spec.zoomOut) >= 0);
  const noZoom = buildHtml(Object.assign({}, spec, { zoomOut: '' }));
  check('and nothing verified means no line at all, never a filled slot',
    !/class="zoom"/.test(noZoom));
}

console.log('\nTHE SWITCHES ARE READABLE AND SAY WHAT THEY COST');
{
  const { rules } = require('./chooser');
  const r = rules();
  check('the subject picture is the rung that is ON', r.subjectPicture.enabled === true);
  check('THE LIBRARY SEARCH IS OFF: Stefan, 2026-09-27, a picture that is only ' +
    'thematically right is rejected', r.librarysearch.enabled === false);
  check('the editor check is BUILT and OFF, as he asked', r.editorCheck.enabled === false);
  check('every switch says in plain words what it is worth, so turning one on ' +
    'is an informed decision',
    [r.subjectPicture, r.librarysearch, r.editorCheck].every((x) => (x._why || '').length > 40));
}

