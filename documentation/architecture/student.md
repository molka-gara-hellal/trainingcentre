# Espace étudiant (Phase 7)

## Contrat (gRPC)
- `StudentService` (rôle STUDENT) : tableau de bord, inscriptions, planning, projets, attestations, demandes d'inscription, paiements.
- `UserService` (authentifié) : profil. `NotificationService` (authentifié) : liste, compteur, marquer lu.
- Ajouts au contrat en Phase 7 : `ListMyPayments` (lecture seule), champ `locale` dans les requêtes qui renvoient des titres de formation, `phone` dans `GetProfileResponse`.
- La langue des titres vient de la requête (langue de l'interface) ; à défaut, de la langue du profil ; repli sur le français.

## Règles de sécurité
| Règle | Où |
|---|---|
| L'identité vient uniquement du JWT ; aucun identifiant d'utilisateur dans les requêtes | `student.service.ts` (`me()`) |
| Un projet d'un autre étudiant est « introuvable » (NOT_FOUND), pas « interdit » : pas d'énumération | `updateMyProject` |
| Projet modifiable seulement si `NOT_STARTED`, `IN_PROGRESS` ou `REVIEWED` **et** inscription `ACTIVE` | `updateMyProject` |
| Rendu impossible sans lien de dépôt ; lien en HTTPS uniquement, sans identifiants intégrés (refuse `javascript:`, `http:`) | `repoUrlField` (`@center/shared`) |
| Écriture conditionnelle (`updateMany` sur le statut lu) : un changement du formateur entre-temps n'est jamais écrasé | `updateMyProject` |
| `adminNote` (demandes) et `note` (paiements) ne sont **jamais** renvoyées à l'étudiant | `listMyRegistrations`, `listMyPayments` |
| Demandes d'inscription : rattachées au compte **ou** déposées avec l'e-mail du compte (vérifié à l'activation) | `listMyRegistrations` |
| Notifications : l'utilisateur ne voit que les siennes ; l'ADMIN voit aussi celles du rôle ADMIN (état lu partagé, acceptable pour une petite équipe) | `notificationScope` |
| Le profil ne modifie jamais l'e-mail ni le rôle | `updateProfile` |
| Liens de dépôt affichés avec `rel="noopener noreferrer nofollow"` | page projets |

## Web
- `lib/student.ts` : chargements en lecture seule (le renouvellement de session reste dans `proxy.ts` / `withFreshAccess`). Session refusée → `/connexion?next=…` ; rôle incorrect → `/espace`.
- `actions/student.ts` : Server Actions (projet, profil, notifications) ; renvoient des **codes** traduits côté interface.
- `components/space/*` : cadre commun (`StudentShell`), menu (`SpaceNav`, badge de notifications non lues), formulaires.

## Limites connues (à traiter plus tard)
- Aucune notification n'est encore **créée** pour l'étudiant : cela arrive avec les actions du formateur et de l'administration (Phases 8-9). Les pages fonctionnent et affichent un état vide.
- Les attestations s'affichent avec leur code de vérification ; le **document PDF** et la page publique de vérification ne sont pas encore faits.
- Aucune donnée n'existe tant que l'administration n'a pas créé sessions, inscriptions, projets et paiements (Phase 9).
