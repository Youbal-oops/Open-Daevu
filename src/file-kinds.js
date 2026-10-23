export const ext = name => (/\.([^.]+)$/.exec(name || '')?.[1] || '').toLowerCase();
const TEXT = new Set(['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yml', 'yaml', 'toml', 'ini', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh', 'sql', 'csv', 'tsv']);
const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']), AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
export const viewerKind = name => { const e = ext(name); return e === 'pdf' ? 'pdf' : e === 'epub' ? 'epub' : VIDEO.has(e) ? 'video' : AUDIO.has(e) ? 'audio' : TEXT.has(e) && !['csv', 'tsv'].includes(e) ? 'text' : null; };
// Editors that enabled plugins offer for this kind of file.
export const editorsFor = (plugins, name) => plugins.filter(p => p.enabled).flatMap(plugin => (plugin.contributes?.fileEditors || []).filter(e => e.extensions.includes(ext(name))).map(editor => ({ plugin, editor })));
