"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { CourseLevel, Locale as ProtoLocale } from "@center/proto-gen/common/v1/common";
import { CourseStatus, SessionStatus } from "@center/proto-gen/course/v1/course";
import { EnrollmentStatus } from "@center/proto-gen/learning/v1/learning";
import { PaymentMethod, PaymentStatus } from "@center/proto-gen/payment/v1/payment";
import { InboxStatus, RegistrationDecision } from "@center/proto-gen/registration/v1/registration";
import { SettingStatus } from "@center/proto-gen/site/v1/site";
import { UserStatus } from "@center/proto-gen/user/v1/user";
import { clients, rpc, type CallContext } from "@/lib/grpc/client";
import { withFreshAccess } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { redirect } from "@/i18n/navigation";
import { parseProgram, tunisDateTime } from "@/lib/admin-parse";
import { apiFailure, text } from "./helpers";

const sessionExpired = (): FormState => ({ status: "error", code: "unauthenticated", values: {} });

/**
 * Exécute un appel d'administration. Les erreurs de validation de l'API reviennent sous forme de codes ;
 * `mapErrors` permet de renommer un champ d'API vers le champ du formulaire.
 */
async function run(
  data: FormData,
  call: (ctx: CallContext) => Promise<void>,
  options: { code?: string; mapField?: (field: string) => string } = {},
): Promise<FormState> {
  const ctx = await withFreshAccess();
  if (!ctx) return sessionExpired();
  try {
    await call(ctx);
  } catch (err) {
    const failure = apiFailure(err, data);
    if (failure.status === "error" && failure.fieldErrors && options.mapField) {
      failure.fieldErrors = Object.fromEntries(Object.entries(failure.fieldErrors).map(([k, v]) => [options.mapField!(k), v]));
    }
    return failure;
  }
  revalidatePath("/", "layout");
  return { status: "success", code: options.code };
}

const opt = (data: FormData, name: string): string | undefined => {
  const value = text(data, name).trim();
  return value === "" ? undefined : value;
};
const int = (data: FormData, name: string): number | undefined => {
  const value = opt(data, name);
  if (value === undefined) return undefined;
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN; // NaN → refusé par l'API (invalid_number)
};
const lines = (data: FormData, name: string): string[] =>
  text(data, name).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const pick = <T extends string>(data: FormData, name: string, prefix: string, allowed: readonly string[]): T | undefined => {
  const value = text(data, name);
  return allowed.includes(value) ? (`${prefix}${value}` as T) : undefined;
};

// ---- Formations ---------------------------------------------------------------------------------

const LOCALES = ["FR", "AR", "EN"] as const;
const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export async function saveCourseAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const id = opt(data, "id");
  // Le français est toujours envoyé ; AR et EN seulement si un contenu a été saisi.
  const sent = LOCALES.filter((l) => l === "FR" || ["title", "summary", "description", "objectives", "prerequisites", "skills", "finalProject", "program"].some((f) => text(data, `${f}_${l}`).trim() !== ""));
  const body = {
    slug: text(data, "slug").trim().toLowerCase(),
    categoryId: text(data, "categoryId"),
    level: pick<CourseLevel>(data, "level", "COURSE_LEVEL_", LEVELS),
    durationHours: int(data, "durationHours"),
    sessionsCount: int(data, "sessionsCount"),
    priceTnd: opt(data, "priceTnd"),
    translations: sent.map((l) => ({
      locale: l === "FR" ? ProtoLocale.LOCALE_FR : l === "AR" ? ProtoLocale.LOCALE_AR : ProtoLocale.LOCALE_EN,
      title: text(data, `title_${l}`).trim(),
      summary: opt(data, `summary_${l}`),
      description: opt(data, `description_${l}`),
      objectives: lines(data, `objectives_${l}`),
      prerequisites: lines(data, `prerequisites_${l}`),
      skills: lines(data, `skills_${l}`),
      finalProject: opt(data, `finalProject_${l}`),
      program: parseProgram(text(data, `program_${l}`)),
    })),
  };
  // « translations.1.title » (API) → « title_AR » (formulaire).
  const mapField = (field: string) => {
    const m = /^translations\.(\d+)\.(\w+)$/.exec(field);
    const l = m ? sent[Number(m[1])] : undefined;
    return m && l ? `${m[2]}_${l}` : field;
  };
  let createdId: string | undefined;
  const state = await run(
    data,
    async (ctx) => {
      if (id) {
        await rpc(ctx, (md, o, cb) => clients().course.updateCourse({ id, ...body }, md, o, cb));
      } else {
        const res = await rpc<{ course?: { id: string } }>(ctx, (md, o, cb) => clients().course.createCourse(body, md, o, cb));
        createdId = res.course?.id;
      }
    },
    { code: "saved", mapField },
  );
  if (createdId) redirect({ href: `/espace/admin/formations/${createdId}`, locale });
  return state;
}

export async function courseStatusAction(_prev: FormState, data: FormData): Promise<FormState> {
  const status = pick<CourseStatus>(data, "status", "COURSE_STATUS_", ["DRAFT", "PUBLISHED", "DISABLED"]);
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.setCourseStatus({ id: text(data, "id"), status: status ?? CourseStatus.COURSE_STATUS_UNSPECIFIED }, md, o, cb));
  });
}

export async function deleteCourseAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const state = await run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.deleteCourse({ id: text(data, "id") }, md, o, cb));
  });
  if (state.status === "success") redirect({ href: "/espace/admin/formations", locale });
  return state;
}

// ---- Sessions et planning -----------------------------------------------------------------------

export async function saveSessionAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const id = opt(data, "id");
  const session = {
    courseId: text(data, "courseId"),
    trainerId: opt(data, "trainerId"),
    roomId: opt(data, "roomId"),
    label: opt(data, "label"),
    startDate: opt(data, "startDate"),
    endDate: opt(data, "endDate"),
    scheduleNote: opt(data, "scheduleNote"),
    capacity: int(data, "capacity"),
  };
  let createdId: string | undefined;
  const state = await run(
    data,
    async (ctx) => {
      if (id) {
        await rpc(ctx, (md, o, cb) => clients().course.updateSession({ id, session }, md, o, cb));
      } else {
        const res = await rpc<{ session?: { id: string } }>(ctx, (md, o, cb) => clients().course.createSession({ session }, md, o, cb));
        createdId = res.session?.id;
      }
    },
    { code: "saved" },
  );
  if (createdId) redirect({ href: `/espace/admin/sessions/${createdId}`, locale });
  return state;
}

export async function sessionStatusAction(_prev: FormState, data: FormData): Promise<FormState> {
  const status = pick<SessionStatus>(data, "status", "SESSION_STATUS_", ["PLANNED", "OPEN", "FULL", "ONGOING", "COMPLETED", "CANCELLED"]);
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.setSessionStatus({ id: text(data, "id"), status: status ?? SessionStatus.SESSION_STATUS_UNSPECIFIED }, md, o, cb));
  });
}

export async function addEventAction(_prev: FormState, data: FormData): Promise<FormState> {
  const startsAt = tunisDateTime(text(data, "startsAt"));
  const endsAt = tunisDateTime(text(data, "endsAt"));
  if (!startsAt || !endsAt) {
    return { status: "error", fieldErrors: { ...(startsAt ? {} : { startsAt: "required" }), ...(endsAt ? {} : { endsAt: "required" }) }, values: {} };
  }
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.addScheduleEvent({ sessionId: text(data, "sessionId"), startsAt, endsAt }, md, o, cb));
  }, { code: "added", mapField: (f) => f });
}

export async function deleteEventAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.deleteScheduleEvent({ id: text(data, "id") }, md, o, cb));
  });
}

// ---- Demandes, messages --------------------------------------------------------------------------

export async function decideRegistrationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const decision = pick<RegistrationDecision>(data, "decision", "REGISTRATION_DECISION_", ["ACCEPT", "REJECT", "WAITLIST"]);
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().registration.decideRegistration(
        { id: text(data, "id"), decision: decision ?? RegistrationDecision.REGISTRATION_DECISION_UNSPECIFIED, sessionId: opt(data, "sessionId"), adminNote: opt(data, "adminNote"), locale: ProtoLocale.LOCALE_UNSPECIFIED },
        md, o, cb,
      ),
    );
  }, { code: "decided" });
}

export async function inboxStatusAction(_prev: FormState, data: FormData): Promise<FormState> {
  const status = pick<InboxStatus>(data, "status", "INBOX_STATUS_", ["NEW", "IN_REVIEW", "CLOSED"]) ?? InboxStatus.INBOX_STATUS_UNSPECIFIED;
  const id = text(data, "id");
  return run(data, async (ctx) => {
    if (text(data, "kind") === "pfe") await rpc(ctx, (md, o, cb) => clients().registration.setPfeRequestStatus({ id, status }, md, o, cb));
    else await rpc(ctx, (md, o, cb) => clients().registration.setContactMessageStatus({ id, status }, md, o, cb));
  });
}

// ---- Paiements -----------------------------------------------------------------------------------

const PAY_STATUSES = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"] as const;
const PAY_METHODS = ["CASH", "BANK_TRANSFER", "OTHER"] as const;

export async function recordPaymentAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().payment.recordPayment(
        {
          enrollmentId: text(data, "enrollmentId"),
          amount: text(data, "amount").trim().replace(",", "."),
          status: pick<PaymentStatus>(data, "status", "PAYMENT_STATUS_", PAY_STATUSES) ?? PaymentStatus.PAYMENT_STATUS_UNSPECIFIED,
          method: pick<PaymentMethod>(data, "method", "PAYMENT_METHOD_", PAY_METHODS),
          reference: opt(data, "reference"),
          note: opt(data, "note"),
          paidAt: undefined,
        },
        md, o, cb,
      ),
    );
  }, { code: "recorded" });
}

export async function updatePaymentAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().payment.updatePaymentStatus(
        {
          id: text(data, "id"),
          status: pick<PaymentStatus>(data, "status", "PAYMENT_STATUS_", PAY_STATUSES) ?? PaymentStatus.PAYMENT_STATUS_UNSPECIFIED,
          method: pick<PaymentMethod>(data, "method", "PAYMENT_METHOD_", PAY_METHODS),
          note: opt(data, "note"),
        },
        md, o, cb,
      ),
    );
  });
}

// ---- Étudiants, formateurs, inscriptions ---------------------------------------------------------

export async function studentStatusAction(_prev: FormState, data: FormData): Promise<FormState> {
  const status = pick<UserStatus>(data, "status", "USER_STATUS_", ["ACTIVE", "SUSPENDED"]) ?? UserStatus.USER_STATUS_UNSPECIFIED;
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().admin.setStudentStatus({ userId: text(data, "userId"), status }, md, o, cb));
  });
}

const trainerFields = (data: FormData) => ({
  firstName: text(data, "firstName").trim(),
  lastName: text(data, "lastName").trim(),
  bio: opt(data, "bio"),
  specialties: text(data, "specialties").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
});

export async function createTrainerAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().admin.createTrainer({ email: text(data, "email").trim(), ...trainerFields(data) }, md, o, cb));
  }, { code: "created" });
}

export async function updateTrainerAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().admin.updateTrainer({ id: text(data, "id"), ...trainerFields(data) }, md, o, cb));
  }, { code: "saved" });
}

export async function updateEnrollmentAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().admin.updateEnrollment(
        {
          id: text(data, "id"),
          status: pick<EnrollmentStatus>(data, "status", "ENROLLMENT_STATUS_", ["ACTIVE", "COMPLETED", "DROPPED"]),
          progressPct: int(data, "progressPct"),
        },
        md, o, cb,
      ),
    );
  }, { code: "saved" });
}

export async function createProjectAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().admin.createProject({ enrollmentId: text(data, "enrollmentId"), title: text(data, "title").trim(), description: opt(data, "description") }, md, o, cb),
    );
  }, { code: "created" });
}

export async function issueCertificateAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().admin.issueCertificate({ enrollmentId: text(data, "enrollmentId") }, md, o, cb));
  }, { code: "issued" });
}

// ---- Paramètres et FAQ ---------------------------------------------------------------------------

export async function saveSettingAction(_prev: FormState, data: FormData): Promise<FormState> {
  const value = text(data, "value").trim();
  // Case « À définir » cochée, ou valeur vide : la valeur reste officiellement non définie.
  const todo = text(data, "todo") === "on" || value === "";
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().site.updateSetting({ key: text(data, "key"), value: todo ? "TODO" : value, status: todo ? SettingStatus.SETTING_STATUS_TODO : SettingStatus.SETTING_STATUS_SET }, md, o, cb),
    );
  }, { code: "saved" });
}

export async function saveFaqAction(_prev: FormState, data: FormData): Promise<FormState> {
  const l = text(data, "locale");
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) =>
      clients().course.upsertFaq(
        {
          id: opt(data, "id"),
          locale: l === "AR" ? ProtoLocale.LOCALE_AR : l === "EN" ? ProtoLocale.LOCALE_EN : ProtoLocale.LOCALE_FR,
          question: text(data, "question").trim(),
          answer: text(data, "answer").trim(),
          sortOrder: int(data, "sortOrder") ?? 0,
          published: text(data, "published") === "yes",
        },
        md, o, cb,
      ),
    );
  }, { code: "saved" });
}

export async function deleteFaqAction(_prev: FormState, data: FormData): Promise<FormState> {
  return run(data, async (ctx) => {
    await rpc(ctx, (md, o, cb) => clients().course.deleteFaq({ id: text(data, "id") }, md, o, cb));
  });
}
