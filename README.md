# Centre de formation informatique — Monastir

Nom du projet : **TODO**. Plateforme web (site public, espaces étudiant/formateur, administration).
Documentation complète : Phase 12.

## Prérequis
- Node.js >= 22.12 (24 LTS recommandé, voir `.nvmrc`)
- pnpm 10 (`npm i -g pnpm@10.34.6`)

## Démarrage local
```bash
pnpm install
cp .env.example .env            # puis compléter si besoin (voir "Base de données")
pnpm db:up                      # PostgreSQL via Docker (Docker Desktop requis)
pnpm db:migrate                 # crée les tables (1ère fois : nommer la migration "init")
pnpm db:seed                    # paramètres du site (TODO), catégories, formations en brouillon, 2 salles
pnpm --filter @center/api dev   # gRPC sur :50051
pnpm --filter @center/web dev   # site sur http://localhost:3000
```

## Commandes
| Commande | Rôle |
|---|---|
| `pnpm build` | Build web + api |
| `pnpm typecheck` | Vérification TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests unitaires |
| `pnpm test:integration` | Tests d'intégration gRPC + PostgreSQL (`pnpm db:up` d'abord) |
| `pnpm proto:lint` / `pnpm proto:gen` | Vérifie / régénère les contrats gRPC |

## Structure
`apps/web` (Next.js, BFF) · `apps/api` (serveur gRPC) · `packages/shared` · `packages/config` · `packages/proto` (contrats gRPC) · `packages/proto-gen` (code généré) · `documentation/`

## Règle : aucune donnée inventée
Toute information non confirmée vaut `TODO` / « À définir » (voir `packages/shared/src/placeholders.ts`).

## Base de données (Phase 3)
PostgreSQL 17 (Docker, port hôte **15433** (configurable via `POSTGRES_PORT`)) + Prisma 7.10 avec l'adapter `pg`.

| Commande | Rôle |
|---|---|
| `pnpm db:up` / `pnpm db:down` | Démarre / arrête PostgreSQL (les données sont conservées) |
| `pnpm db:generate` | Génère le client Prisma (fait aussi automatiquement par `pnpm install`) |
| `pnpm db:migrate` | Crée/applique les migrations en dev (`prisma migrate dev`) |
| `pnpm db:seed` | Seed idempotent : ne réécrit jamais les modifications faites depuis l'admin |
| `pnpm db:studio` | Interface graphique de la base |

- Schéma : `apps/api/prisma/schema.prisma` · Config : `apps/api/prisma.config.ts`
- Le client généré (`apps/api/src/generated/`) n'est pas versionné.
- Prix, niveau, durée, dates, capacité inconnus = colonnes **nullables** ("À définir"). Coordonnées du centre = table `SiteSetting` (statut `TODO`).

## gRPC (Phase 4)
Les contrats sont dans `packages/proto/` (Protocol Buffers, vérifiés avec Buf) ; le code TypeScript est généré dans `packages/proto-gen/` à chaque `pnpm install` (ou `pnpm proto:gen`).
Le navigateur ne parle jamais gRPC : le serveur Next.js (BFF) appelle l'API en gRPC.

- 78 méthodes définies, **toutes implémentées** : catalogue, paramètres, inscription, PFE, contact, **authentification** (Phase 5), **espace étudiant, profil et notifications** (Phase 7), **espace formateur** (Phase 8), **administration** (Phase 9). Le filet de sécurité `UNIMPLEMENTED` (après les contrôles d'accès) reste en place pour toute future méthode ajoutée au contrat.
- RBAC, limitation de débit, validation et erreurs sans fuite d'information sont appliqués à toutes les méthodes.
- Détails, conventions d'erreurs et règles métier : [`documentation/api/grpc.md`](documentation/api/grpc.md).

## Authentification (Phase 5)
argon2id, JWT d'accès de 15 min, refresh tokens à usage unique avec détection de rejeu, anti-énumération de comptes, limitation des tentatives. Détails : [`documentation/architecture/auth.md`](documentation/architecture/auth.md).

**Configuration obligatoire** : l'API refuse de démarrer sans `JWT_ACCESS_SECRET` (>= 32 caractères). Pour en générer un :
```bash
node -p "require('crypto').randomBytes(48).toString('base64url')"
```
Puis l'ajouter dans `.env` (voir `.env.example`). Ne jamais le committer.

**Premier administrateur** (aucun compte par défaut n'existe) :
```bash
pnpm admin:create
```
En développement, `EMAIL_PROVIDER=console` (défaut) affiche les liens d'activation / de réinitialisation dans les logs de l'API. En production, aucun e-mail ne part tant que le SMTP n'est pas configuré (Phase 12).

## Site public (Phase 6)
Next.js (App Router), Tailwind, `next-intl` (FR / AR avec RTL / EN). Le serveur Next.js est le **BFF** : il appelle l'API en gRPC, le navigateur ne voit jamais gRPC ni les jetons (cookies `httpOnly`).

| Page | Chemin |
|---|---|
| Accueil, catalogue, détail d'une formation | `/fr`, `/fr/formations`, `/fr/formations/<slug>` |
| Demande d'inscription, PFE, à propos, contact | `/fr/inscription`, `/fr/pfe`, `/fr/a-propos`, `/fr/contact` |
| Mentions légales, confidentialité (provisoires) | `/fr/mentions-legales`, `/fr/confidentialite` |
| Compte | `/fr/connexion`, `/fr/creer-un-compte`, `/fr/mot-de-passe-oublie`, `/fr/reinitialiser`, `/fr/activer-compte`, `/fr/espace` |

- Toute valeur inconnue (prix, durée, téléphone, adresse, horaires…) s'affiche **« À définir »** ; rien n'est inventé.
- Le catalogue n'affiche que les formations **publiées** : après le seed elles sont toutes en brouillon, la page indique donc « aucune formation publiée ».
- Les traductions arabe et anglaise sont à faire relire ; `pnpm test` vérifie que les 3 fichiers de messages ont les mêmes clés.
- Détails (BFF, sessions, SEO, accessibilité) : [`documentation/architecture/web.md`](documentation/architecture/web.md).

## Espace étudiant (Phase 7)
Réservé au rôle `STUDENT` (les autres rôles sont renvoyés vers `/espace`). Toutes les données viennent du jeton : aucune requête ne porte d'identifiant d'utilisateur.

| Page | Chemin |
|---|---|
| Tableau de bord (progression, prochains cours) | `/fr/espace` |
| Formations, planning | `/fr/espace/formations`, `/fr/espace/planning` |
| Projets (brouillon, dépôt HTTPS, rendu) | `/fr/espace/projets` |
| Attestations, mes demandes, paiements (lecture seule) | `/fr/espace/attestations`, `/fr/espace/inscriptions`, `/fr/espace/paiements` |
| Notifications, profil | `/fr/espace/notifications`, `/fr/espace/profil` |

Les projets, paiements, attestations et le planning sont **créés par le formateur / l'administration** (Phases 8-9) : tant que ce n'est pas fait, chaque page affiche un état vide. Détails : [`documentation/architecture/student.md`](documentation/architecture/student.md).

## Espace formateur (Phase 8)
Réservé au rôle `TRAINER`, limité aux **sessions qui lui sont assignées** (une session d'un autre formateur répond « introuvable »).

| Page | Chemin |
|---|---|
| Mes sessions | `/fr/espace` |
| Session : étudiants, emploi du temps | `/fr/espace/sessions/<id>` |
| Appel (présences) d'un cours | `/fr/espace/sessions/<id>/presences/<cours>` |
| Relecture des projets (à corriger / validé, commentaire, note /20) | `/fr/espace/sessions/<id>/projets` |

Une relecture crée une notification pour l'étudiant. Les sessions, cours, inscriptions et projets sont **créés par l'administration** (Phase 9, voir ci-dessous). Détails : [`documentation/architecture/trainer.md`](documentation/architecture/trainer.md).

## Administration (Phase 9)

Accès réservé au rôle `ADMIN` (`/espace` affiche le tableau de bord, menu latéral `/espace/admin/*`) :

| Page | Fonctions |
|---|---|
| Tableau de bord | étudiants, demandes (dont en attente), formations publiées, revenus encaissés, taux de remplissage, formations les plus demandées |
| Formations | création en brouillon, modification FR/AR/EN (FR obligatoire), publication / désactivation, suppression douce (refusée s'il y a des inscrits actifs) |
| Sessions | création / édition, statut, formateur, capacité (jamais sous le nombre d'inscrits), planning des cours (chevauchement refusé), inscrits : progression, statut, projet, attestation unique, paiement |
| Demandes | accepter (crée le compte étudiant + l'inscription + lien d'activation), liste d'attente, refus ; décision unique et atomique |
| Messages | boîte de réception contact et PFE, statut nouveau / en cours / traité |
| Paiements | liste filtrable, modification du statut (espèces / virement, pas de paiement en ligne) |
| Étudiants | recherche, suspension (sessions fermées immédiatement) et réactivation |
| Formateurs | création (lien d'activation envoyé), modification |
| FAQ, Paramètres | contenu multilingue ; une valeur vide s'affiche « À définir » (aucune donnée inventée) |

Chaque action d'écriture est tracée dans `AuditLog` (acteur, action, entité) dans la même transaction. Détails : [`documentation/architecture/admin.md`](documentation/architecture/admin.md).

## Tests et sécurité (Phase 10)

- **CSP à nonce** par requête (`apps/web/src/lib/csp.ts`, `proxy.ts`), HSTS, CORP, anti-clickjacking.
- **Notification du formateur** quand un étudiant rend un projet (type `PROJECT_SUBMITTED`) : alerte sur le tableau de bord, page `/espace/notifications` pour les formateurs, lien vers les projets de la session.
- **Tests web** : `pnpm --filter @center/web test` (messages i18n + Vitest). Total : 42 unitaires API, 128 d'intégration API.
- Audit, modèle de menace et limites : [`documentation/security.md`](documentation/security.md).

> Nouvelle valeur d'énumération : exécuter `pnpm db:migrate` (nom suggéré : `add_project_submitted`), puis `pnpm proto:gen`.

## Docker (Phase 11)

Pile de production : PostgreSQL + migrations + API gRPC (réseau interne, port non publié) + site web (`127.0.0.1:3000`).

```bash
cp .env.production.example .env.production   # renseigner POSTGRES_PASSWORD, JWT_ACCESS_SECRET, SITE_URL
pnpm docker:up && pnpm docker:admin
```

Commiter `apps/api/prisma/migrations` avant de construire. Détails : [`documentation/docker.md`](documentation/docker.md).

## Déploiement et exploitation (Phase 12)

- **HTTPS** automatique (Caddy + Let's Encrypt, profil `https`), `TRUSTED_PROXY_HOPS=1`, gRPC jamais publié.
- **E-mails** par SMTP (`EMAIL_PROVIDER=smtp`) : activation de compte et réinitialisation, FR / AR / EN, texte brut.
- **Sauvegardes** : `scripts/backup.sh` (rotation 14 jours) et `scripts/restore.sh`.
- **CI** GitHub Actions : lint, typecheck, tests unitaires + intégration, build, audit, images Docker.
- Procédure complète et liste de contrôle avant ouverture : [`documentation/deployment.md`](documentation/deployment.md).

## Documentation

| Document | Contenu |
|---|---|
| [`documentation/architecture/`](documentation/architecture) | base de données, authentification, web, espaces étudiant / formateur / administration |
| [`documentation/api/grpc.md`](documentation/api/grpc.md) | contrat gRPC (78 méthodes) |
| [`documentation/security.md`](documentation/security.md) | modèle de menace, CSP, audit, limites |
| [`documentation/docker.md`](documentation/docker.md) | images, réseaux, durcissement |
| [`documentation/deployment.md`](documentation/deployment.md) | mise en production, sauvegardes, CI/CD |

