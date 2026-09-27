/**
 * Which picture a slide gets, and the switches that decide.
 *
 * The ladder, in order, with what each rung is worth (Wikimedia's measured
 * figures, see subject.js):
 *
 *   1. the story's own subject          85-95%   on by default
 *   2. a library search by words        20-40%   OFF by default
 *   3. one figure the editor published   n/a     always, never switched off
 *
 * Rung 2 is off because Stefan decided on 2026-09-27 that a picture which is
 * only thematically right should be rejected rather than shown: on a Page
 * whose promise is checked facts, a plausible wrong picture costs more than a
 * plain number. Both rungs are one word in picture-rules.json.
 */

const fs = require('fs');
const path = require('path');
const { subjectPicture } = require('./subject');
const { pictureFor: libraryPicture } = require('./pictures');
const { editorApproves } = require('./editor-check');

function rules() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'picture-rules.json'), 'utf8'));
}

/**
 * Everything the editor wrote about this story. The subject guard reads it,
 * so it gets the summary and the proof line rather than a trimmed query.
 */
function storyText(slide) {
  return [slide.summary, slide.proves].filter(Boolean).join(' ');
}

/**
 * Returns a picture or null. Never throws: a slide without a picture is a
 * slide with a number, and a Sunday that cannot reach the internet must
 * still produce a deck.
 */
async function choosePicture(slide, log) {
  const say = log || (() => {});
  const r = rules();

  if (r.subjectPicture && r.subjectPicture.enabled) {
    let pic = null;
    const named = (slide.picture && slide.picture.subject) || '';
    try { pic = await subjectPicture(storyText(slide), named, say); }
    catch (e) { say(`    subject picture threw (${e.message})`); }
    if (pic) {
      pic.kind = 'subject';
      if (await passesEditor(pic, slide, r, say)) return pic;
    }
  }

  if (r.librarysearch && r.librarysearch.enabled) {
    const query = (slide.picture && slide.picture.query) || '';
    let pic = null;
    if (query) {
      try { pic = await libraryPicture(query, say); }
      catch (e) { say(`    library search threw (${e.message})`); }
    }
    if (pic) {
      pic.kind = 'library';
      if (await passesEditor(pic, slide, r, say)) return pic;
    }
  }

  say('    -> the story\'s own number it is');
  return null;
}

async function passesEditor(pic, slide, r, say) {
  if (!(r.editorCheck && r.editorCheck.enabled)) return true;
  try {
    const verdict = await editorApproves(pic, slide, r.editorCheck, say);
    if (verdict === null) return true;          // the check could not run
    if (!verdict.ok) {
      say(`    the editor rejected this picture: ${verdict.why}`);
      return false;
    }
    say(`    the editor accepted this picture: ${verdict.why}`);
    return true;
  } catch (e) {
    // A failing check must never turn into a failing deck.
    say(`    the editor check failed (${e.message}); keeping the picture`);
    return true;
  }
}

module.exports = { choosePicture, rules };
