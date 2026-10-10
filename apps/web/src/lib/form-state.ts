/** État renvoyé par les Server Actions : uniquement des CODES (traduits par l'interface), jamais de texte brut. */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      /** Erreur globale ("invalid_credentials", "rate_limited", "service_unavailable"...). */
      code?: string;
      retryAfterSeconds?: number;
      /** champ → code d'erreur ("required", "invalid_email", "password_too_short"...). */
      fieldErrors?: Record<string, string>;
      /** Valeurs saisies à réafficher (jamais de mot de passe). */
      values?: Record<string, string>;
    }
  | { status: "success"; code?: string };

export const idleState: FormState = { status: "idle" };
