import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture.jpg");

async function entra(page) {
  await page.goto("/admin");
  await page.fill("#pin", "482915");
  // il titolo "Oggi" c'è già nell'HTML: si aspetta il contenuto vero della schermata
  await expect(page.locator("#schermata-oggi .blocco-ordini")).toBeVisible();
}

async function vetrina(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  return { page, chiudi: () => ctx.close() };
}

test("PIN sbagliato: messaggio e campo vuoto; giusto: si entra", async ({ page }) => {
  await page.goto("/admin");
  await page.fill("#pin", "000000");
  await expect(page.locator("#errore-accesso")).toHaveText("PIN non valido.");
  await expect(page.locator("#pin")).toHaveValue("");
  await page.fill("#pin", "482915");
  await expect(page.locator("#titolo-schermata")).toHaveText("Oggi");
});

test("spegnere un prodotto lo segna finito sul sito", async ({ page, browser }) => {
  await entra(page);
  const sw = page.locator("#disp-hb");
  await sw.uncheck({ force: true });
  await expect(page.locator("#esito")).toContainText("Hamburgher: finito per oggi");
  const v = await vetrina(browser);
  await expect(v.page.locator('.scheda[data-id="hb"]')).toHaveClass(/finito/);
  await v.chiudi();
  await sw.check({ force: true });
  await expect(page.locator("#esito")).toContainText("Hamburgher: disponibile");
});

test("ordini in pausa: il sito non lascia inviare", async ({ page, browser }) => {
  await entra(page);
  await page.locator("#ordini-attivi").uncheck({ force: true });
  await expect(page.locator("#esito")).toContainText("Ordini in pausa");
  const v = await vetrina(browser);
  await v.page.locator('.scheda[data-id="sc1"] .piu').click();
  await v.page.locator("#barra-vassoio").click();
  await expect(v.page.locator("#motivo-blocco")).toHaveText("Ordini sospesi in questo momento.");
  await v.chiudi();
  await page.locator("#ordini-attivi").check({ force: true });
  await expect(page.locator("#esito")).toContainText("Ordini attivi");
});

test("prezzo di categoria con la virgola", async ({ page, browser }) => {
  await entra(page);
  await page.locator('[data-schermata="menu"]').click();
  await page.locator('[data-categoria="pinsa"]').click();
  await page.fill("#prezzo", "7,50");
  await page.locator('#modulo-editor button[type="submit"]').click();
  await expect(page.locator("#esito")).toContainText("Salvato");
  const v = await vetrina(browser);
  await expect(v.page.locator("#cat-pinsa .pillola-prezzo")).toHaveText("7,50 €");
  await v.chiudi();
  await page.locator('[data-categoria="pinsa"]').click();
  await page.fill("#prezzo", "7");
  await page.locator('#modulo-editor button[type="submit"]').click();
  await expect(page.locator("#esito")).toContainText("Salvato");
});

test("prezzo sbagliato: errore chiaro dentro l'editor", async ({ page }) => {
  await entra(page);
  await page.locator('[data-schermata="menu"]').click();
  await page.locator('[data-prodotto="sc2"]').click();
  await page.fill("#prezzo", "sei euro");
  await page.locator('#modulo-editor button[type="submit"]').click();
  await expect(page.locator("#errore-editor")).toHaveText("Il prezzo deve essere un numero, es. 6 o 6,50.");
});

test("foto dal telefono: rimpicciolita, caricata e visibile sul sito", async ({ page, browser }) => {
  await entra(page);
  await page.locator('[data-schermata="menu"]').click();
  await page.locator('[data-prodotto="bis"]').click();
  // si parte senza foto, come un prodotto nuovo: dopo il caricamento deve comparire "Rimuovi"
  if (await page.locator("#togli-foto").isVisible()) {
    await page.locator("#togli-foto").click();
    await expect(page.locator("#togli-foto")).toBeHidden();
  }
  await page.setInputFiles("#file-foto", FOTO);
  await expect(page.locator("#stato-foto")).toHaveText("Foto salvata: si vede già sul sito.");
  // la foto da 1600×1200 deve essere arrivata già ritagliata e leggera
  const src = await page.locator("#anteprima img").getAttribute("src");
  const servita = await page.request.get(`/${src}`);
  expect((await servita.body()).length).toBeLessThan(150_000);
  const v = await vetrina(browser);
  await expect(v.page.locator('.scheda[data-id="bis"] img')).toHaveAttribute("src", /^foto\/[0-9a-f]{16}\.(webp|jpg)$/);
  await v.chiudi();
  await expect(page.locator("#etichetta-foto")).toHaveText("Cambia foto");
  await page.locator("#togli-foto").click();
  await expect(page.locator("#stato-foto")).toHaveText("Foto rimossa: sul sito torna il disegno.");
});

test("chiuso oggi: il sito lo dice", async ({ page, browser }) => {
  await entra(page);
  await page.locator("#chiuso-oggi").click();
  await expect(page.locator("#chiuso-oggi")).toHaveText("Riapri oggi");
  const v = await vetrina(browser);
  await expect(v.page.locator("#stato-testo")).toHaveText(/^Chiuso oggi/);
  await v.chiudi();
  await page.locator("#chiuso-oggi").click();
  await expect(page.locator("#chiuso-oggi")).toHaveText("Oggi siamo chiusi");
});

test("eliminare chiede conferma con il nome", async ({ page }) => {
  await entra(page);
  await page.locator('[data-schermata="menu"]').click();
  await page.locator('[data-prodotto="pi5"]').click();
  await page.locator("#elimina-prodotto").click();
  await expect(page.locator("#testo-conferma")).toHaveText("Eliminare Crudo? Non si può annullare.");
  await page.locator("#conferma-no").click();
  await expect(page.locator('[data-prodotto="pi5"]')).toBeVisible();
});

test("si naviga con la sola tastiera", async ({ page }) => {
  await entra(page);
  await page.locator('[data-schermata="info"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#titolo-schermata")).toHaveText("Info");
  await expect(page.locator('[data-schermata="info"]')).toHaveAttribute("aria-current", "page");
  await page.locator("#aperto-5").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#ore-5")).toBeVisible();
});
