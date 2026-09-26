import SwiftUI

struct CalendarLinkView: View {
    @Environment(\.openURL) private var openURL
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "calendar").font(.system(size: 64)).foregroundStyle(.red)
                Text("Votre calendrier familial").font(.title2.bold())
                Text("Retrouvez les événements, les gardes et les listes dans votre calendrier habituel. Les réveils de cette application sont personnels à cet iPhone.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("Ouvrir le calendrier") {
                    openURL(URL(string: "https://nels63640.github.io/calendrier-public/")!)
                }
                .buttonStyle(.borderedProminent)
                Text("Les semaines A et B se règlent dans chaque réveil. Elles ne sont pas synchronisées automatiquement avec les gardes.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(28)
            .navigationTitle("Calendrier")
        }
    }
}
