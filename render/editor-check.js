/**
 * Our own editor looking at the picture before it goes on a slide.
 *
 * BUILT 2026-09-27 AND SWITCHED OFF, on Stefan's instruction: "build our
 * editor now, but SWITCH it off, but make sure it is easy to switch on and
 * off again". It is one word in picture-rules.json plus one repository
 * secret, and it can go back off the same way.
 *
 * Why it exists at all: the research that produced the subject-picture rung
 * also found that re-ranking retrieved images with a multimodal model is
 * where the remaining accuracy lives. The subject rung is 85-95% right, and
 * this is aimed at the other 5-15%.
 *
 * TWO RULES IT IS BUILT AROUND.
 *
 * It may only ever REJECT. It never chooses, never ranks, never suggests an
 * alternative. The ladder below it always has an answer, so the cheapest
 * correct behaviour for any doubt is "no".
 *
 * It can never cost a Monday. No key, a refusal, a timeout, a malformed
 * answer: every one of those returns null. Since 2026-09-27 the caller reads
 * null as "leave the picture out" (the number graphic takes its place),
 * because an unchecked picture was wrong about one time in four.
 */

const UA = 'GoodNewsDaily/1.0 (+https://www.linkedin.com/company/109379035)';

async function editorApproves(pic, slide, cfg, log) {
  const say = log || (() => {});
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    say('    editor check is on but no ANTHROPIC_API_KEY is set; skipping it');
    return null;
  }
  if (!pic || !pic.imageUrl) return null;

  // The picture goes to the model as bytes. A URL would make the model's
  // answer depend on whether it could fetch it, which is a second failure
  // mode for no benefit.
  const img = await fetch(pic.imageUrl, { headers: { 'User-Agent': UA } });
  if (!img.ok) return null;
  const media = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!/^image\/(jpeg|png|gif|webp)$/.test(media)) return null;
  const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');

  const question =
    'You are the picture editor of a daily good-news page whose whole promise is ' +
    'that every story is checked. Below is a story and a picture we are about to ' +
    'put beside it.\n\n' +
    'STORY: ' + slide.summary + '\n' +
    (slide.proves ? 'WHAT IT PROVES: ' + slide.proves + '\n' : '') +
    (pic.subject ? 'THE PICTURE IS FILED AS: ' + pic.subject + '\n' : '') +
    '\nAnswer ONLY with JSON: {"ok": true|false, "why": "<at most 12 words>"}.\n\n' +
    'Say false unless the picture plainly shows the subject the story is about. ' +
    'THE SUBJECT, NOT THE MOMENT: a photograph of the named species, place, ' +
    'building, vehicle or person is a YES even when the story is about one ' +
    'particular animal, a young one, or a moment the picture does not show. ' +
    'A different place, a different species, a different object, a different ' +
    'person, or something that merely shares the name is a NO. ' +
    'A picture that is merely on the same theme is a NO. Rejecting costs us ' +
    'nothing: the slide falls back to a number graphic, which is always correct. ' +
    'The picture does not have to be of the event itself, and it may be a ' +
    'drawing or an old photograph, as long as it shows the thing the story names.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: cfg.model || 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
          { type: 'text', text: question }
        ]
      }]
    })
  });
  if (!res.ok) {
    say(`    editor check: the model answered HTTP ${res.status}`);
    return null;
  }
  const body = await res.json();
  const text = ((body.content || []).find((c) => c.type === 'text') || {}).text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    if (typeof v.ok !== 'boolean') return null;
    return { ok: v.ok, why: String(v.why || '').slice(0, 80) };
  } catch (e) {
    return null;
  }
}

module.exports = { editorApproves };
