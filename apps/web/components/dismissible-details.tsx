"use client";
import {useEffect,useRef,type ReactNode} from 'react';
/** Popover only: ordinary FAQs and specification accordions keep their open state. */
export function DismissibleDetails({children,className}:{children:ReactNode;className?:string}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(event:Event)=>{const el=ref.current;if(el?.open&&event.target instanceof Node&&!el.contains(event.target))el.open=false;};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',escape)};
 },[]);
 return <details ref={ref} className={className}>{children}</details>;
}
