//  =====================================================================
//  MentalClass · Widget iOS (SwiftUI + WidgetKit) — versione grafica 2
//  ---------------------------------------------------------------------
//  Mostra le frasi MentalClass sulla Home (piccolo, medio, grande) e sulla
//  schermata di blocco, a rotazione durante il giorno.
//  - sfondo con il gradiente del marchio, luce lime e cerchi sottili
//  - il testo si rimpicciolisce da solo quando la frase è lunga
//  - al tocco apre l'app proprio su quella frase e propone di condividerla
//
//  ATTENZIONE: nella cartella ios/App/FraseWidget/ ci deve essere UN SOLO
//  file .swift. Sostituisci il contenuto di FraseWidget.swift con questo.
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
    static let mcAbyss = Color(red: 5/255,   green: 44/255,  blue: 49/255)   // #052c31
    static let mcDeep  = Color(red: 8/255,   green: 68/255,  blue: 76/255)   // #08444C
    static let mcTeal  = Color(red: 39/255,  green: 92/255,  blue: 100/255)  // #275C64
    static let mcNight = Color(red: 3/255,   green: 20/255,  blue: 23/255)   // #031417
    static let mcCream = Color(red: 241/255, green: 237/255, blue: 226/255)  // #F1EDE2
    static let mcLime  = Color(red: 194/255, green: 232/255, blue: 62/255)   // #C2E83E
}

// MARK: - Dati

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
        FraseEntry(date: Date(), frase: "La disciplina è scegliere tra ciò che vuoi ora e ciò che vuoi di più.", autore: "MentalClass")
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

// MARK: - Aiuti

/// Grandezza del testo in base alla lunghezza della frase e al formato:
/// le frasi lunghe si rimpiccioliscono invece di essere tagliate.
func mcDimensione(_ frase: String, _ family: WidgetFamily) -> CGFloat {
    let n = frase.count
    switch family {
    case .systemSmall:
        if n < 45 { return 18 }
        if n < 80 { return 15.5 }
        if n < 120 { return 13.5 }
        return 12
    case .systemLarge:
        if n < 90 { return 29 }
        if n < 160 { return 24 }
        if n < 240 { return 20 }
        return 17
    default: // medium
        if n < 60 { return 21 }
        if n < 110 { return 18 }
        if n < 170 { return 15.5 }
        return 13.5
    }
}

/// Data breve in italiano, es. "22 OTT"
func mcDataBreve(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "it_IT")
    f.dateFormat = "d MMM"
    return f.string(from: d).uppercased()
}

/// Link che apre l'app su questa frase e propone di condividerla
func mcLinkFrase(_ frase: String) -> URL {
    var c = URLComponents()
    c.scheme = "mentalclass"
    c.host = "frase"
    c.queryItems = [URLQueryItem(name: "t", value: frase), URLQueryItem(name: "c", value: "1")]
    return c.url ?? URL(string: "mentalclass://home")!
}

// MARK: - Sfondo del marchio

struct MCSfondo: View {
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [.mcTeal, .mcDeep, .mcNight]),
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            )
            RadialGradient(
                gradient: Gradient(colors: [Color.mcLime.opacity(0.30), Color.mcLime.opacity(0.0)]),
                center: .topTrailing,
                startRadius: 0,
                endRadius: 190
            )
            GeometryReader { g in
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .stroke(Color.mcCream.opacity(0.07 - Double(i) * 0.014), lineWidth: 1)
                        .frame(width: CGFloat(110 + i * 70), height: CGFloat(110 + i * 70))
                        .position(x: g.size.width + 12, y: -12)
                }
            }
        }
    }
}

// MARK: - Widget sulla Home

struct FraseWidgetView: View {
    var entry: FraseProvider.Entry
    @Environment(\.widgetFamily) var family

    private var piccolo: Bool { family == .systemSmall }
    private var firma: String {
        (entry.autore != "MentalClass" && !entry.autore.isEmpty) ? entry.autore : "mentalclass.it"
    }

    var body: some View {
        let size = mcDimensione(entry.frase, family)

        VStack(alignment: .leading, spacing: 0) {
            // intestazione: marchio + data
            HStack(spacing: 6) {
                ZStack {
                    Circle().fill(Color.mcLime)
                    Text("M")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(.mcAbyss)
                }
                .frame(width: 17, height: 17)

                Text(piccolo ? "MENTALCLASS" : "MENTALCLASS · FRASE DEL GIORNO")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.3)
                    .foregroundColor(Color.mcCream.opacity(0.85))
                    .lineLimit(1)

                Spacer(minLength: 0)

                if !piccolo {
                    Text(mcDataBreve(entry.date))
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.0)
                        .foregroundColor(.mcLime)
                }
            }

            Spacer(minLength: piccolo ? 6 : 8)

            // virgolette del marchio
            Text("\u{201C}")
                .font(.system(size: piccolo ? 30 : 40, weight: .black, design: .serif))
                .foregroundColor(.mcLime)
                .frame(height: piccolo ? 16 : 22, alignment: .top)
                .clipped()

            // la frase: si adatta da sola alla lunghezza
            Text(entry.frase)
                .font(.system(size: size, weight: .semibold))
                .foregroundColor(.mcCream)
                .lineSpacing(piccolo ? 1 : 2)
                .multilineTextAlignment(.leading)
                .lineLimit(family == .systemLarge ? 11 : (piccolo ? 7 : 5))
                .minimumScaleFactor(0.55)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, piccolo ? 4 : 6)

            Spacer(minLength: piccolo ? 6 : 8)

            // firma + invito a condividere
            HStack(spacing: 7) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.mcLime)
                    .frame(width: 16, height: 3)
                Text(firma)
                    .font(.system(size: piccolo ? 10 : 11, weight: .bold))
                    .foregroundColor(.mcLime)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if !piccolo {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 9.5, weight: .bold))
                        Text("Condividi")
                            .font(.system(size: 10.5, weight: .heavy))
                    }
                    .foregroundColor(.mcAbyss)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Color.mcLime))
                }
            }
        }
        .padding(.horizontal, piccolo ? 14 : 18)
        .padding(.vertical, piccolo ? 13 : 15)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(mcLinkFrase(entry.frase))
    }
}

// MARK: - Schermata di blocco (rettangolare)

struct FraseBloccoView: View {
    var entry: FraseProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("MENTALCLASS")
                .font(.system(size: 9, weight: .heavy))
                .tracking(1.2)
                .widgetAccentable()
            Text(entry.frase)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(3)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(mcLinkFrase(entry.frase))
    }
}

// MARK: - Scelta della vista in base al formato

struct FraseWidgetEntryView: View {
    var entry: FraseProvider.Entry
    @Environment(\.widgetFamily) var family

    @ViewBuilder
    var contenuto: some View {
        if family == .accessoryRectangular {
            FraseBloccoView(entry: entry)
        } else {
            FraseWidgetView(entry: entry)
        }
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            contenuto
                .containerBackground(for: .widget) {
                    if family == .accessoryRectangular {
                        Color.clear
                    } else {
                        MCSfondo()
                    }
                }
        } else {
            ZStack {
                if family != .accessoryRectangular {
                    MCSfondo()
                }
                contenuto
            }
        }
    }
}

@main
struct FraseWidget: Widget {
    let kind: String = "FraseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FraseProvider()) { entry in
            FraseWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Frase del giorno")
        .description("Le frasi di MentalClass sulla tua Home: toccala per aprirla e condividerla.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}
