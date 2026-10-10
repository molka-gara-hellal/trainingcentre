# Espace formateur (Phase 8)

## Contrat (gRPC) — `TrainerService` (rôle TRAINER)
`ListMySessions`, `ListSessionStudents`, `ListSessionSchedule`, `GetEventAttendance`, `MarkAttendance`, `ListSessionProjects`, `ReviewProject`.
Ajouts au contrat en Phase 8 : `GetEventAttendance` (relire les présences déjà saisies), `SessionProject` (projet + nom de l'étudiant), champ `locale` dans les requêtes qui renvoient des titres.

## Règles
| Règle | Où |
|---|---|
| Le formateur est déduit du jeton ; aucune requête ne contient d'identifiant de formateur | `trainer.service.ts` (`me()`) |
| Toute donnée est filtrée par `trainerId` ; session, cours ou projet d'un autre formateur → NOT_FOUND (pas d'énumération) | `ownSession`, requêtes `findFirst` |
| Présences : cours déjà commencé uniquement (`event_not_started`) ; inscriptions de CETTE session, non abandonnées ; pas de doublon ; statut obligatoire ; enregistrement atomique (upsert dans une transaction) | `markAttendance` |
| Relecture : seulement un projet **rendu** (SUBMITTED) ou déjà relu (REVIEWED) ; un projet VALIDÉ est définitif (`project_not_reviewable`) ; écriture conditionnelle sur le statut (pas de course avec l'étudiant) | `reviewProject` |
| « À corriger » exige un commentaire ; note sur 20 avec 2 décimales maximum | `reviewProjectInputSchema` |
| Une relecture crée, dans la même transaction, une notification `PROJECT_REVIEWED` pour l'étudiant concerné (et lui seul) | `reviewProject` |
| Les étudiants ayant abandonné n'apparaissent plus dans les listes | `listSessionStudents`, `listSessionProjects` |

## Web
`lib/trainer.ts` (chargements en lecture seule ; NOT_FOUND → 404), `actions/trainer.ts` (appel, relecture), `components/space/{trainer-shell,attendance-form,review-form}.tsx`. Le tableau de bord d'un formateur est servi par `/espace` selon le rôle.

## Limites connues
- Le formateur n'est **pas** notifié quand un étudiant rend un projet : il faudrait un nouveau type de notification (changement de base de données). À faire avec l'administration (Phase 9) ou en Phase 10.
- Le formateur ne peut pas modifier la progression (%) d'un étudiant ; aucun RPC ne le prévoit pour l'instant.
- Aucun formateur n'existe tant que l'administration n'en crée pas (Phase 9, `CreateTrainer`).
- Le profil formateur (nom, langue) n'a pas encore de page dédiée.
