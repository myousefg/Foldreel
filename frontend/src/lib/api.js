import axios from 'axios';

// Shared secret from the Electron shell. Gates the loopback API so pages in the
// user's other browsers can't read it. Empty in a plain browser dev session
// (the backend then runs with the check disabled).
const API_TOKEN = (typeof window !== 'undefined' && window.electronAPI?.apiToken) || '';

// REACT_APP_API_PORT lets a dev build talk to a scratch backend instead of the real one.
const API_PORT = process.env.REACT_APP_API_PORT || '8767';
export const API_HOST = `http://127.0.0.1:${API_PORT}`;
export const WS_URL   = `ws://127.0.0.1:${API_PORT}/api/ws${API_TOKEN ? `?token=${encodeURIComponent(API_TOKEN)}` : ''}`;

const api = axios.create({
  baseURL: `${API_HOST}/api`,
  headers: {
    'Content-Type': 'application/json',
    ...(API_TOKEN ? { 'X-Foldreel-Token': API_TOKEN } : {}),
  },
});

const tokenParam = API_TOKEN ? `&token=${encodeURIComponent(API_TOKEN)}` : '';
export const thumbUrl = (path, size) => `${API_HOST}/api/thumb?path=${encodeURIComponent(path)}${size ? `&size=${size}` : ''}${tokenParam}`;
export const watchAvatarUrl = (id) => `${API_HOST}/api/watches/${encodeURIComponent(id)}/avatar${tokenParam ? `?${tokenParam.slice(1)}` : ''}`;
export const mediaUrl = (path) => `${API_HOST}/api/media?path=${encodeURIComponent(path)}${tokenParam}`;
export const organizeThumbUrl = (path, size) => `${API_HOST}/api/organize/thumb?path=${encodeURIComponent(path)}${size ? `&size=${size}` : ''}${tokenParam}`;

export const jobsApi = {
  list:   (status)        => api.get('/jobs', { params: status ? { status } : {} }).then(r => r.data),
  get:    (id)            => api.get(`/jobs/${id}`).then(r => r.data),
  log:    (id)            => api.get(`/jobs/${id}/log`).then(r => r.data),
  files:  (id, limit)     => api.get(`/jobs/${id}/files`, { params: limit ? { limit } : {} }).then(r => r.data),
  create: (urls, options) => api.post('/jobs', { urls, options }).then(r => r.data),
  cancel: (id)            => api.post(`/jobs/${id}/cancel`).then(r => r.data),
  pause:  (id)            => api.post(`/jobs/${id}/pause`).then(r => r.data),
  retry:  (id)            => api.post(`/jobs/${id}/retry`).then(r => r.data),
  remove: (id)            => api.delete(`/jobs/${id}`).then(r => r.data),
  deleteFiles: (id)       => api.delete(`/jobs/${id}/files`).then(r => r.data),
  clearFinished: ()       => api.delete('/jobs').then(r => r.data),
};

export const libraryApi = {
  list:        (params) => api.get('/library', { params }).then(r => r.data),
  paths:       (params) => api.get('/library/paths', { params }).then(r => r.data.paths),
  status:      ()       => api.get('/library/status').then(r => r.data),
  tree:        ()       => api.get('/library/tree').then(r => r.data),
  folders:     ()       => api.get('/library/folders').then(r => r.data),
  info:        (path)   => api.get('/library/info', { params: { path } }).then(r => r.data),
  paste:       (body)   => api.post('/library/paste', body).then(r => r.data),
  move:        (body)   => api.post('/library/move', body).then(r => r.data),
  rename:      (path, name) => api.post('/library/rename', { path, name }).then(r => r.data),
  mkdir:       (parent, name) => api.post('/library/mkdir', { parent, name }).then(r => r.data),
  remove:      (paths, mode)  => api.post('/library/delete', { paths, mode }).then(r => r.data),
  relocate:    (items)  => api.post('/library/relocate', { items }).then(r => r.data),
  favorite:    (paths, value) => api.post('/library/favorite', { paths, value }).then(r => r.data),
  tags:        (paths, add = [], remove = []) => api.post('/library/tags', { paths, add, remove }).then(r => r.data),
  duplicates:  ()       => api.get('/library/duplicates', { timeout: 0 }).then(r => r.data),
};

export const previewApi = {
  run: (url, options) => api.post('/preview', { url, options }).then(r => r.data),
};

export const settingsApi = {
  get:    (signal) => api.get('/settings', { signal }).then(r => r.data),
  update: (data)   => api.put('/settings', data).then(r => r.data),
};

export const envApi = {
  get:      () => api.get('/env').then(r => r.data),
  config:   () => api.get('/config').then(r => r.data),
  browsers: () => api.get('/browsers').then(r => r.data),
  cookies:  () => api.get('/cookies').then(r => r.data),
  importCookies: (body) => api.post('/cookies/import', body).then(r => r.data),
  deleteCookieFile: (name) => api.delete(`/cookies/${encodeURIComponent(name)}`).then(r => r.data),
  clearCache: () => api.post('/cache/clear').then(r => r.data),
};

export const configOverridesApi = {
  get:    ()           => api.get('/config/overrides').then(r => r.data),
  update: (overrides)  => api.put('/config/overrides', { overrides }).then(r => r.data),
};

export const presetsApi = {
  list:   ()                    => api.get('/presets').then(r => r.data.presets),
  create: (name, overrides)     => api.post('/presets', { name, overrides }).then(r => r.data),
  update: (id, patch)           => api.put(`/presets/${id}`, patch).then(r => r.data),
  remove: (id)                  => api.delete(`/presets/${id}`).then(r => r.data),
};

export const convertApi = {
  list:   ()             => api.get('/convert').then(r => r.data),
  create: (items)         => api.post('/convert', { items }).then(r => r.data),
  remove: (id)            => api.delete(`/convert/${id}`).then(r => r.data),
  clearFinished: ()       => api.delete('/convert').then(r => r.data),
};

export const organizeApi = {
  log:          ()               => api.get('/organize/log').then(r => r.data),
  clearLog:     ()               => api.delete('/organize/log').then(r => r.data),
  undo:         (id)             => api.post(`/organize/undo/${id}`).then(r => r.data),
  statPaths:    (paths)          => api.post('/organize/stat-paths', { paths }).then(r => r.data),
  renameApply:  (items)          => api.post('/organize/bulk-rename/apply', { items }).then(r => r.data),
};

export const watchesApi = {
  list:   ()                          => api.get('/watches').then(r => r.data),
  create: (url, interval_min, options) => api.post('/watches', { url, interval_min, options }).then(r => r.data),
  update: (id, patch)                 => api.patch(`/watches/${id}`, patch).then(r => r.data),
  remove: (id)                        => api.delete(`/watches/${id}`).then(r => r.data),
  checkNow: (id)                      => api.post(`/watches/${id}/check`).then(r => r.data),
};

export const toolsApi = {
  list:    (check) => api.get('/tools', { params: check ? { check: 1 } : {} }).then(r => r.data),
  install: (name) => api.post(`/tools/${name}/install`).then(r => r.data),
};

export const extensionApi = {
  enable:  () => api.post('/extension-pairing').then(r => r.data),
  disable: () => api.delete('/extension-pairing').then(r => r.data),
  link:    () => api.post('/extension-link').then(r => r.data),
  cancelLink: () => api.delete('/extension-link').then(r => r.data),
};

export const importApi = {
  detect:  ()     => api.get('/import/detect').then(r => r.data),
  inspect: (path) => api.post('/import/inspect', { path }).then(r => r.data),
  run:     (body) => api.post('/import/run', body).then(r => r.data),
};

export const sitesApi = {
  list:   ()             => api.get('/sites').then(r => r.data),
  get:    (site)         => api.get(`/sites/${site}`).then(r => r.data),
  update: (site, data)   => api.put(`/sites/${site}`, data).then(r => r.data),
  remove: (site)         => api.delete(`/sites/${site}`).then(r => r.data),
  verify: (site, probe_url) => api.post(`/sites/${site}/verify`, { probe_url }).then(r => r.data),
  startOauth:  (site)    => api.post(`/sites/${site}/oauth`).then(r => r.data),
  oauthStatus: (site)    => api.get(`/sites/${site}/oauth`).then(r => r.data),
  cancelOauth: (site)    => api.delete(`/sites/${site}/oauth`).then(r => r.data),
};

export const editApi = {
  info:        (path) => api.get('/edit/info', { params: { path } }).then(r => r.data),
  filmstripUrl: (path, count = 12, height = 56) => `${API_HOST}/api/edit/filmstrip?path=${encodeURIComponent(path)}&count=${count}&height=${height}${tokenParam}`,
  waveformUrl: (path, width = 1200, height = 48) => `${API_HOST}/api/edit/waveform?path=${encodeURIComponent(path)}&width=${width}&height=${height}${tokenParam}`,
  export:      (path, ops) => api.post('/edit/export', { path, ops }).then(r => r.data),
  status:      (id) => api.get(`/edit/export/${id}`).then(r => r.data),
  cancel:      (id) => api.post(`/edit/export/${id}/cancel`).then(r => r.data),
};
