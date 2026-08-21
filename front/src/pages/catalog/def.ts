/**
 * Constantes du workflow Catalogue.
 *
 * Le nom du workflow vit ici plutôt que dans `CatalogLayout` : les
 * descripteurs de `services/context` en ont besoin, et le layout importe ces
 * descripteurs — la constante doit donc être atteignable sans passer par lui.
 */
export const CATALOG_WORKFLOW = 'catalog_context';

/** Segment de l'écran des membres d'un groupe, greffé sous le groupe. */
export const MEMBRES = 'user';
