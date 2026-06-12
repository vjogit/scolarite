import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'; // Importez le visualizer
import fs from 'fs'


// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  console.log(`[vite] mode: ${mode}`)
  console.log(`[vite] VITE_API_URL:      ${env.VITE_API_URL}`)
  console.log(`[vite] VITE_KEYCLOAK_URL: ${env.VITE_KEYCLOAK_URL}`)
  return {
  plugins: [
    react(),
    visualizer({
      filename: "./dist/report.html", // Nom du fichier de rapport HTML
      open: true, // Ouvre le rapport automatiquement après le build
      gzipSize: true, // Affiche les tailles gzip
      brotliSize: true, // Affiche les tailles brotli
    }),
  ],
  server: {
    https: {
      key: fs.readFileSync('./cert/localhost-key.pem'),
      cert: fs.readFileSync('./cert/localhost.pem'),
    },
    proxy: {
      '/auth/': {
        target: 'http://10.20.2.2:8080',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
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
      },
      '/api': {
        target: 'http://localhost:3333',
      },
    },
  },
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
