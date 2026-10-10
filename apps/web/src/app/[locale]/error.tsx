"use client";

import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

/** Erreur inattendue : message neutre, aucun détail technique affiché au visiteur. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors.page");
  return (
    <Container className="max-w-xl space-y-4 py-20">
      <h1 className="display text-3xl">{t("title")}</h1>
      <p className="text-muted">{t("text")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </Container>
  );
}
