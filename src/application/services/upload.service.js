import { ENV_PATH, saveEnvVariable } from '../../config/index.js';

/**
 * Uploads a file to Google Drive.
 * googleapis adds about 1 s of startup time, so the Drive module is loaded only when an upload is needed.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {boolean} [options.gzip] compress on the fly and upload as "<name>.gz"
 */
export async function uploadFile(filePath, { gzip = false } = {}) {
  const { uploadToDrive } = await import('../../infrastructure/google-drive/drive-uploader.js');
  return uploadToDrive(filePath, { gzip });
}

/** Runs the one-time OAuth flow and saves the refresh token to .env. */
export async function authorizeDrive({ port, onAuthUrl }) {
  const { obtainRefreshToken } = await import('../../infrastructure/google-drive/drive-auth.js');
  const token = await obtainRefreshToken({ port, onAuthUrl });
  await saveEnvVariable('GOOGLE_REFRESH_TOKEN', token);
  return { envPath: ENV_PATH };
}
