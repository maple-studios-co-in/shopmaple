import Image from "next/image";
import { Fragment } from "react";
import type { BulkPageContent } from "@shopmaple/contracts";
import { ArrowRight, Check } from "lucide-react";
import { HomeCities } from "../home-sections";
import { shopFile } from "@/lib/format";
import { BulkEnquiryForm, type EnquiryContext } from "./enquiry-form";

const stepImages = {
  meet: "1_c060f484-f1f4-4f8a-826e-228632252413.jpg",
  design: "2.jpg",
  deliver: "3.jpg",
};
const trustIcons = {
  price: "price-tag-svgrepo-com_1.svg",
  quality: "icon_maple.svg",
  materials: "Cover_Image_Maple_4.svg",
  custom: "Cover_Image_Maple_2.svg",
};
// Breakpoints match the page's original max-width 990 / 1100 / 749 px media queries.
const container = "mx-auto max-w-[1440px] px-10 max-[750px]:px-4";
const divider = "[border-top:1px_solid_#d8d5cd]";

/** Bulk Enquiry (/pages/bulk-enquiry): the current look, on utilities with the current-look tokens. */
export function BulkEnquiry({ context, content }: { context: EnquiryContext; content: BulkPageContent }) {
  const sections = {
    hero: (
      <section data-store data-service-section="hero" className="px-5 py-10 font-redhat max-[991px]:p-3.5">
        <div className="relative mx-auto flex min-h-[720px] max-w-[1800px] items-center overflow-hidden rounded-[24px] max-[991px]:min-h-[520px] max-[991px]:items-end">
          <div className="absolute inset-0 [&_img]:object-fill [&_img]:object-bottom max-[991px]:[&_img]:object-contain">
            <Image
              src={shopFile(
                "Living_Room_9ba370f6-00a3-4019-9900-b28fb6734ca6.png",
              )}
              alt="A contemporary living room with Maple furniture"
              fill
              sizes="100vw"
              priority
            />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#00000059,#00000014)] max-[991px]:bg-[linear-gradient(0deg,#0009,#00000014)]" />
          <div className="relative w-full px-[70px] py-8 max-[991px]:px-4 max-[991px]:pt-7 max-[991px]:pb-5">
            <div className="w-[460px] max-w-full rounded-[20px] bg-paper px-8 py-9 max-[991px]:w-full max-[991px]:bg-transparent max-[991px]:p-0">
              <p data-bulk-eyebrow className="mb-2 text-[18px] text-black max-[991px]:text-[16px] max-[991px]:text-brand">{content.eyebrow}</p>
              <h1 className="mb-3 font-serif text-[48px] leading-none font-semibold tracking-normal text-brand max-[991px]:text-[32px]">{content.heading}</h1>
              <p data-bulk-subtitle className="mb-6 text-[18px] text-[#1a1a1acc] max-[991px]:hidden">
                {content.subtitle}
              </p>
              <div className="mb-6 h-px w-[100px] bg-[#0000001a] max-[991px]:hidden" />
              <div className="max-[991px]:mt-[18px] max-[991px]:rounded-[20px] max-[991px]:bg-paper max-[991px]:p-5">
                <BulkEnquiryForm context={context} />
              </div>
            </div>
          </div>
        </div>
      </section>
    ),
    trust: (
      <section data-store data-service-section="trust" className={container + " py-4"}>
        <h2 className="text-center font-serif text-[32px] leading-[1.13] font-bold text-brand max-[750px]:text-[26px]">{content.trust.heading}</h2>
        <div data-bulk-proof className="grid grid-cols-5 gap-6 pt-12 text-center max-[750px]:grid-cols-1 max-[750px]:gap-y-7 max-[750px]:pt-8">
          <div className="flex flex-col items-center justify-between gap-4">
            <strong className="font-serif text-[64px] leading-[80px] font-medium text-brand">{content.trust.metricValue}</strong>
            <p className="text-[16px] max-[750px]:text-[14px]">{content.trust.metricLabel}</p>
          </div>
          {content.trust.items.map(item => (
            <div key={item.key} className="flex flex-col items-center justify-between gap-4">
              <Image src={shopFile(trustIcons[item.key])} alt="" width={80} height={80} className="h-[80px] w-[90px] object-contain" />
              <p className="text-[16px] max-[750px]:text-[14px]">{item.title}</p>
            </div>
          ))}
        </div>
      </section>
    ),
    process: (
      <section data-store data-service-section="process" className={container}>
        <header data-section-title className="mb-7 pt-6">
          <p className="mb-1 text-[12px] tracking-[0.08em] uppercase">{content.process.eyebrow}</p>
          <h2 className="font-serif text-[48px] leading-[1.13] font-bold text-brand italic max-[750px]:text-[36px]">{content.process.heading}</h2>
        </header>
        <div className="grid grid-cols-3 gap-6 max-[750px]:flex max-[750px]:snap-x max-[750px]:snap-mandatory max-[750px]:gap-4 max-[750px]:overflow-x-auto max-[750px]:pb-3">
          {content.process.steps.map((step, index) => (
            <article key={step.key} className="overflow-hidden rounded-[12px] bg-white max-[750px]:flex-[0_0_86%] max-[750px]:snap-start">
              <div data-process-image className="relative h-[300px] max-[750px]:h-[250px]">
                <Image
                  src={shopFile(stepImages[step.key])}
                  alt={step.title}
                  width={600}
                  height={400}
                  sizes="(max-width: 749px) 85vw, 33vw"
                  className="size-full object-contain"
                />
                <span className="absolute bottom-5 left-5 grid size-[52px] place-items-center rounded-full bg-white text-[20px] font-semibold text-brand">0{index + 1}</span>
              </div>
              <div data-process-text className="p-6 max-[750px]:p-5">
                <h3 className="font-serif text-[28px] leading-[1.13] font-medium text-[#111] max-[750px]:text-[25px]">{step.title}</h3>
                <p className="mt-3 text-[16px] text-[#555] max-[750px]:text-[15px]">{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
    business: (
      <section data-store data-service-section="business" className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-[60px] px-[60px] py-10 max-[1101px]:gap-8 max-[1101px]:px-10 max-[750px]:grid-cols-1 max-[750px]:gap-6 max-[750px]:px-5 max-[750px]:py-6">
        <div>
          <p className="mb-[22px] inline-block rounded-[100px] bg-white px-3.5 py-2 text-[12px] font-bold tracking-[0.08em] text-brand">{content.business.badge}</p>
          <h2 className="font-serif text-[48px] leading-[1.13] font-bold text-brand italic max-[750px]:text-[36px]">{content.business.heading}</h2>
          <p className="my-2.5 text-[16px] leading-[1.8] text-[#5b5b5b]">{content.business.body}</p>
          <ul className="my-[26px] grid gap-[14px]">
            {content.business.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-3 text-[15px]">
                <span className="grid size-7 place-items-center rounded-full bg-[#f5ede5] text-brand">
                  <Check size={16} aria-hidden="true" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
          <div data-business-cta className="flex items-center gap-6 max-[750px]:gap-4">
            <a
              href="https://m.indiamart.com/maple-furnishers/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-3 border border-solid border-brand bg-brand px-6 py-[13px] font-medium text-white no-underline transition-[background,color] duration-150 ease-[ease] hover:bg-[#571710] max-[750px]:px-[18px]"
            >
              {content.business.cta} <ArrowRight size={18} />
            </a>
            <Image
              src={shopFile("indiamart-logo.png")}
              width={100}
              height={60}
              alt="IndiaMART"
              className="h-auto w-[100px] max-[750px]:w-[60px]"
            />
          </div>
          <p className="my-2.5 text-[12px] leading-[1.8] text-[#5b5b5b]">
            {content.business.trust}
          </p>
        </div>
        <div>
          <Image
            src={shopFile("Chair_bulk.png")}
            alt="Upholstered chairs for commercial furnishing projects"
            width={900}
            height={1000}
            sizes="(max-width: 749px) 100vw, 50vw"
            className="h-auto max-h-[650px] w-full object-contain"
          />
        </div>
      </section>
    ),
    cities: (
      <div data-service-section="cities">
        <HomeCities content={content.cities} />
      </div>
    ),
  };
  const visible = content.sections.filter(section => section.enabled);
  return (
    <div data-bulk-enquiry className="pb-6 text-ink">
      {!visible.some(section => section.key === "hero") && <h1 className="sr-only">{content.heading}</h1>}
      {visible.map((section, index) => {
        const previous = visible[index - 1]?.key;
        return (
          <Fragment key={section.key}>
            {previous === "trust" && <div data-divider className={divider + " mx-auto my-4 w-[90%]"} />}
            {(previous === "process" || previous === "business") && <div data-divider className={divider + " my-8"} />}
            {sections[section.key]}
          </Fragment>
        );
      })}
    </div>
  );
}
