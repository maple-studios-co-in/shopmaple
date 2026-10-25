import { Favourites } from "@/components/favourites";
export const dynamic = "force-dynamic";
export default function FavouritesPage() {
  return (
    <section className="page-section">
      <h1>Saved furniture</h1>
      <Favourites />
    </section>
  );
}
