import MuiButton from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { Button as ShadButton } from '@/components/ui/button';
import { useModeCouleur } from '../../services/modeCouleur';

/**
 * Route de vérification temporaire — dette du lot « cohabitation ».
 *
 * À retirer en fin de migration : supprimer ce fichier, son entrée dans
 * `main.tsx` (le bloc de routes `_cohabitation`) et l'import associé. Non
 * liée au menu, non protégée par un rôle — seule l'authentification Keycloak
 * imposée par `Layout` s'applique.
 */
export default function Cohabitation() {
  const { mode, setMode } = useModeCouleur();

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

      <section>
        <Typography variant="h6" gutterBottom>
          5. Basculement clair/sombre (source unique : useModeCouleur)
        </Typography>
        <MuiButton
          variant="outlined"
          onClick={() => { setMode(mode === 'dark' ? 'light' : 'dark'); }}
        >
          Basculer le mode (actuel : {mode})
        </MuiButton>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Ce bouton change `useModeCouleur().mode` — la même source que
          `layouts/dashboard.tsx` lit pour poser la classe `.dark` sur
          `&lt;html&gt;` (et, tant qu'il reste, choisir le thème MUI). MUI et
          les blocs Tailwind du point 6 doivent bouger ensemble, sans décalage.
        </Typography>
      </section>

      <section>
        <Typography variant="h6" gutterBottom>
          6. Tokens shadcn dérivés de la palette MUI — les deux systèmes
          doivent se ressembler, dans les deux modes
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <div className="rounded-md bg-primary px-4 py-2 text-primary-foreground">primary</div>
          <div className="rounded-md bg-secondary px-4 py-2 text-secondary-foreground">secondary</div>
          <div className="rounded-md bg-muted px-4 py-2 text-muted-foreground">muted</div>
          <div className="rounded-md bg-accent px-4 py-2 text-accent-foreground">accent</div>
          <div className="rounded-md bg-destructive/10 px-4 py-2 text-destructive">destructive</div>
          <div className="rounded-md border border-border bg-card px-4 py-2 text-card-foreground">card</div>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <ShadButton>shadcn — défaut</ShadButton>
          <MuiButton variant="contained">MUI — primary</MuiButton>
          <ShadButton variant="secondary">shadcn — secondary</ShadButton>
          <MuiButton variant="contained" color="secondary">MUI — secondary</MuiButton>
          <ShadButton variant="destructive">shadcn — destructive</ShadButton>
          <MuiButton variant="contained" color="error">MUI — error</MuiButton>
        </Stack>
      </section>

      <section>
        <Typography variant="h6" gutterBottom>
          7. Contraste texte / fond
        </Typography>
        <Typography variant="body2">
          Chaque pastille du point 6 associe un fond et un texte pensés
          ensemble (primary/primary-foreground, etc.) : bascule le mode
          (point 5) et vérifie à l'œil qu'aucune ne devient illisible, en
          clair comme en sombre.
        </Typography>
      </section>
    </Stack>
  );
}
