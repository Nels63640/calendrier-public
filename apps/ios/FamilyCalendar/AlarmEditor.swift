import SwiftUI
import AlarmCore

struct AlarmEditor: View {
    @State var rule: AlarmRule
    @Bindable var store: AlarmStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    private var calendar: Calendar { AlarmPlanner.calendar() }
    private var time: Binding<Date> {
        Binding(get: {
            calendar.date(from: DateComponents(year: 2000, month: 1, day: 1, hour: rule.hour, minute: rule.minute))!
        }, set: {
            rule.hour = calendar.component(.hour, from: $0)
            rule.minute = calendar.component(.minute, from: $0)
        })
    }
    private var onceDate: Binding<Date> {
        Binding(get: {
            AlarmPlanner.civilDate(rule.dateDay, calendar: calendar) ?? Date()
        }, set: { rule.dateDay = AlarmPlanner.civilString($0, calendar: calendar) })
    }
    private var anchor: Binding<Date> {
        Binding(get: {
            AlarmPlanner.civilDate(rule.anchorDay, calendar: calendar) ?? Date()
        }, set: { rule.anchorDay = AlarmPlanner.civilString($0, calendar: calendar) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Mon réveil") {
                    TextField("Nom : réveil, pilule, vitamines…", text: $rule.title)
                        .onChange(of: rule.title) { _, title in rule.title = String(title.prefix(80)) }
                    DatePicker("Heure", selection: time, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel).labelsHidden()
                    Toggle("Activé", isOn: $rule.enabled)
                }
                Section("Répétition") {
                    Picker("Fréquence", selection: $rule.repeatMode) {
                        Text("Une seule fois").tag(AlarmRepeat.once)
                        Text("Chaque semaine").tag(AlarmRepeat.weekly)
                        Text("Une semaine sur deux").tag(AlarmRepeat.alternating)
                    }
                    if rule.repeatMode == .once {
                        DatePicker("Date", selection: onceDate, displayedComponents: .date)
                    } else {
                        HStack {
                            Button("Tous les jours") { rule.weekdays = Set(1...7) }
                            Spacer()
                            Button("Lun. à ven.") { rule.weekdays = Set(1...5) }
                        }
                        ForEach(1...7, id: \.self) { day in
                            Toggle(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][day - 1],
                                   isOn: Binding(get: { rule.weekdays.contains(day) }, set: {
                                if $0 { rule.weekdays.insert(day) } else { rule.weekdays.remove(day) }
                            }))
                        }
                    }
                }
                if rule.repeatMode == .alternating {
                    Section("Semaines A / B") {
                        DatePicker("Une date de ma semaine A", selection: anchor, displayedComponents: .date)
                        Picker("Ce réveil sonne en", selection: $rule.phase) {
                            Text("Semaine A").tag(0)
                            Text("Semaine B").tag(1)
                        }
                        Text("La semaine va du lundi au dimanche. Choisissez une date où vous avez votre fille comme référence A, puis créez un second réveil en semaine B avec la même référence et une autre heure.")
                            .font(.footnote).foregroundStyle(.secondary)
                        Text("Les dates sont programmées à l’avance. Rouvrez l’application avant la fin de la période indiquée dans la liste pour les prolonger.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
                Section("Prochains déclenchements") {
                    let dates = (try? AlarmPlanner.dates(for: rule, after: Date(), calendar: calendar)) ?? []
                    if !rule.enabled { Text("Ce réveil est désactivé.") }
                    else if dates.isEmpty { Text("Aucune date future. Vérifiez votre choix.").foregroundStyle(.orange) }
                    ForEach(Array(dates.prefix(5)), id: \.self) { date in
                        Text(date.formatted(.dateTime.weekday(.wide).day().month(.wide).hour().minute()))
                    }
                    Text("Les horaires suivent le fuseau de cet iPhone. Une heure inexistante au passage à l’heure d’été est décalée d’une heure ; une heure doublée en automne ne sonne qu’une fois.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error = store.errorMessage {
                    Section { Text(error).foregroundStyle(.orange) }
                }
                if store.rules.contains(where: { $0.id == rule.id }) {
                    Section {
                        Button("Supprimer ce réveil", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .disabled(store.busy)
            .navigationTitle("Réglages du réveil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() }.disabled(store.busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        Task { if await store.save(rule) { dismiss() } }
                    }.disabled(store.busy)
                }
            }
            .interactiveDismissDisabled(store.busy)
            .confirmationDialog("Supprimer ce réveil et toutes ses prochaines sonneries ?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Supprimer", role: .destructive) {
                    Task { if await store.remove(rule) { dismiss() } }
                }
            }
        }
    }
}
