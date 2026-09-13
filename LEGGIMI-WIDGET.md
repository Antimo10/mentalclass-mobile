# Widget "Frase del giorno" — guida per la compilazione

## Cos'è

Un widget non interattivo per la schermata Home (iPhone e Android) che mostra la frase del giorno di MentalClass, su sfondo col gradiente teal del brand. Non è cliccabile: mostra solo la frase, che l'app aggiorna ogni giorno.

## Come funziona (il meccanismo)

1. L'app (codice web, `mc-widget.js`) scrive la frase del giorno in una **cassetta condivisa** — su iPhone si chiama "App Group", su Android "SharedPreferences".
2. Il widget nativo legge da quella cassetta e mostra la frase.
3. Quando l'app aggiorna la frase, dice al widget di ridisegnarsi.

La parte web è già pronta e testata. Questa cartella contiene la **parte nativa**, da installare in fase di compilazione.

---

## ⚠️ Nota di onestà

La parte web (che scrive la frase nella cassetta) è stata testata e funziona. La parte nativa qui sotto è scritta corretta e commentata, ma **non è stato possibile testarla** dall'ambiente di sviluppo web: va compilata con Xcode (iOS) e Android Studio (Android), che girano dentro Capawesome. Eventuali micro-aggiustamenti di layout (una frase troppo lunga, un margine) si vedono solo alla prima compilazione. È normale per qualsiasi widget: si rifinisce provandolo sul dispositivo.

---

## FILE iOS (cartella `ios/`)

**`FraseWidget.swift`** — il widget completo in SwiftUI.

Come si installa (lo fa chi compila):
1. In Xcode: **File → New → Target → Widget Extension**, nome **FraseWidget**
2. Attivare **App Groups** su DUE target (l'app principale E il widget), con lo stesso ID: `group.it.mentalclass.app`
3. Sostituire il file `.swift` generato automaticamente con `FraseWidget.swift`

---

## FILE Android (cartella `android/`)

| File | Dove va |
|---|---|
| `FraseWidget.kt` | `android/app/src/main/java/it/mentalclass/app/` |
| `frase_widget.xml` | `android/app/src/main/res/layout/` |
| `widget_sfondo.xml` | `android/app/src/main/res/drawable/` |
| `frase_widget_info.xml` | `android/app/src/main/res/xml/` |

Inoltre va aggiunto un blocco `<receiver>` nel file `AndroidManifest.xml` — il testo esatto è scritto come commento dentro `frase_widget_info.xml`.

---

## Un dato che deve combaciare ovunque

L'identificatore della cassetta condivisa — `group.it.mentalclass.app` — compare in **tre posti** e deve essere identico in tutti:
1. `mc-widget.js` (parte web) → variabile `APP_GROUP`
2. `FraseWidget.swift` (iOS) → costante `MC_APP_GROUP`
3. `FraseWidget.kt` (Android) → il nome nelle `getSharedPreferences(...)`

Se non combacia, il widget resta vuoto. In fase di compilazione lo verifico io con te.

---

## Quando fare tutto questo

Non ora. Questa parte si installa **dopo** che l'app base funziona su Capawesome (Fase D della guida principale). Prima l'app che gira, poi il widget sopra. Te lo ricordo io al momento giusto.
