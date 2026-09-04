/**
 * Les captures de référence ne se comparent — et ne se régénèrent — que dans
 * le conteneur de référence (`e2e/conteneur/`, `make test-ihm`,
 * `make captures-reference`) : c'est lui qui fixe polices, Chromium et
 * antialiasing, à l'identique sur le poste et en CI (docs/ci.md §10). Hors de
 * lui, un poste rend d'autres glyphes : comparer n'y prouve rien, et
 * `--update-snapshots` y produirait des références que la CI refuserait.
 *
 * Le marqueur est posé par l'image (`ENV` du Dockerfile), jamais par
 * l'appelant. Les deux specs de captures se sautent quand il manque, avec ce
 * motif visible dans le rapport — un `npx playwright test` direct sur le poste
 * reste le point d'entrée des 43 tests fonctionnels, et annonce « 20 skipped ».
 */
export const EN_CONTENEUR_REFERENCE = process.env.PLAYWRIGHT_CONTENEUR_REFERENCE === '1';

export const MOTIF_HORS_CONTENEUR =
    'Captures de référence : comparaison et régénération réservées au conteneur de référence '
    + '(make test-ihm, make captures-reference — e2e/conteneur/) ; hors de lui, polices et moteur de rendu '
    + 'ne sont pas ceux des références';
