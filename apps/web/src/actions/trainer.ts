"use server";

import { revalidatePath } from "next/cache";
import { AttendanceStatus, ProjectStatus } from "@center/proto-gen/learning/v1/learning";
import { MarkAttendanceRequest, ReviewProjectRequest } from "@center/proto-gen/trainer/v1/trainer";
import { attendanceInputSchema, reviewProjectInputSchema } from "@center/shared";
import { clients, rpc } from "@/lib/grpc/client";
import { withFreshAccess } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { apiFailure, text, zodFailure } from "./helpers";

const sessionExpired = (): FormState => ({ status: "error", code: "unauthenticated", values: {} });

const ATTENDANCE = {
  PRESENT: AttendanceStatus.ATTENDANCE_STATUS_PRESENT,
  ABSENT: AttendanceStatus.ATTENDANCE_STATUS_ABSENT,
  LATE: AttendanceStatus.ATTENDANCE_STATUS_LATE,
  EXCUSED: AttendanceStatus.ATTENDANCE_STATUS_EXCUSED,
} as const;

/** Champs du formulaire : `status_<inscription>` (radio) et `note_<inscription>`. Seules les lignes cochées sont envoyées. */
export async function markAttendanceAction(_prev: FormState, data: FormData): Promise<FormState> {
  const records: Array<{ enrollmentId: string; status: string; note: string }> = [];
  for (const [key, value] of data.entries()) {
    if (key.startsWith("status_") && typeof value === "string" && value !== "") {
      const enrollmentId = key.slice("status_".length);
      records.push({ enrollmentId, status: value, note: text(data, `note_${enrollmentId}`) });
    }
  }
  const parsed = attendanceInputSchema.safeParse({ scheduleEventId: text(data, "scheduleEventId"), records });
  if (!parsed.success) return { status: "error", fieldErrors: { records: "required" }, values: {} };
  const ctx = await withFreshAccess();
  if (!ctx) return sessionExpired();
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().trainer.markAttendance(
        MarkAttendanceRequest.fromPartial({
          scheduleEventId: parsed.data.scheduleEventId,
          records: parsed.data.records.map((r) => ({
            enrollmentId: r.enrollmentId,
            status: ATTENDANCE[r.status],
            note: r.note,
          })),
        }),
        md,
        o,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function reviewProjectAction(_prev: FormState, data: FormData): Promise<FormState> {
  const parsed = reviewProjectInputSchema.safeParse({
    projectId: text(data, "projectId"),
    status: text(data, "status"),
    feedback: text(data, "feedback"),
    grade: text(data, "grade"),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  const ctx = await withFreshAccess();
  if (!ctx) return sessionExpired();
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().trainer.reviewProject(
        ReviewProjectRequest.fromPartial({
          projectId: parsed.data.projectId,
          status: parsed.data.status === "VALIDATED" ? ProjectStatus.PROJECT_STATUS_VALIDATED : ProjectStatus.PROJECT_STATUS_REVIEWED,
          feedback: parsed.data.feedback,
          grade: parsed.data.grade,
        }),
        md,
        o,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  revalidatePath("/", "layout");
  return { status: "success", code: parsed.data.status === "VALIDATED" ? "validated" : "reviewed" };
}
