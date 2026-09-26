import SwiftUI
import AlarmCore

struct AlarmListView: View {
    @Bindable var store: AlarmStore
    @State private var editing: AlarmRule?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Vos réveils, à votre rythme").font(.title2.bold())
                    Text("Un matin précis, vos jours habituels ou une semaine sur deux.")
                        .foregroundStyle(.secondary)
                    if !store.authorized {
                        Button("Autoriser les alarmes iPhone") {
                            Task { await store.synchronize(requestPermission: true) }
                        }
                        Button("Ouvrir les réglages iPhone") {
                            UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
                        }
                    }
                    Text("Les alarmes sont personnelles à cet iPhone. Elles utilisent la sonnerie système.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error = store.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                        Button("Réessayer la programmation") { Task { await store.synchronize(requestPermission: true) } }
                    }
                }
                if store.rules.isEmpty {
                    Section {
                        ContentUnavailableView("Votre premier réveil", systemImage: "alarm",
                                               description: Text("Préparez un réveil du matin, une prise de pilule ou de vitamines."))
                        Button("Ajouter un réveil") { editing = newRule() }
                        Button("Préparer ma semaine A à 7 h 15") {
                            var rule = newRule(); rule.repeatMode = .alternating
                            rule.title = "Réveil · semaine avec ma fille"; editing = rule
                        }
                    }
                }
                ForEach(store.rules) { rule in
                    Section {
                        HStack(alignment: .center) {
                            Button {
                                editing = rule
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(rule.timeLabel).font(.system(size: 42, weight: .light, design: .rounded)).monospacedDigit()
                                    Text(rule.title).font(.headline)
                                    Text(summary(rule)).font(.subheadline).foregroundStyle(.secondary)
                                }
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Modifier " + rule.title + " à " + rule.timeLabel)
                            Toggle("Activer " + rule.title, isOn: Binding(
                                get: { rule.enabled },
                                set: { value in
                                    var next = rule; next.enabled = value
                                    Task { _ = await store.save(next) }
                                }
                            )).labelsHidden().fixedSize()
                        }
                        Text(store.status(for: rule))
                            .font(.footnote).foregroundStyle(store.scheduledEntries(for: rule).isEmpty && rule.enabled ? .orange : .secondary)
                        if rule.enabled && rule.repeatMode == .alternating {
                            Text("Rouvrez cette application avant la fin de cette période pour prolonger les réveils.")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                    }
                }
                if !store.rules.isEmpty {
                    Section {
                        Button("Actualiser les réveils programmés") { Task { await store.synchronize(requestPermission: true) } }
                        Text("Les répétitions hebdomadaires restent programmées dans iOS. Les semaines alternées sont préparées jusqu’à 8 semaines à l’avance, selon le nombre de réveils. En voyage, ouvrez l’application après un changement de fuseau horaire.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Réveils")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Ajouter", systemImage: "plus") { editing = newRule() }
                }
            }
            .disabled(store.busy || !store.storageHealthy)
            .overlay { if store.busy { ProgressView("Programmation…").padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
            .sheet(item: $editing) { rule in AlarmEditor(rule: rule, store: store) }
        }
    }

    private func newRule() -> AlarmRule {
        var rule = AlarmRule()
        rule.anchorDay = AlarmPlanner.civilString(Date(), calendar: AlarmPlanner.calendar())
        return rule
    }

    private func summary(_ rule: AlarmRule) -> String {
        if rule.repeatMode == .once { return AlarmPlanner.civilDate(rule.dateDay, calendar: AlarmPlanner.calendar())!.formatted(date: .abbreviated, time: .omitted) }
        let labels = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
        let days = rule.weekdays.sorted().map { labels[$0 - 1] }.joined(separator: " ")
        return days + (rule.repeatMode == .alternating ? " · semaine \(rule.phase == 0 ? "A" : "B")" : " · chaque semaine")
    }
}
