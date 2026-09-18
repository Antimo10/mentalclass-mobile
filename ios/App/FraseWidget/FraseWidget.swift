//  =====================================================================
//  MentalClass · Widget iOS (SwiftUI + WidgetKit)
//  ---------------------------------------------------------------------
//  Mostra le frasi MentalClass sulla Home, a rotazione durante il giorno.
//  Sfondo unico (nessun bordo). Al tocco apre l'app sulla schermata Home.
//
//  ATTENZIONE: nella cartella ios/App/FraseWidget/ ci deve essere UN SOLO
//  file .swift. Se esiste "FraseWidget .swift" (con lo spazio) ELIMINALO,
//  altrimenti il build fallisce con "invalid redeclaration".
//
//  App Group IDENTICO su app, widget e mc-widget.js:
//        group.it.mentalclass.mentalclass
//  =====================================================================

import WidgetKit
import SwiftUI

let MC_APP_GROUP = "group.it.mentalclass.mentalclass"
let MC_KEY_FRASE = "frase_del_giorno"
let MC_KEY_AUTORE = "autore_del_giorno"
let MC_KEY_LISTA = "frasi_widget"   // JSON array [{"q":...,"a":...}]

extension Color {
    static let mcAbyss = Color(red: 5/255,  green: 44/255,  blue: 49/255)   // #052c31
    static let mcCream = Color(red: 241/255, green: 237/255, blue: 226/255) // #F1EDE2
    static let mcLime  = Color(red: 194/255, green: 232/255, blue: 62/255)  // #C2E83E
}

struct FraseEntry: TimelineEntry {
    let date: Date
    let frase: String
    let autore: String
}

private struct FraseItem: Decodable {
    let q: String
    let a: String?
}

struct FraseProvider: TimelineProvider {

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
        completion(FraseEntry(date: Date(), frase: lista[0].0, autore: lista[0].1))
    }

    // Timeline che cambia frase ogni ~90 minuti, ruotando nella lista.
    func getTimeline(in context: Context, completion: @escaping (Timeline<FraseEntry>) -> Void) {
        let lista = leggiLista()
        var entries: [FraseEntry] = []
        let ora = Date()
        let passoMin = 90
        let quante = 16   // ~24 ore

        for i in 0..<quante {
            let quando = Calendar.current.date(byAdding: .minute, value: i * passoMin, to: ora) ?? ora
            let (frase, autore) = lista[i % lista.count]
            entries.append(FraseEntry(date: quando, frase: frase, autore: autore))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct FraseWidgetView: View {
    var entry: FraseProvider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(spacing: family == .systemSmall ? 6 : 10) {
            Text("MENTALCLASS")
                .font(.system(size: family == .systemSmall ? 8 : 10, weight: .heavy))
                .tracking(1.6)
                .foregroundColor(.mcLime)
                .frame(maxWidth: .infinity, alignment: .center)

            Spacer(minLength: 0)

            Text(entry.frase)
                .font(.system(size: family == .systemSmall ? 15 : 20, weight: .bold, design: .serif))
                .foregroundColor(.mcCream)
                .multilineTextAlignment(.center)
                .lineLimit(family == .systemSmall ? 4 : 5)
                .minimumScaleFactor(0.6)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)

            if entry.autore != "MentalClass" && !entry.autore.isEmpty {
                Text("— \(entry.autore)")
                    .font(.system(size: family == .systemSmall ? 10 : 12, weight: .semibold))
                    .foregroundColor(.mcLime)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            Spacer(minLength: 0)
        }
        .padding(family == .systemSmall ? 14 : 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "mentalclass://home"))   // tocco -> Home
    }
}

@main
struct FraseWidget: Widget {
    let kind: String = "FraseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FraseProvider()) { entry in
            if #available(iOS 17.0, *) {
                FraseWidgetView(entry: entry)
                    .containerBackground(Color.mcAbyss, for: .widget)   // sfondo unico, no bordi
            } else {
                ZStack {
                    Color.mcAbyss
                    FraseWidgetView(entry: entry)
                }
            }
        }
        .configurationDisplayName("Frase del giorno")
        .description("Le frasi di MentalClass, che cambiano durante il giorno sulla tua Home.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
