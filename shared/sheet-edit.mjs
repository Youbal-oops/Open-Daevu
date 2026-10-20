import {columnName,address} from './sheet.mjs';
export const SHEET_ROWS=10000,SHEET_COLUMNS=256;
export function bounds(a,b=a){return {top:Math.min(a[0],b[0]),bottom:Math.max(a[0],b[0]),left:Math.min(a[1],b[1]),right:Math.max(a[1],b[1])};}
export function clipboardText(rows,range){const out=[];for(let y=range.top;y<=range.bottom;y++){const row=[];for(let x=range.left;x<=range.right;x++){const value=String(rows[y]?.[x]??'');row.push(/["\t\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value);}out.push(row.join('\t'));}return out.join('\n');}
export function clipboardRows(text){
 if(text.length>5000000)throw Error('Paste up to 5 MB at a time.');
 const rows=[],row=[];let value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&(quoted||value==='')){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c==='\t'&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push([...row]);row.length=0;value='';}else value+=c;}
 if(quoted)throw Error('The pasted table has an unclosed quote.');
 if(value||row.length||!rows.length){row.push(value);rows.push(row);}
 return rows;
}
export function putCells(rows,top,left,block){
 if(top<0||left<0||top+block.length>SHEET_ROWS||block.some(row=>left+row.length>SHEET_COLUMNS))throw Error('Sheets support up to 10,000 rows and 256 columns.');
 const next=rows.map(row=>[...row]);for(let y=0;y<block.length;y++){while(next.length<=top+y)next.push([]);for(let x=0;x<block[y].length;x++){while(next[top+y].length<=left+x)next[top+y].push('');next[top+y][left+x]=String(block[y][x]??'');}}return next;
}
// Quoted formula strings are text, not references. Absolute row/column markers stay fixed.
export function shiftFormula(source,dy,dx){if(!source.startsWith('='))return source;return source.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(/(?<![A-Za-z0-9_])(\$?)([A-Z]+)(\$?)([1-9]\d*)(?![A-Za-z0-9_])/gi,(ref,c,col,r,row)=>{const [y,x]=address(col+row),ny=y+(r?0:dy),nx=x+(c?0:dx);return ny<0||nx<0||ny>=SHEET_ROWS||nx>=SHEET_COLUMNS?'#REF!':c+columnName(nx)+r+(ny+1);})).join('');}
export function fillDown(rows,range){const block=[];for(let y=range.top+1;y<=range.bottom;y++)block.push(Array.from({length:range.right-range.left+1},(_,offset)=>shiftFormula(String(rows[range.top]?.[range.left+offset]??''),y-range.top,0)));return putCells(rows,range.top+1,range.left,block);}
