import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
}
async function settings(page: Page) {
  const open = page.getByRole("button", {
    name: "Afficher les réglages",
    exact: true,
  });
  if (await open.isVisible()) await open.click();
}
async function closePanels(page: Page) {
  for (const name of ["Fermer les réglages", "Fermer les simulations"]) {
    const close = page.getByRole("button", { name, exact: true });
    if (await close.isVisible()) await close.click();
  }
}
async function saved(page: Page) {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Sauvegarder le projet", exact: true })
    .click();
  let raw = "";
  for await (const c of (await (await event).createReadStream())!)
    raw += c.toString();
  return JSON.parse(raw);
}
test("fixed compact workspace, committed dimensions, scaled bubbles and help tabs", async ({
  page,
}) => {
  await ready(page);
  await settings(page);
  await expect(page.locator(".brand")).toContainText("chromablind");
  await expect(page.locator(".canvas-heading,.app-footer")).toHaveCount(0);
  const first = await saved(page);
  const diameter = page.getByLabel("Diamètre (mm)");
  await diameter.fill("250");
  // A draft must not regenerate the illustration or mutate its document.
  await expect(page.getByTestId("disk-count")).toHaveText(
    `${first.disks.length.toLocaleString("fr-FR")} bulles`,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chromablind.project.v1") ?? "null")
            ?.geometry.width,
      ),
    )
    .toBe(200);
  await diameter.press("Enter");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Auto · proposer les paramètres",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
  const scaled = await saved(page);
  expect(scaled.geometry.width).toBe(250);
  expect(scaled.geometry.minRadius).toBeCloseTo(1.375);
  expect(scaled.geometry.maxRadius).toBeCloseTo(4.75);
  expect(scaled.geometry.density).toBe(0.9);
  await page
    .getByRole("button", { name: "Aide et informations", exact: true })
    .click();
  await page.getByRole("tab", { name: "Infos", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("0.3.0");
  await page
    .getByRole("tab", { name: "Méthode et limites", exact: true })
    .click();
  await expect(page.getByRole("tabpanel")).toContainText("CMJN");
  await page
    .getByRole("button", { name: "Fermer la méthode", exact: true })
    .click();
  await page.getByLabel("Diamètre (mm)").fill("10");
  await page.getByLabel("Diamètre (mm)").press("Enter");
  await page
    .getByRole("button", {
      name: "Auto · proposer les paramètres",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
  expect((await saved(page)).geometry.minRadius).toBe(0.2);
  await closePanels(page);
  const dimensions = await page
    .evaluate(() => ({
      height: window.innerHeight,
      body: document.body.scrollHeight,
      area: document.querySelector(".artboard-area")!,
    }))
    .catch(() => null);
  expect(dimensions?.body).toBe(dimensions?.height);
  const noScroll = await page
    .locator(".artboard-area")
    .evaluate(
      (e) =>
        e.scrollHeight === e.clientHeight && e.scrollWidth === e.clientWidth,
    );
  expect(noScroll).toBe(true);
  await page
    .getByRole("button", { name: "Augmenter le zoom", exact: true })
    .click();
  expect(
    await page
      .locator(".artboard-area")
      .evaluate((e) => getComputedStyle(e).overflow),
  ).toBe("hidden");
});
test("centered drawing, ordered eraser, independent widths and undo", async ({
  page,
}) => {
  await ready(page);
  await settings(page);
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  await page
    .getByRole("button", { name: "Épaisseur 10 mm", exact: true })
    .click();
  await closePanels(page);
  const box = (await page.getByTestId("main-canvas").boundingBox())!;
  const stroke = async (y: number) => {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * y, {
      steps: 12,
    });
    await page.mouse.up();
  };
  await stroke(0.5);
  const ink = await saved(page);
  expect(ink.motifs[0].strokes).toHaveLength(1);
  expect(ink.motifs[0].strokes[0].width).toBe(10);
  expect(Math.abs(ink.motifs[0].x - 100)).toBeLessThan(0.5);
  expect(Math.abs(ink.motifs[0].y - 100)).toBeLessThan(0.5);
  const count = (d: any) => d.disks.filter((c: any) => c.color >= 16).length;
  expect(count(ink)).toBeGreaterThan(0);
  await settings(page);
  await page.getByRole("button", { name: "Gomme", exact: true }).click();
  await page
    .getByRole("button", { name: "Épaisseur 20 mm", exact: true })
    .click();
  await closePanels(page);
  await stroke(0.5);
  const erased = await saved(page);
  expect(erased.motifs[0].strokes[1].erase).toBe(true);
  expect(erased.motifs[0].strokes[0].width).toBe(10);
  expect(count(erased)).toBe(0);
  await page
    .getByRole("button", { name: "Annuler la modification", exact: true })
    .click();
  expect(count(await saved(page))).toBe(count(ink));
  await settings(page);
  await page.getByRole("button", { name: "Tout effacer", exact: true }).click();
  const clear = await saved(page);
  expect(clear.motifs[0].strokes).toEqual([]);
});
test("fonts, forced result in colors, guided effects, CMYK master and first project export", async ({
  page,
}) => {
  await ready(page);
  await settings(page);
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByLabel("Texte du motif").fill("Été");
  const before = await saved(page);
  await page.getByLabel("Police du motif").selectOption("NotoSerif");
  const changed = await saved(page);
  expect(changed.motifs[0].path).not.toBe(before.motifs[0].path);
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await closePanels(page);
  await expect(
    page.getByRole("button", { name: "Conception", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Résultat", exact: true }),
  ).toHaveCount(0);
  await settings(page);
  await page.getByLabel("Effet recherché").selectOption("accessible");
  await page.getByRole("button", { name: "Guidée", exact: true }).click();
  for (const effect of ["accessible", "hidden", "transforming"]) {
    await page.getByLabel("Effet recherché").selectOption(effect);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const doc = await saved(page);
  expect(doc.print.profile).toBe("fogra39-vigc");
  expect(doc.colors.every((c: any) => c.cmyk.length === 4)).toBe(true);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await expect(page.locator(".export-row").first()).toContainText(
    "Projet chromablind",
  );
  await expect(
    page.getByRole("button", { name: "Exporter le PDF CMJN", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Profil du catalogue")).toHaveValue(
    "fogra39-vigc",
  );
});

test("undo and redo preserve custom project disks across different supports", async ({
  page,
}) => {
  await ready(page);
  const original = await saved(page);
  const a = {
    ...original,
    geometry: {
      ...original.geometry,
      shape: "rectangle",
      width: 120,
      height: 180,
    },
    disks: [
      { x: 30, y: 40, r: 2, color: 0 },
      { x: 70, y: 80, r: 3, color: 0 },
    ],
  };
  await page.getByTestId("project-input").setInputFiles({
    name: "a.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(a)),
  });
  const before = await saved(page);
  const b = {
    ...before,
    geometry: { ...before.geometry, width: 160 },
    disks: [{ x: 50, y: 60, r: 4, color: 0 }],
  };
  await page.getByTestId("project-input").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(b)),
  });
  await closePanels(page);
  await page
    .getByRole("button", { name: "Annuler la modification", exact: true })
    .click();
  const restored = await saved(page);
  expect(restored.geometry).toEqual(before.geometry);
  expect(restored.disks).toEqual(before.disks);
  await page
    .getByRole("button", { name: "Rétablir la modification", exact: true })
    .click();
  expect((await saved(page)).disks.map((d: any) => [d.x, d.y, d.r])).toEqual([
    [50, 60, 4],
  ]);
});

test("a dark CMYK base survives save and reopen without rewriting its inks", async ({
  page,
}) => {
  await ready(page);
  await settings(page);
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await page.getByText("Base · CMJN", { exact: true }).click();
  for (const [label, value] of [
    ["Cyan", "0"],
    ["Magenta", "0"],
    ["Jaune", "75"],
    ["Noir", "100"],
  ]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(value);
  }
  const before = await saved(page);
  expect(before.palette.baseCMYK).toEqual([0, 0, 0.75, 1]);
  before.print.background = [0.1234, 0.2345, 0.3456, 0.0456];
  await page.getByTestId("project-input").setInputFiles({
    name: "inks.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(before)),
  });
  const reopened = await saved(page);
  expect(reopened.colors.map((c: any) => c.cmyk)).toEqual(
    before.colors.map((c: any) => c.cmyk),
  );
  expect(reopened.print.background).toEqual(before.print.background);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
