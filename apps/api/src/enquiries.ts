import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { enquiryInputSchema, type EnquiryReceipt } from "@shopmaple/contracts";
import { z } from "zod";
import type { EnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { isKeeriLeadKind, type KeeriLeadsConfig } from "./keeri-leads.js";
import { HttpError } from "./cart.js";
import { ensureContact } from "./contacts.js";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function saveEnquiry(db:PrismaClient,raw:unknown,key:unknown,config:EnquiryDeliveryConfig|null=null,keeri:KeeriLeadsConfig|null=null):Promise<{created:boolean;receipt:EnquiryReceipt}>{
 const idempotencyHash=hash(z.uuid().parse(key));
 const input=enquiryInputSchema.parse(raw);
 const payloadHash=hash(JSON.stringify(input));
 const receipt=(reference:string):EnquiryReceipt=>({reference,mode:"preview",notificationSent:false});
 // One address is one newsletter signup, however often it is entered. The reply is the same either way, with a reference
 // that names no row, so the form cannot be used to learn who has signed up.
 if(input.kind==="newsletter"&&await db.enquiry.findFirst({where:{kind:"newsletter",email:input.email},select:{id:true}}))
  return {created:true,receipt:receipt("enq_"+randomUUID())};
 try {
  const saved=await db.$transaction(async tx => {
   const contactId=await ensureContact(tx,input);
   const enquiry=await tx.enquiry.create({data:{id:"enq_"+randomUUID(),idempotencyHash,payloadHash,...input,contactId}});
   // A signup is a list entry rather than a person waiting for an answer: it does not email the team.
   if(config&&input.kind!=="newsletter") await tx.enquiryDelivery.create({data:{enquiryId:enquiry.id,configurationHash:config.fingerprint,nextAttemptAt:new Date()}});
   // A person waiting for an answer also becomes a Keeri lead; the local row stays as the fallback.
   if(keeri&&isKeeriLeadKind(input.kind)) await tx.enquiryDelivery.create({data:{enquiryId:enquiry.id,target:"keeri",configurationHash:keeri.fingerprint,nextAttemptAt:new Date()}});
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
