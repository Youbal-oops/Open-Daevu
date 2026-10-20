import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
import react from '@vitejs/plugin-react';
export default defineConfig({ base: './', define: { __APP_VERSION__: JSON.stringify(version) }, plugins: [react()], server: { port: 5173, strictPort: true, watch: { ignored: ['**/.test-data/**'] } }, build: { rollupOptions: { output: { manualChunks: { canvas: ['@xyflow/react'], markdown: ['react-markdown'] } } } } });
