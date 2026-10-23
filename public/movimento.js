/* Movimento della vetrina.
   Tutto anima solo transform e opacity (lavoro della scheda grafica, fluido
   anche su telefoni economici), dura poco e parte una volta sola: le schede
   compaiono entrando nello schermo, la foto si allarga nel dettaglio, il
   pallino vola al vassoio, i passi di "Come funziona" si accendono in fila.
   Niente che giri all'infinito. Con "riduci movimento" non parte niente e
   la pagina resta identica, solo ferma. */

import { euro } from "./lib/whatsapp.js";

const ridotto = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s, dentro = document) => dentro.querySelector(s);
const $$ = (s, dentro = document) => [...dentro.querySelectorAll(s)];
const attivo = () => !ridotto.matches;

/* ---------- transizioni di vista (foto della scheda → foglio) ----------
   Dove il browser non le conosce (o con movimento ridotto) il cambio avviene
   subito, e il foglio sale con la sua animazione normale. */
export function transizione(aggiorna) {
  if (!attivo() || !document.startViewTransition) { aggiorna(); return Promise.resolve(false); }
  const t = document.startViewTransition(aggiorna);
  return t.finished.then(() => true, () => true);
}

/* ---------- "+": salto, ✓, pallino che vola al vassoio ---------- */

export function animaAggiunta(da, verso) {
  if (!attivo() || !da || !verso || verso.hidden) return;
  da.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: 300, easing: "cubic-bezier(.2,.9,.3,1.4)" });
  // conferma visiva: il "+" diventa ✓ per un attimo (il nome accessibile non cambia)
  if (da.classList.contains("piu") && !da.dataset.segno) {
    da.dataset.segno = da.textContent;
    da.textContent = "✓";
    da.classList.add("fatto");
    setTimeout(() => { da.textContent = da.dataset.segno; delete da.dataset.segno; da.classList.remove("fatto"); }, 700);
  }

  const a = da.getBoundingClientRect();
  const b = verso.querySelector(".conta")?.getBoundingClientRect() || verso.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const pallino = document.createElement("span");
  pallino.className = "pallino-volo";
  pallino.setAttribute("aria-hidden", "true");
  pallino.style.left = `${a.left + a.width / 2 - 7}px`;
  pallino.style.top = `${a.top + a.height / 2 - 7}px`;
  document.body.append(pallino);
  // arco: sale un po' prima di scendere verso la barra
  const volo = pallino.animate([
    { transform: "translate(0, 0) scale(1)" },
    { transform: `translate(${dx * .5}px, ${Math.min(dy * .5, 0) - 60}px) scale(1.1)`, offset: .45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.6)` }
  ], { duration: 450, easing: "cubic-bezier(.3,.7,.4,1)" });
  volo.onfinish = () => {
    pallino.remove();
    verso.animate([{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
      { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.4)" });
    $(".conta", verso)?.animate([{ transform: "scale(1)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }],
      { duration: 320, easing: "cubic-bezier(.2,.9,.3,1.4)" });
  };
  // la quantità sulla scheda fa un piccolo salto
  da.closest(".scheda")?.querySelector(".quanti")?.animate(
    [{ transform: "scale(.6)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
    { duration: 320, easing: "cubic-bezier(.2,.9,.3,1.4)" });
}

export function contaFino(el, valore) {
  const da = Number(el.dataset.valore ?? valore);
  el.dataset.valore = String(valore);
  if (!attivo() || da === valore) { el.textContent = euro(valore); return; }
  const inizio = performance.now();
  const passo = t => {
    const k = Math.min(1, (t - inizio) / 300);
    const v = da + (valore - da) * (1 - (1 - k) ** 3);
    el.textContent = euro(k < 1 ? Math.round(v * 100) / 100 : valore);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

document.addEventListener("vassoio:aggiunto", ev => animaAggiunta(ev.detail.da, document.getElementById("barra-vassoio")));
document.addEventListener("vassoio:totale", ev => contaFino(ev.detail.el, ev.detail.valore));

/* ---------- comparsa una volta sola entrando nello schermo ----------
   Le schede (e i passi di "Come funziona") partono nascoste solo se questo
   codice gira: senza JavaScript, o con movimento ridotto, sono già lì. */
if (attivo() && "IntersectionObserver" in window) {
  document.documentElement.classList.add("anima-entrate");
  const osserva = new IntersectionObserver(voci => {
    // le schede che entrano insieme (una riga della griglia) escono una dopo l'altra
    voci.filter(v => v.isIntersecting).forEach((v, i) => {
      v.target.style.transitionDelay = `${Math.min(i, 5) * 60}ms`;
      v.target.classList.add("vista");
      osserva.unobserve(v.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .12 });
  $$(".scheda, .passi").forEach(el => osserva.observe(el));
}

/* ---------- categoria attiva: la pillola scura scivola fra le voci ---------- */
const chips = $(".chips");
if (chips) {
  const cursore = document.createElement("span");
  cursore.className = "chip-cursore";
  cursore.setAttribute("aria-hidden", "true");
  chips.prepend(cursore);
  chips.classList.add("con-cursore");
  let primaVolta = true;
  document.addEventListener("chip:attiva", ev => {
    const chip = ev.detail.chip;
    cursore.classList.toggle("visibile", !!chip);
    if (!chip) return;
    if (primaVolta) { cursore.classList.add("senza-transizione"); primaVolta = false; }
    cursore.style.width = `${chip.offsetWidth}px`;
    cursore.style.transform = `translateX(${chip.offsetLeft}px)`;
    requestAnimationFrame(() => cursore.classList.remove("senza-transizione"));
    // la voce attiva resta visibile nella fila che scorre di lato
    const sinistra = chip.offsetLeft - 16;
    const destra = chip.offsetLeft + chip.offsetWidth + 16 - chips.clientWidth;
    if (chips.scrollLeft > sinistra) chips.scrollTo({ left: sinistra, behavior: attivo() ? "smooth" : "auto" });
    else if (chips.scrollLeft < destra) chips.scrollTo({ left: destra, behavior: attivo() ? "smooth" : "auto" });
  });
}
