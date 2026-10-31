import { CartContents } from "@/components/cart";
import { pageTitle } from "@/components/store/current-look";
export default function CartPage() {
  return (
    <section data-store data-cart-page className="mx-auto min-h-[60vh] max-w-[900px] px-10 py-12 max-[1001px]:px-6 max-[1001px]:py-9 max-[701px]:px-4 max-[701px]:py-8">
      <h1 className={`${pageTitle} mb-6`}>Your cart</h1>
      <CartContents />
    </section>
  );
}
