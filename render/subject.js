/**
 * THE SUBJECT PICTURE: the story's own subject, and the picture attached to it.
 *
 * WHY THIS REPLACED A LIBRARY SEARCH (2026-09-27). Stefan, on the first real
 * deck: a picture that "looks good but is utterly unrelated to the content".
 * He was right, and the fault was the method, not the query. Wikimedia has
 * solved this exact problem at scale for unillustrated Wikipedia articles and
 * published what each method is worth, measured on about 500 matches in six
 * languages by expert reviewers:
 *
 *     the subject's own picture        85-95% right
 *     another language's lead image    56-76%
 *     the subject's category           51-76%
 *     searching a library by words     20-40%   <- what we were doing
 *
 * https://www.mediawiki.org/wiki/Growth/Personalized_first_day/Structured_tasks/Add_an_image/Idea_validation
 *
 * So this does what their best method does: find what the story is ABOUT,
 * then take the picture that subject already carries. Tested on our own
 * failures the same afternoon: pygmy hog, Andoya spaceport, the ozone layer,
 * wetland restoration and the Indus river dolphin all resolved to a picture
 * of the actual subject, and all four checked were public domain with no
 * attribution required.
 *
 * THE GUARD THAT MATTERS. An entity search always answers something. Asked
 * about "a farmer turned 70 acres", it will confidently return an entity
 * nobody meant. So a match is only accepted when the entity's own label
 * appears VERBATIM in the story's text. That turns "the search found
 * something" into "the story actually names this thing", and it is the
 * difference between 85% and nonsense.
 */

const UA = 'GoodNewsDaily/1.0 (+https://www.linkedin.com/company/109379035)';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.split('?')[0]}`);
  return res.json();
}

/**
 * Phrases the story might be about, most promising first.
 *
 * Two kinds, and no cleverness beyond them: sequences of capitalised words,
 * which is how a place, an organisation or a person appears in a summary;
 * and two- or three-word lower-case phrases, which is how a species, a
 * material or a phenomenon appears. Everything is checked against the text
 * afterwards anyway, so a wrong guess here costs a lookup, not a wrong
 * picture.
 */
function candidatePhrases(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const out = [];

  // Capitalised runs, skipping the first word of a sentence, which is
  // capitalised for grammar rather than because it names anything.
  const words = clean.split(' ');
  let run = [];
  words.forEach((w, i) => {
    const bare = w.replace(/[^A-Za-z'’-]/g, '');
    const isName = /^[A-Z][a-z’'-]+$/.test(bare) && i > 0 && !/[.!?]$/.test(words[i - 1] || '');
    if (isName) { run.push(bare); return; }
    if (run.length) { out.push(run.join(' ')); run = []; }
  });
  if (run.length) out.push(run.join(' '));

  // Lower-case noun-ish phrases: three words, then two, across the summary.
  const low = clean.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const STOP = new Set(('the a an of in on at for and to with by from is are was were has have had ' +
    'its his her their that this as it can could after over into more than about now new first ' +
    'been being they them he she we you i not no but or so if when while which who whom whose ' +
    'one two three four five six seven eight nine ten').split(' '));
  for (const n of [3, 2]) {
    for (let i = 0; i + n <= low.length; i++) {
      const parts = low.slice(i, i + n);
      if (parts.some((p) => STOP.has(p) || p.length < 3)) continue;
      out.push(parts.join(' '));
    }
  }

  // ORDERING, and it took a failed render to get right. The first version
  // sorted longest-first and kept twelve, which looks sensible and is wrong:
  // the actual subject of a story is usually SHORT. "pygmy hog" lost to
  // "species written off" and never got tried at all, so a story whose
  // subject has a perfectly good picture fell through to a number.
  //
  // Two signals decide the order instead:
  //
  //   - where it sits. A summary names its subject early and its setting
  //     late, so a phrase from the first half outranks one from the second.
  //   - whether it is a SETTING rather than a subject. "in Cologne", "from
  //     Andoya", "at the hospital": a phrase introduced by a place
  //     preposition is where the story happened, not what it is about, and
  //     taking it produced a city skyline for a story about a child
  //     spotting a stolen car. It goes last rather than being dropped,
  //     because sometimes the place IS the story.
  const lower = clean.toLowerCase();
  const isSetting = (p) => new RegExp('\\b(in|from|at|near|across|outside)\\s+' +
    p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(lower);
  const at = (p) => { const i = lower.indexOf(p.toLowerCase()); return i < 0 ? 1 : i / lower.length; };

  const seen = new Set();
  return out
    .filter((p) => p.length >= 4 && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
    .map((p) => ({ p, rank: (isSetting(p) ? 1 : 0) + at(p) * 0.5 - Math.min(p.split(' ').length, 3) * 0.08 }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.p)
    .slice(0, 24);
}

/** The entity search. Returns up to three candidates; never throws. */
async function findEntities(phrase, log) {
  try {
    const d = await json(`${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(phrase)}` +
      `&language=en&uselang=en&format=json&limit=3&origin=*`);
    return d.search || [];
  } catch (e) {
    log(`    entity search failed for "${phrase}": ${e.message}`);
    return [];
  }
}

/**
 * A SETTING IS NOT A SUBJECT, and the database says which is which.
 *
 * "A six-year-old in Cologne recognised her family's stolen car" named
 * Cologne, so the label guard passed it happily and the slide got a
 * photograph of a cathedral skyline. Same for "his Oregon barley farm",
 * which produced the state of Oregon. Both are the place the story happened
 * in, and Stefan's rule of 2026-09-27 is that a picture which is only
 * thematically right is rejected.
 *
 * Each entity carries a one-line description of what kind of thing it is,
 * so the rule can be exact rather than clever: a country, state, city or
 * district is where, not what. A spaceport, a species or a river dolphin is
 * not caught by this, which is the point.
 */
function isSettingEntity(hit) {
  const d = String((hit && hit.description) || '').toLowerCase();
  if (!d) return false;
  return /\b(country|sovereign state|state of the|federal state|city|town|village|municipality|county|province|region|district|capital|borough|commune|prefecture|canton)\b/.test(d);
}

/** The picture an entity carries (property P18), or ''. */
async function entityImage(qid, log) {
  try {
    const d = await json(`${WIKIDATA}?action=wbgetclaims&entity=${qid}&property=P18&format=json&origin=*`);
    const c = (d.claims && d.claims.P18) || [];
    // Wikidata ranks its own statements; a "preferred" one is the maintained
    // choice and beats whatever happens to be first.
    const best = c.find((x) => x.rank === 'preferred') || c[0];
    return (best && best.mainsnak && best.mainsnak.datavalue && best.mainsnak.datavalue.value) || '';
  } catch (e) {
    log(`    P18 lookup failed for ${qid}: ${e.message}`);
    return '';
  }
}

/**
 * Everything the credit needs, straight from the file's own record: the
 * licence, whether attribution is a condition, who made it, and a copy
 * already scaled to slide width so nothing large is ever downloaded.
 */
async function commonsFile(fileName, log) {
  const d = await json(`${COMMONS}?action=query&titles=File:${encodeURIComponent(fileName)}` +
    `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1080&format=json&origin=*`);
  const page = Object.values(d.query.pages)[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) throw new Error('no image info');
  const em = ii.extmetadata || {};
  const val = (k) => ((em[k] || {}).value || '');
  const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const licence = strip(val('LicenseShortName'));
  const owed = String(val('AttributionRequired')).toLowerCase() === 'true';
  const restrictions = strip(val('Restrictions'));
  // A file carrying a use restriction (trademark, personality rights) is not
  // worth the argument on a Page that publishes five of these a week.
  if (restrictions) throw new Error(`file carries restrictions: ${restrictions}`);
  if (/non-?commercial|\bnc\b|no derivative|\bnd\b/i.test(licence)) {
    throw new Error(`licence is not usable commercially: ${licence}`);
  }
  return {
    imageUrl: ii.thumburl || ii.url,
    creator: strip(val('Artist')).slice(0, 60),
    licenceLabel: licence || 'see Wikimedia Commons',
    owedCredit: owed,
    source: 'Wikimedia Commons',
    landing: ii.descriptionurl || ''
  };
}

/**
 * The story's subject picture, or null.
 *
 * `text` is everything the editor wrote about the story: the summary and the
 * proof line. The label guard reads it, so the more of the editor's own words
 * it gets, the safer the match.
 */
async function subjectPicture(text, named, log) {
  const say = log || (() => {});
  const haystack = ' ' + String(text || '').toLowerCase() + ' ';

  // THE SUBJECT HAS TO BE NAMED, NOT GUESSED (2026-09-27, after three
  // rounds of trying to guess it).
  //
  // Guessing the subject out of the sentence with rules produced, in order:
  // a US state for an Oregon wetland, a university for the same story once
  // the state was rejected, a wild boar for a pygmy hog, Europe for a rocket
  // launch, and - the one that ended the experiment - a bottle of PERFUME
  // for a story about a child in Cologne. Every one of them passed the
  // "the story names this thing" guard, because the story did name it.
  //
  // The lesson is not that the rules were bad. It is that entity linking
  // from a free sentence is a research problem, and we already have
  // something that has READ the article and verified it: the editor. A
  // subject it names is a lookup. A subject we infer is a guess wearing a
  // lookup's clothes, and on a page that promises checked facts a confident
  // wrong picture is worse than no picture.
  //
  // So: no named subject, no picture. The number graphic is always right.
  const phrases = named ? [named] : [];
  if (!phrases.length) {
    say('    no subject named for this story; a guessed one is not good enough');
    return null;
  }
  say(`    subject named by the editor: "${named}"`);

  for (const phrase of phrases) {
    for (const hit of await findEntities(phrase, say)) {
      // THE GUARD: the thing the search returned has to be a thing the story
      // actually names. Without it, "a farmer turned 70 acres" resolves to
      // something confident and wrong.
      //
      // CHECK WHAT MATCHED, NOT THE LABEL. The first version compared the
      // entity's label, and the label of a species is its scientific name:
      // "pygmy hog" is filed as "Porcula salvania", which appears in no
      // news story ever written, so the best match of the whole test set
      // was thrown away silently. The search says which of its names the
      // query hit, and that is the name to check. It also fixes spelling:
      // "Andoya" in a summary against "Andøya" in the database.
      // The "does the story name this?" guard exists to catch a GUESSED
      // subject. A named one has already been chosen by something that read
      // the article, and holding it to the story's exact spelling threw away
      // "Andoya Space" because the summary wrote Andoya without its slashed
      // o. So the guard applies only when we had to look for the subject
      // ourselves, which today is never.
      const matched = String((hit.match && hit.match.text) || hit.label || '').toLowerCase();
      if (!named) {
        if (!matched || matched.length < 4 || haystack.indexOf(' ' + matched) < 0) continue;
      }
      if (isSettingEntity(hit)) {
        say(`    "${hit.label}" is where the story happened, not what it is about (${hit.description})`);
        continue;
      }

      const file = await entityImage(hit.id, say);
      if (!file) continue;

      try {
        const pic = await commonsFile(file, say);
        pic.subject = hit.label;
        pic.qid = hit.id;
        say(`    subject "${hit.label}" (${hit.id}) -> ${pic.licenceLabel}` +
          (pic.owedCredit ? ' (credit owed)' : '') + ` by ${pic.creator || 'unknown'}`);
        return pic;
      } catch (e) {
        say(`    "${hit.label}" has a picture we cannot use (${e.message}), next`);
      }
    }
  }
  say('    no subject in this story carries a usable picture');
  return null;
}

module.exports = { subjectPicture, candidatePhrases };
