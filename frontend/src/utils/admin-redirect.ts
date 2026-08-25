// The post-login redirect target arrives in the URL query, so it is attacker
// supplied. Accept only in-app admin paths: hash routing is the only reason a
// raw value cannot currently leave the origin, and that is not a guarantee
// worth depending on.
const ADMIN_REDIRECT_PATTERN = /^\/admin(?:[/?#]|$)/

export const ADMIN_HOME = '/admin'

export const safeAdminRedirect = (value: unknown): string => {
  if (typeof value !== 'string') return ADMIN_HOME
  // A scheme-relative or absolute URL must never survive, even when its path
  // happens to start with /admin.
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return ADMIN_HOME
  return ADMIN_REDIRECT_PATTERN.test(value) ? value : ADMIN_HOME
}
