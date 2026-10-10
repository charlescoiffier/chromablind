import { chromium, webkit } from "playwright";
import { mkdir } from "node:fs/promises";
await mkdir("docs/images", { recursive: true });
async function ready(page) {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Sauvegarder le projet"]').disabled,
  );
}
async function compose(page) {
  const open = page.getByRole("button", {
    name: "Afficher les réglages",
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: "Motif", exact: true }).click();
  await page.getByLabel("Texte du motif").fill("6");
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await ready(page);
await compose(page);
await page.getByRole("button", { name: "Résultat", exact: true }).click();
await page.getByRole("button", { name: "Format", exact: true }).click();
await page.screenshot({ path: "docs/images/apercu-bureau.png" });
await page.getByRole("button", { name: "Motif", exact: true }).click();
await page.getByRole("button", { name: "Conception", exact: true }).click();
await page.screenshot({ path: "docs/images/conception.png" });
await page.getByRole("button", { name: "Dessin", exact: true }).click();
await page.screenshot({ path: "docs/images/dessin.png" });
await browser.close();
const tablet = await webkit.launch();
const tabletPage = await tablet.newPage({
  viewport: { width: 834, height: 1194 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await ready(tabletPage);
await compose(tabletPage);
await tabletPage.getByRole("button", { name: "Résultat", exact: true }).click();
for (const name of ["Fermer les réglages", "Fermer les simulations"]) {
  const close = tabletPage.getByRole("button", { name, exact: true });
  if (await close.isVisible()) await close.click();
}
await tabletPage.screenshot({ path: "docs/images/tablette.png" });
await tablet.close();
