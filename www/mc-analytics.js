/* =====================================================================
   MentalClass · Analytics (Plausible)
   ---------------------------------------------------------------------
   Versione veloce: Plausible non usa cookie e non raccoglie dati
   personali, quindi GDPR ed ePrivacy NON richiedono un banner di
   consenso. Nessun banner, nessuna logica di opt-in/opt-out: lo script
   parte da solo appena la pagina si carica.

   COSA DEVI FARE TU (5 minuti, una volta sola):
   1. Vai su https://plausible.io e crea un account (30 giorni di prova
      gratuita, poi a pagamento in base al traffico — niente piano
      gratuito per sempre come PostHog, è il compromesso di questa
      soluzione più semplice).
   2. Aggiungi il sito "mentalclass.it" e spunta "Include subdomains"
      così tiene insieme www.mentalclass.it e app.mentalclass.it.
   3. Non serve incollare nessuna chiave qui: lo script sotto usa già
      il tuo dominio (data-domain nel tag <script> in ogni pagina).

   UN LIMITE ONESTO DI QUESTA VERSIONE:
   Plausible è anonimo per progettazione — non collega gli eventi a UNA
   persona specifica (niente nome, niente email, niente ID utente). Va
   benissimo per "quante persone fanno X" ma non per "cosa ha fatto
   Mario nello specifico". Se in futuro ti serve quel livello di
   dettaglio, è lì che si torna a PostHog.
   ===================================================================== */

(function () {
  "use strict";

  /* la coda che raccoglie gli eventi finché lo script Plausible non è
     ancora arrivato dal loro server (evita di perdere i primi click) */
  window.plausible = window.plausible || function () {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };

  var MCA = {
    /* non c'è nulla da attivare: Plausible parte da solo */
    init: function () {},

    /* Plausible non identifica le singole persone: questa funzione
       resta per compatibilità con i punti dell'app che la richiamano,
       ma non fa nulla. */
    identificaUtente: function () {},
    reset: function () {},

    /* Registra un'azione. Esempi: "audio aperto", "paywall audio mostrato". */
    evento: function (nome, proprieta) {
      try { window.plausible(nome, proprieta ? { props: proprieta } : undefined); }
      catch (e) {}
    }
  };

  window.MCA = MCA;
})();
