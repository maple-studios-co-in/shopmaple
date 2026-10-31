import { iconButton } from "./current-look";

/**
 * A header action icon (search, account, wishlist, cart): the 32 x 40 icon button, 40 x 44 under
 * 750 px, with an 18 px wide glyph under 701 px. `border: 0` as the legacy rule had it (style none,
 * colour current). Tailwind's max-[N] means `width < N`.
 */
export const headerIcon = `${iconButton} border-none border-current max-[750px]:h-11 max-[750px]:w-10 max-[701px]:[&_svg]:w-[18px]`;
