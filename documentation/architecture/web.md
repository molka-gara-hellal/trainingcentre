# Site web (Phase 6)

## Rôle du serveur Next.js (BFF)
```
Navigateur ──HTTPS──▶ Next.js (pages + Server Actions) ──gRPC──▶ API (apps/api) ──▶ PostgreSQL
                      │ cookies httpOnly (jetons)
```
- Le navigateur ne parle **jamais** gRPC et ne voit **jamais** un jeton : `center_at` (accès, expire avec le jeton) et `center_rt` (renouvellement, 14 jours) sont des cookies `httpOnly`, `SameSite=Lax`, `Secure` en https.
- Les formulaires sont des **Server Actions** (contrôle d'origine natif de Next.js contre le CSRF). Chaque action revalide côté serveur avec les schémas Zod de `@center/shared`, puis l'API revalide (double validation).
- Les erreurs renvoyées à l'interface sont des **codes stables** (`invalid_credentials`, `rate_limited`, `course_not_found`…) traduits en FR/AR/EN ; jamais de détail technique.

## Fichiers clés (`apps/web/src`)
| Fichier | Rôle |
|---|---|
| `lib/grpc/client.ts` | clients gRPC (une connexion réutilisée), délai maximum, métadonnées (`x-client-ip`, `x-request-id`, `authorization`) |
| `lib/grpc/errors.ts` | `ApiError` (code stable, erreurs par champ, `retry-after`) |
| `lib/auth/refresh.ts` | renouvellement des jetons **dédoublonné** (un seul appel par jeton, résultat réutilisé 8 s) |
| `lib/auth/session.ts` | utilisateur courant, `withFreshAccess` (Server Actions), `requireUser` |
| `proxy.ts` | 1) renouvelle la session avant le rendu 2) préfixe de langue (next-intl) |
| `lib/data.ts` | lecture du catalogue / paramètres, avec repli si l'API est indisponible |
| `actions/*.ts` | Server Actions (connexion, inscription, contact, PFE…) |
| `lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts` | métadonnées, hreflang, sitemap, JSON-LD |

## Sessions : pourquoi le renouvellement est dans `proxy.ts`
Le refresh token est à usage unique. Pendant le rendu d'une page on **ne peut pas écrire de cookie** : renouveler là ferait perdre le nouveau jeton et l'API verrait un rejeu. Donc :
1. `proxy.ts` (navigations GET) : cookie d'accès absent + cookie de renouvellement présent → renouvellement, nouveaux cookies placés dans la requête en cours (la page les voit) **et** dans la réponse.
2. Plusieurs requêtes simultanées avec le même cookie périmé partagent **un seul** appel (vérifié : 6 requêtes parallèles → 6 × 200, même nouveau jeton).
3. Server Actions : `withFreshAccess()` fait la même chose et réécrit les cookies.
4. Les pages ne font que lire (`getCurrentUser`).

Limite connue : le dédoublonnage est en mémoire d'un processus Next.js. Avec plusieurs instances, la fenêtre de tolérance de 10 s de l'API prend le relais ; au-delà il faudrait un cache partagé (Phase 12 si besoin).

## Adresse IP du visiteur
L'API limite le débit par IP. Le site transmet `x-client-ip` uniquement si `TRUSTED_PROXY_HOPS` > 0, en lisant l'entrée de `X-Forwarded-For` ajoutée par **notre** proxy (les entrées précédentes sont falsifiables). Par défaut (0, développement) l'API voit l'IP du serveur Next.js.
**Phase 12 :** derrière un reverse proxy, mettre `TRUSTED_PROXY_HOPS=1` et ne pas exposer le port gRPC de l'API publiquement (l'API fait confiance à `x-client-ip` si la valeur est une IP valide).

## Données inconnues
`Todo` (« À définir ») s'affiche pour toute valeur absente : durée, tarif, niveau, programme, coordonnées du centre. Le JSON-LD n'inclut que des champs connus (pas de prix, pas de prestataire tant que `PROJECT_NAME` est « À définir »).

## Internationalisation
- Préfixe de langue obligatoire (`/fr`, `/ar`, `/en`) ; `hreflang` + `x-default` sur chaque page.
- Arabe : `dir="rtl"`, propriétés logiques (`ms-`, `ps-`, `start`), pas d'interlettrage serré.
- Chiffres latins dans toutes les langues (dates, prix).
- **AR et EN ont été rédigés sans relecture native : à faire relire avant publication.** `pnpm test` (workspace web) vérifie que `fr/en/ar.json` ont les mêmes clés et variables.

## Accessibilité (WCAG 2.1 AA visé)
Lien d'évitement, un `<h1>` par page, formulaires avec étiquettes + erreurs liées (`aria-describedby`, `aria-invalid`), cibles ≥ 44 px, focus visible, `prefers-reduced-motion` respecté, menu mobile fermable à Échap. Contrôle automatique axe-core (WCAG 2 A/AA) : 0 violation sur les pages principales en FR, AR et EN. Un audit manuel (lecteur d'écran) reste à faire en Phase 10.

## En-têtes de sécurité
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`. Les pages qui reçoivent un jeton dans l'URL (`/activer-compte`, `/reinitialiser`) ajoutent `Referrer-Policy: no-referrer` et `Cache-Control: no-store`, et sont `noindex`. La CSP stricte (nonce) est prévue en Phase 10.

## Pièges anti-robots
Champ caché `website` : s'il est rempli, l'action répond « succès » sans rien enregistrer. Limites de débit côté API (Phase 4/5).

## À valider avant publication
- Textes juridiques (`mentions-legales`, `confidentialite`) : provisoires, à faire valider (loi organique 2004-63).
- Noms des fondatrices affichés sur « À propos » : à confirmer.
- Aucune formation n'est publiée après le seed : elles apparaîtront quand l'administration (Phase 9) les publiera.
