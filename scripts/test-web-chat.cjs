const {spawnSync}=require('node:child_process');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[require('node:path').resolve(__dirname,'../tests/fixtures/web-chat-electron.cjs')],{stdio:'inherit',env,timeout:120000});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
