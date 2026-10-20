const api=window.workspacePlugin;
const context=await api.ready();document.querySelector('#project').textContent=context.project?.name || 'Global dice';
let history=await api.storage.get('rolls') || [];
function draw(){document.querySelector('#result').textContent=history.at(-1)?.value || '—';document.querySelector('#history').replaceChildren(...history.slice(-10).reverse().map(item=>{const li=document.createElement('li');li.textContent=`D20 · ${item.value} · ${new Date(item.at).toLocaleTimeString()}`;return li;}));}draw();
document.querySelector('#roll').onclick=async()=>{history=[...history,{value:crypto.getRandomValues(new Uint32Array(1))[0]%20+1,at:new Date().toISOString()}].slice(-100);await api.storage.set('rolls',history);draw();};
