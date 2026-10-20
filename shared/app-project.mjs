import {validateAppLogo} from './app-logo.mjs';
export const APP_LIMITS = { files: 128, file: 2000000, total: 12000000 };
export function appPath(value) {
  if (typeof value !== 'string' || value.length > 180 || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s) || !/^[\w. -]+$/.test(s)) || /(^|\/)(?:__proto__|prototype|constructor)$/i.test(value)) throw Error('Use a relative app file path without traversal or reserved names.');
  return value;
}
export function validateFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length > APP_LIMITS.files) throw Error('An app can contain up to 128 files.');
  let total = 0;
  for (const [name, text] of Object.entries(files)) { appPath(name); if (typeof text !== 'string' || text.length > APP_LIMITS.file) throw Error('Keep each app file under 2 MB.'); total += text.length; }
  if (total > APP_LIMITS.total) throw Error('Keep app source and embedded assets under 12 MB.');
  if (!files['index.html']?.trim()) throw Error('An app needs index.html.');
  return files;
}
export function appFiles(data) { return data.files || { 'index.html': data.html || '<main>Your app</main>' }; }
export function appSource(data, draft = false) { return !draft && data.published ? data.published.files : appFiles(data); }
export function validateApp(data) {
  validateAppLogo(data.logo);
  if (data.files) validateFiles(data.files);
  else if (typeof data.html !== 'string' || data.html.length > 300000) throw Error('An app needs HTML or an app file project.');
  if (data.published) validateFiles(data.published.files);
  if (data.versions && (!Array.isArray(data.versions) || data.versions.length > 3)) throw Error('Keep up to three published versions.');
  for (const version of data.versions || []) validateFiles(version.files);
}
