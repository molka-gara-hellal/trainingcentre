# Administration (Phase 9)

## Principes
- **Accès** : toutes les RPC d'administration sont déclarées `admin` dans `apps/api/src/grpc/policies.ts` (refus par défaut). Le rôle est relu en base à chaque appel : une rétrogradation est immédiate.
- **Identité** : l'acteur vient uniquement du JWT (`ctx.auth`), jamais de la requête.
- **Audit** : `common/audit.ts` écrit une ligne `AuditLog` (acteur, action, entité, métadonnées sans donnée sensible) dans la transaction de l'action.
- **Aucune donnée inventée** : prix, durée, niveau, capacité, horaires, bio restent « À définir » tant qu'ils sont vides. Les paramètres du site ont une liste de clés fermée (`SETTING_KEYS`).

## Services (apps/api/src/modules)
| Fichier | RPC |
|---|---|
| `course/course-admin.service.ts` | formations (CRUD, statut), sessions (liste, détail, création, édition, statut), planning (liste, ajout, suppression), FAQ |
| `site/site-admin.ts` | `UpdateSetting` |
| `registration/registration-admin.service.ts` | demandes (liste, détail, décision), PFE, messages de contact |
| `payment/payment.service.ts` | enregistrer / modifier / lister / historique |
| `admin/admin.service.ts` | statistiques, étudiants, formateurs, inscriptions, projets, attestations |

## Règles métier (codes d'erreur stables)
| Code | Cas |
|---|---|
| `slug_already_used` | identifiant d'URL déjà pris |
| `french_required` | traduction française absente (création/édition, ou publication) |
| `course_has_enrollments` | suppression refusée : inscrits actifs |
| `capacity_below_enrollments` | capacité inférieure aux inscrits actifs |
| `event_overlap` / `event_has_attendance` | cours qui se chevauchent / cours déjà appelé |
| `registration_already_decided` | demande déjà traitée (verrou advisory contre les décisions simultanées) |
| `session_full` / `session_closed` | acceptation impossible |
| `email_belongs_to_staff` / `account_unavailable` | e-mail d'un formateur/admin, ou compte suspendu/supprimé |
| `already_enrolled` / `certificate_already_issued` | doublons |
| `email_already_used` | création d'un formateur |

## Décision d'une demande
Acceptation = dans **une transaction** : verrous (`decide|id`, `seats|session`), contrôle capacité, recherche ou création du compte étudiant (`PENDING_ACTIVATION`) + jeton d'activation, création de l'inscription, passage de la session à `FULL` si la dernière place est prise, demande `ACCEPTED`, notification, audit. L'e-mail d'activation est envoyé **après** validation de la transaction.

## Interface (apps/web)
- `/espace/admin/{formations,sessions,demandes,messages,paiements,etudiants,formateurs,faq,parametres}` ; garde `requireAdmin`.
- Formulaires : `components/admin/admin-form.tsx` (action serveur en prop, erreurs par champ via contexte, messages traduits à partir de codes).
- Textes : namespace `Admin` + `Errors.api.*` / `Errors.field.*` (fr/en/ar identiques, vérifié par `scripts/check-messages.mjs`).

## Limites connues
- Pas de RPC de création de salles : `roomId` d'une session existante est conservé mais non éditable.
- Les paramètres du site sont mis en cache 60 s côté site public.
- Pas d'e-mail de décision (acceptation/refus) hors lien d'activation d'un nouveau compte : SMTP en Phase 12 ; l'étudiant est notifié dans son espace.
- Le formateur n'est pas encore notifié quand un étudiant rend un projet (Phase 10).
