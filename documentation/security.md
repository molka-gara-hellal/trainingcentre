# Sécurité (Phase 10)

Document destiné à l'évaluation technique. Chaque point renvoie au code ou à un test.

## 1. Modèle de menace (résumé)

| Menace | Mesure | Où |
|---|---|---|
| Vol / falsification de session | JWT d'accès court (15 min) + refresh token **rotatif**, stocké haché ; cookies `httpOnly`, `SameSite`, `Secure` en production | `apps/api/src/modules/auth`, `apps/web/src/lib/auth/cookies.ts` |
| Élévation de privilèges | RBAC par RPC (table exhaustive `define()`), **rôle et statut relus en base** à chaque appel ; l'identité vient uniquement du JWT, jamais du corps de la requête | `apps/api/src/grpc/policies.ts` |
| IDOR (accès à la ressource d'autrui) | chaque requête est filtrée par l'identité authentifiée (étudiant, formateur de la session) ; tests d'intégration « autre utilisateur → NOT_FOUND / PERMISSION_DENIED » | `apps/api/test/integration/*` |
| Injection SQL | Prisma (requêtes paramétrées) ; verrous consultatifs via `hashtext` sur valeurs maîtrisées | `apps/api/src/modules/*` |
| Entrées malformées | Zod 4 sur toutes les entrées (schémas partagés `packages/shared`) | `parseInput` dans `createUnary` |
| XSS | React échappe par défaut ; **CSP à nonce** + `strict-dynamic`, pas de `unsafe-inline` pour les scripts ; liens sortants filtrés (HTTPS uniquement) | `apps/web/src/lib/csp.ts`, `proxy.ts` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `next.config.ts`, CSP |
| CSRF | cookies `SameSite`, mutations via Server Actions (contrôle d'origine intégré à Next.js) | `apps/web/src/actions` |
| Force brute | limiteur par IP + limiteur d'échecs par e-mail + IP ; argon2id (OWASP : 19 MiB, t=2, p=1) | `rate-limit.ts`, `attempt-limiter.ts`, `password.ts` |
| Abus (spam, formulaires publics) | classes de limites : lecture 120/min, écriture publique 10/10 min, auth 30/5 min | `rate-limit.ts` |
| Fuite d'informations | erreurs mappées en codes stables ; aucun message interne, aucune trace de pile côté client ; énumération de comptes évitée à la connexion | `handler.ts` |
| Traçabilité | `AuditLog` écrit dans la **même transaction** que chaque action d'administration | `apps/api/src/common/audit.ts` |

## 2. Politique de sécurité du contenu (CSP)

Générée par requête dans `proxy.ts` (nonce de 16 octets aléatoires) :

```
default-src 'self'
script-src 'self' 'nonce-…' 'strict-dynamic'      (+ 'unsafe-eval' en développement uniquement)
style-src 'self' 'nonce-…'   style-src-attr 'unsafe-inline'
img-src 'self' data: blob:   font-src 'self'   connect-src 'self'
object-src 'none'   base-uri 'self'   form-action 'self'   frame-ancestors 'none'
upgrade-insecure-requests  (seulement si NEXT_PUBLIC_SITE_URL est en https)
```

Autres en-têtes : `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy: same-origin`, `Strict-Transport-Security` (2 ans, sous-domaines), pas de `X-Powered-By`.

**Vérifié dans un vrai navigateur** : pages publiques FR/AR/EN, connexion et Server Action fonctionnent sous CSP ; un gestionnaire `onerror` injecté dans le DOM est bloqué ; le nonce change à chaque requête.

## 3. Audit des dépendances

`pnpm audit` : 3 alertes, **toutes transitives de la CLI Prisma** (`mysql2`, `deepmerge-ts`), absentes de l'exécution ; `mysql2` est corrigé par un override pnpm, `deepmerge-ts` est ignoré explicitement (`auditConfig.ignoreGhsas`, justification dans `pnpm-workspace.yaml`) (le moteur utilisé est PostgreSQL via `@prisma/adapter-pg`). Aucune alerte sur les dépendances d'exécution de l'API ou du web. Action : surveiller les mises à jour de Prisma ; relancer `pnpm audit` avant chaque déploiement (CI en Phase 12).

## 4. Tests de sécurité

- API : 128 tests d'intégration (RBAC par rôle, IDOR, statut suspendu, rotation / réutilisation de refresh token, limites, audit, concurrence sur places / décisions / attestations) + 42 tests unitaires.
- Web : tests unitaires (CSP, `lib/ip` — IP cliente et sauts de proxy de confiance, analyse des formulaires, liens de notification contre l'injection de chemin).
- E2E navigateur (Playwright) : CSP, flux admin / étudiant / formateur, notification de projet, axe-core WCAG A/AA, RTL arabe, mobile sans défilement horizontal, 0 erreur console.

## 5. Accessibilité (audit manuel + automatique)

Navigation clavier et focus visibles, libellés associés aux champs, `aria-live` pour les erreurs de formulaire, contrastes AA, `dir="rtl"` en arabe, tableaux avec en-têtes. axe-core : 0 violation sur les pages testées (publiques, étudiant, formateur, administration, notifications).

## 6. Limites connues et points à traiter

| Point | Statut |
|---|---|
| `TRUSTED_PROXY_HOPS=1` derrière Caddy | fait : profil `https` de `docker-compose.prod.yml`, voir `deployment.md` §3 |
| Port gRPC (50051) non exposé | fait : réseau Docker interne, jamais publié |
| E-mails (activation, réinitialisation) | fait : SMTP (`EMAIL_PROVIDER=smtp`), texte brut, TLS imposé |
| Secrets via variables d'environnement, jamais committés | fait : `.env.production` ignoré par Git (`chmod 600`) |
| Pas d'e-mail de décision (acceptation / refus) autre que le lien d'activation | accepté pour le PFE |
| Pas de notifications d'administration dans l'interface (compteurs seulement sur le tableau de bord) | accepté |
| Textes légaux provisoires, AR / EN à relire par un natif | à valider par les fondatrices |
| Cache des paramètres du site : 60 s | accepté |
| SPF / DKIM / DMARC du domaine d'expédition | TODO : à configurer chez le prestataire |
