import React,{useRef,useState} from 'react';
import {PluginIcon} from './plugin-icon';
import {Network,Globe2,Puzzle,MessageSquare,AppWindow} from 'lucide-react';
import './canvas-shelf.css';

function usePull(surfaceRef,fraction,onChange,toggle){
 const gesture=useRef(null);
 const position=event=>{const rect=surfaceRef.current?.getBoundingClientRect();return rect?Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)):fraction;};
 return {
  onPointerDown:event=>{if(event.button!==0)return;event.preventDefault();gesture.current={x:event.clientX,y:event.clientY,fraction,dragged:!toggle};event.currentTarget.setPointerCapture(event.pointerId);},
  onPointerMove:event=>{const active=gesture.current;if(!active)return;const distance=toggle?event.clientX-active.x:event.clientY-active.y;if(Math.abs(distance)>8)active.dragged=true;if(active.dragged)onChange(toggle?(distance>0?1:0):position(event));},
  onPointerUp:event=>{const active=gesture.current;if(!active)return;gesture.current=null;event.currentTarget.releasePointerCapture(event.pointerId);if(toggle)onChange(active.dragged?(event.clientX-active.x>0?1:0):(active.fraction?0:1));else{const value=position(event);onChange(value<.16?0:value>.9?1:Math.max(.3,value));}},
  onPointerCancel:()=>{const active=gesture.current;gesture.current=null;if(active)onChange(active.fraction);},
  onClick:event=>{if(toggle&&event.detail===0)onChange(fraction?0:1);},
 };
}
export function CanvasShelfHandle({surfaceRef,fraction,onChange,disabled,kind='canvas',title,chat,iconName,shortcut}){
 const pull=usePull(surfaceRef,fraction,onChange,true),label=title||(kind==='canvas'?'canvas board':'browser'),Icon=kind==='apps'?AppWindow:chat?MessageSquare:kind==='canvas'?Network:kind==='browser'?Globe2:Puzzle;
 return <div className="canvas-shelf-handle" role="separator" tabIndex={disabled?-1:0} aria-label={fraction?`Close ${label}`:`Open ${label}`} title={(fraction?`Close ${label}`:`Open ${label}`)+(shortcut?` (${shortcut})`:'')} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction*100)} aria-controls={`workspace-${kind}-shelf`} aria-disabled={disabled||undefined} data-open={fraction>0} {...(disabled?{}:pull)} onKeyDown={event=>{if(disabled)return;if(['ArrowRight','ArrowLeft','Home','End','Enter',' '].includes(event.key)){event.preventDefault();onChange(event.key==='Home'?0:event.key==='End'?1:['Enter',' '].includes(event.key)?(fraction?0:1):(event.key==='ArrowRight'?1:0));}}}>{kind==='plugin'&&iconName?<PluginIcon name={iconName} size={18}/>:<Icon size={18} aria-hidden="true"/>}</div>;
}
export function CanvasShelf({surfaceRef,fraction,onChange,children,kind='canvas',title}){
 const base=usePull(surfaceRef,fraction,onChange,false),label=title||(kind==='canvas'?'canvas board':'browser'),[stretching,setStretching]=useState(false),origin=useRef(null);
 // While the edge is being dragged only the shape is drawn; the contents come back when you let go.
 const pull={...base,onPointerDown:e=>{origin.current={x:e.clientX,y:e.clientY};base.onPointerDown(e);},onPointerMove:e=>{const o=origin.current;if(o&&!stretching&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>6)setStretching(true);base.onPointerMove(e);},onPointerUp:e=>{origin.current=null;setStretching(false);base.onPointerUp(e);},onPointerCancel:()=>{origin.current=null;setStretching(false);base.onPointerCancel();}};
 return <section id={`workspace-${kind}-shelf`} className={`canvas-shelf ${kind}-shelf${stretching?' stretching':''}`} style={{height:Math.max(.16,fraction)*100+'%'}} aria-label={title||(kind==='canvas'?'Canvas board':'Browser workspace')}>
  {children}
  <div className="canvas-shelf-grip" role="separator" tabIndex={0} aria-label={`Resize ${label}`} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction*100)} {...pull} onKeyDown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();onChange(event.key==='Home'?0:event.key==='End'?1:Math.max(0,Math.min(1,fraction+(event.key==='ArrowDown'?0.1:-0.1))));}}}><span/></div>
 </section>;
}
