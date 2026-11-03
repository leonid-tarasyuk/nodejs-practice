#!/usr/bin/env node
/**
 * One-time OAuth 2.0 authorization for Google Drive.
 * Opens a local HTTP server, prints the consent URL, receives the authorization code
 * and saves the refresh token to .env as GOOGLE_REFRESH_TOKEN.
 */
import { authorizeDrive } from '../src/application/services/upload.service.js';
import { runMain } from '../src/cli/index.js';
import { logger } from '../src/utils/logger.js';

const PORT = Number(process.env.AUTH_PORT) || 53682;

await runMain(async () => {
  const { envPath } = await authorizeDrive({
    port: PORT,
    onAuthUrl: (url) => {
      logger.info('Open this URL in a browser and allow access to Google Drive:\n');
      logger.info(`${url}\n`);
      logger.info('Waiting for authorization...');
    },
  });
  logger.info(`Refresh token saved to ${envPath}`);
});
