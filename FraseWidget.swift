//  =====================================================================
//  MentalClass · Widget iOS (SwiftUI + WidgetKit)
//  ---------------------------------------------------------------------
//  Widget NON interattivo: mostra la frase del giorno su sfondo brand.
//  Legge la frase dalla "cassetta condivisa" (App Group) che l'app
//  aggiorna dal codice web (mc-widget.js).
//
//  NON POSSO TESTARE QUESTO CODICE dall'ambiente web: va compilato in
//  Xcode (dentro Capawesome). È scritto corretto e commentato, ma
//  eventuali micro-aggiustamenti di layout si vedono solo compilando.
//
//  COME SI INSTALLA (lo fa chi compila, con la mia guida):
//  1. In Xcode: File > New > Target > Widget Extension, nome "FraseWidget"
//  2. Attivare App Groups sia sull'app sia sul widget, ID:
//     group.it.mentalclass.app
//  3. Sostituire il file generato con questo.
//  =====================================================================

import WidgetKit
import SwiftUI

// L'identificatore della cassetta condivisa: deve combaciare ESATTAMENTE
// con APP_GROUP in mc-widget.js
let MC_APP_GROUP = "group.it.mentalclass.app"
let MC_KEY_FRASE = "frase_del_giorno"
let MC_KEY_AUTORE = "autore_del_giorno"

// I colori del brand MentalClass
extension Color {
    static let mcDeep  = Color(red: 8/255,  green: 68/255,  blue: 76/255)   // #08444C
    static let mcHi    = Color(red: 14/255, green: 91/255,  blue: 102/255)  // #0e5b66
    static let mcAbyss = Color(red: 5/255,  green: 44/255,  blue: 49/255)   // #052c31
    static let mcCream = Color(red: 241/255, green: 237/255, blue: 226/255) // #F1EDE2
    static let mcLime  = Color(red: 194/255, green: 232/255, blue: 62/255)  // #C2E83E
}

// I dati che il widget mostra
struct FraseEntry: TimelineEntry {
    let date: Date
    let frase: String
    let autore: String
}

// Legge la frase dalla cassetta condivisa e costruisce la timeline
struct FraseProvider: TimelineProvider {

    // testo di riserva se la cassetta è ancora vuota (prima apertura app)
    private func leggi() -> (String, String) {
        let difese = UserDefaults(suiteName: MC_APP_GROUP)
        let frase = difese?.string(forKey: MC_KEY_FRASE)
            ?? "Alleniamo la mente, un giorno alla volta."
        let autore = difese?.string(forKey: MC_KEY_AUTORE) ?? "MentalClass"
        return (frase, autore)
    }

    func placeholder(in context: Context) -> FraseEntry {
        FraseEntry(date: Date(), frase: "La disciplina è la forma più alta di libertà.", autore: "MentalClass")
    }

    func getSnapshot(in context: Context, completion: @escaping (FraseEntry) -> Void) {
        let (frase, autore) = leggi()
        completion(FraseEntry(date: Date(), frase: frase, autore: autore))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FraseEntry>) -> Void) {
        let (frase, autore) = leggi()
        let entry = FraseEntry(date: Date(), frase: frase, autore: autore)
        // ricontrolla tra un'ora, nel caso l'app abbia aggiornato la frase
        let prossimo = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(prossimo)))
    }
}

// L'aspetto del widget
struct FraseWidgetView: View {
    var entry: FraseProvider.Entry

    var body: some View {
        ZStack {
            // sfondo: gradiente teal del brand
            LinearGradient(
                gradient: Gradient(colors: [.mcHi, .mcDeep, .mcAbyss]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 8) {
                // etichetta piccola in alto
                Text("MENTALCLASS")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.5)
                    .foregroundColor(.mcLime)

                Spacer(minLength: 2)

                // la frase del giorno
                Text(entry.frase)
                    .font(.system(size: 15, weight: .semibold, design: .serif))
                    .foregroundColor(.mcCream)
                    .lineLimit(4)
                    .minimumScaleFactor(0.7)
                    .fixedSize(horizontal: false, vertical: true)

                // autore, se non è il brand generico
                if entry.autore != "MentalClass" && !entry.autore.isEmpty {
                    Text("— \(entry.autore)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.mcLime)
                }
            }
            .padding(16)
        }
    }
}

// La dichiarazione del widget
@main
struct FraseWidget: Widget {
    let kind: String = "FraseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FraseProvider()) { entry in
            if #available(iOS 17.0, *) {
                FraseWidgetView(entry: entry)
                    .containerBackground(.clear, for: .widget)
            } else {
                FraseWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Frase del giorno")
        .description("La frase di MentalClass, ogni giorno sulla tua schermata Home.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
