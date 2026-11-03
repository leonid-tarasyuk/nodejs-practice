import http from 'node:http';
import { DriveError } from '../../utils/errors.js';
import { DRIVE_SCOPES, createOAuthClient } from './drive.client.js';

/**
 * Interactive OAuth 2.0 flow for a desktop app: starts a local HTTP server on `port`,
 * hands the consent URL to `onAuthUrl`, waits for Google to redirect back with the
 * authorization code and exchanges it for tokens.
 *
 * @param {object} options
 * @param {number} options.port
 * @param {(url: string) => void} options.onAuthUrl
 * @returns {Promise<string>} refresh token
 */
export async function obtainRefreshToken({ port, onAuthUrl }) {
  const redirectUri = `http://127.0.0.1:${port}`;
  const client = createOAuthClient(redirectUri);

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  try {
    onAuthUrl(client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: DRIVE_SCOPES }));
    const code = await waitForCode(server, redirectUri);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new DriveError('Google did not return a refresh token, revoke the app access and try again');
    }
    return tokens.refresh_token;
  } finally {
    server.close();
  }
}

function waitForCode(server, baseUrl) {
  return new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, baseUrl);
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(code ? 'Authorization complete, you can close this tab.' : `Authorization failed: ${error}`);
      if (code) resolve(code);
      else reject(new DriveError(`Authorization failed: ${error ?? 'no code received'}`));
    });
  });
}
