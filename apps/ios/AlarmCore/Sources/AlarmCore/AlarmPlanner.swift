import Foundation

public struct AlarmEntry: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var ruleID: UUID
    public var title: String
    public var hour: Int
    public var minute: Int
    public var weekdays: [Int]
    public var fireDate: Date?
    public var nextDate: Date
    public var signature: String {
        "\(title)|\(hour):\(minute)|\(weekdays)|\(fireDate?.timeIntervalSince1970 ?? -1)"
    }
}

public struct AlarmPlan: Sendable {
    public var entries: [AlarmEntry]
    // First occurrence deliberately not scheduled (capacity or end of window).
    public var refreshBefore: [UUID: Date]
}

public enum AlarmPlanner {
    public static func calendar(timeZone: TimeZone = .current) -> Calendar {
        var result = Calendar(identifier: .iso8601)
        result.timeZone = timeZone
        result.firstWeekday = 2
        return result
    }

    public static func civilString(_ date: Date, calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public static func civilDate(_ string: String, calendar: Calendar) -> Date? {
        let parts = string.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              civilString(date, calendar: calendar) == string else { return nil }
        return date
    }

    public static func occurrence(on day: Date, rule: AlarmRule, calendar: Calendar) -> Date? {
        // Preserve the minute through a spring DST gap; first occurrence in an autumn overlap.
        let start = calendar.startOfDay(for: day)
        let result = calendar.nextDate(
            after: start.addingTimeInterval(-1),
            matching: DateComponents(hour: rule.hour, minute: rule.minute, second: 0),
            matchingPolicy: .nextTimePreservingSmallerComponents,
            repeatedTimePolicy: .first
        )
        return result.flatMap { calendar.isDate($0, inSameDayAs: day) ? $0 : nil }
    }

    public static func dates(for rule: AlarmRule, after now: Date, days: Int = 70,
                             calendar: Calendar) throws -> [Date] {
        try rule.validate(calendar: calendar)
        guard rule.enabled else { return [] }
        if rule.repeatMode == .once {
            guard let date = occurrence(on: rule.date, rule: rule, calendar: calendar), date > now else { return [] }
            return [date]
        }
        let anchor = civilDate(rule.anchorDay, calendar: calendar)!
        let anchorMonday = calendar.dateInterval(of: .weekOfYear, for: anchor)!.start
        var results: [Date] = []
        for offset in 0..<days {
            let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now))!
            let weekday = (calendar.component(.weekday, from: day) + 5) % 7 + 1
            guard rule.weekdays.contains(weekday) else { continue }
            if rule.repeatMode == .alternating {
                let monday = calendar.dateInterval(of: .weekOfYear, for: day)!.start
                let weeks = calendar.dateComponents([.day], from: anchorMonday, to: monday).day! / 7
                guard ((weeks % 2) + 2) % 2 == rule.phase else { continue }
            }
            if let date = occurrence(on: day, rule: rule, calendar: calendar), date > now { results.append(date) }
        }
        return results
    }

    public static func plan(_ rules: [AlarmRule], now: Date, calendar: Calendar,
                            capacity: Int = 48, horizonDays: Int = 56) throws -> AlarmPlan {
        var repeating: [AlarmEntry] = []
        var fixed: [AlarmEntry] = []
        var refresh: [UUID: Date] = [:]
        let horizon = calendar.date(byAdding: .day, value: horizonDays, to: now)!
        for rule in rules where rule.enabled {
            let occurrences = try dates(for: rule, after: now, days: horizonDays + 15, calendar: calendar)
            guard let next = occurrences.first else { continue }
            func entry(_ date: Date, weekly: Bool) -> AlarmEntry {
                AlarmEntry(
                    id: rule.id.uuidString + (weekly ? ":weekly" : ":\(Int(date.timeIntervalSince1970))"),
                    ruleID: rule.id, title: rule.title, hour: rule.hour, minute: rule.minute,
                    weekdays: weekly ? rule.weekdays.sorted() : [], fireDate: weekly ? nil : date,
                    nextDate: date
                )
            }
            if rule.repeatMode == .weekly {
                repeating.append(entry(next, weekly: true))
            } else if rule.repeatMode == .once {
                fixed.append(entry(next, weekly: false))
            } else {
                fixed += occurrences.filter { $0 < horizon }.map { entry($0, weekly: false) }
                refresh[rule.id] = occurrences.first(where: { $0 >= horizon })
            }
        }
        guard repeating.count < capacity || fixed.isEmpty else { throw AlarmProblem.capacity }
        guard repeating.count <= capacity else { throw AlarmProblem.capacity }
        fixed.sort { $0.nextDate == $1.nextDate ? $0.id < $1.id : $0.nextDate < $1.nextDate }
        let accepted = Array(fixed.prefix(max(0, capacity - repeating.count)))
        for entry in fixed.dropFirst(accepted.count) {
            refresh[entry.ruleID] = min(refresh[entry.ruleID] ?? entry.nextDate, entry.nextDate)
        }
        // A distant punctual alarm must not silently disappear behind alternating occurrences.
        let selectedIDs = Set((repeating + accepted).map(\.ruleID))
        for rule in rules where rule.enabled {
            if try !dates(for: rule, after: now, calendar: calendar).isEmpty && !selectedIDs.contains(rule.id) {
                throw AlarmProblem.capacity
            }
        }
        return AlarmPlan(entries: repeating + accepted, refreshBefore: refresh)
    }
}
