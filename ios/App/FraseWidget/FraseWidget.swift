//  =====================================================================
//  MentalClass · Widget iOS (SwiftUI + WidgetKit)
//  ---------------------------------------------------------------------
//  Mostra le frasi MentalClass sulla schermata Home, facendole RUOTARE
//  durante il giorno. Legge le frasi dalla "cassetta condivisa"
//  (App Group) che l'app aggiorna dal codice web (mc-widget.js).
//
//  IMPORTANTE — sostituire l'intero contenuto del file FraseWidget.swift
//  del target widget con questo. L'App Group deve essere IDENTICO
//  sull'app, sul widget e in mc-widget.js:
//        group.it.mentalclass.mentalclass
//  =====================================================================

import WidgetKit
import SwiftUI

// Cassetta condivisa: DEVE combaciare con APP_GROUP di mc-widget.js
let MC_APP_GROUP  = "group.it.mentalclass.mentalclass"
let MC_KEY_FRASE  = "frase_del_giorno"
let MC_KEY_AUTORE = "autore_del_giorno"
let MC_KEY_LISTA  = "frasi_widget"   // JSON array [{"q":...,"a":...}]

// Colori del brand
extension Color {
    static let mcDeep  = Color(red: 8/255,  green: 68/255,  blue: 76/255)   // #08444C
    static let mcHi    = Color(red: 14/255, green: 91/255,  blue: 102/255)  // #0e5b66
    static let mcAbyss = Color(red: 5/255,  green: 44/255,  blue: 49/255)   // #052c31
    static let mcCream = Color(red: 241/255, green: 237/255, blue: 226/255) // #F1EDE2
    static let mcLime  = Color(red: 194/255, green: 232/255, blue: 62/255)  // #C2E83E
}

struct FraseEntry: TimelineEntry {
    let date: Date
    let frase: String
    let autore: String
}

// Una frase decodificata dal JSON
private struct FraseItem: Decodable {
    let q: String
    let a: String?
}

struct FraseProvider: TimelineProvider {

    // Legge la LISTA di frasi dalla cassetta condivisa.
    // Se manca, ripiega sulla singola, poi su un testo di riserva.
    private func leggiLista() -> [(String, String)] {
        let box = UserDefaults(suiteName: MC_APP_GROUP)

        if let raw = box?.string(forKey: MC_KEY_LISTA),
           let data = raw.data(using: .utf8),
           let arr = try? JSONDecoder().decode([FraseItem].self, from: data),
           !arr.isEmpty {
            return arr.map { ($0.q, ($0.a ?? "MentalClass")) }
        }

        if let f = box?.string(forKey: MC_KEY_FRASE), !f.isEmpty {
            let a = box?.string(forKey: MC_KEY_AUTORE) ?? "MentalClass"
            return [(f, a)]
        }

        return [("Alleniamo la mente, un giorno alla volta.", "MentalClass")]
    }

    func placeholder(in context: Context) -> FraseEntry {
        FraseEntry(date: Date(), frase: "Alleniamo la mente, un giorno alla volta.", autore: "MentalClass")
    }

    func getSnapshot(in context: Context, completion: @escaping (FraseEntry) -> Void) {
        let lista = leggiLista()
        let (frase, autore) = lista[0]
        completion(FraseEntry(date: Date(), frase: frase, autore: autore))
    }

    // Costruisce una TIMELINE che cambia frase ogni ~2 ore, ruotando
    // nella lista. iOS mostra così frasi diverse durante la giornata,
    // senza aprire l'app.
    func getTimeline(in context: Context, completion: @escaping (Timeline<FraseEntry>) -> Void) {
        let lista = leggiLista()
        var entries: [FraseEntry] = []
        let ora = Date()
        let passoOre = 2            // cambia frase ogni 2 ore
        let quante = 12             // prepara le prossime 24 ore (12 x 2h)

        for i in 0..<quante {
            let quando = Calendar.current.date(byAdding: .hour, value: i * passoOre, to: ora) ?? ora
            let (frase, autore) = lista[i % lista.count]
            entries.append(FraseEntry(date: quando, frase: frase, autore: autore))
        }

        // allo scadere dell'ultima, iOS richiede una nuova timeline
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct FraseWidgetView: View {
    var entry: FraseProvider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [.mcHi, .mcDeep, .mcAbyss]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: family == .systemSmall ? 6 : 10) {
                // etichetta brand in alto
                Text("MENTALCLASS")
                    .font(.system(size: family == .systemSmall ? 8 : 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundColor(.mcLime)
                    .frame(maxWidth: .infinity, alignment: .center)

                Spacer(minLength: 0)

                // FRASE grande e centrata (stile Motivation)
                Text(entry.frase)
                    .font(.system(size: family == .systemSmall ? 15 : 20,
                                  weight: .bold, design: .serif))
                    .foregroundColor(.mcCream)
                    .multilineTextAlignment(.center)
                    .lineLimit(family == .systemSmall ? 4 : 5)
                    .minimumScaleFactor(0.6)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)

                // autore in lime
                if entry.autore != "MentalClass" && !entry.autore.isEmpty {
                    Text("— \(entry.autore)")
                        .font(.system(size: family == .systemSmall ? 10 : 12, weight: .semibold))
                        .foregroundColor(.mcLime)
                        .frame(maxWidth: .infinity, alignment: .center)
                }

                Spacer(minLength: 0)
            }
            .padding(family == .systemSmall ? 14 : 20)
        }
    }
}

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
        .description("Le frasi di MentalClass, che cambiano durante il giorno sulla tua Home.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
