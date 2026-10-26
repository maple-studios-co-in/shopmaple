# Navigation continuity

Customers must reach the selected product from the mobile menu without the menu continuing to cover the destination. Keyboard users must retain a focused desktop submenu when a mouse pointer happens to leave the navigation region. These repair existing navigation behavior without changing Shopify copy, destinations, artwork or menu structure.

The existing `ProductRail` in the mobile drawer omits the close callback used by category and quick links. Both the main rail and Living Room rail must close through the controlled drawer state on activation. The existing desktop `onPointerLeave` closes a panel even when a link inside it holds focus. Keep the panel open while focus remains inside that panel; ordinary mouse-only departure, outside focus/pointer and Escape must still dismiss it.

Use the existing Next.js links and navigation state. Passing the existing close callback is preferable to global route-change listeners, which add unrelated behavior and can close menus during external navigation. A focused-panel guard is preferable to disabling hover dismissal. No animation dependency or new content is needed.

Preserve route hrefs and link semantics. A modified click must keep native navigation behavior; closing the drawer is consistent with existing category links. When a navigation panel is dismissed, body scrolling must recover. Test the real controlled mobile component and desktop component with only browser/Next transport boundaries stubbed.

No production release occurs until the outstanding capacity gate is resolved. Checkout remains disabled. This is one increment of the full storefront goal, not completion of that goal.

The same audit found a category-copy defect: introductions are sliced to 197 characters and receive an ellipsis even when no expansion control is rendered. Normalize whitespace as the component already does, then preserve introductions of 200 or fewer normalized characters exactly. Only longer text uses the existing collapsed excerpt and Read More/Read Less controls. Empty input must not become an ellipsis. Existing long default excerpts and button labels remain unchanged.
