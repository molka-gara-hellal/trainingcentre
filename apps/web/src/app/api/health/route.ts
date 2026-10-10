// Sonde de santé pour Docker / le reverse proxy : ne dépend ni de l'API ni de la base.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
