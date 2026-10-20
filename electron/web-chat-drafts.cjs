const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {replaceFile}=require('./fs-utils.cjs');
function normalizeDraft(value){
 if(!value||typeof value.text!=='string'||value.text.length>30000||!Array.isArray(value.attachments)||!Array.isArray(value.selected)||value.selected.length>12||value.selected.some(id=>typeof id!=='string'||id.length>100))throw Error('Invalid saved web-chat draft.');
 const attachments=value.attachments.length?require('./plugin-web.cjs').validateWebMessage({text:value.text,attachments:value.attachments}).attachments:[];
 return {text:value.text,attachments,selected:[...new Set(value.selected)],split:!!value.split,native:!!value.native,waitBusy:value.waitBusy!==false,ratio:Math.max(.25,Math.min(.75,Number(value.ratio)||.5))};
}
class WebChatDrafts{
 constructor(root){this.root=root;this.queue=Promise.resolve();}
 file(pluginId,panelId,projectId){return path.join(this.root,createHash('sha256').update(JSON.stringify([pluginId,panelId,projectId])).digest('hex')+'.json');}
 async read(...scope){await this.queue;const file=this.file(...scope);try{if((await fs.stat(file)).size>60000000)throw Error('Saved draft is too large.');return normalizeDraft(JSON.parse(await fs.readFile(file,'utf8')));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 write(pluginId,panelId,projectId,value){const draft=normalizeDraft(value),file=this.file(pluginId,panelId,projectId);const job=this.queue.then(async()=>{await fs.mkdir(this.root,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(draft),'utf8');await replaceFile(file+'.tmp',file);return true;});this.queue=job.catch(()=>{});return job;}
}
module.exports={WebChatDrafts,normalizeDraft};
