import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { PaymentServiceService, type Payment } from "@center/proto-gen/payment/v1/payment";
import { recordPaymentInputSchema, updatePaymentInputSchema } from "@center/shared";
import { z } from "zod";
import { actorId, callerLocale } from "../../common/caller";
import { audit } from "../../common/audit";
import { paymentMethodMap, paymentStatusMap } from "../../common/enums";
import { notFound, validationError } from "../../common/errors";
import { formatTnd, normalizePage, pageInfo } from "../../common/format";
import type { Prisma, PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import { NotificationType, type Locale, type PaymentStatus } from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";
import { localesToLoad, pickByLocale } from "../course/course.mapper";

const uuidSchema = z.object({ id: z.uuid("invalid_value") });

type PaymentRow = {
  id: string; enrollmentId: string; amount: { toFixed(d: number): string }; currency: string; status: PaymentStatus;
  method: Parameters<typeof paymentMethodMap.toProto>[0] | null; reference: string | null; note: string | null;
  paidAt: Date | null; createdAt: Date;
};

export const toProtoPayment = (p: PaymentRow): Payment => ({
  id: p.id,
  enrollmentId: p.enrollmentId,
  amount: formatTnd(p.amount),
  currency: p.currency,
  status: paymentStatusMap.toProto(p.status),
  method: p.method ? paymentMethodMap.toProto(p.method) : undefined,
  reference: p.reference ?? undefined,
  note: p.note ?? undefined,
  paidAt: p.paidAt ?? undefined,
  createdAt: p.createdAt,
});

export function buildPaymentService(deps: { prisma: PrismaClient; unary: UnaryFactory; now?: () => Date }): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;
  const S = PaymentServiceService;

  const notifyStudent = (tx: Prisma.TransactionClient, userId: string, paymentId: string, status: PaymentStatus) =>
    // Pas de montant dans la notification : l'étudiant le consulte dans son espace.
    tx.notification.create({ data: { userId, type: NotificationType.PAYMENT_UPDATE, payload: { paymentId, status } } });

  return {
    recordPayment: unary(S.recordPayment, async (req, ctx) => {
      const input = parseInput(recordPaymentInputSchema, {
        enrollmentId: req.enrollmentId,
        amount: req.amount,
        status: paymentStatusMap.toDb(req.status),
        method: paymentMethodMap.toDb(req.method),
        reference: req.reference,
        note: req.note,
        paidAt: req.paidAt,
      });
      const enrollment = await prisma.enrollment.findUnique({ where: { id: input.enrollmentId }, select: { id: true, student: { select: { userId: true } } } });
      if (!enrollment) throw notFound();
      const paidStatuses: PaymentStatus[] = ["PAID", "PARTIAL"];
      const paidAt = input.paidAt ?? (paidStatuses.includes(input.status) ? now() : undefined);
      const payment = await prisma.$transaction(async (tx) => {
        const row = await tx.payment.create({
          data: {
            enrollmentId: input.enrollmentId, amount: input.amount, status: input.status,
            method: input.method ?? null, reference: input.reference ?? null, note: input.note ?? null, paidAt: paidAt ?? null,
          },
        });
        await notifyStudent(tx, enrollment.student.userId, row.id, row.status);
        await audit(tx, actorId(ctx), "payment.record", "Payment", row.id, { enrollmentId: row.enrollmentId, status: row.status });
        return row;
      });
      return { payment: toProtoPayment(payment) };
    }),

    updatePaymentStatus: unary(S.updatePaymentStatus, async (req, ctx) => {
      const input = parseInput(updatePaymentInputSchema, {
        id: req.id, status: paymentStatusMap.toDb(req.status), method: paymentMethodMap.toDb(req.method), note: req.note,
      });
      const existing = await prisma.payment.findUnique({ where: { id: input.id }, include: { enrollment: { select: { student: { select: { userId: true } } } } } });
      if (!existing) throw notFound();
      const payment = await prisma.$transaction(async (tx) => {
        const row = await tx.payment.update({
          where: { id: input.id },
          data: {
            status: input.status,
            method: input.method ?? existing.method,
            note: input.note ?? existing.note,
            paidAt: (input.status === "PAID" || input.status === "PARTIAL") && !existing.paidAt ? now() : existing.paidAt,
          },
        });
        if (existing.status !== row.status) await notifyStudent(tx, existing.enrollment.student.userId, row.id, row.status);
        await audit(tx, actorId(ctx), "payment.update", "Payment", row.id, { from: existing.status, to: row.status });
        return row;
      });
      return { payment: toProtoPayment(payment) };
    }),

    listPayments: unary(S.listPayments, async (req, ctx) => {
      const locale: Locale = await callerLocale(prisma, ctx, req.locale);
      const params = normalizePage(req.page, 20, 100);
      const status = paymentStatusMap.toDb(req.status);
      const sessionId = req.sessionId?.trim();
      if (sessionId && !z.uuid().safeParse(sessionId).success) throw validationError([{ field: "sessionId", code: "invalid_value" }]);
      const where: Prisma.PaymentWhereInput = { ...(status && { status }), ...(sessionId && { enrollment: { sessionId } }) };
      const [rows, total] = await Promise.all([
        prisma.payment.findMany({
          where, orderBy: { createdAt: "desc" }, skip: params.skip, take: params.pageSize,
          include: {
            enrollment: {
              select: {
                student: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
                session: { select: { course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } } },
              },
            },
          },
        }),
        prisma.payment.count({ where }),
      ]);
      return {
        payments: rows.map((row) => ({
          payment: toProtoPayment(row),
          firstName: row.enrollment.student.user.firstName,
          lastName: row.enrollment.student.user.lastName,
          email: row.enrollment.student.user.email,
          courseTitle: pickByLocale(row.enrollment.session.course.translations, locale)?.title ?? row.enrollment.session.course.slug,
        })),
        pageInfo: pageInfo(params, total),
      };
    }),

    getEnrollmentPaymentHistory: unary(S.getEnrollmentPaymentHistory, async (req) => {
      const { id } = parseInput(uuidSchema, { id: req.enrollmentId });
      if (!(await prisma.enrollment.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      const rows = await prisma.payment.findMany({ where: { enrollmentId: id }, orderBy: { createdAt: "desc" }, take: 200 });
      return { payments: rows.map(toProtoPayment) };
    }),
  };
}
