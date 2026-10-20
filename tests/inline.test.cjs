const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inlineToHtml, inlineToPlain, treeToInline, escapeInline } = require('../shared/inline.mjs');

const text = v => ({ t: 'text', v });
const el = (tag, kids, extra = {}) => ({ t: 'el', tag, kids, ...extra });

test('stored text is shown as formatting, never as markers', () => {
  assert.equal(inlineToHtml('a **bold** and *italic* and ++under++ and ~~gone~~ and `code`'), 'a <b>bold</b> and <i>italic</i> and <u>under</u> and <s>gone</s> and <code>code</code>');
  assert.equal(inlineToHtml('**_both_**'), '<b><i>both</i></b>');
  assert.equal(inlineToHtml('see [the docs](https://example.org/a)'), 'see <a href="https://example.org/a">the docs</a>');
  assert.equal(inlineToHtml('2 * 3 * 4 and snake_case_name'), '2 * 3 * 4 and snake_case_name', 'spaces and words with underscores are left alone');
  assert.equal(inlineToHtml('<script>alert(1)</script> & "quotes"'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;', 'nothing typed can become markup');
  assert.equal(inlineToHtml('a \\*star\\* here'), 'a *star* here', 'an escaped marker is plain text');
  assert.equal(inlineToPlain('a **bold** and [link](https://x.org) \\*'), 'a bold and link *');
});

test('what the editor drew becomes stored text, keeping spaces outside the markers', () => {
  assert.equal(treeToInline([text('hi '), el('b', [text('there')]), text('!')]), 'hi **there**!');
  assert.equal(treeToInline([el('b', [text(' padded ')])]), ' **padded** ');
  assert.equal(treeToInline([el('i', [text('soft')])]), '*soft*');
  assert.equal(treeToInline([el('b', [el('i', [text('both')])])]), '**_both_**');
  assert.equal(treeToInline([el('i', [el('b', [text('both')])])]), '_**both**_');
  assert.equal(treeToInline([el('span', [text('x')], { style: 'font-weight: 700; font-style: italic' })]), '_**x**_'.replace('_**x**_', '**_x_**'));
  assert.equal(treeToInline([el('u', [text('u')]), text(' '), el('strike', [text('s')]), text(' '), el('code', [text('c')])]), '++u++ ~~s~~ `c`');
  assert.equal(treeToInline([el('a', [text('docs')], { href: 'https://example.org' })]), '[docs](https://example.org)');
  assert.equal(treeToInline([text('a * b [c] `d`')]), 'a \\* b \\[c\\] \\`d\\`', 'typed characters that look like markers are protected');
  assert.equal(treeToInline([el('javascript', [text('x')]), el('a', [text('bad')], { href: 'javascript:alert(1)' })]), 'xbad', 'unsafe links are dropped');
});

test('formatting survives the round trip, including characters that look like markers', () => {
  for (const sample of ['plain', '**bold** text', 'a *b* c', '**_both_** and ~~strike~~', 'price: 2 * 3 [done]', 'C++ is fun', 'line one\nline two']) {
    const html = inlineToHtml(sample);
    // Read the HTML back with a tiny parser: enough for the tags this module itself produces.
    const stack = [{ kids: [] }], re = /<(\/?)(b|i|u|s|code|a)(?: href="([^"]*)")?>|([^<]+)/g;
    for (const m of html.matchAll(re)) {
      if (m[4] !== undefined) stack.at(-1).kids.push(text(m[4].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
      else if (!m[1]) { const node = el(m[2], [], m[3] ? { href: m[3] } : {}); stack.at(-1).kids.push(node); stack.push(node); }
      else stack.pop();
    }
    assert.equal(inlineToPlain(treeToInline(stack[0].kids)), inlineToPlain(sample), 'same words after the round trip: ' + sample);
    assert.equal(inlineToHtml(treeToInline(stack[0].kids)), html, 'same formatting after the round trip: ' + sample);
  }
  assert.equal(escapeInline('a*b'), 'a\\*b');
});
