const {DatabaseSync,constants}=require('node:sqlite');
function singleStatement(sql){
 let quote='',ended=false;
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1];
  if(quote){if(c===quote){if(next===quote)i++;else quote='';}continue;}
  if(c==='-'&&next==='-'){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
  if(c==='/'&&next==='*'){i+=2;while(i<sql.length&&!(sql[i]==='*'&&sql[i+1]==='/'))i++;i++;continue;}
  if(ended&&!/\s/.test(c))throw Error('Run one SQL statement at a time.');
  if(c===';' ){ended=true;continue;}if(c==='\''||c==='"'||c==='`')quote=c;else if(c==='[')quote=']';
 }
}
function query({file,sql,params}){
 singleStatement(sql);
 const db=new DatabaseSync(file,{readOnly:true,allowExtension:false,timeout:500,limits:{length:2000000,sqlLength:20000,column:100,exprDepth:50,compoundSelect:20,vdbeOp:20000,functionArg:30,attach:0,likePatternLength:1000,variableNumber:100}});
 try{
  db.exec('PRAGMA query_only=ON');
  db.setAuthorizer((action,first,second)=>{
   if(action===constants.SQLITE_SELECT || action===constants.SQLITE_RECURSIVE)return constants.SQLITE_OK;
   if(action===constants.SQLITE_READ)return first==='_rw_schema'?constants.SQLITE_DENY:constants.SQLITE_OK;
   if(action===constants.SQLITE_FUNCTION)return ['load_extension','readfile','writefile'].includes(String(second).toLowerCase())?constants.SQLITE_DENY:constants.SQLITE_OK;
   return constants.SQLITE_DENY;
  });
  const statement=db.prepare(sql);statement.setReadBigInts(true);const columns=statement.columns().map(c=>c.name);if(!columns.length)throw Error('Use a read-only SELECT query.');statement.setReturnArrays(true);
  const rows=[];let bytes=0,truncated=false;for(const row of statement.iterate(...params)){
   const safe=row.map(v=>typeof v==='bigint'?(v<=Number.MAX_SAFE_INTEGER&&v>=Number.MIN_SAFE_INTEGER?Number(v):v.toString()):v instanceof Uint8Array?'[binary]':v);bytes+=JSON.stringify(safe).length;
   if(rows.length>=1000||bytes>2000000){truncated=true;break;}rows.push(safe);
  }return {columns,rows,truncated};
 }finally{db.close();}
}
const respond=message=>{try{const value={ok:true,value:query(message)};if(process.parentPort)process.parentPort.postMessage(value);else process.send(value);}catch(e){const value={ok:false,error:e.message};if(process.parentPort)process.parentPort.postMessage(value);else process.send(value);}};
if(process.parentPort)process.parentPort.on('message',event=>respond(event.data));else process.on('message',respond);
