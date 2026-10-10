import { credentials, Metadata, Server, ServerCredentials, status, type ServiceError, type UntypedServiceImplementation } from "@grpc/grpc-js";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Locale } from "@center/proto-gen/common/v1/common";
import { CourseServiceClient, CourseServiceService } from "@center/proto-gen/course/v1/course";
import { ROLES, type Role } from "@center/shared";
import type { Authenticator } from "../common/auth";
import { AppError, notFound, REQUEST_ID_METADATA_KEY, RETRY_AFTER_METADATA_KEY, unauthenticated } from "../common/errors";
import { createRateLimiter } from "../common/rate-limit";
import { authorize, clientIpFrom, createUnary, requestIdFrom } from "./handler";

const md = (entries: Record<string, string>) => {
  const metadata = new Metadata();
  for (const [k, v] of Object.entries(entries)) metadata.set(k, v);
  return metadata;
};

describe("authorize", () => {
  it("laisse passer un endpoint public sans identité", () => {
    expect(() => authorize("public", null)).not.toThrow();
  });
  it("refuse un anonyme sur un endpoint protégé (UNAUTHENTICATED)", () => {
    expect(() => authorize("authenticated", null)).toThrow(AppError);
    try {
      authorize(["ADMIN"], null);
    } catch (e) {
      expect((e as AppError).code).toBe(status.UNAUTHENTICATED);
    }
  });
  it("refuse un rôle non autorisé (PERMISSION_DENIED) et accepte le bon", () => {
    try {
      authorize(["ADMIN"], { userId: "u", role: "STUDENT" });
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).code).toBe(status.PERMISSION_DENIED);
    }
    expect(() => authorize(["ADMIN"], { userId: "u", role: "ADMIN" })).not.toThrow();
  });
});

describe("clientIpFrom / requestIdFrom", () => {
  it("préfère x-client-ip (transmis par le BFF) quand c'est une IP valide", () => {
    expect(clientIpFrom(md({ "x-client-ip": "203.0.113.7" }), "ipv4:10.0.0.5:5555")).toBe("203.0.113.7");
  });
  it("ignore une valeur x-client-ip qui n'est pas une IP (pas de clé de limitation forgée)", () => {
    expect(clientIpFrom(md({ "x-client-ip": "pas-une-ip; DROP" }), "ipv4:10.0.0.5:5555")).toBe("10.0.0.5");
  });
  it("lit l'adresse du pair IPv4 et IPv6", () => {
    expect(clientIpFrom(md({}), "ipv4:10.0.0.5:5555")).toBe("10.0.0.5");
    expect(clientIpFrom(md({}), "ipv6:[::1]:5555")).toBe("::1");
  });
  it("conserve un x-request-id valide et en génère un sinon", () => {
    expect(requestIdFrom(md({ [REQUEST_ID_METADATA_KEY]: "abc-12345678" }))).toBe("abc-12345678");
    const generated = requestIdFrom(md({ [REQUEST_ID_METADATA_KEY]: "<script>" }));
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ---- Serveur gRPC réel, en local, avec des handlers factices : teste toute la chaîne d'interceptors ----

const authenticator: Authenticator = async (metadata) => {
  // Simule un jeton expiré ou invalide.
  if (metadata.get("x-test-expired")[0]) throw unauthenticated();
  const role = metadata.get("x-test-role")[0];
  if (typeof role === "string" && (ROLES as readonly string[]).includes(role)) {
    return { userId: "user-test", role: role as Role };
  }
  return null;
};

let server: Server;
let client: CourseServiceClient;

beforeAll(async () => {
  const unary = createUnary({
    logger: pino({ level: "silent" }),
    authenticator,
    // 3 appels de lecture par minute et par IP : permet de tester la limitation.
    rateLimiter: createRateLimiter({
      read: { points: 3, durationSeconds: 60 },
      submit: { points: 100, durationSeconds: 60 },
      auth: { points: 100, durationSeconds: 60 },
      default: { points: 100, durationSeconds: 60 },
    }),
  });
  const implementation: UntypedServiceImplementation = {
    listAdminCourses: unary(CourseServiceService.listAdminCourses, async () => ({ courses: [] })),
    getCourse: unary(CourseServiceService.getCourse, async (req) => {
      if (req.slug === "boom") throw new Error("password=hunter2 host=db.interne");
      throw notFound("course_not_found");
    }),
  };
  server = new Server();
  server.addService(CourseServiceService, implementation);
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync("127.0.0.1:0", ServerCredentials.createInsecure(), (e, p) => (e ? reject(e) : resolve(p))),
  );
  client = new CourseServiceClient(`127.0.0.1:${port}`, credentials.createInsecure());
});

afterAll(async () => {
  client.close();
  await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
});

function listAdmin(headers: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) =>
    client.listAdminCourses({}, md(headers), (error) => (error ? reject(error) : resolve())),
  );
}

describe("chaîne d'interceptors (serveur gRPC réel)", () => {
  it("anonyme → UNAUTHENTICATED sur un RPC d'administration", async () => {
    await expect(listAdmin()).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });
  it.each(["STUDENT", "TRAINER"] as const)("%s → PERMISSION_DENIED sur un RPC d'administration", async (role) => {
    await expect(listAdmin({ "x-test-role": role })).rejects.toMatchObject({ code: status.PERMISSION_DENIED });
  });
  it("ADMIN → accepté", async () => {
    await expect(listAdmin({ "x-test-role": "ADMIN" })).resolves.toBeUndefined();
  });

  it("une erreur inattendue ne fuit pas et renvoie un identifiant de requête", async () => {
    const error = await new Promise<ServiceError>((resolve) =>
      client.getCourse({ slug: "boom", locale: Locale.LOCALE_FR }, md({ "x-client-ip": "198.51.100.1" }), (e) => resolve(e as ServiceError)),
    );
    expect(error.code).toBe(status.INTERNAL);
    expect(error.details).toBe("internal_error");
    expect(JSON.stringify(error.metadata?.getMap())).not.toContain("hunter2");
    expect(error.metadata?.get(REQUEST_ID_METADATA_KEY)).toHaveLength(1);
  });

  it("limite le débit par adresse IP (RESOURCE_EXHAUSTED + retry-after) sans pénaliser les autres IP", async () => {
    const callGet = (ip: string) =>
      new Promise<ServiceError>((resolve) =>
        client.getCourse({ slug: "x", locale: Locale.LOCALE_FR }, md({ "x-client-ip": ip }), (e) => resolve(e as ServiceError)),
      );
    for (let i = 0; i < 3; i += 1) expect((await callGet("203.0.113.50")).code).toBe(status.NOT_FOUND);
    const limited = await callGet("203.0.113.50");
    expect(limited.code).toBe(status.RESOURCE_EXHAUSTED);
    expect(Number(limited.metadata?.get(RETRY_AFTER_METADATA_KEY)[0])).toBeGreaterThanOrEqual(1);
    expect((await callGet("203.0.113.51")).code).toBe(status.NOT_FOUND);
  });

  it("méthode PUBLIQUE + jeton expiré → traité comme anonyme (la page publique ne casse pas)", async () => {
    const error = await new Promise<ServiceError>((resolve) =>
      client.getCourse({ slug: "x", locale: Locale.LOCALE_FR }, md({ "x-client-ip": "198.51.100.90", "x-test-expired": "1" }), (e) =>
        resolve(e as ServiceError),
      ),
    );
    expect(error.code).toBe(status.NOT_FOUND); // le handler a bien été atteint
  });

  it("méthode PROTÉGÉE + jeton expiré → UNAUTHENTICATED (le BFF sait qu'il doit rafraîchir)", async () => {
    await expect(listAdmin({ "x-test-expired": "1" })).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });
});
