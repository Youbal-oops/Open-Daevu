import React, {useEffect,useState} from 'react';
import {api} from './api';
import './database-sql.css';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
export function DatabaseSql({projectId,artifact,beforeRun,onChange}){
 const [schema,setSchema]=useState(null),[sql,setSql]=useState(''),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;api.databaseSchema(projectId).then(next=>{if(!active)return;setSchema(next);const t=next.tables.find(t=>t.id===artifact.id);if(t)setSql(s=>s || `SELECT * FROM ${quote(t.sqlName)} LIMIT 100;`);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectId,artifact.id,artifact.title]);
 async function run(exporting=false){setBusy(true);setError('');try{await beforeRun();if(exporting)await api.databaseExport(projectId);else{setResult(await api.databaseQuery(projectId,sql));setSchema(await api.databaseSchema(projectId));}}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="database-sql" aria-label="SQLite database"><header><div><strong>SQLite</strong><span>Project database</span></div><button className="button secondary small-button" disabled={busy} onClick={()=>run(true)}>Export .sqlite</button></header>
  <p className="field-help">Query saved tables in this project. Use SELECT, joins, filters, and aggregates. Edit rows in the Table editor or through the app database API.</p>
  <details><summary>Tables & columns</summary>{schema?.tables.map(t=><div className="db-sql-schema" key={t.id}><code>{quote(t.sqlName)}</code><small>_id · {t.columns.map(c=>`${c.sqlName} (${c.type})`).join(' · ')}</small></div>)}</details>
  <textarea spellCheck={false} aria-label="SQL query" value={sql} onChange={e=>setSql(e.target.value)}/><div className="db-sql-run"><button className="button primary small-button" disabled={busy||!sql.trim()} onClick={()=>run()}>{busy?'Working…':'Run query'}</button><small>Read only · 1,000 result rows · 4-second limit</small></div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {result&&<><div className="db-sql-result"><table><thead><tr>{result.columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{result.rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v===null?<em>NULL</em>:String(v)}</td>)}</tr>)}</tbody></table></div><small>{result.rows.length} rows{result.truncated?' · Result capped; add a filter or LIMIT.':''}</small></>}
  <label className="db-app-access"><input type="checkbox" checked={artifact.data.allowAppWrites!==false} onChange={e=>onChange({...artifact.data,allowAppWrites:e.target.checked})}/>Allow apps in this project to edit rows</label><p className="field-help">Apps connect to this project automatically. This setting can disable app row edits for this table. Project agents can manage its schema and records.</p>
 </section>;
}
