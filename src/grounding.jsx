import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { api } from './api';
// Provider search attribution is isolated from application styling and never executes scripts.
export default function GroundingWidget({ html }) {
  const host=useRef(null);
  useEffect(()=>{
    const shadow=host.current.shadowRoot || host.current.attachShadow({mode:'open'});
    shadow.innerHTML=DOMPurify.sanitize(html,{ADD_TAGS:['style'],FORBID_TAGS:['script','iframe','object','embed','form','input','button','link','meta','base'],FORBID_ATTR:['srcdoc'],ALLOW_DATA_ATTR:false});
    // No shadow selector may style the application host. The provider's normal widget CSS stays inside this tree.
    for(const style of shadow.querySelectorAll('style'))if(/:host|@import|::part|::slotted/i.test(style.textContent))style.remove();
    const click=e=>{const link=e.composedPath().find(node=>node instanceof HTMLAnchorElement);if(!link)return;e.preventDefault();if(/^https?:\/\//i.test(link.href))api.openURL(link.href);};
    shadow.addEventListener('click',click);return()=>{shadow.removeEventListener('click',click);shadow.innerHTML='';};
  },[html]);
  return <div ref={host} className="grounding-widget" aria-label="Google Search suggestions" style={{contain:'content',isolation:'isolate',overflow:'hidden',position:'relative',maxHeight:300,marginTop:15}}/>;
}
