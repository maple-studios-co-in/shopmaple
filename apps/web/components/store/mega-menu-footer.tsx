import { MaplePromise } from "./maple-promise";

/**
 * Frame 1:1454 ("Living room mega-menu"): under the menu's columns, the Maple promise strip and the invitation to
 * consult, spanning the whole panel.
 */
export function MegaMenuFooter() {
  return (
    <div data-mega-footer className="col-span-full flex flex-col gap-4 pt-2">
      <MaplePromise className="lg:grid-cols-4" />
      <p className="m-0 font-text text-[16px] leading-[1.45] text-taupe">Your space. Your choices. Consult with Maple on colour, material, finish, and size.</p>
    </div>
  );
}
