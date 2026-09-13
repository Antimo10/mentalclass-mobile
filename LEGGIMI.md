# MentalClass — Pacchetto per App Store e Google Play

## Cosa c'è in questa cartella

```
mentalclass-app-store/
├── capacitor.config.json   ← le impostazioni dell'app (nome, colori, ID)
├── package.json            ← elenco degli "ingredienti" tecnici (Capacitor)
├── assets/
│   ├── icon-only.png              1024×1024 — icona sorgente, genera tutte le taglie
│   ├── icona-appstore-1024.png    per la scheda su App Store Connect
│   └── icona-googleplay-512.png   per la scheda su Google Play Console
└── www/
    ├── index.html   ← l'app vera (copia di app.html, rinominata come richiesto)
    ├── mc-api.js
    └── mc-analytics.js
```

Questa è la base tecnica pronta. Non manca il codice: manca il "confezionamento" finale, che si fa online con il servizio che abbiamo scelto (Capawesome Cloud), senza bisogno di un Mac.

---

## Cosa ho già modificato nel codice, e perché

**L'abbonamento non si vende più dentro la versione app-store.** Ho aggiunto un controllo (`eAppNativa()`) che riconosce se l'app sta girando come vera app da telefono (dentro Capacitor) oppure come sito nel browser:

- **Nel browser** (mentalclass.it, come oggi): tutto identico a ora, il pagamento con Stripe funziona come sempre.
- **Nell'app da App Store/Google Play**: il pulsante "Abbonati" non apre più Stripe. Mostra invece un avviso — *"Si fa dal sito. L'abbonamento si attiva su mentalclass.it..."* — senza nessun link diretto al pagamento, e i testi dei pulsanti cambiano in modo neutro ("Info sull'abbonamento" invece di "Scegli Mensile").

È lo stesso modello di Netflix, Spotify, Kindle: l'app si scarica gratis, chi vuole abbonarsi lo fa sul sito, Apple e Google non vedono passare nessuna vendita e non trattengono commissioni. **Ho verificato che questo comportamento funzioni correttamente con dei test automatici** (la versione web continua a funzionare come sempre, la versione app blocca correttamente il pagamento).

> ⚠️ **Una cosa onesta da sapere:** questa è la strada più sicura e più comune, ma l'ultima parola su cosa Apple accetta o rifiuta in fase di controllo ce l'hanno loro. Se lavori con un consulente o un'agenzia per la pubblicazione, fai vedere loro questo punto prima di inviare l'app in revisione.

---

## I prossimi passi, in ordine

### FASE 1 — Apri i due account (li apri solo tu)

1. **Apple Developer Program** — vai su developer.apple.com, 99$/anno, serve verificare la tua identità
2. **Google Play Console** — vai su play.google.com/console, 25$ una tantum

Questi due passaggi richiedono la tua identità reale: non posso farli al posto tuo.

### FASE 2 — Apri un account su Capawesome Cloud

Vai su **cloud.capawesome.io**, crea un account (si parte da 9$/mese). È il servizio che prende il codice di questa cartella e lo trasforma nei file che Apple e Google accettano — senza che tu debba comprare un Mac.

### FASE 3 — Qui torniamo a lavorare insieme

Quando hai fatto la Fase 1 e la Fase 2, torna da me. A quel punto:
- Ti guido passo passo nel collegare questa cartella a Capawesome Cloud
- Prepariamo insieme i testi della scheda (descrizione, parole chiave)
- Verifichiamo gli screenshot da caricare (te li preparo io a partire dall'app vera)
- Impostiamo l'invio alla revisione

### FASE 4 — La revisione

Apple impiega di solito 1-3 giorni per controllare l'app prima di pubblicarla. Google, per i nuovi account, da maggio 2026 chiede anche un **test chiuso con almeno 12 persone per 14 giorni consecutivi** prima di poter pubblicare davvero — è una regola loro, non qualcosa che possiamo saltare. Vale la pena saperlo ora per pianificare i tempi, non scoprirlo all'ultimo.

---

## Riepilogo costi

| Cosa | Costo | Quando |
|---|---|---|
| Apple Developer Program | 99$ | ora, poi ogni anno |
| Google Play Console | 25$ | una volta sola |
| Capawesome Cloud | da 9$/mese | quando iniziamo a compilare |

**Totale per partire: circa 133$**, più l'abbonamento mensile del servizio di compilazione finché serve.

---

## Cosa NON cambia

Il sito (www.mentalclass.it) e la webapp continuano a funzionare esattamente come oggi, sullo stesso codice. L'app da store è "la stessa app in un contenitore diverso" — non è un progetto parallelo da mantenere doppio.

---

## Notifiche giornaliere (già incluse)

L'app include le notifiche con le frasi del giorno, all'orario della fascia scelta dall'utente (Mattina / Tutto il giorno / Sera). Funzionano solo nella versione app da store, non nel browser — è normale, le notifiche locali sono una funzione del telefono.

Come funzionano: quando l'utente apre l'app, vengono programmate le notifiche dei prossimi 14 giorni. Ogni volta che riapre l'app, se ne programmano altre con frasi fresche. Il telefono le invia da solo, anche ad app chiusa.

**Un dettaglio tecnico per Android**, da sistemare in fase di build (te lo ricordo io quando arriviamo lì): per far scattare le notifiche all'orario esatto, Android 12+ richiede una riga di permesso nel file `AndroidManifest.xml`:
```
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```
Questo file viene generato da Capacitor durante la prima build. Non serve farlo ora: è un passaggio di quando colleghiamo Capawesome.

