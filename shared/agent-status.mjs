// Status is evidence from a failed provider request, never from assistant prose.
export const agentBinding = agent => JSON.stringify([agent.provider,agent.connectionId || '',agent.model || '',agent.command || '',agent.args || '']);
export function agentOffline(state,agent,now=Date.now()) {
 const value=state.agentAvailability?.[agent?.id];
 return value && value.binding===agentBinding(agent) && (!value.retryAt || Date.parse(value.retryAt)>now) ? value : null;
}
export function usageLimit(error,now=Date.now()) {
 const message=String(error.message || error),code=String(error.code || '');
 if(!(error.status===429 || /(?:weekly|usage|rate)[ _-]?limit|quota.*(?:exceed|exhaust)|insufficient_quota|resource_exhausted|too many requests|you(?:'ve| have) hit your (?:\w+ )?limit|you(?:'re| are) out of (?:extra )?usage/i.test(message+' '+code)))return null;
 let retryAt=error.retryAt && Number.isFinite(Date.parse(error.retryAt)) ? new Date(error.retryAt).toISOString() : null;
 const resetLabel=message.match(/resets?\s+(.+?)(?:\n|$)/i)?.[1]?.slice(0,160) || '';
 // Claude reports an explicit IANA timezone. Resolve that wall time with Intl,
 // including DST, instead of assuming the device uses the same timezone.
 const match=resetLabel.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i);
 if(!retryAt && match)try{
  const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].toLowerCase()),day=+match[2],hour=+match[3]%12+(match[5].toLowerCase()==='pm'?12:0),minute=+(match[4] || 0),zone=match[6];
  if(month>=0 && day>=1 && day<=31 && +match[3]>=1 && +match[3]<=12 && minute<60){
   const parts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));
   const year=+parts(now).year;
   for(const y of [year,year+1]){const target=Date.UTC(y,month,day,hour,minute);let candidate=target;for(let i=0;i<3;i++){const p=parts(candidate);candidate+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}if(candidate>now){retryAt=new Date(candidate).toISOString();break;}}
  }
 }catch{}
 return {reason:message.slice(0,700),resetLabel,retryAt,detectedAt:new Date(now).toISOString()};
}
export function cliFailure(code,stdout,stderr) {
 let result;
 try{result=JSON.parse(stdout);}catch{for(const line of stdout.trim().split('\n').reverse())try{const v=JSON.parse(line);if(v.type==='result' || v.is_error){result=v;break;}}catch{}}
 if(result && (result.is_error || result.terminal_reason==='api_error')){
  const error=new Error(typeof result.result==='string'?result.result:result.errors?.join('\n') || 'The provider could not complete this request.');
  error.status=Number(result.api_error_status) || undefined;return error;
 }
 return new Error(`CLI exited with code ${code}. ${stderr.slice(-2500) || stdout.slice(-1500) || 'Check CLI authentication and permissions.'}`);
}
