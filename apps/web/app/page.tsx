import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PenTool, Truck, House, Hammer } from "lucide-react";
import { Hero } from "@/components/hero";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import { shopFile } from "@/lib/format";
export const dynamic = "force-dynamic";
const cats = [
  ["Sofas", "sofas", "Cover_Image_Maple_6.svg?v=1778649785"],
  [
    "Dining Chair",
    "chairs",
    "Dining_Chairs_bac53a57-f5ab-4af0-beec-7ca279851dc3.png?v=1776235600",
  ],
  ["Coffee Tables", "tables", "Cover_Image_Maple_7.svg?v=1778649944"],
  [
    "Accent Chair",
    "chairs",
    "ChatGPTImageJun18_2025_08_27_31PM.png?v=1776235338",
  ],
  ["Beds", "beds", "Cover_Image_Maple_8.svg?v=1778650094"],
  ["Dinings", "tables", "Cover_Image_Maple_10.svg?v=1780689685"],
];
export default async function Home() {
  const result = await getProducts({ limit: "8" }).catch(() => null);
  return (
    <>
      <h1 className="sr-only">Maple Furnishers — furniture for your home</h1>
      <Hero />
      <Link href="/collections/sofas" className="home-banner">
        <Image
          src={shopFile(
            "1_Sofa_web_banner_Hompage_44dfb940-c378-4980-9268-f6d79c2d5ac0.png?v=1791220477",
          )}
          alt="Discover Maple sofas"
          fill
          sizes="100vw"
        />
      </Link>
      <section className="difference">
        <div>
          <p className="label">THE MAPLE DIFFERENCE</p>
          <h2>Every element is yours to reshape</h2>
          <Link href="/pages/contact">
            Tell Us About Your Space <ArrowRight size={17} />
          </Link>
        </div>
        <ul>
          {[
            [PenTool, "Fully Customizable"],
            [Truck, "Delivery Across India"],
            [House, "In-House Crafted in Delhi"],
            [Hammer, "36-Month Warranty"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof PenTool;
            return (
              <li key={String(text)}>
                <I strokeWidth={1} />
                <span>{String(text)}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="page-section">
        <h2 className="section-title">Shop By Category</h2>
        <div className="category-grid">
          {cats.map(([name, category, image]) => (
            <Link href={"/collections/" + category} key={name}>
              <div className="category-image">
                <Image
                  src={
                    "https://shop.maplefurnishers.com/cdn/shop/collections/" +
                    image
                  }
                  alt={name!}
                  fill
                  sizes="(max-width:700px) 45vw, 16vw"
                />
              </div>
              <h3>{name}</h3>
            </Link>
          ))}
        </div>
      </section>
      <div
        className="marquee"
        aria-label="Elegance isn't found. At Maple, it is custom-built."
      >
        <p>Elegance isn’t found. At Maple, it is custom-built.</p>
      </div>
      <section className="page-section">
        <div className="section-heading">
          <h2 className="section-title">Explore the collection</h2>
          <Link href="/collections/all">
            View all <ArrowRight size={17} />
          </Link>
        </div>
        {result ? (
          <div className="product-grid">
            {result.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Our collection is temporarily unavailable.</p>
            <Link href="/">Try again</Link>
          </div>
        )}
      </section>
      <section className="contact-band">
        <h2>Have a Space in Mind?</h2>
        <p>
          Whether it’s a single statement chair or a complete room, the process
          starts with a conversation.
        </p>
        <Link className="button light" href="/pages/contact">
          Tell us about your project <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
