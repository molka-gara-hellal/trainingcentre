# Docker (Phase 11)

## Architecture

| Service | Image / cible | Réseaux | Port |
|---|---|---|---|
| `db` | `postgres:17-alpine` | backend | aucun port publié |
| `migrate` | `docker/api.Dockerfile` cible `migrate` (one-shot : `prisma migrate deploy`) | backend, edge (sortie seule) | — |
| `api` | `docker/api.Dockerfile` cible `runtime` (bundle tsup + dépendances de production) | backend | 50051 **interne uniquement** |
| `web` | `docker/web.Dockerfile` (Next.js `standalone`) | backend, edge | `127.0.0.1:3000` |
| `admin` (profil `tools`) | image `migrate` | backend | — |

- `backend` est un réseau **interne** : ni accès entrant ni sortant. Le port gRPC n'est jamais publié.
- Ordre de démarrage : `db` sain → `migrate` terminé avec succès → `api` sain → `web`.
- Durcissement des conteneurs `api` et `web` : utilisateur non root, système de fichiers en lecture seule (+ `tmpfs`), `cap_drop: ALL`, `no-new-privileges`, init `tini`, logs limités (10 Mo × 5).
- Healthchecks : API = connexion TCP au port gRPC ; web = `GET /api/health` (sans dépendance à l'API).

## Mise en route

```bash
cp .env.production.example .env.production   # puis renseigner les valeurs OBLIGATOIRES
pnpm docker:up                               # build + démarrage
pnpm docker:admin                            # crée le premier administrateur (saisie interactive)
pnpm docker:logs
```

`POSTGRES_PASSWORD` : lettres, chiffres, `-` et `_` uniquement (il est inséré dans `DATABASE_URL` ; `@ : / # %` provoquent l'erreur Prisma P1013). Si le mot de passe change après le premier démarrage : `docker compose … down -v` (efface la base Docker).

Variables obligatoires : `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` (≥ 32 caractères), `SITE_URL`. Compose refuse de démarrer si elles manquent.

## Développement et production côte à côte

`docker-compose.dev.yml` (projet `training-center-dev`, base `center-db` sur le port 15433) et `docker-compose.prod.yml` (projet `training-center`) ont des noms de projet, des volumes et des conteneurs distincts : ils ne se partagent rien. Ne jamais retirer `name:` de l'un des deux fichiers.

## Points d'attention

1. **Migrations** : le dossier `apps/api/prisma/migrations` doit être **commité** (il est généré par `pnpm db:migrate`). Le build de l'image `migrate` échoue explicitement s'il est absent.
2. **`SITE_URL`** est figée dans l'image web au build (`NEXT_PUBLIC_SITE_URL` : CSP, liens, SEO). Changer de domaine = reconstruire (`pnpm docker:up`).
3. **`TRUSTED_PROXY_HOPS`** : 0 sans reverse proxy ; 1 derrière un proxy qui écrase `X-Forwarded-For`. À régler en Phase 12 avec le proxy HTTPS.
4. **E-mails** : `EMAIL_PROVIDER=none` tant que le SMTP n'est pas branché (Phase 12) ; aucun lien d'activation n'est envoyé. Les comptes se créent avec `pnpm docker:admin`.
5. **HTTPS** : le conteneur web écoute en HTTP sur 127.0.0.1 ; le TLS est terminé par le reverse proxy (Phase 12).
6. **Sauvegardes** : les données sont dans le volume `center_db_data`. Exemple : `docker compose --env-file .env.production -f docker-compose.prod.yml exec db pg_dump -U center center > sauvegarde.sql`.

## Vérifications effectuées

Le sandbox de développement n'a pas de démon Docker : les images n'ont pas pu être construites ici. Chaque étape a été rejouée hors Docker : `compose config` valide ; `pnpm deploy --prod --ignore-scripts` + démarrage de l'API avec les seules dépendances de production (connexion PostgreSQL, écoute gRPC, sonde TCP, argon2 natif) ; build `standalone` du web + démarrage (`/api/health` 200, CSP avec nonce, `upgrade-insecure-requests` en https, fichiers statiques servis). **Premier `pnpm docker:up` à faire sur votre machine** ; en cas d'erreur de build, envoyez-moi la sortie.
