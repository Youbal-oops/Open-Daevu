export function conversationURL(provider,url,service){
 try{
  const current=new URL(url),base=new URL(service.url);
  if(current.origin!==service.origin)return null;
  const route={chatgpt:/^\/(?:g\/[a-zA-Z0-9_-]+\/)?c\/[a-zA-Z0-9-]+\/?$/,gemini:/^\/app\/[a-zA-Z0-9_-]+\/?$/,claude:/^\/chat\/[a-zA-Z0-9-]+\/?$/}[provider];
  if(current.pathname.replace(/\/+$/,'')!==base.pathname.replace(/\/+$/,'')&&!route?.test(current.pathname))return null;
  return current.origin+current.pathname;
 }catch{return null;}
}
