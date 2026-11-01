import Link from "next/link";
export default function NotFound() {
  return (
    <section className="empty-state">
      <h1>We couldn’t find that page</h1>
      <p>Let’s help you find a piece you’ll love.</p>
      <Link className="button" href="/collections/all">
        Explore furniture
      </Link>
    </section>
  );
}
