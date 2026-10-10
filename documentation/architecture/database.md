# Base de données — décisions de modélisation (Phase 3)

| Sujet | Choix |
|---|---|
| Identifiants | UUID v7 (`uuid(7)`), triables par date de création |
| Prix inconnu | `Course.priceTnd` nullable → affiché « À définir ». Montants en `Decimal(10,3)` (dinar : 3 décimales), jamais `Float` |
| Informations inconnues | Niveau, durée, dates, capacité de session : nullables. Coordonnées du centre : `SiteSetting` (`status = TODO`) |
| Multilingue | `CourseTranslation` / `CourseCategoryTranslation` : une ligne par langue (FR obligatoire, AR/EN optionnels) |
| Catalogue vs groupe | `Course` = fiche ; `CourseSession` = groupe concret (dates, salle, formateur, capacité) |
| Inscription vs étudiant | `Registration` = demande publique sans compte ; `Enrollment` = étudiant accepté dans une session |
| Suppression douce | `deletedAt` sur `User` et `Course` ; les relations d'historique (paiements, présences) sont en `Restrict` |
| Tokens | `RefreshToken` (famille de rotation) et `PasswordResetToken` : seul le hash est stocké |
| Mot de passe | `User.passwordHash` nullable tant que le compte n'est pas activé ; hash argon2id (Phase 5) |
| Certificats | Uniquement `ATTESTATION` délivrée par le centre ; aucune certification tierce tant que non confirmée |
| Paiements | Une ligne = un versement ; suivi manuel (espèces/virement) au lancement |
| Capacité | Places occupées = `Enrollment` actifs de la session ; calculé dans l'API (Phase 4/9) |

Limites connues : l'unicité de `User.email` s'applique aussi aux comptes supprimés (un e-mail ne peut pas être réutilisé après suppression douce). Règle de non-chevauchement des salles : à appliquer dans le service (pas de contrainte SQL d'exclusion pour l'instant).
