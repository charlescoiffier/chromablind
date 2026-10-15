import { test, expect } from "@playwright/test";
test("new project protects edits, motif controls and view pan", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Nom du projet").fill("Composition modifiée");
  await page
    .getByRole("button", { name: "Nouveau projet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nouveau projet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Nom du projet")).toHaveValue(
    "Composition modifiée",
  );
  await page
    .getByRole("button", { name: "Nouveau projet", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder et créer" }).click();
  expect(
    (await download).suggestedFilename().normalize("NFC").replace(/_/g, " "),
  ).toContain("Composition modifiée");
  await expect(page.getByLabel("Nom du projet")).toHaveValue("Étude 01");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
  const open = page.getByRole("button", {
    name: "Afficher les réglages",
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Crayon", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Épaisseur du trait")).toHaveCount(0);
  await page.getByRole("button", { name: "Centrer le motif" }).click();
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guidée", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Effet recherché")).toHaveValue("vanishing");
  await page
    .getByRole("button", { name: "Création libre", exact: true })
    .click();
  await page.getByText("Base · CMJN", { exact: true }).click();
  await page.getByLabel("Cyan", { exact: true }).fill("75");
  await expect(page.getByLabel("Cyan (%)")).toHaveCount(0);
  await expect(page.locator(".derived-colors > div")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Fermer les réglages", exact: true })
    .click();
  const close = page.getByRole("button", {
    name: "Fermer les simulations",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  await page.getByRole("button", { name: "Panoter la vue" }).click();
  const box = (await page.locator(".artboard-area").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 30,
  );
  await page.mouse.up();
  await expect(page.locator(".artboard")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 60, 30)",
  );
  await page.getByRole("button", { name: "Ajuster à la fenêtre" }).click();
  await expect(page.locator(".artboard")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
});
