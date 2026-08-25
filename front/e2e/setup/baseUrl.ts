/**
 * Adresse de l'application testée. `start-local-keep` sert un build figé sur
 * nginx (`https://10.20.2.5:9021`), l'adresse par défaut de la suite — le
 * mode que `make test-ihm` présuppose. Elle diffère de `npm run dev`
 * (`https://10.20.2.1:5173`), au port propre à chaque machine.
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://10.20.2.5:9021';
