import type { Context, Next } from 'hono'

export async function securityHeaders(c: Context, next: Next) {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  const path = c.req.path
  if (
    path.startsWith('/api/') ||
    path.startsWith('/share/') ||
    path.startsWith('/admin/') ||
    path === '/health' ||
    path === '/ready' ||
    path === '/live' ||
    path === '/ping'
  ) {
    c.header('Cache-Control', 'no-store')
  }
}

export function getClientIp(c: Context): string | null {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || null
}
