import MuiButton from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { Button as ShadButton } from '@/components/ui/button';

/**
 * Route de vérification temporaire — dette du lot « cohabitation ».
 *
 * À retirer en fin de migration : supprimer ce fichier, son entrée dans
 * `main.tsx` (le bloc de routes `_cohabitation`) et l'import associé. Non
 * liée au menu, non protégée par un rôle — seule l'authentification Keycloak
 * imposée par `Layout` s'applique.
 */
export default function Cohabitation() {
  return (
    <Stack spacing={4} sx={{ p: 4 }}>
      <Typography variant="h4">Cohabitation Tailwind / MUI</Typography>

      <section>
        <Typography variant="h6" gutterBottom>
          1. Utilitaire Tailwind sur un élément nu
        </Typography>
        <div className="rounded-md bg-blue-600 p-4 text-white">
          Ce bandeau doit être bleu, à coins arrondis, texte blanc — pur
          Tailwind, aucun MUI en jeu.
        </div>
      </section>

      <section>
        <Typography variant="h6" gutterBottom>
          2. Utilitaire Tailwind sur un composant MUI (test de l'ordre des couches)
        </Typography>
        <MuiButton
          variant="contained"
          className="bg-pink-600 hover:bg-pink-700"
        >
          Bouton MUI, fond forcé en rose par Tailwind
        </MuiButton>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Si ce bouton reste bleu (couleur MUI par défaut), l'ordre des
          couches CSS est cassé : MUI l'emporte alors qu'il doit être en
          dessous de `utilities`.
        </Typography>
      </section>

      <section>
        <Typography variant="h6" gutterBottom>
          3. Bouton shadcn et bouton MUI côte à côte
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <ShadButton>Bouton shadcn</ShadButton>
          <MuiButton variant="contained">Bouton MUI</MuiButton>
        </Stack>
      </section>

      <section>
        <Typography variant="h6" gutterBottom>
          4. Préflight Tailwind vs typographie MUI environnante
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h1" sx={{ fontSize: '2rem' }}>Titre MUI (h1)</Typography>
          <Typography variant="body1">
            Paragraphe MUI standard. Les listes ci-dessous doivent conserver
            leurs puces et leur retrait MUI habituels si le préflight
            Tailwind ne les a pas neutralisés hors de portée de cette page.
          </Typography>
          <ul>
            <li>Premier élément</li>
            <li>Second élément</li>
          </ul>
        </Paper>
      </section>
    </Stack>
  );
}
