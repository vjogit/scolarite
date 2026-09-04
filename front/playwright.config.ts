import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/setup/baseUrl';

/**
 * Filet de régression de l'interface. Chromium seul, un seul worker : la
 * base est partagée entre les tests (voir décision (f), aucune isolation par
 * données uniques pour ce lot).
 */
export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/setup/globalSetup.ts',
    fullyParallel: false,
    workers: 1,
    // 30 s (le défaut) ne laisse pas la marge nécessaire au remontage forcé
    // de aide/hierarchieE2E.ts (cliquerPuisAttendreUrl) sur les écrans
    // encore touchés par le défaut de rendu figé de BarreAxes.
    timeout: 60_000,
    // Un test instable se corrige, ne se relance pas.
    retries: 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: BASE_URL,
        // Certificat mkcert : valide dans le navigateur du poste, pas dans le
        // magasin par défaut de Playwright.
        ignoreHTTPSErrors: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'setup',
            testMatch: /.*\.setup\.ts/,
        },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['setup'],
        },
    ],
});
