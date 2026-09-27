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
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
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

/**
 * ONE CANDIDATE, AND ONLY AN EXACT ONE (2026-09-27, after the test on 108
 * published stories).
 *
 * The first version took up to three search results and used the first one
 * that had a picture. Measured on a month of real stories, that is where most
 * wrong pictures came from: when the right entry was rejected or had no
 * picture, the loop moved on to whatever came next. "Amazon" became a
 * skyscraper called Amazon Tower, "KEEP" became a castle keep in Spain,
 * "Helvellyn" the title page of a piano score.
 *
 * So there is exactly one candidate now, found in this order:
 *   1. The Wikipedia article whose title (or redirect) is the named subject.
 *      A disambiguation page means the name is ambiguous ("Spectrum",
 *      "NHS"), and an ambiguous name gets no picture.
 *   2. Failing that, the database search, but only if its FIRST result
 *      carries the named subject as its label or one of its names, exactly.
 * If that one candidate is a setting, has no picture, or has a picture we
 * cannot use, the answer is no picture. Never the next result.
 */
async function findEntity(phrase, log) {
  const viaTitle = await byWikipediaTitle(phrase, log);
  if (viaTitle === 'ambiguous') return null;
  if (viaTitle) return viaTitle;
  try {
    const d = await json(`${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(phrase)}` +
      `&language=en&uselang=en&format=json&limit=1&origin=*`);
    const hit = (d.search || [])[0];
    if (!hit) return null;
    const matched = (hit.match && hit.match.text) || hit.label || '';
    if (sameName(matched, phrase)) return hit;
    log(`    the database's first answer for "${phrase}" is "${hit.label}", not an exact match; no picture`);
  } catch (e) {
    log(`    entity search failed for "${phrase}": ${e.message}`);
  }
  return null;
}

/** Same name, ignoring case, accents, punctuation and spacing. */
function sameName(a, b) {
  const n = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return !!n(a) && n(a) === n(b);
}

/**
 * THE NAMED SUBJECT'S OWN ARTICLE, which also finds it under another name
 * (2026-09-27, the first real deck).
 *
 * The editor named "Kok-Aral Dam". The database files it as "Dike Kokaral"
 * and does not list the English name as an alias, so the search above came
 * back empty and a subject with a perfectly good picture got none. Wikipedia
 * keeps a redirect from every common name to the article, and the article
 * says which database entry it is. Since the 108-story test this is asked
 * FIRST: an article title is an exact answer, a search result is a guess.
 * Returns the entry, 'ambiguous' for a disambiguation page, or null.
 *
 * This is still the NAMED subject, looked up by another road; nothing is
 * guessed. The setting rule below still applies to what comes back, which
 * is why the label and description are fetched as well. Never throws.
 */
async function byWikipediaTitle(phrase, log) {
  try {
    const w = await json(`${WIKIPEDIA}?action=query&titles=${encodeURIComponent(phrase)}` +
      `&redirects=1&prop=pageprops&ppprop=wikibase_item|disambiguation&format=json&origin=*`);
    const page = Object.values((w.query && w.query.pages) || {})[0] || {};
    if (page.pageprops && 'disambiguation' in page.pageprops) {
      log(`    "${phrase}" could mean several things (a disambiguation page); no picture`);
      return 'ambiguous';
    }
    const qid = page.pageprops && page.pageprops.wikibase_item;
    if (!qid) return null;
    const e = await json(`${WIKIDATA}?action=wbgetentities&ids=${qid}` +
      `&props=labels|descriptions&languages=en&format=json&origin=*`);
    const ent = (e.entities && e.entities[qid]) || {};
    const label = (ent.labels && ent.labels.en && ent.labels.en.value) || page.title || phrase;
    const description = (ent.descriptions && ent.descriptions.en && ent.descriptions.en.value) || '';
    if (!sameName(label, phrase)) {
      log(`    "${phrase}" is filed under another name: "${label}" (${qid}), via Wikipedia`);
    }
    return { id: qid, label, description, match: { text: phrase } };
  } catch (err) {
    log(`    Wikipedia lookup failed for "${phrase}": ${err.message}`);
    return null;
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
 * `text` is everything the editor wrote about the story. It is no longer
 * read here (the subject is named, and matched exactly); the argument stays
 * so the callers do not change.
 */
async function subjectPicture(text, named, log) {
  const say = log || (() => {});

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
  if (!named) {
    say('    no subject named for this story; a guessed one is not good enough');
    return null;
  }
  say(`    subject named by the editor: "${named}"`);

  const hit = await findEntity(named, say);
  if (hit) {
    if (isSettingEntity(hit)) {
      say(`    "${hit.label}" is where the story happened, not what it is about (${hit.description})`);
    } else {
      const file = await entityImage(hit.id, say);
      if (file) {
        try {
          const pic = await commonsFile(file, say);
          pic.subject = hit.label;
          pic.qid = hit.id;
          say(`    subject "${hit.label}" (${hit.id}) -> ${pic.licenceLabel}` +
            (pic.owedCredit ? ' (credit owed)' : '') + ` by ${pic.creator || 'unknown'}`);
          return pic;
        } catch (e) {
          say(`    "${hit.label}" has a picture we cannot use (${e.message})`);
        }
      }
    }
  }
  say('    no subject in this story carries a usable picture');
  return null;
}

module.exports = { subjectPicture, candidatePhrases };
