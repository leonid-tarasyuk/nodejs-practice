import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Path of the project's .env file (independent of the current working directory). */
export const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url));

dotenv.config({ path: ENV_PATH, quiet: true });

export const driveConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  folderName: process.env.GOOGLE_DRIVE_FOLDER_NAME || 'csv-to-json',
};

/** Sets `name=value` in .env, replacing an existing line or appending a new one. */
export async function saveEnvVariable(name, value) {
  const content = await readFile(ENV_PATH, 'utf8').catch(() => '');
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const updated = pattern.test(content)
    ? content.replace(pattern, () => line)
    : `${content}${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
  await writeFile(ENV_PATH, updated);
}
