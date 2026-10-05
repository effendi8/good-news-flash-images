#!/usr/bin/env node
/**
 * Which spec still needs a deck, and the receipt that says which one a deck
 * answers.
 *
 * WHY THIS EXISTS (audit of 2026-09-27, finding A, built 2026-10-05). The
 * old rule was "a spec with a PDF beside it is finished". So a preview deck
 * rendered on a Sunday afternoon blocked the live spec written at 19:30:
 * the renderer saw a PDF and did nothing, and the script saw a PDF and
 * posted it. The preview became the live deck. The rule now: the script
 * stamps every spec with `askedAt`, and after a render this job writes
 * `carousel/<monday>.receipt.txt` naming the `askedAt` it answered and the
 * commit that holds the deck. The script accepts only a receipt that
 * answers ITS OWN ask, and points Buffer at the deck by that commit, so a
 * later preview can never swap the file under a scheduled post.
 *
 * The receipt is .txt on purpose: the workflow fires on carousel/*.json,
 * and a receipt named .json would look like a spec to it.
 *
 *   node render/pick.js                    prints the spec to render, or nothing
 *   node render/pick.js receipt <spec> <sha>   writes the receipt for <spec>
 */
const fs = require('fs');
const path = require('path');

function receiptPath(specPath) {
  return specPath.replace(/\.json$/, '.receipt.txt');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

/**
 * Whether this spec still needs rendering.
 *
 * A spec with no `askedAt` is from before 2026-10-05 and keeps the old rule
 * (no PDF = needs one), so no finished week is ever rendered again.
 */
function needsRender(specPath) {
  const pdf = specPath.replace(/\.json$/, '.pdf');
  if (!fs.existsSync(pdf)) return true;
  const spec = readJson(specPath);
  if (!spec || !spec.askedAt) return false;
  const receipt = readJson(receiptPath(specPath));
  return !receipt || receipt.askedAt !== spec.askedAt;
}

/** The newest spec that needs a deck, or ''. */
function pick(dir) {
  const specs = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    : [];
  let chosen = '';
  specs.forEach((f) => {
    const p = path.join(dir, f);
    if (needsRender(p)) chosen = p;
  });
  return chosen;
}

function writeReceipt(specPath, sha) {
  if (!/^[0-9a-f]{40}$/.test(String(sha || ''))) throw new Error(`not a commit id: ${sha}`);
  const spec = readJson(specPath);
  if (!spec) throw new Error(`spec not readable: ${specPath}`);
  const receipt = { monday: spec.monday, askedAt: spec.askedAt || '', sha };
  fs.writeFileSync(receiptPath(specPath), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

module.exports = { needsRender, pick, writeReceipt, receiptPath };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'receipt') {
    const r = writeReceipt(a, b);
    console.log(`Receipt: ${r.monday} answers ${r.askedAt || '(no askedAt)'} at ${r.sha}`);
  } else {
    process.stdout.write(pick(path.join(process.cwd(), 'carousel')));
  }
}
