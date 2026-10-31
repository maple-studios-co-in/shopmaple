import { act } from "react";

/**
 * Waits (inside act) until `check` returns something truthy: overlays such as the menu panel, the mobile
 * drawer, the wishlist drawer and search load on demand, so their content arrives a moment after the
 * click that opens them. It yields with setImmediate, which tests that fake setTimeout leave alone.
 */
export async function waitFor<T>(check: () => T, turns = 400): Promise<T> {
  let value = check();
  for (let turn = 0; !value && turn < turns; turn++) {
    await act(async () => new Promise((resolve) => setImmediate(resolve)));
    value = check();
  }
  return value;
}
