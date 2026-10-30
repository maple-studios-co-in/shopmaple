"use client"

import * as React from "react"

/**
 * Where overlays (dialog, sheet, drawer, menus, popovers, tooltips, select) render.
 * The admin's tokens and scoped base live on `.shop-admin`, so its overlays portal into
 * that element instead of `document.body`, which belongs to the storefront's styles.
 */
const PortalContainerContext = React.createContext<HTMLElement | null>(null)

function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: React.ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

/** The element overlays portal into; undefined lets Radix fall back to `document.body`. */
function usePortalContainer() {
  return React.useContext(PortalContainerContext) ?? undefined
}

export { PortalContainerProvider, usePortalContainer }
