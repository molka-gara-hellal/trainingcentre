"use server";

import { getLocale } from "next-intl/server";
import { CourseLevel } from "@center/proto-gen/common/v1/common";
import {
  RequestPfeSupportRequest,
  SubmitContactMessageRequest,
  SubmitRegistrationRequest,
} from "@center/proto-gen/registration/v1/registration";
import { contactMessageInputSchema, pfeRequestInputSchema, registrationInputSchema } from "@center/shared";
import { clients, rpc } from "@/lib/grpc/client";
import { callContext } from "@/lib/auth/session";
import { protoLocale } from "@/lib/data";
import type { FormState } from "@/lib/form-state";
import { apiFailure, isBot, text, zodFailure } from "./helpers";

const LEVELS = {
  BEGINNER: CourseLevel.COURSE_LEVEL_BEGINNER,
  INTERMEDIATE: CourseLevel.COURSE_LEVEL_INTERMEDIATE,
  ADVANCED: CourseLevel.COURSE_LEVEL_ADVANCED,
} as const;

const checked = (data: FormData, name: string) => data.get(name) === "on";

export async function submitRegistrationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  if (isBot(data)) return { status: "success" };

  const laptop = text(data, "hasOwnLaptop");
  const age = text(data, "age").trim();
  const parsed = registrationInputSchema.safeParse({
    firstName: text(data, "firstName"),
    lastName: text(data, "lastName"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    age: age === "" ? undefined : Number(age),
    educationLevel: text(data, "educationLevel"),
    institution: text(data, "institution"),
    courseSlug: text(data, "courseSlug"),
    sessionId: text(data, "sessionId") || undefined,
    level: text(data, "level") || undefined,
    hasOwnLaptop: laptop === "yes" ? true : laptop === "no" ? false : undefined,
    message: text(data, "message"),
    consentGiven: checked(data, "consentGiven"),
    locale: locale.toUpperCase(),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);

  const input = parsed.data;
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().registration.submitRegistration(
        SubmitRegistrationRequest.fromPartial({
          ...input,
          level: LEVELS[input.level],
          locale: protoLocale(locale),
        }),
        md,
        opts,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  return { status: "success" };
}

export async function submitPfeAction(_prev: FormState, data: FormData): Promise<FormState> {
  if (isBot(data)) return { status: "success" };
  const parsed = pfeRequestInputSchema.safeParse({
    name: text(data, "name"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    topic: text(data, "topic"),
    message: text(data, "message"),
    consentGiven: checked(data, "consentGiven"),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().registration.requestPfeSupport(RequestPfeSupportRequest.fromPartial(parsed.data), md, opts, cb),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  return { status: "success" };
}

export async function submitContactAction(_prev: FormState, data: FormData): Promise<FormState> {
  if (isBot(data)) return { status: "success" };
  const parsed = contactMessageInputSchema.safeParse({
    name: text(data, "name"),
    email: text(data, "email"),
    subject: text(data, "subject"),
    message: text(data, "message"),
    consentGiven: checked(data, "consentGiven"),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().registration.submitContactMessage(SubmitContactMessageRequest.fromPartial(parsed.data), md, opts, cb),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  return { status: "success" };
}
