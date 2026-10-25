"use client";
import {useEffect,useState,type ReactNode} from "react";
import {isCampaignActive,type CampaignSchedule} from "@shopmaple/contracts";

/** Server clock owns initial markup; open pages recheck at boundaries and resume. */
export function CampaignWindow({children,schedule,serverNow}:{children:ReactNode;schedule:CampaignSchedule;serverNow:number}) {
 const [now,setNow]=useState(serverNow);
 useEffect(()=>{
  let timer:number|undefined;
  function refresh(){
   if(timer!==undefined) window.clearTimeout(timer);
   const current=Date.now();
   setNow(current);
   const next=[schedule.startsAt,schedule.endsAt].filter((value):value is string=>value!==null).map(Date.parse).filter(value=>value>current).sort((a,b)=>a-b)[0];
   if(next!==undefined) timer=window.setTimeout(refresh,Math.min(next-current,2_147_483_647));
  }
  function onVisibility(){if(!document.hidden) refresh();}
  refresh();
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',onVisibility);
  return ()=>{
   if(timer!==undefined) window.clearTimeout(timer);
   window.removeEventListener('focus',refresh);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[schedule.startsAt,schedule.endsAt,serverNow]);
 return isCampaignActive(schedule,now)?children:null;
}
