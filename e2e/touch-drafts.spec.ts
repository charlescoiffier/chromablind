import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet", exact: true }),
  ).toBeEnabled();
}
async function settings(page: Page) {
  const b = page.getByRole("button", {
    name: "Afficher les réglages",
    exact: true,
  });
  if (await b.isVisible()) await b.click();
}
async function saved(page: Page) {
  const d = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Sauvegarder le projet", exact: true })
    .click();
  let raw = "";
  for await (const c of (await (await d).createReadStream())!)
    raw += c.toString();
  return JSON.parse(raw);
}
async function close(page: Page) {
  for (const name of ["Fermer les réglages", "Fermer les simulations"]) {
    const b = page.getByRole("button", { name, exact: true });
    if (await b.isVisible()) await b.click();
  }
}
test("blank projects, persistent text/drawing drafts and contextual tools", async ({
  page,
}) => {
  await ready(page);
  const initial = await saved(page);
  expect(initial.motifs.every((m: any) => !m.text && !m.path)).toBe(true);
  expect(initial.geometry).toMatchObject({
    width: 200,
    minRadius: 1.1,
    maxRadius: 3.8,
    distribution: 0.65,
    gap: 0.28,
    density: 0.9,
  });
  await settings(page);
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByLabel("Texte du motif").fill("Été");
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  await close(page);
  const b = (await page.getByTestId("main-canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, {
    steps: 8,
  });
  await page.mouse.up();
  const drawn = await saved(page);
  expect(drawn.motifs[0].strokes).toHaveLength(1);
  await settings(page);
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await expect(page.getByLabel("Texte du motif")).toHaveValue("Été");
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  const restored = await saved(page);
  expect(restored.motifs[0].strokes).toEqual(drawn.motifs[0].strokes);
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await expect(page.locator(".footer-hint")).toContainText("Format");
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await page
    .getByRole("button", { name: "Création libre", exact: true })
    .click();
  await expect(page.getByLabel("Profil de recette")).toBeVisible();
  const before = await saved(page);
  await page.getByLabel("Profil de recette").selectOption("protan");
  const after = await saved(page);
  expect(after.colors).not.toEqual(before.colors);
  expect(after.disks.map((d: any) => [d.x, d.y, d.r])).toEqual(
    before.disks.map((d: any) => [d.x, d.y, d.r]),
  );
  await expect(page.locator(".derived-colors > div")).toHaveCount(3);
  await close(page);
  await page
    .getByRole("button", { name: "Nouveau projet", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toContainText("Nouveau projet");
});
test("two fingers zoom and pan without drawing or changing the document", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native multi-touch input is injected through Chromium CDP; physical iPad qualification remains separate.",
  );
  await ready(page);
  await settings(page);
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  await close(page);
  const before = await saved(page);
  const b = (await page.locator(".artboard-area").boundingBox())!,
    x = Math.round(b.x + b.width / 2),
    y = Math.round(b.y + b.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x - 50, y, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 50, y, id: 1 },
      { x: x + 50, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 80, y: y + 30, id: 1 },
      { x: x + 120, y: y + 30, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.getByRole("button", { name: "Ajuster à la fenêtre" }),
  ).toContainText("200 %");
  const translation = await page.locator(".artboard").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return [m.m41, m.m42];
  });
  expect(Math.abs(translation[0] - 20)).toBeLessThan(1);
  expect(Math.abs(translation[1] - 30)).toBeLessThan(1);
  const after = await saved(page);
  expect(after).toEqual(before);
});

test("double reading keeps the chromatic distractors around motif B", async ({
  page,
}) => {
  await ready(page);
  const d = await saved(page);
  d.palette.effect = "transforming";
  d.motifs = d.motifs.map((m: any, i: number) => ({
    ...m,
    kind: "svg",
    text: "",
    regions: undefined,
    path: "M-10 -10h20v20h-20z",
    x: i ? 140 : 60,
    y: 100,
    scale: 1,
    rotation: 0,
  }));
  d.disks = [
    [100, 70],
    [100, 80],
    [60, 100],
    [140, 100],
    [141, 100],
  ].map(([x, y]) => ({ x, y, r: 0.3, color: 0 }));
  await page.getByTestId("project-input").setInputFiles({
    name: "double.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(d)),
  });
  await expect(page.getByTestId("disk-count")).toHaveText("5 bulles");
  const result = await saved(page);
  expect(result.disks.map((v: any) => Math.floor(v.color / 16))).toEqual([
    0, 1, 1, 3, 2,
  ]);
});
