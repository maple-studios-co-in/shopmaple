import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { enquiryInputSchema, type EnquiryReceipt } from "@shopmaple/contracts";
import { z } from "zod";
import type { EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { HttpError } from "./cart.js";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function saveEnquiry(db:PrismaClient,raw:unknown,key:unknown,config:EnquiryDeliveryConfig|null=null):Promise<{created:boolean;receipt:EnquiryReceipt}>{
 const idempotencyHash=hash(z.uuid().parse(key));
 const input=enquiryInputSchema.parse(raw);
 const payloadHash=hash(JSON.stringify(input));
 const receipt=(reference:string):EnquiryReceipt=>({reference,mode:"preview",notificationSent:false});
 try {
  const saved=await db.$transaction(async tx => {
   const enquiry=await tx.enquiry.create({data:{id:"enq_"+randomUUID(),idempotencyHash,payloadHash,...input}});
   if(config) await tx.enquiryDelivery.create({data:{enquiryId:enquiry.id,configurationHash:config.fingerprint,nextAttemptAt:new Date()}});
   return enquiry;
  });
  return {created:true,receipt:receipt(saved.id)};
 }catch(error){
  if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=="P2002")throw error;
  const previous=await db.enquiry.findUnique({where:{idempotencyHash}});
  if(!previous)throw error;
  if(previous.payloadHash!==payloadHash)throw new HttpError(409,"ENQUIRY_CONFLICT","This submission key was already used. Please edit the form and submit again.");
  return {created:false,receipt:receipt(previous.id)};
 }
}
