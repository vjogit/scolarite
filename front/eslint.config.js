import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
       // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
         // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      // `strictTypeChecked` interdit d'interpoler un nombre dans un gabarit ;
      // la règle elle-même l'autorise par défaut, et pour cause : `${3}` ne
      // réserve aucune surprise. Le danger est l'interpolation d'une valeur
      // qui peut manquer — elle écrit « undefined » à l'écran — et cela reste
      // interdit. Ce réglage rend à la règle son défaut, pas moins.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // Les configs *TypeChecked ci-dessus exigent les infos de type.
      parserOptions: {
        // `env.d.ts` fait désormais partie du programme de `tsconfig.app.json` :
        // le tirer en plus par `allowDefaultProject` le ferait appartenir à deux
        // projets à la fois, ce que le service de types refuse.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
