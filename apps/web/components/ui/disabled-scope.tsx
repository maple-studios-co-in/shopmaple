"use client"

import * as React from "react"

/**
 * A region whose form controls are disabled, for example while the editor saves or after a
 * version conflict. A `<fieldset disabled>` covers its own descendants only; dialogs and
 * sheets portal out of it, so their content reads this scope and disables itself too, with
 * the notice explaining why.
 */
const DisabledScopeContext = React.createContext<{ disabled: boolean; notice?: React.ReactNode }>({ disabled: false })

function DisabledScope({ disabled, notice, children }: { disabled: boolean; notice?: React.ReactNode; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ disabled, notice }), [disabled, notice])
  return <DisabledScopeContext.Provider value={value}>{children}</DisabledScopeContext.Provider>
}

/** Overlay content: the children inside a disabled fieldset (with the notice) when the scope is disabled. */
function DisabledScopeContent({ children }: { children: React.ReactNode }) {
  const { disabled, notice } = React.useContext(DisabledScopeContext)
  if (!disabled) return <>{children}</>
  return (
    <fieldset disabled className="contents">
      {notice && <p role="alert" className="mx-6 mt-4 rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-2.5 text-xs font-medium text-danger">{notice}</p>}
      {children}
    </fieldset>
  )
}

export { DisabledScope, DisabledScopeContent }
