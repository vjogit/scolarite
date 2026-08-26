import * as React from "react"

// Sorti de sidebar.tsx (même motif que button-variants.ts au lot 1) : la
// règle react-refresh/only-export-components refuse qu'un fichier de
// composants exporte aussi un hook.
export interface SidebarContextProps {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

export const SidebarContext = React.createContext<SidebarContextProps | null>(
  null
)

export function useSidebar() {
  const context = React.use(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}
