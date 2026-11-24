import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_MODE': JSON.stringify('public') },
  build: { target: 'esnext' },
  plugins: [vue(), {
    name: 'freeze-public-reader-data',
    apply: 'build',
    writeBundle() {
      const dist = path.join(root, 'frontend/dist')
      const result = spawnSync(process.env.AWARDS_PYTHON || 'python', [path.join(root, 'scripts/finalize_static_site.py'), dist], { stdio: 'inherit' })
      if (result.status !== 0) throw new Error('Static reader data generation failed.')
      const reader = spawnSync(process.execPath, [path.join(root, 'frontend/build-fixed-reader.mjs'), dist], { stdio: 'inherit' })
      if (reader.status !== 0) throw new Error('Fixed reader generation failed.')
    },
  }],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
})
