# API gRPC — contrats et conventions (Phase 4)

Les fichiers `.proto` de `packages/proto/` sont la **source de vérité**. Le code TypeScript (types, définitions de services, clients) est généré dans `packages/proto-gen/src/` (ne jamais l'éditer à la main).

```
packages/proto/<service>/v1/<service>.proto  --buf generate-->  packages/proto-gen/src/<service>/v1/<service>.ts
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm proto:lint` | Vérifie les `.proto` (règles Buf `STANDARD`) |
| `pnpm proto:gen` | Régénère le code TypeScript (aussi lancé par `pnpm install`) |
| `pnpm test` | Tests unitaires (sans base de données) |
| `pnpm test:integration` | Tests d'intégration : vrai serveur gRPC + vrai PostgreSQL (`pnpm db:up` d'abord) |

Les tests d'intégration utilisent une base **dédiée `<nom>_test`** (créée automatiquement, migrations appliquées avec `prisma migrate deploy`). Ils ne touchent jamais à la base de développement.

## Services

69 méthodes sont définies ; **39 sont implémentées** (colonne « État »). Une méthode non implémentée répond `UNIMPLEMENTED` **après** les contrôles d'accès (un anonyme reçoit `UNAUTHENTICATED`, un étudiant `PERMISSION_DENIED` sur une méthode d'administration).

| Service | Méthodes définies | Accès | État |
|---|---|---|---|
| `CourseService` | 17 | Lecture publique ; écriture ADMIN | Lecture implémentée : `ListCategories`, `ListCourses`, `GetCourse`, `ListUpcomingSessions`, `ListFaqs`. Écriture (formations, groupes, FAQ) : Phase 9 |
| `RegistrationService` | 10 | Soumissions publiques ; gestion ADMIN | Implémentées : `SubmitRegistration`, `RequestPfeSupport`, `SubmitContactMessage`. Traitement des demandes : Phase 9 |
| `SiteService` | 2 | Lecture publique ; écriture ADMIN | `GetPublicSettings` implémentée (valeurs `TODO` renvoyées telles quelles) |
| `AuthService` | 9 | Public / authentifié | **Implémenté (Phase 5)** : `Register`, `ActivateAccount`, `Login`, `Logout`, `RefreshToken`, `ForgotPassword`, `ResetPassword`, `ChangePassword`, `GetMe`. Voir `documentation/architecture/auth.md` |
| `UserService` | 2 | Authentifié | **Implémenté (Phase 7)** : `GetProfile` (avec téléphone), `UpdateProfile` (nom, langue, téléphone ; e-mail et rôle jamais modifiables) |
| `StudentService` | 8 | STUDENT | **Implémenté (Phase 7)** : `GetDashboard`, `ListMyEnrollments`, `ListMySchedule`, `ListMyProjects`, `UpdateMyProject`, `ListMyCertificates`, `ListMyRegistrations`, `ListMyPayments` (ajout Phase 7, lecture seule). Voir `documentation/architecture/student.md` |
| `TrainerService` | 7 | TRAINER | **Implémenté (Phase 8)** : `ListMySessions`, `ListSessionStudents`, `ListSessionSchedule`, `GetEventAttendance` (ajout Phase 8), `MarkAttendance`, `ListSessionProjects`, `ReviewProject`. Voir `documentation/architecture/trainer.md` |
| `PaymentService` | 4 | ADMIN | Phase 9 |
| `NotificationService` | 4 | Authentifié | **Implémenté (Phase 7)** : `ListMyNotifications`, `CountMyUnread`, `MarkNotificationRead`, `MarkAllNotificationsRead`. La création des notifications arrive avec les actions admin/formateur (Phases 8-9) |
| `AdminService` | 6 | ADMIN | Phase 9 |

`SiteService` est un ajout par rapport à la Phase 1 : les coordonnées du centre (téléphone, e-mail, adresse...) doivent être lisibles publiquement sans passer par un service d'administration.

## Chaîne de traitement d'un appel

Chaque méthode est créée avec `unary(...)` (`apps/api/src/grpc/handler.ts`) :

1. identifiant de requête (`x-request-id`, généré si absent ou invalide) ;
2. limitation de débit par IP et par méthode ;
3. authentification (JWT d'accès, rôle et statut relus en base) ;
4. autorisation (RBAC) selon `apps/api/src/grpc/policies.ts` ;
5. validation Zod (schémas partagés dans `@center/shared`) puis logique métier ;
6. conversion des erreurs en erreurs gRPC sans fuite d'information interne.

**Impossible d'oublier un endpoint** : `policies.ts` exige une politique d'accès pour *chaque* méthode des `.proto`. Si on ajoute une méthode sans politique, TypeScript refuse de compiler.

## Erreurs

Le message d'erreur est un **code stable** (jamais de texte technique ni de donnée personnelle) que l'interface traduit.

| Code gRPC | Message | Cas |
|---|---|---|
| `INVALID_ARGUMENT` | `validation_failed` | Données invalides. Détail par champ dans le metadata `x-validation-errors` : `[{"field":"email","code":"invalid_email"}]` |
| `NOT_FOUND` | `course_not_found`, `not_found` | Ressource absente (ou formation non publiée) |
| `ALREADY_EXISTS` | `registration_already_exists` | Demande active identique (même e-mail + formation) |
| `FAILED_PRECONDITION` | `session_closed`, `project_locked`, `enrollment_not_active`, `event_not_started`, `project_not_reviewable` | Session terminée ou annulée ; projet rendu/validé ; inscription terminée |
| `UNAUTHENTICATED` | `unauthenticated`, `invalid_credentials` | Pas connecté ou jeton invalide/expiré (le BFF doit rafraîchir) ; identifiants faux |
| `PERMISSION_DENIED` | `permission_denied` | Rôle insuffisant |
| `UNIMPLEMENTED` | `not_implemented` | Méthode définie mais pas encore implémentée |
| `RESOURCE_EXHAUSTED` | `rate_limited` | Trop de requêtes ; metadata `retry-after` (secondes) |
| `INTERNAL` | `internal_error` | Erreur inattendue ; détails uniquement dans les logs, corrélés par `x-request-id` |

## Metadata

| Clé | Sens | Direction |
|---|---|---|
| `x-request-id` | Corrélation des logs (renvoyé aussi en trailer) | client ↔ serveur |
| `authorization` | `Bearer <jeton d'accès>` | client → serveur |
| `x-client-ip` | IP du visiteur final, transmise par le serveur Next.js (BFF) pour la limitation de débit | client → serveur |
| `x-validation-errors` | Erreurs par champ (JSON) | serveur → client |
| `retry-after` | Délai avant nouvel essai | serveur → client |

`x-client-ip` n'est digne de confiance que parce que le port gRPC **n'est jamais exposé publiquement** (réseau interne uniquement).

## Limites de débit (par IP et par méthode)

| Classe | Limite | Usage |
|---|---|---|
| `read` | 120 / minute | Catalogue, paramètres, FAQ |
| `submit` | 10 / 10 minutes | Inscription, PFE, contact (plusieurs étudiants peuvent partager l'IP du centre) |
| `auth` | 30 / 5 minutes | Méthodes d'authentification (le brute force d'un compte est limité à part : 5 échecs / 15 min par e-mail + IP) |
| `default` | 300 / minute | Méthodes authentifiées |

Stockage en mémoire : suffisant pour une seule instance d'API. Passer à Redis si l'API est dupliquée.

## Règles métier de l'inscription

- Seules les formations **publiées** acceptent des demandes.
- Un même e-mail (casse ignorée) ne peut avoir qu'**une demande active** par formation (`PENDING`, `ACCEPTED`, `WAITLIST`). Garanti sous concurrence par un verrou transactionnel PostgreSQL (vérifié : 20 envois simultanés identiques → 1 inscription).
- Si une session est choisie et qu'elle est complète (ou marquée `FULL`), la demande passe en `WAITLIST`.
- La date de consentement est fixée **par le serveur**.
- Une notification est créée pour les administrateurs, sans donnée personnelle dans son contenu.
- TODO (Phase 12) : e-mail à l'administration et e-mail de confirmation au candidat.
- TODO (juridique) : politique de consentement parental pour les mineurs (bornes d'âge actuelles : 10–100, simple contrôle de cohérence).

## Ajouter une méthode

1. Ajouter la méthode et ses messages dans le `.proto` (une requête `XxxRequest` et une réponse `XxxResponse` par méthode, imposé par Buf).
2. `pnpm proto:lint && pnpm proto:gen`.
3. Déclarer sa politique d'accès dans `apps/api/src/grpc/policies.ts` (TypeScript l'impose).
4. L'implémenter dans `apps/api/src/modules/<module>/` avec `unary(Service.methode, async (req, ctx) => ...)`.
5. Écrire le test d'intégration correspondant.
