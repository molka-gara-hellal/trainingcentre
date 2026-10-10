import "server-only";
import { notFound, redirect } from "next/navigation";
import { Role } from "@center/proto-gen/common/v1/common";
import {
  GetEventAttendanceRequest,
  ListMySessionsRequest,
  ListSessionProjectsRequest,
  ListSessionScheduleRequest,
  ListSessionStudentsRequest,
  type GetEventAttendanceResponse,
  type ListMySessionsResponse,
  type ListSessionProjectsResponse,
  type ListSessionScheduleResponse,
  type ListSessionStudentsResponse,
} from "@center/proto-gen/trainer/v1/trainer";
import { ApiError } from "./grpc/errors";
import { clients, rpc } from "./grpc/client";
import { callContext, requireUser } from "./auth/session";
import { protoLocale } from "./data";

/** Garde de page : connecté ET formateur. Les autres rôles retournent sur /espace. */
export async function requireTrainer(locale: string, path: string) {
  const user = await requireUser(locale, path);
  if (user.role !== Role.ROLE_TRAINER) redirect(`/${locale}/espace`);
  return user;
}

/**
 * Lecture seule (le jeton a été renouvelé par proxy.ts). Session refusée → connexion ; rôle incorrect → /espace ;
 * session ou cours introuvable (ou appartenant à un autre formateur) → page 404.
 */
async function guarded<T>(locale: string, path: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isUnauthenticated) redirect(`/${locale}/connexion?next=${encodeURIComponent(path)}`);
      if (err.grpcCode === 7) redirect(`/${locale}/espace`);
      if (err.grpcCode === 5 || err.grpcCode === 3) notFound();
    }
    throw err;
  }
}
const withToken = () => callContext({ withToken: true });

export const loadMySessions = (locale: string) =>
  guarded(locale, "/espace", async () =>
    (await rpc<ListMySessionsResponse>(await withToken(), (md, o, cb) =>
      clients().trainer.listMySessions(ListMySessionsRequest.fromPartial({ locale: protoLocale(locale), page: { page: 1, pageSize: 50 } }), md, o, cb),
    )).sessions,
  );

export const loadSessionStudents = (locale: string, sessionId: string) =>
  guarded(locale, `/espace/sessions/${sessionId}`, async () =>
    (await rpc<ListSessionStudentsResponse>(await withToken(), (md, o, cb) =>
      clients().trainer.listSessionStudents(ListSessionStudentsRequest.fromPartial({ sessionId, locale: protoLocale(locale) }), md, o, cb),
    )).students,
  );

export const loadSessionSchedule = (locale: string, sessionId: string) =>
  guarded(locale, `/espace/sessions/${sessionId}`, async () =>
    (await rpc<ListSessionScheduleResponse>(await withToken(), (md, o, cb) =>
      clients().trainer.listSessionSchedule(ListSessionScheduleRequest.fromPartial({ sessionId, locale: protoLocale(locale) }), md, o, cb),
    )).events,
  );

export const loadEventAttendance = (locale: string, eventId: string) =>
  guarded(locale, "/espace", async () =>
    (await rpc<GetEventAttendanceResponse>(await withToken(), (md, o, cb) =>
      clients().trainer.getEventAttendance(GetEventAttendanceRequest.fromPartial({ scheduleEventId: eventId }), md, o, cb),
    )).records,
  );

export const loadSessionProjects = (locale: string, sessionId: string) =>
  guarded(locale, `/espace/sessions/${sessionId}/projets`, async () =>
    (await rpc<ListSessionProjectsResponse>(await withToken(), (md, o, cb) =>
      clients().trainer.listSessionProjects(ListSessionProjectsRequest.fromPartial({ sessionId }), md, o, cb),
    )).projects,
  );
