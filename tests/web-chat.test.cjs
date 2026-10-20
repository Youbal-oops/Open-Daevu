const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateWebMessage}=require('../electron/plugin-web.cjs');
const {sendInWebContents}=require('../electron/web-chat-send.cjs');

test('a completed provider reports its result while another is still pending',async()=>{
 const {sendWebChats}=await import('../shared/web-chat.mjs');
 const targets=['gemini','chatgpt'].map(id=>({id,name:id,panels:[{id:'main',type:'web-chat'}]}));
 let finish;const pending=new Promise(resolve=>{finish=resolve;}),progress=[];
 const all=sendWebChats(targets,['gemini','chatgpt'],id=>id==='gemini'?pending:Promise.resolve({sent:true}),{text:'hello'},r=>progress.push(r));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(progress.map(r=>r.id),['chatgpt']);
 finish({sent:false,message:'Gemini not ready'});await all;assert.deepEqual(progress.map(r=>r.id),['chatgpt','gemini']);
});

test('a stalled renderer has a host timeout, restores throttling and cannot submit after expiry',async()=>{
 let finish,calls=[],throttled=true;
 const pending=new Promise(resolve=>{finish=resolve;});
 const wc={getBackgroundThrottling:()=>throttled,setBackgroundThrottling:value=>{throttled=value;},isDestroyed:()=>false,focus(){calls.push('focus');},insertText(){calls.push('insert');},executeJavaScript(script){calls.push(script.includes('removeAttribute')?'cleanup':'script');return script.includes('setAttribute')?pending:Promise.resolve(true);}};
 const result=await sendInWebContents(wc,{text:'hello',attachments:[]},'gemini',{timeout:20});
 assert.equal(result.sent,false);assert.match(result.message,/timed out/);assert.equal(throttled,true);assert.ok(calls.includes('cleanup'));
 finish(true);await new Promise(resolve=>setImmediate(resolve));assert.ok(!calls.includes('insert'));assert.ok(!calls.includes('focus'));
});

test('shared web chat sends independently to every selection and retains provider errors',async()=>{
 const {sendWebChats}=await import('../shared/web-chat.mjs');
 const targets=['gemini','chatgpt'].map(id=>({id,name:id,panels:[{id:'main',type:'web-chat'}]})),calls=[];
 const payload={text:'hello',attachments:[{name:'example.txt',type:'text/plain',base64:'aGVsbG8='}]};
 const result=await sendWebChats(targets,['gemini','chatgpt'],async(id,panel,value)=>{calls.push({id,panel,value});if(id==='chatgpt')throw Error('Sign in first');return {sent:true};},payload);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.value===payload));assert.equal(result[0].sent,true);assert.equal(result[1].message,'Sign in first');
 const retry=[];await sendWebChats(targets,result.filter(r=>!r.sent).map(r=>r.id),async id=>{retry.push(id);return {sent:true};},payload);assert.deepEqual(retry,['chatgpt']);
});
test('Enter sends, Shift+Enter inserts a line and IME composition does not submit',async()=>{
 const {sendsOnEnter}=await import('../shared/web-chat.mjs');
 assert.equal(sendsOnEnter({key:'Enter'}),true);assert.equal(sendsOnEnter({key:'Enter',ctrlKey:true}),true);
 for(const event of [{key:'Enter',shiftKey:true},{key:'Enter',nativeEvent:{isComposing:true}},{key:'Enter',keyCode:229},{key:'x'}])assert.equal(sendsOnEnter(event),false);
});

test('recipient shortcuts accept Ctrl+1/2 from DOM and native views without repeats or modified typing',async()=>{
 const {webRecipientShortcut}=await import('../shared/web-chat.mjs');
 assert.equal(webRecipientShortcut({key:'1',ctrlKey:true,type:'keydown'}),0);
 assert.equal(webRecipientShortcut({key:'2',control:true,type:'keyDown'}),1);
 for(const event of [{key:'1'},{key:'2',ctrlKey:true,shiftKey:true},{key:'1',control:true,alt:true},{key:'1',ctrlKey:true,metaKey:true},{key:'1',ctrlKey:true,repeat:true},{key:'2',control:true,isAutoRepeat:true},{key:'1',ctrlKey:true,isComposing:true},{key:'1',control:true,type:'keyUp'},{key:'3',ctrlKey:true},{key:'1',ctrlKey:true,defaultPrevented:true}])assert.equal(webRecipientShortcut(event),null);
});

test('queued sends wait for readiness, send once, and never send after cancellation or a stalled readiness check',async()=>{
 const {sendWhenWebChatReady}=await import('../shared/web-chat.mjs');let reads=0,sends=0,waits=0;
 await sendWhenWebChatReady(async()=>({busy:++reads<3}),async()=>{sends++;},{poll:1,onWait:()=>waits++});assert.equal(sends,1);assert.equal(waits,2);
 const controller=new AbortController();await assert.rejects(sendWhenWebChatReady(async()=>({busy:true}),async()=>{sends++;},{signal:controller.signal,poll:1,onWait:()=>controller.abort()}),/cancelled/);assert.equal(sends,1);
 await assert.rejects(sendWhenWebChatReady(()=>new Promise(()=>{}),async()=>{sends++;},{timeout:10}),/too long/);assert.equal(sends,1);
});
test('web upload payloads reject paths, corrupt bytes and excessive files before website access',()=>{
 assert.deepEqual(validateWebMessage('hello'),{text:'hello',attachments:[]});
 const file={name:'example.txt',type:'text/plain',base64:Buffer.from('hello').toString('base64')};
 assert.deepEqual(validateWebMessage({text:'hello',attachments:[file]}).attachments,[file]);
 assert.equal(validateWebMessage({text:'',attachments:[file]}).attachments.length,1);
 for(const attachment of [{...file,name:'../private'},{...file,name:'C:\\private'},{...file,base64:'not base64'}, {...file,base64:'a'}])assert.throws(()=>validateWebMessage({text:'hello',attachments:[attachment]}),/attachment/);
 assert.throws(()=>validateWebMessage({text:'hi',attachments:Array(9).fill(file)}),/eight/);
 assert.throws(()=>validateWebMessage({text:'hi',attachments:[{...file,base64:Buffer.alloc(21*1024*1024).toString('base64')}]}),/20 MB/);
});
