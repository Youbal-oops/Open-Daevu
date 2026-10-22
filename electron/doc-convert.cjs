// Turns Word files into Markdown, so an uploaded .docx or .doc opens as a Daevu document.
const fs = require('node:fs');
const mammoth = require('mammoth');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const WordExtractor = require('word-extractor');

const WORD = /\.(docx|docm|dotx|dotm|doc)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
turndown.use(gfm);
turndown.addRule('noImages', { filter: 'img', replacement: () => '' });

async function wordToMarkdown(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('Convert Word files under 50 MB.');
  if (/\.doc$/i.test(file)) {
    const body = (await new WordExtractor().extract(file)).getBody();
    return body.replace(/\r\n?/g, '\n').split(/\n+/).map(line => line.trim()).filter(Boolean).join('\n\n');
  }
  const { value } = await mammoth.convertToHtml({ path: file }, { convertImage: mammoth.images.imgElement(() => ({ src: '' })) });
  return turndown.turndown(value).replace(/\n{3,}/g, '\n\n').trim();
}
module.exports = { wordToMarkdown, WORD };
