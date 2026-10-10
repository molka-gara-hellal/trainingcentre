/**
 * Content-Security-Policy stricte, générée à CHAQUE requête avec un nonce aléatoire.
 *
 * - Scripts : uniquement 'self' + ceux portant le nonce (`strict-dynamic` laisse ces scripts en charger d'autres,
 *   sans autoriser le moindre script en ligne injecté).
 * - Styles : feuilles 'self' / nonce. Les attributs `style="..."` (ex. largeur d'une barre de progression) sont
 *   autorisés SEUL via `style-src-attr` : ils ne permettent pas d'exécuter du code.
 * - Aucun objet/plugin, aucune iframe, formulaires uniquement vers ce site, pas de <base> détourné.
 */
export function buildCsp(nonce: string, options: { isDev?: boolean; upgradeInsecure?: boolean } = {}): string {
  const { isDev = false, upgradeInsecure = false } = options;
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    // React en développement a besoin d'eval (reconstruction des piles d'appel) ; jamais en production.
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-inline'"] : [])]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(isDev ? ["ws:", "wss:"] : [])]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (upgradeInsecure) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Nonce de 128 bits, base64 (Web Crypto : disponible dans le proxy Edge comme dans Node). */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
