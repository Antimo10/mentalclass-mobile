/* =====================================================================
   MentalClass · Widget (solo versione app da store)
   ---------------------------------------------------------------------
   Questo file è la PARTE WEB del widget. Non disegna il widget (quello
   lo fa il codice nativo Swift/Kotlin): si limita a scrivere la frase
   del giorno in una "cassetta condivisa" che il widget legge, e a dirgli
   di aggiornarsi.

   Nel browser non fa nulla: il widget è una funzione del telefono.

   DIPENDE DAL PLUGIN: capacitor-widget-bridge
   (già aggiunto al package.json del progetto mobile)
   ===================================================================== */

(function () {
  "use strict";

  /* stesso identificatore usato nel codice nativo (App Group / SharedPrefs).
     Deve combaciare ESATTAMENTE con quello impostato in Xcode e Android. */
  var APP_GROUP = "group.it.mentalclass.app";
  var CHIAVE_FRASE  = "frase_del_giorno";
  var CHIAVE_AUTORE = "autore_del_giorno";

  function plugin() {
    try {
      return window.Capacitor &&
             window.Capacitor.Plugins &&
             window.Capacitor.Plugins.WidgetBridge;
    } catch (e) { return null; }
  }

  function eApp() {
    return !!(window.Capacitor &&
              window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  }

  var MCW = {

    /* Scrive la frase nella cassetta condivisa e aggiorna il widget.
       Da chiamare quando l'app carica/cambia la frase del giorno. */
    aggiorna: async function (frase, autore) {
      var p = plugin();
      if (!p || !eApp() || !frase) return;

      try {
        /* su Android va detto quali widget esistono, prima di aggiornarli */
        if (window.Capacitor.getPlatform && window.Capacitor.getPlatform() === "android") {
          try {
            await p.setRegisteredWidgets({
              widgets: ["it.mentalclass.app.FraseWidget"]
            });
          } catch (e) {}
        }

        /* scrivo frase e autore nella cassetta condivisa */
        await p.setItem({ group: APP_GROUP, key: CHIAVE_FRASE,  value: String(frase) });
        await p.setItem({ group: APP_GROUP, key: CHIAVE_AUTORE, value: String(autore || "MentalClass") });

        /* dico al widget di ridisegnarsi con i nuovi dati */
        await p.reloadAllTimelines();
      } catch (e) {}
    }
  };

  window.MCW = MCW;
})();
