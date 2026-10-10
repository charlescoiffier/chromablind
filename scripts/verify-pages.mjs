import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const failed = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.goto(
    process.env.PAGES_TEST_URL || "http://127.0.0.1:4173/chromablind/",
  );
  await page
    .getByRole("button", { name: "Sauvegarder le projet", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Sauvegarder le projet"]').disabled,
  );
  assert.notEqual(
    await page.getByTestId("disk-count").textContent(),
    "0 bulles",
  );
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Exporter le PDF CMJN", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Exporter en SVG", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(
    await page
      .getByText("Sur GitHub Pages, les projets et SVG sont disponibles.", {
        exact: false,
      })
      .isVisible(),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(
    "Pages: fonts, ICC tables, worker, editor and available exports verified.",
  );
} finally {
  await browser.close();
}
