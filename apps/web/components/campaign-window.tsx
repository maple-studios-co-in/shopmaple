"use client";
import {type ReactNode} from "react";
import {isCampaignActive,type CampaignSchedule} from "@shopmaple/contracts";
import {useCampaignClock} from "./campaign-clock";

/** Server clock owns initial markup; open pages recheck at boundaries and resume. */
export function CampaignWindow({children,schedule,serverNow}:{children:ReactNode;schedule:CampaignSchedule;serverNow:number}) {
 const now=useCampaignClock([schedule.startsAt,schedule.endsAt],serverNow);
 return isCampaignActive(schedule,now)?children:null;
}
