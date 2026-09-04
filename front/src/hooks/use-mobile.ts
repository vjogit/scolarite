import * as React from "react"

const MOBILE_BREAKPOINT = 768

const REQUETE = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function sAbonner(rappel: () => void) {
  const mql = window.matchMedia(REQUETE)
  mql.addEventListener("change", rappel)
  return () => {
    mql.removeEventListener("change", rappel)
  }
}

function lireInstantane() {
  return window.matchMedia(REQUETE).matches
}

/**
 * Réécrit depuis la version générée par shadcn (useState + useEffect) :
 * `matchMedia` est un magasin externe, `useSyncExternalStore` le lit sans
 * poser d'état dans un effet — même motif que Keycloak dans App.tsx.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(sAbonner, lireInstantane)
}
