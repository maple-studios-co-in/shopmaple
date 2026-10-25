import Link from "next/link";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        Maple<span>FURNISHERS</span>
      </div>
      <div>
        <h2>SHOP</h2>
        <Link href="/collections/all">All furniture</Link>
        <a href="https://shop.maplefurnishers.com/pages/our-story">Our Story</a>
        <Link href="/pages/bulk-enquiry">Bulk Enquiry</Link>
        <Link href="/pages/contact">Help Center</Link>
      </div>
      <div>
        <h2>HELP</h2>
        {[
          ["Privacy Policy", "privacy-policy"],
          ["Terms of Service", "terms-of-service"],
          ["Shipping Policy", "shipping-policy"],
          ["Refund Policy", "refund-policy"],
        ].map(([name, path]) => (
          <a
            key={path}
            href={"https://shop.maplefurnishers.com/policies/" + path}
          >
            {name}
          </a>
        ))}
      </div>
      <div>
        <h2>CUSTOMER CARE</h2>
        <p>
          A-2/56–57, W.H.S, Kirti Nagar,
          <br />
          New Delhi, Delhi, 110015
        </p>
        <a href="tel:+919211819727">+91 9211819727</a>
        <a href="mailto:contact@maplefurnishers.com">
          contact@maplefurnishers.com
        </a>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Maple Furnishers</span>
        <a href="https://www.instagram.com/the_maple_experience/">Instagram</a>
      </div>
    </footer>
  );
}
