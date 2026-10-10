import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { Locale as ProtoLocale } from "@center/proto-gen/common/v1/common";
import { Role } from "@center/proto-gen/common/v1/common";
import {
  CountMyUnreadRequest,
  ListMyNotificationsRequest,
  type CountMyUnreadResponse,
  type ListMyNotificationsResponse,
} from "@center/proto-gen/notification/v1/notification";
import {
  GetDashboardRequest,
  ListMyCertificatesRequest,
  ListMyEnrollmentsRequest,
  ListMyPaymentsRequest,
  ListMyProjectsRequest,
  ListMyRegistrationsRequest,
  ListMyScheduleRequest,
  type GetDashboardResponse,
  type ListMyCertificatesResponse,
  type ListMyEnrollmentsResponse,
  type ListMyPaymentsResponse,
  type ListMyProjectsResponse,
  type ListMyRegistrationsResponse,
  type ListMyScheduleResponse,
} from "@center/proto-gen/student/v1/student";
import { GetProfileRequest, type GetProfileResponse } from "@center/proto-gen/user/v1/user";
import { ApiError } from "./grpc/errors";
import { clients, rpc } from "./grpc/client";
import { callContext, requireUser } from "./auth/session";
import { protoLocale } from "./data";

/**
 * Chargements de l'espace étudiant. Lecture seule (aucune écriture de cookie pendant le rendu) : le jeton d'accès
 * a déjà été renouvelé par proxy.ts. Session refusée → page de connexion ; rôle incorrect → /espace.
 */
async function guarded<T>(locale: string, path: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isUnauthenticated) redirect(`/${locale}/connexion?next=${encodeURIComponent(path)}`);
      if (err.grpcCode === 7) redirect(`/${locale}/espace`);
    }
    throw err;
  }
}

/** Garde de page : utilisateur connecté ET étudiant. Les autres rôles retournent sur /espace. */
export async function requireStudent(locale: string, path: string) {
  const user = await requireUser(locale, path);
  if (user.role !== Role.ROLE_STUDENT) redirect(`/${locale}/espace`);
  return user;
}

const withToken = () => callContext({ withToken: true });
const loc = (locale: string): ProtoLocale => protoLocale(locale);

export const loadDashboard = cache((locale: string) =>
  guarded(locale, "/espace", async () =>
    rpc<GetDashboardResponse>(await withToken(), (md, o, cb) =>
      clients().student.getDashboard(GetDashboardRequest.fromPartial({ locale: loc(locale) }), md, o, cb),
    ),
  ),
);
export const loadEnrollments = cache((locale: string) =>
  guarded(locale, "/espace/formations", async () =>
    (await rpc<ListMyEnrollmentsResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMyEnrollments(ListMyEnrollmentsRequest.fromPartial({ locale: loc(locale) }), md, o, cb),
    )).enrollments,
  ),
);
export const loadSchedule = (locale: string) =>
  guarded(locale, "/espace/planning", async () =>
    (await rpc<ListMyScheduleResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMySchedule(ListMyScheduleRequest.fromPartial({ locale: loc(locale) }), md, o, cb),
    )).events,
  );
export const loadProjects = (locale: string) =>
  guarded(locale, "/espace/projets", async () =>
    (await rpc<ListMyProjectsResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMyProjects(ListMyProjectsRequest.fromPartial({}), md, o, cb),
    )).projects,
  );
export const loadCertificates = (locale: string) =>
  guarded(locale, "/espace/attestations", async () =>
    (await rpc<ListMyCertificatesResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMyCertificates(ListMyCertificatesRequest.fromPartial({ locale: loc(locale) }), md, o, cb),
    )).certificates,
  );
export const loadRegistrations = (locale: string) =>
  guarded(locale, "/espace/inscriptions", async () =>
    (await rpc<ListMyRegistrationsResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMyRegistrations(ListMyRegistrationsRequest.fromPartial({ locale: loc(locale) }), md, o, cb),
    )).registrations,
  );
export const loadPayments = (locale: string) =>
  guarded(locale, "/espace/paiements", async () =>
    (await rpc<ListMyPaymentsResponse>(await withToken(), (md, o, cb) =>
      clients().student.listMyPayments(ListMyPaymentsRequest.fromPartial({}), md, o, cb),
    )).payments,
  );
export const loadNotifications = (locale: string) =>
  guarded(locale, "/espace/notifications", async () =>
    (await rpc<ListMyNotificationsResponse>(await withToken(), (md, o, cb) =>
      clients().notification.listMyNotifications(ListMyNotificationsRequest.fromPartial({ limit: 50 }), md, o, cb),
    )).notifications,
  );
export const loadProfile = (locale: string) =>
  guarded(locale, "/espace/profil", async () =>
    rpc<GetProfileResponse>(await withToken(), (md, o, cb) =>
      clients().user.getProfile(GetProfileRequest.fromPartial({}), md, o, cb),
    ),
  );

export const loadUnreadCount = cache(async (): Promise<number> => {
  try {
    const res = await rpc<CountMyUnreadResponse>(await withToken(), (md, o, cb) =>
      clients().notification.countMyUnread(CountMyUnreadRequest.fromPartial({}), md, o, cb),
    );
    return res.count;
  } catch (err) {
    if (err instanceof ApiError) return 0; // le badge n'est jamais bloquant
    throw err;
  }
});

/** Métadonnées communes des pages privées (jamais indexées). */
export async function spaceMetadata(locale: string, key: string, path: string) {
  const { getTranslations } = await import("next-intl/server");
  const { buildMetadata } = await import("./seo");
  const t = await getTranslations({ locale, namespace: "Student.nav" });
  return buildMetadata({ locale, path, title: t(key), description: t(key), noindex: true });
}
