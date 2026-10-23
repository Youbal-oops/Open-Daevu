// Youbal said to fix: cover broken links, fragments, path case and fenced examples.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {checkDocs,anchors} = require('../scripts/check-docs.cjs');

test('documentation checks accept real targets and reject broken paths, headings and path case', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'daevu-docs-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  await fs.writeFile(path.join(root,'Guide.md'),'# Setup\n\n## Same\n## Same\n');
  await fs.writeFile(path.join(root,'README.md'),'[Guide](Guide.md#setup)\n<img src="image.svg">\n[Same](Guide.md#same-1)\n~~~md\n[Example](absent.md)\n~~~\n`[inline](missing.md)`\n');
  await fs.writeFile(path.join(root,'image.svg'),'<svg/>');
  assert.deepEqual(checkDocs(root,['README.md']).errors,[]);
  await fs.appendFile(path.join(root,'README.md'),'\n[Bad](Guide.md#missing)\n[Missing](absent.md)\n[Case](guide.md)\n[Escape](../private.md)\n');
  const result=checkDocs(root,['README.md']);
  assert.equal(result.errors.length,4);
  assert.ok(result.errors.some(e=>e.includes('missing heading fragment')));
  assert.ok(result.errors.some(e=>e.includes('outside repository')));
});
test('duplicate headings and explicit HTML anchors remain addressable', () => {
  assert.deepEqual([...anchors('# One\n# One\n<a id="custom"></a>')],['one','one-1','custom']);
});
