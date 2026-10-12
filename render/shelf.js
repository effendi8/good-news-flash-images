/**
 * THE PICTURE SHELF: a symbol picture for a story no photograph can show.
 *
 * WHY THIS EXISTS (Stefan, 2026-10-05 "yes, I want all that", and the deck
 * of 2026-10-12, which went out with no picture on any story page). Most of
 * what this Page publishes is about people and events: a home rebuilt by
 * volunteers, a woman pulled out of the mud, a flood rescue. None of those
 * has a legally usable photograph of its own, and searching a library by
 * words was switched off on 2026-09-27 because it is right only 20-40% of
 * the time. So the shelf is the third way: a small set of pictures that a
 * HUMAN looked at and approved, each filed under one concept from a closed
 * list ("home", "rescue", "volunteers", ...). The weekly naming call in the
 * script picks one concept per story, or none.
 *
 * THE RULES, each one a line below:
 *   - only pictures Stefan approved ("approved": true in shelf.json);
 *   - only pictures checked within the last year ("checkedOn");
 *   - only a concept on the closed list; anything else is no picture;
 *   - the same picture never twice in one deck, and not again within eight
 *     weeks (read from the record each render leaves behind);
 *   - the licence is re-read from Wikimedia Commons on every use, through
 *     the same function the subject pictures use, so a file that has since
 *     changed licence or vanished is refused, never used from memory;
 *   - the page says "Symbol picture", so no reader takes it for the scene.
 * When nothing on the shelf passes, the slide shows its number, as before.
 *
 * NO MODEL LOOKS AT A SHELF PICTURE. Stefan has looked at every one of them,
 * which is a better check than the picture check; the only machine judgment
 * left is the concept word, and that is one word from a closed list.
 */
const fs = require('fs');
const path = require('path');

const SHELF_FILE = path.join(__dirname, 'shelf.json');
const RECORD_DIR = path.join(__dirname, '..', 'carousel');
const ROTATION_DAYS = 56;     // eight weeks, the rule in the 10-05 proposal
const STALE_DAYS = 366;       // a check older than a year is no check

function loadShelf(file) {
  try { return JSON.parse(fs.readFileSync(file || SHELF_FILE, 'utf8')); }
  catch (e) { return { concepts: [], entries: [] }; }
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

/**
 * The shelf ids used by decks in the eight weeks BEFORE this Monday, read
 * from the `<monday>.pictures.txt` record every render writes. A record is
 * .txt for the same reason the receipt is: the workflow fires on
 * carousel/*.json and must never mistake it for a spec.
 */
function recentlyUsed(monday, dir) {
  const used = new Set();
  let names = [];
  try { names = fs.readdirSync(dir || RECORD_DIR); } catch (e) { return used; }
  for (const name of names) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.pictures\.txt$/);
    if (!m || m[1] >= monday) continue;
    // ONLY A MONDAY DECK USES A PICTURE UP (2026-10-12). A preview is
    // written for "tomorrow", so on any day but Sunday it carries a
    // weekday date, and counting it would lock the shelf's pictures for
    // eight weeks without a reader ever seeing them.
    if (new Date(m[1] + 'T12:00:00Z').getUTCDay() !== 1) continue;
    if (daysBetween(m[1], monday) > ROTATION_DAYS) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(dir || RECORD_DIR, name), 'utf8'));
      (rec.slides || []).forEach((s) => { if (s.shelfId) used.add(s.shelfId); });
    } catch (e) { /* an unreadable record rotates nothing; it never blocks a deck */ }
  }
  return used;
}

/**
 * The shelf entries this slide may use, best first. Pure, so the tests can
 * reach every rule without a network.
 *
 * Order: the picture used longest ago (or never) first, ties by the order
 * Stefan approved them in, so the same week always gets the same answer.
 */
function eligible(shelf, concept, monday, usedRecently, usedThisDeck) {
  const c = String(concept || '').trim().toLowerCase();
  if (!c || !(shelf.concepts || []).includes(c)) return [];
  return (shelf.entries || []).filter((e) =>
    e.concept === c &&
    e.approved === true &&
    e.file &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.checkedOn || '') &&
    daysBetween(e.checkedOn, monday) <= STALE_DAYS &&
    !usedRecently.has(e.id) &&
    !usedThisDeck.has(e.id));
}

/**
 * One shelf picture for one slide, or null. Never throws.
 *
 * `commonsFile` is passed in (subject.js) so the licence rules live in one
 * place and the tests can stub the network.
 */
async function shelfPicture(slide, monday, usedThisDeck, commonsFile, log, opts) {
  const say = log || (() => {});
  const o = opts || {};
  const concept = slide.picture && slide.picture.concept;
  if (!concept) { say('    no concept named for the shelf'); return null; }
  const shelf = o.shelf || loadShelf();
  const pool = eligible(shelf, concept, monday, o.usedRecently || recentlyUsed(monday, o.dir), usedThisDeck);
  if (!pool.length) {
    say(`    the shelf has no approved, unused picture for "${concept}"`);
    return null;
  }
  for (const entry of pool) {
    try {
      const pic = await commonsFile(entry.file, say);
      pic.kind = 'shelf';
      pic.shelfId = entry.id;
      say(`    shelf picture ${entry.id} for "${concept}" -> ${pic.licenceLabel}` +
        (pic.owedCredit ? ' (credit owed)' : '') + ` by ${pic.creator || 'unknown'}`);
      return pic;
    } catch (e) {
      say(`    shelf picture ${entry.id} cannot be used today (${e.message}); the next one`);
    }
  }
  say(`    no shelf picture for "${concept}" passed its licence check`);
  return null;
}

module.exports = { shelfPicture, eligible, recentlyUsed, loadShelf, ROTATION_DAYS, STALE_DAYS };
