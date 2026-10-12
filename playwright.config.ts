import { defineConfig } from '@playwright/test'
const base = process.env.GITHUB_ACTIONS === 'true' ? '/editor' : ''
export default defineConfig({ testDir: './tests/e2e', timeout: 30000, fullyParallel: false, workers: 1, reporter: 'list', use: { baseURL: 'http://127.0.0.1:3107' + base + '/', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' }, webServer: { command: 'node scripts/serve-tests.mjs', url: 'http://127.0.0.1:3107' + base + '/notes/', reuseExistingServer: false } })
