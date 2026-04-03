export function isEmbeddedAppPath(pathname: string): boolean {
  return pathname === '/embedded-apps' || pathname.startsWith('/embedded-apps/')
}
