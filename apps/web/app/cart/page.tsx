import { CartContents } from "@/components/cart";
export default function CartPage() {
  return (
    <section className="page-section cart-page">
      <h1>Your cart</h1>
      <CartContents />
    </section>
  );
}
