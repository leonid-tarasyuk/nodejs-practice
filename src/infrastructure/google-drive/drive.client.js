import { google } from 'googleapis';
import { driveConfig } from '../../config/index.js';
import { DriveError } from '../../utils/errors.js';
import { formatBytes } from '../../utils/format.js';

/** Least-privilege scope: the app only sees files and folders it created itself. */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function createOAuthClient(redirectUri) {
  const { clientId, clientSecret } = driveConfig;
  if (!clientId || !clientSecret) {
    throw new DriveError(
      'Google Drive is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (see README)',
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** OAuth2 client authorized with the refresh token from .env. */
export function createAuthorizedClient() {
  const client = createOAuthClient();
  if (!driveConfig.refreshToken) {
    throw new DriveError('GOOGLE_REFRESH_TOKEN is not set in .env: run "npm run auth" first (see README)');
  }
  client.setCredentials({ refresh_token: driveConfig.refreshToken });
  return client;
}

/**
 * Thin wrapper over the googleapis Drive v3 client: only the calls the app needs,
 * with API errors turned into DriveError messages.
 */
export class DriveClient {
  constructor(auth = createAuthorizedClient()) {
    this.auth = auth;
    this.drive = google.drive({ version: 'v3', auth });
  }

  /** Authorization header with a fresh access token (refreshed automatically when it expires). */
  async authHeaders() {
    const { token } = await wrapApiErrors(() => this.auth.getAccessToken());
    return { Authorization: `Bearer ${token}` };
  }

  findOrCreateFolder(folderName = driveConfig.folderName) {
    return wrapApiErrors(async () => {
      const escaped = folderName.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      const { data } = await this.drive.files.list({
        q: `mimeType='${FOLDER_MIME}' and name='${escaped}' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });
      if (data.files.length > 0) return data.files[0].id;

      const created = await this.drive.files.create({
        requestBody: { name: folderName, mimeType: FOLDER_MIME },
        fields: 'id',
      });
      return created.data.id;
    });
  }

  /** Throws a DriveError if a file of `size` bytes does not fit into the free Drive space. */
  checkQuota(size) {
    return wrapApiErrors(async () => {
      const { data } = await this.drive.about.get({ fields: 'storageQuota' });
      const { limit, usage } = data.storageQuota ?? {};
      if (!limit) return; // unlimited storage
      const free = Number(limit) - Number(usage);
      if (size > free) {
        throw new DriveError(
          `Not enough space on Google Drive: file is ${formatBytes(size)}, available ${formatBytes(free)}. ` +
            'Try --gzip to upload a compressed file.',
        );
      }
    });
  }
}

async function wrapApiErrors(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DriveError) throw err;
    const reason = err.response?.data?.error_description || err.response?.data?.error?.message || err.message;
    if (String(reason).includes('invalid_grant')) {
      throw new DriveError('Google refresh token is invalid or expired: run "npm run auth" again');
    }
    throw new DriveError(`Google Drive API error: ${reason}`, { cause: err });
  }
}
