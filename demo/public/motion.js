/* Container Serraglio — movimento
   ------------------------------------------------------------------
   Strato di animazione sopra app.js: se manca, il sito funziona uguale.
   GSAP + ScrollTrigger per le animazioni, Lenis per lo scorrimento
   morbido; gli effetti sono riscritti in JavaScript semplice partendo
   dai componenti di React Bits (BlurText, SplitText, CountUp, Magnet,
   SpotlightCard, ScrollVelocity, DecryptedText, AnimatedContent).
   Le librerie stanno in vendor/ e non su CDN: la CSP del server
   accetta solo script da 'self', e il sito deve girare anche offline
   sull'hotspot del telefono.
   Con "riduci movimento" attivo nel sistema non parte niente.
   ------------------------------------------------------------------ */

(() => {
  if (!window.gsap || !window.ScrollTrigger || !window.Lenis) return;
  // ?movimento nell'indirizzo forza le animazioni, per vedere la demo
  // anche da un computer che ha "riduci movimento" attivo
  const forza = new URLSearchParams(location.search).has("movimento");
  if (!forza && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  gsap.registerPlugin(ScrollTrigger);

  const $ = s => document.querySelector(s);
  const tutti = s => gsap.utils.toArray(s);
  const puntatoreFine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- scorrimento morbido ----------
     Lenis gira sul ticker di GSAP, così ScrollTrigger e Lenis leggono
     la stessa posizione nello stesso fotogramma. Sui link interni
     Lenis rispetta già lo scroll-padding-top del CSS. */

  const lenis = new Lenis({ anchors: true, autoRaf: false });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  /* ---------- parole divise (SplitText / BlurText) ----------
     Avvolge ogni parola in uno span lasciando intatti <em> e <br>.
     Con "maschera" la parola sale da dentro un riquadro che la taglia. */

  function dividiParole(el, maschera = false) {
    const parole = [];
    const giro = nodo => [...nodo.childNodes].forEach(n => {
      if (n.nodeType === Node.ELEMENT_NODE) { if (n.tagName !== "BR") giro(n); return; }
      if (n.nodeType !== Node.TEXT_NODE) return;
      const frammento = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(pezzo => {
        if (!pezzo) return;
        if (/^\s+$/.test(pezzo)) { frammento.append(pezzo); return; }
        const parola = document.createElement("span");
        parola.className = maschera ? "parola maschera" : "parola";
        if (maschera) {
          const dentro = document.createElement("span");
          dentro.textContent = pezzo;
          parola.append(dentro);
          parole.push(dentro);
        } else {
          parola.textContent = pezzo;
          parole.push(parola);
        }
        frammento.append(parola);
      });
      n.replaceWith(frammento);
    });
    giro(el);
    return parole;
  }

  /* ---------- hero: ingresso ---------- */

  const titolo = dividiParole($(".hero h1"));
  const numeri = tutti(".numeri dt");

  const ingresso = gsap.timeline({ defaults: { ease: "power3.out" } });
  ingresso
    .from(".hero .occhiello", { y: 20, opacity: 0, duration: .6 })
    .from(titolo, { y: 36, opacity: 0, filter: "blur(10px)", duration: .9, stagger: .07, clearProps: "filter" }, "-=.3")
    .from([".hero .sottotitolo", ".hero .azioni", ".numeri"], { y: 24, opacity: 0, duration: .7, stagger: .1 }, "-=.6")
    .from(".hero-foto", { scale: .82, opacity: 0, duration: 1.1, ease: "expo.out" }, .25)
    .from(".bollo", { scale: 0, rotation: -12, duration: .7, stagger: .15, ease: "back.out(2.2)" }, "-=.5");

  // CountUp: i prezzi contano da zero mentre compaiono
  numeri.forEach(dt => {
    const [, cifra, resto] = dt.textContent.match(/(\d+)(.*)/) || [];
    if (!cifra) return;
    const conta = { v: 0 };
    ingresso.to(conta, {
      v: Number(cifra), duration: 1.2, ease: "power2.out",
      onUpdate: () => { dt.textContent = Math.round(conta.v) + resto; }
    }, "<");
  });

  /* ---------- hero: profondità ----------
     Allo scorrere il testo sale e sbiadisce, la foto va più piano e
     l'alone si allarga: tre velocità diverse danno la profondità. */

  const scorriHero = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
  gsap.to(".hero-testo", { y: 90, opacity: .25, ease: "none", scrollTrigger: scorriHero });
  gsap.to(".hero-foto", { y: -50, ease: "none", scrollTrigger: scorriHero });
  gsap.to(".alone", { y: 160, scale: 1.25, ease: "none", scrollTrigger: scorriHero });

  // inclinazione della foto che segue il puntatore (TiltedCard)
  if (puntatoreFine) {
    const foto = $(".hero-foto");
    gsap.set(foto, { transformPerspective: 900 });
    const giraX = gsap.quickTo(foto, "rotationX", { duration: .8, ease: "power3.out" });
    const giraY = gsap.quickTo(foto, "rotationY", { duration: .8, ease: "power3.out" });
    $(".hero").addEventListener("pointermove", e => {
      const r = foto.getBoundingClientRect();
      giraY(gsap.utils.clamp(-1, 1, (e.clientX - r.left) / r.width * 2 - 1) * 10);
      giraX(gsap.utils.clamp(-1, 1, (e.clientY - r.top) / r.height * 2 - 1) * -8);
    });
    $(".hero").addEventListener("pointerleave", () => { giraX(0); giraY(0); });
  }

  /* ---------- testata che si fa da parte ----------
     Scorrendo in giù sparisce e lascia lo schermo al menù; basta
     risalire di poco per riaverla. Resta ferma col menù mobile aperto
     o quando ci si arriva con la tastiera. */

  const testata = $(".testata");
  let nascosta = false;
  const mostraTestata = si => {
    if (nascosta === !si) return;
    nascosta = !si;
    gsap.to(testata, { yPercent: si ? 0 : -100, duration: .35, ease: "power2.out", overwrite: true });
  };
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: self => {
      if (document.documentElement.classList.contains("nav-aperta")) return mostraTestata(true);
      mostraTestata(self.direction < 0 || self.scroll() < 120);
    }
  });
  testata.addEventListener("focusin", () => mostraTestata(true));

  /* ---------- menù mobile ----------
     Il cerchio che si apre è CSS; qui le voci entrano una dopo l'altra
     mentre il cerchio si allarga, e Lenis si ferma finché è aperto.
     Si guarda aria-expanded del pulsante e non la classe su <html>,
     che Lenis cambia a ogni scorrimento. */

  const bottoneNav = $("#apri-nav");
  const vociNav = tutti(".nav-mobile-voce, .nav-mobile-piede > *");
  new MutationObserver(() => {
    if (bottoneNav.getAttribute("aria-expanded") === "true") {
      lenis.stop();
      mostraTestata(true);
      gsap.fromTo(vociNav, { y: 48, opacity: 0 }, {
        y: 0, opacity: 1, duration: .7, ease: "power3.out", stagger: .06, delay: .15, overwrite: true
      });
    } else {
      lenis.start();
    }
  }).observe(bottoneNav, { attributes: true, attributeFilter: ["aria-expanded"] });

  /* ---------- nastro (ScrollVelocity) ----------
     Scorre da solo; quando la pagina scorre accelera nella stessa
     direzione e poi torna alla sua andatura. */

  const binario = $(".nastro-binario");
  if (binario) {
    const giro = binario.innerHTML;
    let larghezza = 0;
    const prepara = () => {
      binario.innerHTML = giro;
      const una = binario.scrollWidth || 1;
      const copie = Math.max(1, Math.ceil(innerWidth / una));
      binario.innerHTML = giro.repeat(copie * 2);
      larghezza = una * copie;
    };
    prepara();
    let attesa;
    addEventListener("resize", () => { clearTimeout(attesa); attesa = setTimeout(prepara, 200); });

    const sposta = gsap.quickSetter(binario, "x", "px");
    const avvolgi = x => gsap.utils.wrap(-larghezza, 0, x);
    let x = 0, verso = -1, visibile = false;
    ScrollTrigger.create({ trigger: ".nastro", onToggle: self => { visibile = self.isActive; } });
    gsap.ticker.add((t, dt) => {
      if (!visibile) return;
      const v = lenis.velocity || 0;
      if (Math.abs(v) > .5) verso = v > 0 ? -1 : 1;
      x = avvolgi(x + verso * .06 * dt * (1 + Math.min(Math.abs(v) / 5, 6)));
      sposta(x);
    });
  }

  /* ---------- comparse allo scorrimento (AnimatedContent) ---------- */

  tutti(".sezione-testa h2, .dove h2").forEach(h2 => {
    gsap.from(dividiParole(h2, true), {
      yPercent: 110, duration: .9, ease: "power4.out", stagger: .06,
      scrollTrigger: { trigger: h2, start: "top 88%", once: true }
    });
  });

  // i tre passi salgono in fila e il numero di ciascuno "scatta" subito dopo
  const passi = tutti(".passo");
  gsap.set(passi, { y: 40, opacity: 0 });
  gsap.set(".passo-numero", { scale: 0 });
  ScrollTrigger.batch(passi, {
    start: "top 90%", once: true,
    onEnter: gruppo => {
      gsap.to(gruppo, { y: 0, opacity: 1, duration: .8, ease: "power3.out", stagger: .12, clearProps: "transform,opacity" });
      gsap.to(gruppo.map(p => p.querySelector(".passo-numero")), {
        scale: 1, duration: .6, ease: "back.out(2.5)", stagger: .12, delay: .25, clearProps: "transform"
      });
    }
  });

  const comparse = tutti(".striscia p, .sezione-testa .etichetta, .sezione-testa .sottotitolo, .come-piede, .filtri, .dove .etichetta, .dove .sottotitolo, .dove .azioni, .orari, .piede > *");
  gsap.set(comparse, { y: 32, opacity: 0 });
  ScrollTrigger.batch(comparse, {
    start: "top 92%", once: true,
    onEnter: gruppo => gsap.to(gruppo, { y: 0, opacity: 1, duration: .8, ease: "power3.out", stagger: .08, clearProps: "transform,opacity" })
  });

  /* ---------- schede del menù ----------
     app.js manda "menu:mostrato" al primo disegno e a ogni cambio di
     filtro: solo allora le schede entrano in scena. I ridisegni per le
     scorte restano immediati, senza animazione. */

  let lotto = [];
  document.addEventListener("menu:mostrato", () => {
    lotto.forEach(t => t.kill());
    const schede = tutti("#griglia .scheda");
    gsap.set(schede, { y: 48, scale: .96, opacity: 0 });
    lotto = ScrollTrigger.batch(schede, {
      start: "top 94%", once: true,
      onEnter: gruppo => gsap.to(gruppo, {
        y: 0, scale: 1, opacity: (i, el) => el.classList.contains("esaurita") ? .55 : 1,
        duration: .7, ease: "power3.out", stagger: .06, clearProps: "transform,opacity"
      })
    });
    ScrollTrigger.refresh();
  });

  // luce che segue il puntatore sulla scheda (SpotlightCard)
  if (puntatoreFine) {
    $("#griglia").addEventListener("pointermove", e => {
      const scheda = e.target.closest(".scheda");
      if (!scheda) return;
      const r = scheda.getBoundingClientRect();
      scheda.style.setProperty("--mx", `${e.clientX - r.left}px`);
      scheda.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  }

  /* ---------- pulsanti calamitati (Magnet) ---------- */

  if (puntatoreFine) {
    tutti(".hero .btn, .dove .btn, .testata .btn").forEach(el => {
      const vaiX = gsap.quickTo(el, "x", { duration: .6, ease: "elastic.out(1, .4)" });
      const vaiY = gsap.quickTo(el, "y", { duration: .6, ease: "elastic.out(1, .4)" });
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        vaiX((e.clientX - r.left - r.width / 2) * .3);
        vaiY((e.clientY - r.top - r.height / 2) * .4);
      });
      el.addEventListener("pointerleave", () => { vaiX(0); vaiY(0); });
    });
  }

  /* ---------- aggiunta all'ordine ----------
     Il bottone premuto viene ridisegnato da app.js, quindi la sua
     posizione si legge in fase di cattura, prima che sparisca. Il
     pallino vola solo se il conteggio è davvero salito. */

  const conteggio = $("#conteggio");
  document.addEventListener("click", e => {
    const piu = e.target.closest("[data-piu]");
    if (!piu) return;
    const da = piu.getBoundingClientRect();
    const prima = Number(conteggio.textContent);
    const nelDialogo = !!piu.closest("dialog");
    requestAnimationFrame(() => {
      if (Number(conteggio.textContent) <= prima) return;
      if (nelDialogo) return rimbalza();
      voloVerso(da, conteggio.getBoundingClientRect());
    });
  }, true);

  function rimbalza() {
    gsap.fromTo(conteggio, { scale: 1.6 }, { scale: 1, duration: .6, ease: "elastic.out(1, .35)" });
  }

  function voloVerso(da, a) {
    const pallino = document.createElement("span");
    pallino.className = "pallino-volo";
    document.body.append(pallino);
    const x0 = da.left + da.width / 2, y0 = da.top + da.height / 2;
    const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2;
    gsap.set(pallino, { x: x0, y: y0, xPercent: -50, yPercent: -50 });
    gsap.timeline({ onComplete: () => { pallino.remove(); rimbalza(); } })
      .to(pallino, { x: x1, duration: .65, ease: "power1.inOut" })
      .to(pallino, { y: Math.min(y0, y1) - 120, duration: .3, ease: "power2.out" }, 0)
      .to(pallino, { y: y1, duration: .35, ease: "power2.in" }, .3)
      .to(pallino, { scale: .4, duration: .65 }, 0);
  }

  /* ---------- finestra dell'ordine ----------
     Mentre è aperta Lenis si ferma, così la rotella scorre l'elenco e
     non la pagina dietro. */

  const dialogo = $("#ordine");
  new MutationObserver(() => {
    if (dialogo.open) {
      lenis.stop();
      gsap.from(dialogo, { yPercent: 12, opacity: 0, duration: .45, ease: "power3.out", clearProps: "transform,opacity" });
      gsap.from(dialogo.querySelectorAll(".riga"), { x: -16, opacity: 0, duration: .4, stagger: .05, delay: .1, clearProps: "transform,opacity" });
    } else {
      lenis.start();
    }
  }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });

  // codice dell'ordine che si "decifra" (DecryptedText)
  const conferma = $("#conferma");
  new MutationObserver(() => {
    if (conferma.hidden) return;
    const el = $("#codice-ordine");
    const finale = el.textContent;
    const segni = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const p = { v: 0 };
    gsap.from(el, { scale: .6, duration: .7, ease: "back.out(2.4)" });
    gsap.to(p, {
      v: 1, duration: 1, ease: "none",
      onUpdate: () => {
        const fissi = Math.floor(p.v * finale.length);
        el.textContent = finale.slice(0, fissi) + [...finale.slice(fissi)]
          .map(c => c === " " || c === "-" ? c : segni[Math.random() * segni.length | 0]).join("");
      },
      onComplete: () => { el.textContent = finale; }
    });
  }).observe(conferma, { attributes: true, attributeFilter: ["hidden"] });
})();
