# Déploiement en production (Phase 12)

Cible : un serveur Linux (VPS) avec Docker. **Aucune valeur n'est inventée** : domaine, hébergeur, fournisseur SMTP et adresses sont des `TODO` à définir par les fondatrices.

## 1. Prérequis (TODO : à choisir)

| Élément | État |
|---|---|
| Serveur Linux avec Docker Engine + plugin Compose (≥ 2.24) | TODO : hébergeur |
| Nom de domaine pointant (DNS A/AAAA) vers le serveur | TODO : domaine |
| Fournisseur SMTP (hôte, port, identifiants, adresse expéditrice) | TODO |
| Dépôt GitHub avec `apps/api/prisma/migrations` **commité** | à faire (`git add apps/api/prisma/migrations`) |

Pare-feu du serveur : n'ouvrir que **22 (SSH), 80 et 443**. PostgreSQL (5432) et gRPC (50051) ne sont jamais publiés.

## 2. Première installation

```bash
git clone <URL-du-dépôt> /opt/training-center && cd /opt/training-center
cp .env.production.example .env.production && chmod 600 .env.production
nano .env.production
```

Valeurs à renseigner :

| Variable | Valeur |
|---|---|
| `POSTGRES_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` (lettres, chiffres, `-`, `_`) |
| `JWT_ACCESS_SECRET` | même commande avec `48` |
| `SITE_DOMAIN` | `votre-domaine.tn` (sans `https://`) |
| `SITE_URL` | `https://votre-domaine.tn` |
| `TRUSTED_PROXY_HOPS` | `1` (Caddy devant le site) |
| `EMAIL_PROVIDER`, `SMTP_*`, `EMAIL_FROM` | voir §4 |

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile https up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tools run --rm admin   # premier administrateur
```

`SITE_DOMAIN` est obligatoire avec le profil `https` : s'il est vide, Caddy se rabat sur `localhost` (certificat auto-signé, pas de Let's Encrypt). Caddy obtient le certificat Let's Encrypt au premier accès (le DNS doit déjà pointer vers le serveur). Vérifier : `https://votre-domaine.tn`, `docker compose … ps` (tous `healthy`).

## 3. Pourquoi `TRUSTED_PROXY_HOPS=1`

Le site lit l'IP du visiteur dans `X-Forwarded-For` pour la limitation de débit côté API. Avec **un** proxy de confiance (Caddy, qui remplace l'en-tête reçu), on prend la dernière entrée, ajoutée par Caddy. Sans proxy, laisser `0` : sinon n'importe quel visiteur pourrait falsifier son IP. Cas testés : `apps/web/src/lib/ip.test.ts`.

## 4. E-mails (SMTP)

```
EMAIL_PROVIDER=smtp
SMTP_HOST=<hôte fourni par le prestataire>
SMTP_PORT=587            # STARTTLS (obligatoire, jamais en clair) ; 465 avec SMTP_SECURE=true
SMTP_USER=…  SMTP_PASSWORD=…
EMAIL_FROM=Nom du centre <contact@votre-domaine.tn>
EMAIL_BRAND_NAME=Nom du centre      # TODO : nom du centre (défaut : le domaine)
```

E-mails envoyés (FR / AR / EN selon la langue du compte, **texte brut**, lien à usage unique) : activation de compte (inscription acceptée, nouveau formateur) et réinitialisation du mot de passe. L'API refuse de démarrer si `smtp` est choisi sans `SMTP_HOST` / `EMAIL_FROM`. Les liens ne sont jamais écrits dans les logs. Pour la délivrabilité, configurer SPF / DKIM / DMARC chez le prestataire (TODO).

## 5. Mises à jour et retour arrière

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml --profile https up -d --build
```

Les migrations s'appliquent automatiquement (service `migrate`) avant le démarrage de l'API. **Sauvegarder avant chaque mise à jour** (§6). Retour arrière : `git checkout <ancien-commit>` puis la même commande ; si une migration a modifié le schéma, restaurer la sauvegarde d'avant (§6).

## 6. Sauvegardes

```bash
./scripts/backup.sh                      # ./backups/center-AAAAMMJJ-HHMMSS.dump (format custom, rotation 14 jours)
./scripts/restore.sh backups/center-….dump   # ÉCRASE la base (confirmation « OUI »)
```

Automatiser (cron, tous les jours à 02:30) : `30 2 * * * cd /opt/training-center && ./scripts/backup.sh >> backups/backup.log 2>&1`. **Copier les sauvegardes hors du serveur** (autre machine ou stockage objet) : une sauvegarde sur le même disque ne protège pas d'une panne du serveur. Tester une restauration sur une machine de test avant le lancement. Les sauvegardes contiennent des données personnelles : droits `600`, accès restreint.

## 7. CI/CD (GitHub Actions)

`.github/workflows/ci.yml`, sur chaque push et pull request : lint, typecheck, tests unitaires, tests d'intégration (PostgreSQL de service), build, audit des dépendances de production, build des images Docker (sans publication). Le déploiement reste **manuel** (§5) : volontaire tant que l'hébergeur n'est pas choisi ; un job de déploiement SSH pourra être ajouté ensuite.

## 8. Liste de contrôle avant ouverture au public

- [ ] Domaine, DNS, HTTPS valide (Caddy), pare-feu 22 / 80 / 443 seulement
- [ ] `.env.production` en `chmod 600`, secrets uniques, **jamais committé**
- [ ] `TRUSTED_PROXY_HOPS=1`, `SITE_URL` en `https://`
- [ ] SMTP testé : créer un compte, recevoir le lien d'activation ; tester « mot de passe oublié »
- [ ] Sauvegarde automatique + copie hors serveur + **restauration testée**
- [ ] Premier administrateur créé, mot de passe fort
- [ ] Contenus à renseigner dans l'administration (Paramètres, Formations, FAQ) : toute valeur vide s'affiche « À définir »
- [ ] Textes légaux (mentions légales, confidentialité) relus par les fondatrices ; traductions AR / EN relues par un locuteur natif ; noms des fondatrices sur « À propos » confirmés
- [ ] `docker compose … logs` sans erreur ; `pnpm audit --prod` à jour
