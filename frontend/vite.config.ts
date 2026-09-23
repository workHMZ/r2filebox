import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const WORKER_ORIGIN = 'http://localhost:8787'

/*
 * `wrangler dev` and the Vite dev server sit on different ports, so the browser
 * labels every proxied request with the Vite origin. The Worker's admin routes
 * reject a mismatched Origin as CSRF (worker/src/routes/admin.ts), which makes
 * admin login fail with "Invalid request origin" at :3000 while it works at
 * :8787. Rewriting the header lets the admin console be developed with HMR.
 *
 * `changeOrigin` only rewrites Host, not Origin, which is why this hook exists.
 * It lives in `server`, so it never reaches a build.
 */
const proxyToWorker = {
  target: WORKER_ORIGIN,
  changeOrigin: true,
  configure: (proxy: { on: (event: string, cb: (req: { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void }) => void) => void }) => {
    proxy.on('proxyReq', (proxyReq) => {
      // Only rewrite what the browser actually sent; a same-origin GET has no
      // Origin header and must stay that way.
      if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', WORKER_ORIGIN)
    })
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/admin': proxyToWorker,
      '/api': proxyToWorker,
      '/health': proxyToWorker,
    },
  },
})
