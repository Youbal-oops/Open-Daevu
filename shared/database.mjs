// Apply only edits made in a database editor; preserve newer records written by an app.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function mergeDatabaseDraft(before,after,current){
 if(equal(before,after))return current;
 if(object(before)&&object(after)&&object(current)){
  return Object.fromEntries([...new Set([...Object.keys(current),...Object.keys(after)])].filter(k=>!(Object.hasOwn(before,k)&&!Object.hasOwn(after,k))).map(k=>[k,Object.hasOwn(after,k)?Object.hasOwn(before,k)?mergeDatabaseDraft(before[k],after[k],current[k]):after[k]:current[k]]));
 }
 if(Array.isArray(before)&&Array.isArray(after)&&Array.isArray(current)&&[...before,...after,...current].every(v=>object(v)&&typeof v.id==='string')){
  const old=new Map(before.map(v=>[v.id,v])),next=new Map(after.map(v=>[v.id,v])),live=new Map(current.map(v=>[v.id,v]));
  for(const id of old.keys())if(!next.has(id))live.delete(id);
  for(const [id,value]of next)if(!old.has(id)||live.has(id))live.set(id,old.has(id)?mergeDatabaseDraft(old.get(id),value,live.get(id)):value);
  const order=[...new Set([...after.map(v=>v.id),...live.keys()])];return order.filter(id=>live.has(id)).map(id=>live.get(id));
 }
 return after;
}
