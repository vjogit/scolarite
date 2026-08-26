import path from 'path'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'; // Importez le visualizer
import fs from 'fs'

// ── Les trois façons de lancer le front ──────────────────────────────────────
//
//   development  `npm run dev`
//                Serveur Vite sur https://10.20.2.1:5173, backend lancé à la
//                main depuis le debugger VSCode sur localhost:3333.
//
//   conteneurs   `npm run build:conteneurs`, via start-scolarite.sh local
//                Build servi par nginx (10.20.2.5:9021), qui reverse-proxie
//                vers le conteneur backend. Le serveur Vite n'est pas utilisé.
//
//   production   `npm run build`, via start-scolarite.sh prod
//
// Le mode « conteneurs » ne peut pas s'appeler « local » : Vite réserve ce nom
// à cause du suffixe .local des fichiers d'env.
//
// Chaque mode lit front/.env.<mode>. Attention au suffixe .local : un
// .env.<mode>.local surcharge silencieusement le fichier du mode.

const HOTE_DEV = '10.20.2.1'
const PORT_DEV = 5173

const CLE_TLS = './cert/localhost-key.pem'
const CERT_TLS = './cert/localhost.pem'

// Cibles du proxy du serveur de dev. Les adresses viennent de
// infra/run/compose.yaml (backend 10.20.2.4) et infra/run/build/nginx.conf.
const CIBLES_PROXY: Record<string, { api: string; auth: string }> = {
  // Backend hors conteneur : back/cmd/serveur/config.yaml, server.port 3333.
  development: { api: 'http://localhost:3333', auth: 'http://10.20.2.2:8080' },
  // Backend conteneurisé, joint directement — on court-circuite nginx, qui ne
  // sert de toute façon que le build. Utile pour déboguer le front contre la
  // stack conteneurs sans la reconstruire.
  conteneurs: { api: 'http://10.20.2.4:3333', auth: 'http://10.20.2.2:8080' },
}

// Sans elles le front part avec des `undefined` : baseURL axios vide
// (src/services/api.ts) ou init Keycloak muet (src/KeycloakContext.tsx).
const VARIABLES_REQUISES = [
  'VITE_API_URL',
  'VITE_KEYCLOAK_URL',
  'VITE_KEYCLOAK_REALM',
  'VITE_KEYCLOAK_CLIENT_ID',
]

function serveurDeDev(mode: string) {
  const cibles = CIBLES_PROXY[mode]
  if (!cibles) {
    throw new Error(
      `Le serveur de dev ne connaît pas le mode « ${mode} ». ` +
      `Modes possibles : ${Object.keys(CIBLES_PROXY).join(', ')}.`,
    )
  }

  // Lecture différée : en mode build ces fichiers n'existent pas (front/cert/
  // est ignoré par git, donc absent d'un clone neuf comme de la CI) et les lire
  // au chargement de la config faisait échouer `vite build`.
  for (const fichier of [CLE_TLS, CERT_TLS]) {
    if (!fs.existsSync(fichier)) {
      throw new Error(
        `Certificat HTTPS absent : front/${fichier.replace('./', '')}\n` +
        `  mkdir -p cert\n` +
        `  mkcert -key-file ${CLE_TLS} -cert-file ${CERT_TLS} localhost ${HOTE_DEV}`,
      )
    }
  }

  const auth: ProxyOptions = {
    target: cibles.auth,
    changeOrigin: true,
    cookieDomainRewrite: HOTE_DEV,
    // Keycloak construit ses URL de redirection depuis ces en-têtes : ils
    // doivent décrire le serveur Vite, pas la cible du proxy.
    headers: {
      'X-Forwarded-Host': `${HOTE_DEV}:${PORT_DEV}`,
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Port': String(PORT_DEV),
    },
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes) => {
        const cookies = proxyRes.headers['set-cookie'];
        if (cookies) {
          proxyRes.headers['set-cookie'] = cookies.map(cookie =>
            cookie
              .replace(/;\s*Secure/gi, '')
              .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          );
        }
      });
    },
  }

  return {
    host: HOTE_DEV,
    port: PORT_DEV,
    // Les X-Forwarded-* ci-dessus codent PORT_DEV. Si Vite glissait sur le port
    // suivant parce que 5173 est pris, Keycloak redirigerait vers le mauvais
    // serveur : mieux vaut refuser de démarrer.
    strictPort: true,
    https: {
      key: fs.readFileSync(CLE_TLS),
      cert: fs.readFileSync(CERT_TLS),
    },
    proxy: {
      '/auth/': auth,
      '/api': { target: cibles.api },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  const manquantes = VARIABLES_REQUISES.filter((cle) => !env[cle])
  if (manquantes.length > 0) {
    throw new Error(
      `Mode « ${mode} » : variables absentes de front/.env.${mode} — ` +
      manquantes.join(', '),
    )
  }

  console.log(`[vite] mode « ${mode} » — API ${env.VITE_API_URL}`)

  return {
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      filename: "./dist/report.html", // Nom du fichier de rapport HTML
      open: true, // Ouvre le rapport automatiquement après le build
      gzipSize: true, // Affiche les tailles gzip
      brotliSize: true, // Affiche les tailles brotli
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // `vite build` n'a pas de serveur : ne pas exiger les certificats mkcert.
  ...(command === 'serve' ? { server: serveurDeDev(mode) } : {}),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {

            if (id.includes('@mui/x-date-pickers') || id.includes('@mui/material')) {
              return 'mui-material-libs'; // Un chunk pour les grosses libs
            }
            if (id.includes('@toolpad') || id.includes('@mui')) {
              return 'mui-libs'; // Un chunk pour les grosses libs
            }

            if (id.includes('@tanstack')) {
              return 'tanstack-libs'; // Un chunk pour les grosses libs
            }

            if (id.includes('recharts')) {
              return 'recharts-libs'; // Un chunk pour les grosses libs
            }

            if (id.includes('fullcalendar')) {
              return 'fullcalendar-libs'; // Un chunk pour les grosses libs
            }

            return 'vendor'; // Le reste des dépendances
          }
        },
      },
    },
  },
  }
})
