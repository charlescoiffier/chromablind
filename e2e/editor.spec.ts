import { test, expect } from "@playwright/test";
test("creates a plate, recolors without moving circles, exports and undoes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".brand")).toBeVisible();
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  if (
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  const save = async () => {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
    const d = await event;
    const stream = await d.createReadStream();
    let data = "";
    for await (const chunk of stream!) data += chunk.toString();
    return JSON.parse(data);
  };
  const before = await save();
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByLabel("Texte du motif").fill("É");
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await page
    .getByRole("button", { name: "Création libre", exact: true })
    .click();
  await page.getByRole("button", { name: "Guidée", exact: true }).click();
  const after = await save();
  expect(after.disks.map((d: any) => [d.x, d.y, d.r])).toEqual(
    before.disks.map((d: any) => [d.x, d.y, d.r]),
  );
  expect(after.motifs[0].path.length).toBeGreaterThan(100);
  const drawer = await page
    .getByRole("button", { name: "Fermer les réglages" })
    .isVisible();
  if (drawer)
    await page.getByRole("button", { name: "Fermer les réglages" }).click();
  await page
    .getByRole("button", { name: "Annuler la modification", exact: true })
    .click();
  if (drawer)
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Création libre", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en SVG" }).click();
  expect((await event).suggestedFilename()).toMatch(/\.svg$/);
});
test("rectangle, drawing, safe SVG import and project validation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  if (
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.getByLabel("Hauteur (mm)")).toBeVisible();
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByRole("button", { name: "Dessin", exact: true }).click();
  if (
    await page.getByRole("button", { name: "Fermer les réglages" }).isVisible()
  )
    await page.getByRole("button", { name: "Fermer les réglages" }).click();
  const box = await page.getByTestId("main-canvas").boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, {
    steps: 10,
  });
  await page.mouse.up();
  await page.getByTestId("svg-input").setInputFiles({
    name: "shape.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g transform="translate(10,20)"><rect width="30" height="40"/></g></svg>',
    ),
  });
  await expect(page.locator(".status-message[role=status]")).toContainText(
    "SVG importé",
  );
  await page.getByTestId("project-input").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole("alert")).toContainText("Version");
});
test("guided recipes and simulation constraints are usable", async ({
  page,
}) => {
  await page.goto("/");
  if (
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await page.getByRole("button", { name: "Guidée", exact: true }).click();
  for (const effect of ["accessible", "vanishing", "hidden", "transforming"])
    await page.getByLabel("Effet recherché").selectOption(effect);
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Motif B", exact: true }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .click();
  await page.getByLabel("Profil ciblé").selectOption("tritan");
  await page.getByLabel("Modèle de simulation").selectOption("brettel");
  await expect(
    page.getByLabel("Modèle de simulation").locator('option[value="machado"]'),
  ).toHaveAttribute("disabled", "");
});

test("switches Machado to tritan without losing the editor and transforms the support", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  if (
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .click();
  await page.getByLabel("Modèle de simulation").selectOption("machado");
  if (
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .click();
  await page.getByLabel("Profil ciblé").selectOption("tritan");
  await expect(page.getByLabel("Modèle de simulation")).toHaveValue("brettel");
  expect(errors).toEqual([]);
  if (
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  await page.getByRole("button", { name: "Couleurs", exact: true }).click();
  await page.getByLabel("Couleur du support").fill("#ff0000");
  if (
    await page.getByRole("button", { name: "Fermer les réglages" }).isVisible()
  )
    await page.getByRole("button", { name: "Fermer les réglages" }).click();
  await page.getByRole("button", { name: "Luminance", exact: true }).click();
  const pixel = await page
    .getByTestId("main-canvas")
    .evaluate((c: HTMLCanvasElement) =>
      Array.from(c.getContext("2d")!.getImageData(0, 0, 1, 1).data),
    );
  expect(pixel[0]).toBe(pixel[1]);
  expect(pixel[1]).toBe(pixel[2]);
});

test("preserves imported geometry and evenodd SVG holes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  const originalDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
  const stream = await (await originalDownload).createReadStream();
  let raw = "";
  for await (const c of stream!) raw += c.toString();
  const doc = JSON.parse(raw);
  doc.disks = [
    { x: 100, y: 100, r: 1, color: 0 },
    { x: 110, y: 100, r: 1, color: 0 },
  ];
  await page.getByTestId("project-input").setInputFiles({
    name: "custom.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByTestId("disk-count")).toHaveText("2 bulles");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chromablind.project.v1") ?? "null")
            ?.disks?.length ?? 0,
      ),
    )
    .toBe(2);
  await page.reload();
  await expect(page.getByTestId("disk-count")).toHaveText("2 bulles");
  expect(errors).toEqual([]);
  await page.getByTestId("svg-input").setInputFiles({
    name: "donut.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M0 0h100v100H0z M25 25h50v50H25z"/></svg>',
    ),
  });
  const output = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
  const savedStream = await (await output).createReadStream();
  raw = "";
  for await (const c of savedStream!) raw += c.toString();
  const saved = JSON.parse(raw);
  expect(saved.motifs[0].fillRule).toBe("evenodd");
  expect(saved.disks[0].color).toBeLessThan(16);
  await page.getByTestId("svg-input").setInputFiles({
    name: "outline.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="black" d="M0 0L100 100"/></svg>',
    ),
  });
  await expect(page.getByRole("alert")).toContainText("contours");
});

test("exports and soft-proofs a real CMYK PDF", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await page
    .getByText("Options avancées d’impression", { exact: true })
    .click();
  await page.getByLabel("Profil du catalogue").selectOption("fogra39-vigc");
  await page.getByRole("button", { name: "Épreuver", exact: true }).click();
  await expect(
    page.getByText("Écart maximal ΔE76 :", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF CMJN" }).click();
  const output = await event;
  expect(output.suggestedFilename()).toMatch(/\.pdf$/);
  await output.saveAs("output/qualification.pdf");
});

test("discards an obsolete softproof after a palette change", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = page.waitForResponse("**/api/proof");
  await page.route("**/api/proof", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        colors: [],
        relativeColors: [],
        deltaE: [9],
        outOfGamut: [],
        profile: "Ancien profil",
        warnings: [],
      },
    });
  });
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await page
    .getByText("Options avancées d’impression", { exact: true })
    .click();
  await page.getByLabel("Profil du catalogue").selectOption("fogra47-vigc");
  await page.getByRole("button", { name: "Épreuver", exact: true }).click();
  await page.keyboard.press("Escape");
  if (
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les simulations", exact: true })
      .click();
  await page.getByLabel("Profil ciblé").selectOption("protan");
  release();
  await response;
  await expect(page.locator(".status-message[role=status]")).toContainText(
    "Relancez",
  );
  await expect(
    page.getByRole("button", { name: "Épreuve", exact: true }),
  ).toHaveCount(0);
});

test("unions separately painted SVG regions at intersections", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  const first = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
  let raw = "";
  for await (const c of (await (await first).createReadStream())!)
    raw += c.toString();
  const doc = JSON.parse(raw);
  doc.disks = [{ x: 100, y: 100, r: 1, color: 0 }];
  await page.getByTestId("project-input").setInputFiles({
    name: "one.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.getByTestId("svg-input").setInputFiles({
    name: "union.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd"><rect width="60" height="100"/><rect x="40" width="60" height="100"/></g></svg>',
    ),
  });
  const next = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
  raw = "";
  for await (const c of (await (await next).createReadStream())!)
    raw += c.toString();
  const saved = JSON.parse(raw);
  expect(saved.motifs[0].regions.length).toBe(2);
  expect(saved.disks[0].color).toBeGreaterThanOrEqual(16);
});

test("renders and edits a 20,000-disk project", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("disk-count")).not.toHaveText("0 bulles");
  const output = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder le projet" }).click();
  let raw = "";
  for await (const c of (await (await output).createReadStream())!)
    raw += c.toString();
  const doc = JSON.parse(raw);
  doc.geometry = {
    ...doc.geometry,
    shape: "rectangle",
    width: 1000,
    height: 1000,
    minRadius: 0.5,
    maxRadius: 1,
    limit: 20000,
  };
  doc.disks = Array.from({ length: 20000 }, (_, i) => ({
    x: (i % 200) * 5 + 2,
    y: Math.floor(i / 200) * 5 + 2,
    r: 1,
    color: 0,
  }));
  const start = Date.now();
  await page.getByTestId("project-input").setInputFiles({
    name: "20k.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByTestId("disk-count")).toHaveText(/20\s000 bulles/);
  const elapsed = Date.now() - start;
  if (
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Afficher les réglages", exact: true })
      .click();
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByLabel("Texte du motif").fill("É");
  await expect(page.getByTestId("disk-count")).toHaveText(/20\s000 bulles/);
  await info.attach("performance-20k", {
    body: JSON.stringify({
      browser: info.project.name,
      importAndRenderMilliseconds: elapsed,
      count: 20000,
    }),
    contentType: "application/json",
  });
  console.log(
    `${info.project.name}: import et aperçu 20 000 bulles en ${elapsed} ms`,
  );
});

test("can open and export a saved project after interrupting first generation", async ({
  page,
}) => {
  await page.route("**/*generator.worker*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await route.continue();
    } catch {
      /* Worker may have been terminated. */
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Interrompre", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reprendre", exact: true }),
  ).toBeVisible();
  const doc = {
    version: 1,
    generator: "packing-1",
    name: "Projet rechargé",
    geometry: {
      shape: "circle",
      width: 180,
      height: 180,
      minRadius: 1.1,
      maxRadius: 3.8,
      gap: 0.28,
      density: 0.8,
      distribution: 0.65,
      seed: 12487,
      limit: 20000,
    },
    palette: {
      mode: "free",
      effect: "vanishing",
      profile: "deutan",
      noise: 0.35,
      strength: 0.7,
      freeColors: ["#899764", "#ef7864", "#d6a15c", "#a5b589"],
    },
    colors: Array.from({ length: 64 }, () => ({
      space: "XYZ-D65",
      xyz: [0.3, 0.3, 0.3],
    })),
    motifs: ["6", "9"].map((text) => ({
      fillRule: "nonzero",
      kind: "text",
      text,
      path: "",
      x: 90,
      y: 90,
      scale: 1,
      rotation: 0,
      strokeWidth: 5,
    })),
    disks: [{ x: 90, y: 90, r: 2, color: 0 }],
    background: "#ffffff",
  };
  doc.disks = [{ x: 90, y: 90, r: 2, color: 0 }];
  await page.getByTestId("project-input").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByTestId("disk-count")).toHaveText("1 bulles");
  await expect(
    page.getByRole("button", { name: "Sauvegarder le projet" }),
  ).toBeEnabled();
});
