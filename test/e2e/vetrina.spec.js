import { test, expect } from "@playwright/test";
import { componiMessaggio } from "../../public/lib/whatsapp.js";

const VENERDI_MEZZOGIORNO = new Date("2026-10-23T12:00:00+02:00");
const scheda = (page, id) => page.locator(`.scheda[data-id="${id}"]`);

async function pannello(request) {
  const r = await request.post("/api/admin/login", { data: { pin: "482915" }, headers: { Origin: "http://127.0.0.1:3100" } });
  expect(r.ok()).toBeTruthy();
  return (metodo, percorso, data) => request.fetch(`/api/admin${percorso}`, {
    method: metodo, data, headers: { Origin: "http://127.0.0.1:3100" }
  });
}

test("aggiungi e invia: il link WhatsApp contiene il messaggio giusto", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await scheda(page, "sc1").locator(".piu").click();
  await scheda(page, "hb").locator(".piu").click();
  const barra = page.locator("#barra-vassoio");
  await expect(barra.locator(".conta")).toHaveText("3");
  await expect(barra.locator(".totale")).toHaveText(/20,00/);
  await barra.click();
  await page.fill("#nome-ritiro", "Giulia");
  await page.fill("#note", "senza maionese");
  await expect(page.locator("#ora-ritiro")).toHaveValue("12:20");
  const href = await page.locator("#invia-whatsapp").getAttribute("href");
  expect(href.startsWith("https://wa.me/393270536624?text=")).toBeTruthy();
  expect(decodeURIComponent(href.split("text=")[1])).toBe(componiMessaggio({
    nome: "Giulia", ora: "12:20", note: "senza maionese", demo: true,
    righe: [{ nome: "Container Serraglio 1", quantita: 2, prezzo: 6 }, { nome: "Hamburgher", quantita: 1, prezzo: 8 }]
  }));
});

test("senza nome non parte: errore accanto al campo", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  await scheda(page, "hd").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await page.locator("#invia-whatsapp").click();
  await expect(page.locator("#errore-nome")).toHaveText("Scrivi il nome per il ritiro.");
  await expect(page.locator("#nome-ritiro")).toBeFocused();
});

test("vassoio vecchio: via i prodotti spariti o finiti, con avviso", async ({ page, request }) => {
  const chiama = await pannello(request);
  await chiama("PUT", "/prodotti/hd/finito", { finito: true });
  try {
    await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
    await page.addInitScript(() => localStorage.setItem("cs-vassoio", JSON.stringify({ nonesiste: 1, hd: 1, sc1: 1 })));
    await page.goto("/");
    await expect(page.locator("#barra-vassoio .conta")).toHaveText("1");
    await page.locator("#barra-vassoio").click();
    await expect(page.locator("#avviso-vassoio")).toHaveText("Alcuni prodotti non sono più disponibili e li abbiamo tolti dal vassoio.");
    await expect(page.locator("#righe-vassoio li")).toHaveCount(1);
    await expect(page.locator("#totale-vassoio")).toHaveText(/6,00/);
  } finally {
    await chiama("PUT", "/prodotti/hd/finito", { finito: false });
  }
});

test("chiuso nel weekend: invio bloccato con il motivo", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-24T12:00:00+02:00"));
  await page.goto("/");
  await expect(page.locator("#stato-testo")).toHaveText("Chiuso · riapre lunedì alle 10:00");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await expect(page.locator("#invia-whatsapp")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#motivo-blocco")).toHaveText("Siamo chiusi — ordina lunedì alle 10:00.");
});

test("ordini sospesi dal pannello", async ({ page, request }) => {
  const chiama = await pannello(request);
  await chiama("PATCH", "/impostazioni", { ordini_attivi: "0" });
  try {
    await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
    await page.goto("/");
    await scheda(page, "sc1").locator(".piu").click();
    await page.locator("#barra-vassoio").click();
    await expect(page.locator("#motivo-blocco")).toHaveText("Ordini sospesi in questo momento.");
  } finally {
    await chiama("PATCH", "/impostazioni", { ordini_attivi: "1" });
  }
});

test("orario scaduto con il vassoio aperto: si ricontrolla al tocco", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-23T14:20:00+02:00"));
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await page.fill("#nome-ritiro", "Luca");
  await expect(page.locator("#ora-ritiro option")).toHaveText(["14:40", "14:50"]);
  await page.clock.setFixedTime(new Date("2026-10-23T14:52:00+02:00"));
  await page.locator("#invia-whatsapp").click();
  await expect(page.locator("#motivo-blocco")).toHaveText("Per oggi non ci sono più orari di ritiro.");
  await expect(page.locator("#invia-whatsapp")).toHaveAttribute("aria-disabled", "true");
});

test("dettaglio: allergeni, Esc chiude e il focus torna alla scheda", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  const apri = scheda(page, "pi4").locator(".scheda-apri");
  await apri.focus();
  await page.keyboard.press("Enter");
  const foglio = page.locator("#foglio-dettaglio");
  await expect(foglio).toBeVisible();
  await expect(foglio.locator(".allergeni-chip li")).toHaveText(["Glutine", "Pesce", "Latte"]);
  await page.keyboard.press("Escape");
  await expect(foglio).toBeHidden();
  await expect(apri).toBeFocused();
});

test.describe("movimento ridotto", () => {
  test.use({ reducedMotion: "reduce" });
  test("nessuna animazione dopo il +", async ({ page }) => {
    await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
    await page.goto("/");
    await scheda(page, "sc1").locator(".piu").click();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator(".pallino-volo")).toHaveCount(0);
  });
});

/* ---------- dalla revisione delle fasi 2-3 ---------- */

test("l'orario scelto non cambia di nascosto: se passa, avviso e niente invio", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-23T13:00:00+02:00"));
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await page.fill("#nome-ritiro", "Marta");
  await page.selectOption("#ora-ritiro", "13:30");
  await page.clock.setFixedTime(new Date("2026-10-23T13:20:00+02:00"));
  await page.fill("#note", "x");
  let aperto = false;
  page.on("popup", () => { aperto = true; });
  await page.locator("#invia-whatsapp").click();
  await expect(page.locator("#avviso-vassoio")).toHaveText(/L'orario che avevi scelto è passato/);
  expect(aperto).toBe(false);
});

test("il + del vassoio da tastiera tiene il focus", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  const piu = page.locator('#righe-vassoio li[data-id="sc1"] [data-piu]');
  await piu.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('#righe-vassoio li[data-id="sc1"] .quantita')).toHaveText("2");
  await expect(page.locator('#righe-vassoio li[data-id="sc1"] [data-piu]')).toBeFocused();
});

test("un nome fatto solo di simboli non basta", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await page.fill("#nome-ritiro", "**");
  await page.locator("#invia-whatsapp").click();
  await expect(page.locator("#errore-nome")).toHaveText("Scrivi il nome per il ritiro.");
});

test("Invia bloccato resta raggiungibile da tastiera e collegato al motivo", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-24T12:00:00+02:00"));
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  const invia = page.locator("#invia-whatsapp");
  await expect(invia).toHaveAttribute("href", "#");
  await expect(invia).toHaveAttribute("aria-describedby", "motivo-blocco");
});

test("svuotato il vassoio, il focus torna al menù", async ({ page }) => {
  await page.clock.setFixedTime(VENERDI_MEZZOGIORNO);
  await page.goto("/");
  await scheda(page, "sc1").locator(".piu").click();
  await page.locator("#barra-vassoio").click();
  await page.fill("#nome-ritiro", "Ada");
  await page.evaluate(() => { document.getElementById("chiedi-svuota").hidden = false; });
  await page.locator("#svuota-si").click();
  await expect(page.locator("#titolo-menu")).toBeFocused();
});
