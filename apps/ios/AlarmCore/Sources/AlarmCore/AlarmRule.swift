import Foundation

public enum AlarmRepeat: String, Codable, CaseIterable, Sendable {
    case once, weekly, alternating
}

public struct AlarmRule: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var title = "Réveil"
    public var hour = 7
    public var minute = 15
    public var enabled = true
    public var repeatMode = AlarmRepeat.weekly
    // ISO weekdays: Monday = 1, Sunday = 7.
    public var weekdays: Set<Int> = [1, 2, 3, 4, 5]
    public var dateDay: String
    // A civil date in week A, not ISO week-number parity.
    public var anchorDay = "2026-09-28"
    public var phase = 0

    public init() {
        let today = AlarmPlanner.civilString(Date(), calendar: AlarmPlanner.calendar())
        dateDay = today
        anchorDay = today
    }

    public var timeLabel: String { String(format: "%02d:%02d", hour, minute) }

    public func validate(calendar: Calendar) throws {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              title.count <= 80, (0...23).contains(hour), (0...59).contains(minute),
              phase == 0 || phase == 1,
              repeatMode == .once || (!weekdays.isEmpty && weekdays.allSatisfy({ (1...7).contains($0) })),
              AlarmPlanner.civilDate(anchorDay, calendar: calendar) != nil,
              AlarmPlanner.civilDate(dateDay, calendar: calendar) != nil
        else { throw AlarmProblem.invalidRule }
    }
}

public enum AlarmProblem: Error, LocalizedError, Equatable {
    case invalidRule, pastDate, capacity, permission, storage
    public var errorDescription: String? {
        switch self {
        case .invalidRule: return "Vérifiez le nom, l’heure, les jours et la semaine de référence."
        case .pastDate: return "Choisissez une date et une heure futures."
        case .capacity: return "Trop de réveils actifs. Désactivez un réveil avant d’en ajouter un."
        case .permission: return "Autorisez les alarmes dans les Réglages de l’iPhone pour les programmer."
        case .storage: return "Les réveils n’ont pas pu être enregistrés sur cet iPhone."
        }
    }
}
