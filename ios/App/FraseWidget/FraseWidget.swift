//  =====================================================================
//  MentalClass · Widget iOS (SwiftUI + WidgetKit) — versione grafica 2
//  ---------------------------------------------------------------------
//  Mostra le frasi MentalClass sulla Home (piccolo, medio, grande) e sulla
//  schermata di blocco, a rotazione durante il giorno.
//  - sfondo con il gradiente del marchio, luce lime e cerchi sottili
//  - il testo si rimpicciolisce da solo quando la frase è lunga
//  - al tocco apre l'app proprio su quella frase
//  - (medio e grande) tasti Salva e Condividi: aprono l'app ed eseguono l'azione
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
    var tipo: String = "frase"        // frase · pensiero · dizionario · oroscopo
    var etichetta: String = ""        // es. "PENSIERO DEL GIORNO"
    var parola: String = ""           // dizionario
    var forte: String = ""            // oroscopo
    var debole: String = ""
    var consiglio: String = ""
}

private struct FraseItem: Decodable {
    let q: String
    let a: String?
    let t: Double?
    let tipo: String?
    let k: String?
    let w: String?
    let pf: String?
    let pd: String?
    let c: String?
}

private func mcEntry(_ it: FraseItem, _ quando: Date) -> FraseEntry {
    FraseEntry(date: quando, frase: it.q, autore: it.a ?? "MentalClass",
               tipo: it.tipo ?? "frase", etichetta: it.k ?? "",
               parola: it.w ?? "", forte: it.pf ?? "", debole: it.pd ?? "", consiglio: it.c ?? "")
}

struct FraseProvider: TimelineProvider {

    private func leggiVoci() -> [FraseItem] {
        let box = UserDefaults(suiteName: MC_APP_GROUP)
        if let raw = box?.string(forKey: MC_KEY_LISTA),
           let data = raw.data(using: .utf8),
           let arr = try? JSONDecoder().decode([FraseItem].self, from: data),
           !arr.isEmpty {
            return arr
        }
        if let f = box?.string(forKey: MC_KEY_FRASE), !f.isEmpty {
            let a = box?.string(forKey: MC_KEY_AUTORE) ?? "MentalClass"
            return [FraseItem(q: f, a: a, t: nil, tipo: "frase", k: nil, w: nil, pf: nil, pd: nil, c: nil)]
        }
        return [FraseItem(q: "Alleniamo la mente, un giorno alla volta.", a: "MentalClass", t: nil, tipo: "frase", k: nil, w: nil, pf: nil, pd: nil, c: nil)]
    }

    func placeholder(in context: Context) -> FraseEntry {
        FraseEntry(date: Date(), frase: "La disciplina è scegliere tra ciò che vuoi ora e ciò che vuoi di più.", autore: "MentalClass")
    }

    func getSnapshot(in context: Context, completion: @escaping (FraseEntry) -> Void) {
        let voci = leggiVoci()
        let ora = Date().timeIntervalSince1970
        let attuale = voci.filter { ($0.t ?? 0) > 0 && ($0.t ?? 0) <= ora }.last ?? voci[0]
        completion(mcEntry(attuale, Date()))
    }

    // Se l'app ha mandato gli orari (gli stessi delle notifiche), il widget
    // cambia contenuto esattamente a quegli orari. Altrimenti ruota ogni 90 minuti.
    func getTimeline(in context: Context, completion: @escaping (Timeline<FraseEntry>) -> Void) {
        let voci = leggiVoci()
        let ora = Date()
        var entries: [FraseEntry] = []
        let conOrario = voci.filter { ($0.t ?? 0) > 0 }.sorted { ($0.t ?? 0) < ($1.t ?? 0) }

        if !conOrario.isEmpty {
            let adessoS = ora.timeIntervalSince1970
            let attuale = conOrario.filter { ($0.t ?? 0) <= adessoS }.last ?? conOrario[0]
            entries.append(mcEntry(attuale, ora))
            for it in conOrario where (it.t ?? 0) > adessoS {
                entries.append(mcEntry(it, Date(timeIntervalSince1970: it.t ?? 0)))
                if entries.count >= 90 { break }
            }
            completion(Timeline(entries: entries, policy: .atEnd))
            return
        }

        let passoMin = 90
        for i in 0..<16 {
            let quando = Calendar.current.date(byAdding: .minute, value: i * passoMin, to: ora) ?? ora
            entries.append(mcEntry(voci[i % voci.count], quando))
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

/// Link che apre l'app proprio su questa frase.
/// azione: "" = mostra la frase · "like" = la salva nei preferiti · "condividi" = apre la condivisione
func mcLinkFrase(_ frase: String, _ autore: String = "", azione: String = "", tipo: String = "") -> URL {
    var c = URLComponents()
    c.scheme = "mentalclass"
    c.host = "frase"
    var q = [URLQueryItem(name: "t", value: frase)]
    if !autore.isEmpty { q.append(URLQueryItem(name: "a", value: autore)) }
    if azione == "like" { q.append(URLQueryItem(name: "l", value: "1")) }
    if azione == "condividi" { q.append(URLQueryItem(name: "c", value: "1")) }
    if !tipo.isEmpty && tipo != "frase" { q.append(URLQueryItem(name: "tp", value: tipo)) }
    c.queryItems = q
    return c.url ?? URL(string: "mentalclass://home")!
}

/// Tasto a pillola del widget (Salva / Condividi)
struct MCTasto: View {
    let icona: String
    let testo: String
    let pieno: Bool
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icona)
                .font(.system(size: 10, weight: .bold))
            Text(testo)
                .font(.system(size: 10.5, weight: .heavy))
        }
        .foregroundColor(pieno ? .mcAbyss : .mcLime)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(pieno ? Color.mcLime : Color.mcLime.opacity(0.12))
        )
        .overlay(
            Capsule().stroke(Color.mcLime.opacity(pieno ? 0 : 0.55), lineWidth: 1)
        )
    }
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
    private var grande: Bool { family == .systemLarge }
    private var oroscopo: Bool { entry.tipo == "oroscopo" }

    /* intestazione: cambia con il tipo di contenuto */
    private var etichetta: String {
        if !entry.etichetta.isEmpty { return entry.etichetta }
        switch entry.tipo {
        case "pensiero": return "PENSIERO DEL GIORNO"
        case "dizionario": return "PAROLA DEL GIORNO"
        case "oroscopo": return "OROSCOPO DEL MESE"
        default: return "FRASE DEL GIORNO"
        }
    }
    /* l'oroscopo è lungo: nei widget piccolo e medio mostro il consiglio */
    private var testo: String {
        if oroscopo && !grande && entry.frase.count > 170 && !entry.consiglio.isEmpty { return entry.consiglio }
        return entry.frase
    }
    private var firma: String {
        if oroscopo || entry.tipo == "dizionario" || entry.tipo == "pensiero" { return "mentalclass.it" }
        return (entry.autore != "MentalClass" && !entry.autore.isEmpty) ? entry.autore : "mentalclass.it"
    }

    var body: some View {
        let size = mcDimensione(testo, family) * (oroscopo && grande ? 0.82 : 1)

        VStack(alignment: .leading, spacing: 0) {
            // intestazione: marchio + tipo + data
            HStack(spacing: 6) {
                ZStack {
                    Circle().fill(Color.mcLime)
                    Text("M")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(.mcAbyss)
                }
                .frame(width: 17, height: 17)

                Text(piccolo ? "MENTALCLASS" : etichetta)
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.3)
                    .foregroundColor(Color.mcCream.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 0)

                if !piccolo && !oroscopo {
                    Text(mcDataBreve(entry.date))
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.0)
                        .foregroundColor(.mcLime)
                }
            }

            Spacer(minLength: piccolo ? 6 : 8)

            if entry.tipo == "dizionario" && !entry.parola.isEmpty {
                // la parola in grande, poi la definizione
                Text(entry.parola)
                    .font(.system(size: piccolo ? 20 : (grande ? 32 : 24), weight: .bold))
                    .foregroundColor(.mcCream)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(testo)
                    .font(.system(size: max(11, size - 3), weight: .medium))
                    .foregroundColor(Color.mcCream.opacity(0.85))
                    .lineSpacing(1.5)
                    .lineLimit(grande ? 9 : (piccolo ? 4 : 3))
                    .minimumScaleFactor(0.6)
                    .padding(.top, 4)
            } else if oroscopo {
                // solo testo: punto forte · punto debole sulla stessa riga
                if !piccolo && (!entry.forte.isEmpty || !entry.debole.isEmpty) {
                    (Text("PUNTO FORTE ").font(.system(size: 8.5, weight: .heavy)).foregroundColor(.mcLime)
                     + Text(entry.forte).font(.system(size: 11, weight: .semibold)).foregroundColor(.mcCream)
                     + Text("   ·   PUNTO DEBOLE ").font(.system(size: 8.5, weight: .heavy)).foregroundColor(Color(red: 245/255, green: 183/255, blue: 46/255))
                     + Text(entry.debole).font(.system(size: 11, weight: .semibold)).foregroundColor(.mcCream))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .padding(.bottom, 6)
                }
                (testo == entry.consiglio ? Text(testo).italic() : Text(testo))
                    .font(.system(size: size, weight: testo == entry.consiglio ? .medium : .semibold))
                    .foregroundColor(.mcCream)
                    .lineSpacing(1.5)
                    .lineLimit(grande ? 12 : (piccolo ? 6 : 4))
                    .minimumScaleFactor(0.5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if grande && !entry.consiglio.isEmpty {
                    Text("Consiglio: " + entry.consiglio)
                        .font(.system(size: 12, weight: .medium))
                        .italic()
                        .foregroundColor(Color.mcCream.opacity(0.75))
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)
                        .padding(.top, 8)
                }
            } else {
                // virgolette del marchio
                Text("\u{201C}")
                    .font(.system(size: piccolo ? 30 : 40, weight: .black, design: .serif))
                    .foregroundColor(.mcLime)
                    .frame(height: piccolo ? 16 : 22, alignment: .top)
                    .clipped()

                // la frase: si adatta da sola alla lunghezza
                Text(testo)
                    .font(.system(size: size, weight: .semibold))
                    .foregroundColor(.mcCream)
                    .lineSpacing(piccolo ? 1 : 2)
                    .multilineTextAlignment(.leading)
                    .lineLimit(grande ? 11 : (piccolo ? 7 : 5))
                    .minimumScaleFactor(0.55)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, piccolo ? 4 : 6)
            }

            Spacer(minLength: piccolo ? 6 : 8)

            // firma + tasti Salva e Condividi (veri: ognuno apre l'app con la sua azione)
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
                    Link(destination: mcLinkFrase(entry.frase, entry.autore, azione: "like", tipo: entry.tipo)) {
                        MCTasto(icona: "heart.fill", testo: "Salva", pieno: false)
                    }
                    Link(destination: mcLinkFrase(entry.frase, entry.autore, azione: "condividi", tipo: entry.tipo)) {
                        MCTasto(icona: "square.and.arrow.up", testo: "Condividi", pieno: true)
                    }
                }
            }
        }
        .padding(.horizontal, piccolo ? 14 : 18)
        .padding(.vertical, piccolo ? 13 : 15)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(mcLinkFrase(entry.frase, entry.autore, tipo: entry.tipo))
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
        .widgetURL(mcLinkFrase(entry.frase, entry.autore, tipo: entry.tipo))
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
        .description("Le frasi di MentalClass sulla tua Home: toccala per aprirla, salvarla o condividerla.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}
