const {randomUUID}=require('node:crypto');
async function askBrowserAssistant({plugins,store,runner,browser,chatImages,assertWritable},id,projectId,tabId,agentId,text,options={}){
 await assertWritable();options=options||{};const record=plugins.enabled(id);if(!record.manifest.browserExtension)throw Error('Enable a browser assistant plugin.');plugins.permit(record,'agents:run');const project=plugins.project(projectId);
 if(!project.agentIds.includes(agentId))throw Error('Choose an assistant assigned to this project.');
 if(typeof text!=='string'||!text.trim()||text.length>7000)throw Error('Enter a browser question under 7,000 characters.');
 if(runner.lanes.has(`${projectId}:${agentId}`))throw Error('This assistant is already working. Wait or choose another profile.');
 let context,refs=[];
 if(options.sharePage!==false){plugins.permit(record,'browser:read');context=await browser.assistantCapture(projectId,tabId,options.screenshot!==false);if(context.screenshot){plugins.permit(record,'files:write');refs=await chatImages.add(projectId,[{name:'Browser viewport.jpg',dataUrl:context.screenshot}]);delete context.screenshot;}}
 let chatId=options.chatId;if(!chatId){chatId=randomUUID();await store.mutate({type:'chat:create',projectId,value:{id:chatId,agentId,title:'Browser assistant'}});}
 const result=await runner.start(projectId,agentId,text,{chatId,refs,browserContext:context});return {...result,chatId};
}
module.exports={askBrowserAssistant};
