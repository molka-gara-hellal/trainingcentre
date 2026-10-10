import { describe, expect, it } from "vitest";
import { POLICIES, policyFor } from "./policies";

/**
 * Liste BLANCHE des endpoints joignables sans être connecté.
 * Si ce test échoue après l'ajout d'un RPC, c'est voulu : il faut décider consciemment s'il peut être public.
 */
const EXPECTED_PUBLIC = [
  "/auth.v1.AuthService/ActivateAccount",
  "/auth.v1.AuthService/ForgotPassword",
  "/auth.v1.AuthService/Login",
  "/auth.v1.AuthService/Logout",
  "/auth.v1.AuthService/RefreshToken",
  "/auth.v1.AuthService/Register",
  "/auth.v1.AuthService/ResetPassword",
  "/course.v1.CourseService/GetCourse",
  "/course.v1.CourseService/ListCategories",
  "/course.v1.CourseService/ListCourses",
  "/course.v1.CourseService/ListFaqs",
  "/course.v1.CourseService/ListUpcomingSessions",
  "/registration.v1.RegistrationService/RequestPfeSupport",
  "/registration.v1.RegistrationService/SubmitContactMessage",
  "/registration.v1.RegistrationService/SubmitRegistration",
  "/site.v1.SiteService/GetPublicSettings",
].sort();

describe("politiques d'accès gRPC", () => {
  it("expose exactement la liste blanche d'endpoints publics", () => {
    const publicPaths = [...POLICIES.entries()]
      .filter(([, policy]) => policy.access === "public")
      .map(([path]) => path)
      .sort();
    expect(publicPaths).toEqual(EXPECTED_PUBLIC);
  });

  it("réserve à ADMIN tout RPC d'écriture ou d'administration du catalogue, des inscriptions et des paiements", () => {
    for (const [path, policy] of POLICIES) {
      const isManagement =
        /^\/(payment|admin)\.v1\./.test(path) ||
        /\/(Create|Update|Delete|Set|Upsert|Decide|List(Admin|Registrations|PfeRequests|ContactMessages))/.test(path) ||
        /\/(GetAdminCourse|GetRegistration)$/.test(path);
      const isOwnData = /^\/(student|trainer|user|notification|auth)\.v1\./.test(path);
      if (isManagement && !isOwnData) {
        expect(policy.access, path).toEqual(["ADMIN"]);
      }
    }
  });

  it("applique la limite stricte aux formulaires publics et à l'authentification", () => {
    expect(policyFor("/registration.v1.RegistrationService/SubmitRegistration").limit).toBe("submit");
    expect(policyFor("/auth.v1.AuthService/Login").limit).toBe("auth");
    expect(policyFor("/course.v1.CourseService/ListCourses").limit).toBe("read");
  });

  it("refuse un chemin inconnu au lieu de le laisser passer", () => {
    expect(() => policyFor("/inconnu.v1.Service/Methode")).toThrow(/Aucune politique/);
  });
});
