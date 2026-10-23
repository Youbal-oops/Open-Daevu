const {test} = require('node:test');
const assert = require('node:assert/strict');

test('Files counts match visible items, including projects holding only inline pictures (#45)', async () => {
  const {fileInventory} = await import('../shared/file-list.mjs');
  const hidden = {id:'inline', inline:true, name:'Pasted.png'}, visible = {id:'upload', name:'Report.pdf'};
  for (const files of [[], [hidden], [hidden, hidden, hidden]]) {
    assert.deepEqual(fileInventory({notes:[], files}), {uploads:[], counts:{all:0,note:0,sheet:0,file:0}});
  }
  const result = fileInventory({notes:[{kind:'note'},{kind:'sheet'},{}],files:[hidden,visible]});
  assert.deepEqual(result.uploads,[visible]);
  assert.deepEqual(result.counts,{all:4,note:2,sheet:1,file:1});
});

test('large combinatorics are bounded and use the symmetric smaller argument (#42)', async t => {
  const {Worker} = require('node:worker_threads');
  const url = require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../shared/mathexpr.mjs')).href;
  const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads');import(workerData).then(({evaluate})=>parentPort.postMessage([evaluate('nCr(5,2)'),evaluate('nCr(1e12,999999999999)'),Number.isNaN(evaluate('nCr(1e12,5e11)')),Number.isNaN(evaluate('nCr(5.5,2)'))]));`,{eval:true,workerData:url});
  t.after(()=>worker.terminate());
  const values = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Combinatorics exceeded its work limit')),5000);worker.once('message',v=>{clearTimeout(timer);resolve(v);});worker.once('error',e=>{clearTimeout(timer);reject(e);});});
  assert.deepEqual(values,[10,1e12,true,true]);
});

test('polynomial fits remain accurate for years and large timestamps (#43)', async () => {
  const {polyFit} = await import('../bundled-plugins/chart-statistics/stats.mjs');
  for (const [offset,step] of [[2015,1],[1e12,1000]]) for (const degree of [2,3]) {
    const xs=Array.from({length:11},(_,i)=>offset+i*step), y=z=>4-2*z+3*z*z+(degree===3 ? .25*z*z*z : 0);
    const fit=polyFit(xs,xs.map(x=>y((x-offset)/step)),degree);
    for (const z of [0,2.5,5,10,12]) assert.ok(Math.abs(fit.fn(offset+z*step)-y(z))<1e-7);
    assert.ok(Math.abs(fit.r2-1)<1e-12);
  }
  assert.equal(polyFit([2015,2015,2015],[1,2,3],2),null);
});

test('large chart extrema accept arrays beyond the function argument limit (#41)', async () => {
  const {minimum,maximum}=await import('../shared/scale.mjs');
  const values=Array.from({length:200000},(_,i)=>i-100000);
  assert.equal(minimum(values),-100000);assert.equal(maximum(values),99999);
  assert.equal(minimum([2,3],0),0);assert.equal(maximum([-2,-3],0),0);
});

test('user Markdown retains ordinary hashes, inline code and Windows paths (#39)', async () => {
  const {markdownToBlocks,blocksToMarkdown}=await import('../shared/blocks.mjs');
  const {fixMarkdown}=await import('../shared/markdown-fix.mjs');
  const text=['#1 priority','#launch plan','`<br>`',String.raw`C:\new\notes.txt`].join('\n\n');
  const blocks=markdownToBlocks(text);
  assert.ok(blocks.every(b=>b.type==='p'));
  assert.equal(blocksToMarkdown(blocks),text);
  assert.equal(fixMarkdown('Keep \`<br>\` and \`#code\`'),'Keep \`<br>\` and \`#code\`');
});

test('app bridge and shared canvas context resolve cross-workbook formulas (#30)', async () => {
  const {bridgeRead}=await import('../src/bridge.js');
  const {projectSheetContext}=await import('../shared/workbook.mjs');
  const {calculateSheet}=await import('../shared/sheet.mjs');
  const {csvParse}=await import('../shared/domain.mjs');
  const budget={id:'budget',title:'Budget',kind:'sheet',sheetName:'Totals',content:'Amount\n42'};
  const report={id:'report',title:'Report',kind:'sheet',content:'Amount\n=[Budget]Totals!A2'};
  const project={notes:[budget,report],files:[],artifacts:[]};
  assert.equal(bridgeRead(project,'table',['report']).rows[0].values.Amount,42);
  assert.equal(calculateSheet(csvParse(report.content),projectSheetContext(report,project.notes,csvParse))[1][0],'42');
});

test('a reference on a secondary sheet resolves that sheet and retains its real document id (#28)', () => {
  const {applyMutation,resolveRef}=require('../shared/domain.mjs');
  const state=require('./fixture.cjs').makeFixture(),project=state.projects[0];
  project.notes.push({id:'book',kind:'sheet',title:'Book',content:'1',sheets:[{id:'tab-two',name:'Second',content:'42'}]});
  const next=applyMutation(state,{type:'ref',projectId:project.id,value:{id:'r_second',name:'second-value',target:{type:'cell',noteId:'book',sheetId:'tab-two',range:'A1'}}});
  assert.equal(resolveRef(next.projects[0],'r_second').value,'42');
});


test('sheet peers retain identity across unrelated app snapshots (#49)', async () => {
 const {stableSheetSources}=await import('../shared/workbook.mjs');
 const book={id:'book',title:'Budget',kind:'sheet',content:'1',sheets:[{id:'two',name:'Two',content:'2'}]};
 const first=stableSheetSources([book]);
 assert.equal(stableSheetSources([structuredClone(book),{id:'note',kind:'note',content:'Edited'}],first),first);
 const changed=structuredClone(book);changed.sheets[0].content='3';assert.notEqual(stableSheetSources([changed],first),first);
 const renamed={...book,title:'New title'};assert.notEqual(stableSheetSources([renamed],first),first);
});
