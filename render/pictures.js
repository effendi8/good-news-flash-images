/**
 * Finding a picture for a slide, under Stefan's rules of 2026-09-27.
 *
 * THE RULE THAT REMOVES THE LEGAL RISK IS NOT THE SIZE OF THE PRINT, IT IS
 * WHICH PICTURES ARE ACCEPTED. Whether a credit is legally owed is decided
 * by the licence, so this asks for the licences that owe nothing FIRST, and
 * only falls back to a licence that demands a credit when the first pass
 * finds nothing. His words for the decision: "prefer free, allow strict with
 * credit".
 *
 *   pass 1  public domain and CC0        credit optional, we print one anyway
 *   pass 2  CC BY and CC BY-SA           credit is a CONDITION of use
 *   pass 3  nothing                      the slide falls back to a number
 *                                        graphic built from the story's own
 *                                        verified figures (deck.js)
 *
 * NEVER the outlet's own photograph, under any pass. That is rule 46 of the
 * main project and it is why this searches an openly licensed library rather
 * than the article page: linking to a publisher's photo is fine, copying it
 * into our own file is not (Swiss URG Art. 2(3bis)).
 *
 * Openverse needs no key and aggregates Flickr, Wikimedia and museum
 * collections. Anonymous use is capped at about 100 requests a day against
 * the five a week this needs.
 */

const OPENVERSE = 'https://api.openverse.org/v1/images/';
const UA = 'GoodNewsDaily/1.0 (+https://www.linkedin.com/company/109379035)';

// Licences that owe no attribution, best first.
const FREE = 'cc0,pdm';
// Licences that owe one. Anything more restrictive (nc, nd) is never asked
// for: this Page is a commercial-capable publication and a non-commercial
// picture would be the wrong licence even if nobody ever complained.
const STRICT = 'by,by-sa';

const LICENCE_LABELS = {
  cc0: 'CC0', pdm: 'public domain', by: 'CC BY', 'by-sa': 'CC BY-SA'
};

async function search(query, licences) {
  const url = `${OPENVERSE}?q=${encodeURIComponent(query)}` +
    `&license=${licences}&size=large&page_size=8&mature=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Openverse answered HTTP ${res.status} for "${query}"`);
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/**
 * Downloads the picture and returns it as a data URI.
 *
 * Inlined rather than linked for two reasons: a remote image that loads
 * slowly or not at all would produce a blank half-page in the PDF with
 * nobody watching, and hotlinking someone's file on every render is rude
 * even when the licence allows it.
 */
async function inline(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`picture fetch answered HTTP ${res.status}`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//.test(type)) throw new Error(`picture is ${type}, not an image`);
  const buf = Buffer.from(await res.arrayBuffer());
  // A slide picture over ~4 MB makes a PDF Buffer may refuse and a reader
  // will not wait for. Anything that large is the wrong file anyway.
  if (buf.length > 4 * 1024 * 1024) throw new Error(`picture is ${buf.length} bytes, too large`);
  return `data:${type};base64,${buf.toString('base64')}`;
}

function shape(hit, owedCredit) {
  const licence = String(hit.license || '').toLowerCase();
  const version = hit.license_version ? ` ${hit.license_version}` : '';
  return {
    creator: hit.creator || '',
    source: hit.source || hit.provider || '',
    licence,
    // A licence that owes nothing still gets named, because the credit is
    // printed either way and naming it costs one word.
    licenceLabel: (LICENCE_LABELS[licence] || licence) + (owedCredit ? version : ''),
    owedCredit,
    landing: hit.foreign_landing_url || '',
    imageUrl: hit.url || ''
  };
}

/**
 * One picture for one slide, or null.
 *
 * Never throws: a slide with no picture is a slide with a number graphic,
 * and a Sunday evening that cannot reach Openverse must still produce a
 * deck. Every failure is logged so a silent run of blank-looking slides
 * cannot be mistaken for a design decision.
 */
async function pictureFor(query, log) {
  const say = log || (() => {});
  for (const [licences, owed] of [[FREE, false], [STRICT, true]]) {
    let hits = [];
    try {
      hits = await search(query, licences);
    } catch (e) {
      say(`  picture search failed (${licences}): ${e.message}`);
      continue;
    }
    for (const hit of hits) {
      const pic = shape(hit, owed);
      if (!pic.imageUrl) continue;
      try {
        pic.dataUri = await inline(pic.imageUrl);
        say(`  picture: ${pic.licenceLabel}${owed ? ' (credit owed)' : ''} ` +
          `by ${pic.creator || 'unknown'} via ${pic.source}`);
        return pic;
      } catch (e) {
        say(`  picture rejected (${e.message}), trying the next hit`);
      }
    }
    say(`  no usable picture under ${licences} for "${query}"`);
  }
  return null;
}

module.exports = { pictureFor, inline };
