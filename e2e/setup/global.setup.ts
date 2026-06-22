// ============================================================
// global.setup.ts
// ============================================================
// Purpose:   One-time global setup that runs before all Playwright projects.
//            Loads environment variables from e2e/.env.e2e.
// Used by:   playwright.config.ts globalSetup field
// ============================================================

export default async function globalSetup(): Promise<void> {
  // Environment variables are loaded by playwright.config.ts via dotenv.
  // No additional global setup is required for self-hosted JWT auth.
}
