import type { Context, Next } from 'hono'

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export async function securityHeaders(c: Context, next: Next) {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')

  const path = c.req.path
  const dynamicRoute =
    path.startsWith('/api/') ||
    path === '/api' ||
    path.startsWith('/admin/') ||
    path === '/admin' ||
    path === '/health'

  if (dynamicRoute) {
    c.header('Cache-Control', 'no-store')
    c.header('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  } else {
    c.header('Content-Security-Policy', APP_CSP)
  }
}

export function getClientIp(c: Context): string | null {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || null
}
