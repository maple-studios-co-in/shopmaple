import Image from "next/image";
import Link from "next/link";
import { Instagram, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import { shopFile } from "@/lib/format";

const policies = [
  ["Privacy Policy", "privacy-policy"],
  ["Terms of Service", "terms-of-service"],
  ["Shipping Policy", "shipping-policy"],
  ["Refund Policy", "refund-policy"],
];

export function Footer() {
  return (
    <footer className="maple-footer">
      <div className="maple-footer-main">
        <Link
          className="maple-footer-logo"
          href="/"
          aria-label="Maple Furnishers home"
        >
          <Image
            src={shopFile("Cover_Image_Maple_1.png?v=1752647999")}
            alt="Maple Furnishers"
            width={1080}
            height={500}
            sizes="(max-width:749px) 70vw, 25vw"
          />
        </Link>
        <nav aria-label="About Maple">
          <h2>SHOP</h2>
          <Link href="/pages/our-story">
            Our Story
          </Link>
          <Link href="/pages/bulk-enquiry">Bulk Enquiry</Link>
          <Link href="/pages/contact">Help Center</Link>
          <a href="https://shop.maplefurnishers.com/blogs/recent-stories">
            Blogs
          </a>
        </nav>
        <nav aria-label="Help and policies">
          <h2>HELP</h2>
          {policies.map(([title, slug]) => (
            <a
              key={slug}
              href={`https://shop.maplefurnishers.com/policies/${slug}`}
            >
              {title}
            </a>
          ))}
          <a href="https://uhnuqi-tu.myshopify.com/apps/return_prime">
            Return &amp; Exchange
          </a>
        </nav>
        <div className="maple-footer-care">
          <h2>CUSTOMER CARE</h2>
          <p>
            <MapPin size={26} strokeWidth={1} />
            <span>
              A-2/56 - 57, W.H.S, Kirti Nagar,
              <br />
              New Delhi, Delhi, 110015
            </span>
          </p>
          <a href="tel:+918796130252">
            <Phone size={26} strokeWidth={1} /> +91 87961 30252
          </a>
          <a href="mailto:contact@maplefurnishers.com">
            <Mail size={26} strokeWidth={1} /> contact@maplefurnishers.com
          </a>
        </div>
      </div>
      <div className="maple-footer-contact">
        <div>
          <h2>Let’s Build Something Lasting</h2>
        </div>
        <div>
          <h3>For Bulk Order/Collaboration:</h3>
          <a href="tel:+919262968727">
            <Phone size={24} strokeWidth={1} /> +91 92629 68727
          </a>
          <a href="mailto:aditya@maplefurnishers.com">
            <Mail size={24} strokeWidth={1} /> aditya@maplefurnishers.com
          </a>
        </div>
        <div>
          <h3>For Customer Service:</h3>
          <a href="tel:+918796130252">
            <Phone size={24} strokeWidth={1} /> +91 87961 30252
          </a>
          <a href="mailto:contact@maplefurnishers.com">
            <Mail size={24} strokeWidth={1} /> contact@maplefurnishers.com
          </a>
        </div>
        <div>
          <h3>Find Us On</h3>
          <Image
            src={shopFile("amazon_logo.avif?v=1778615085")}
            alt="Amazon"
            width={150}
            height={56}
          />
        </div>
      </div>
      <div className="maple-footer-bottom">
        <span>© {new Date().getFullYear()} Maple Furnishers</span>
        <nav aria-label="Store policies">
          {policies.map(([title, slug]) => (
            <a
              key={slug}
              href={`https://shop.maplefurnishers.com/policies/${slug}`}
            >
              {title}
            </a>
          ))}
        </nav>
        <div>
          <a
            href="https://www.instagram.com/the_maple_experience/"
            aria-label="Maple Furnishers on Instagram"
          >
            <Instagram size={20} />
          </a>
          <a
            href="https://www.linkedin.com/company/maplefurnishers/"
            aria-label="Maple Furnishers on LinkedIn"
          >
            <Linkedin size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
}
