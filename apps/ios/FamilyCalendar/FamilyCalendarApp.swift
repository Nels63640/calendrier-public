import SwiftUI

@main
struct FamilyCalendarApp: App {
    @State private var store = AlarmStore()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            TabView {
                AlarmListView(store: store)
                    .tabItem { Label("Réveils", systemImage: "alarm") }
                CalendarLinkView()
                    .tabItem { Label("Calendrier", systemImage: "calendar") }
            }
            .tint(.red)
            .preferredColorScheme(.dark)
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .task { await store.synchronize() }
            .onChange(of: phase) { _, value in
                if value == .active { Task { await store.synchronize() } }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
                Task { await store.synchronize() }
            }
        }
    }
}
