import Foundation
import Observation
import AlarmCore

struct AlarmRegistration: Codable {
    var systemID: UUID
    var entry: AlarmEntry
    var appliedSignature: String
}

struct AlarmArchive: Codable {
    var version = 1
    var rules: [AlarmRule] = []
    var registrations: [String: AlarmRegistration] = [:]
}

@MainActor @Observable
final class AlarmStore {
    private(set) var archive = AlarmArchive()
    private(set) var activeIDs: Set<UUID> = []
    private(set) var refreshBefore: [UUID: Date] = [:]
    private var expectedEntries: [AlarmEntry] = []
    private(set) var busy = false
    private(set) var authorized = false
    private(set) var storageHealthy = true
    var errorMessage: String?
    private let driver: any AlarmDriver
    private let file: URL
    private var pendingRefresh = false

    var rules: [AlarmRule] { archive.rules }

    init(driver: any AlarmDriver = SystemAlarmDriver(), file: URL? = nil) {
        self.driver = driver
        self.file = file ?? URL.applicationSupportDirectory
            .appending(path: "FamilyCalendar", directoryHint: .isDirectory)
            .appending(path: "alarms.json")
        do {
            if FileManager.default.fileExists(atPath: self.file.path) {
                archive = try JSONDecoder().decode(AlarmArchive.self, from: Data(contentsOf: self.file))
                guard archive.version == 1, Set(archive.rules.map(\.id)).count == archive.rules.count else { throw AlarmProblem.storage }
                for rule in archive.rules { try rule.validate(calendar: AlarmPlanner.calendar()) }
            }
        } catch {
            storageHealthy = false
            errorMessage = "Impossible de lire vos réveils. Les alarmes iOS existantes sont conservées. Ne supprimez pas l’application ; réessayez après avoir libéré de l’espace."
        }
        authorized = driver.authorized
    }

    private func persist() throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(archive)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func save(_ rule: AlarmRule) async -> Bool {
        guard !busy, storageHealthy else { return false }
        do {
            let calendar = AlarmPlanner.calendar()
            try rule.validate(calendar: calendar)
            if rule.enabled && rule.repeatMode == .once {
                let dates = try AlarmPlanner.dates(for: rule, after: Date(), calendar: calendar)
                if dates.isEmpty { throw AlarmProblem.pastDate }
            }
            var rules = archive.rules.filter { $0.id != rule.id }
            rules.append(rule)
            _ = try AlarmPlanner.plan(rules, now: Date(), calendar: calendar)
            archive.rules = rules.sorted { ($0.hour, $0.minute, $0.title) < ($1.hour, $1.minute, $1.title) }
            try persist()
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
        return await synchronize(requestPermission: rule.enabled)
    }

    func remove(_ rule: AlarmRule) async -> Bool {
        guard !busy, storageHealthy else { return false }
        // Cancellation must succeed before removing the local rule.
        do {
            let ids = try driver.identifiers()
            for (key, record) in archive.registrations where record.entry.ruleID == rule.id {
                if ids.contains(record.systemID) { try driver.cancel(id: record.systemID) }
                archive.registrations.removeValue(forKey: key)
                try persist()
            }
            archive.rules.removeAll { $0.id == rule.id }
            try persist()
            activeIDs = try driver.identifiers()
            return true
        } catch {
            errorMessage = "La suppression n’est pas terminée : \(error.localizedDescription)"
            return false
        }
    }

    func synchronize(requestPermission: Bool = false) async -> Bool {
        guard storageHealthy else { return false }
        guard !busy else { pendingRefresh = true; return false }
        busy = true
        defer {
            busy = false
            if pendingRefresh {
                pendingRefresh = false
                Task { await synchronize() }
            }
        }
        do {
            authorized = driver.authorized
            if !authorized && requestPermission { authorized = try await driver.requestAuthorization() }
            guard authorized else {
                activeIDs = []
                if requestPermission { throw AlarmProblem.permission }
                return false
            }
            let plan = try AlarmPlanner.plan(archive.rules, now: Date(), calendar: AlarmPlanner.calendar())
            expectedEntries = plan.entries
            let desired = Dictionary(uniqueKeysWithValues: plan.entries.map { ($0.id, $0) })
            activeIDs = try driver.identifiers()
            let alerting = try driver.alertingIdentifiers()
            // Cancel obsolete times before installing replacements. Never remove unknown system alarms.
            for (key, record) in archive.registrations where desired[key] == nil {
                // Opening the app must not silence an alarm currently ringing.
                if alerting.contains(record.systemID), archive.rules.contains(where: {
                    $0.id == record.entry.ruleID && $0.enabled && $0.hour == record.entry.hour &&
                    $0.minute == record.entry.minute && $0.title == record.entry.title
                }) { continue }
                if activeIDs.contains(record.systemID) { try driver.cancel(id: record.systemID) }
                archive.registrations.removeValue(forKey: key)
                try persist()
            }
            for entry in plan.entries {
                var record = archive.registrations[entry.id] ??
                    AlarmRegistration(systemID: UUID(), entry: entry, appliedSignature: "")
                if record.appliedSignature == entry.signature && activeIDs.contains(record.systemID) { continue }
                if activeIDs.contains(record.systemID) { try driver.cancel(id: record.systemID) }
                record.entry = entry
                record.appliedSignature = ""
                // Journal the ID before asking iOS: retrying uses the same ID after an interruption.
                archive.registrations[entry.id] = record
                try persist()
                try await driver.schedule(id: record.systemID, entry: entry)
                record.appliedSignature = entry.signature
                archive.registrations[entry.id] = record
                try persist()
            }
            activeIDs = try driver.identifiers()
            refreshBefore = plan.refreshBefore
            errorMessage = nil
            return true
        } catch {
            activeIDs = (try? driver.identifiers()) ?? []
            errorMessage = "Programmation incomplète. Vérifiez les réveils ci-dessous, puis réessayez. \(error.localizedDescription)"
            return false
        }
    }

    func scheduledEntries(for rule: AlarmRule) -> [AlarmEntry] {
        guard authorized else { return [] }
        return archive.registrations.values.filter {
            $0.entry.ruleID == rule.id && activeIDs.contains($0.systemID) &&
            $0.appliedSignature == $0.entry.signature
        }.map(\.entry).sorted { $0.nextDate < $1.nextDate }
    }

    func status(for rule: AlarmRule) -> String {
        if !rule.enabled {
            let remains = archive.registrations.values.contains { $0.entry.ruleID == rule.id && activeIDs.contains($0.systemID) }
            return remains ? "Désactivation incomplète — réessayez" : "Désactivé"
        }
        if !authorized { return "Autorisation iOS nécessaire" }
        let entries = scheduledEntries(for: rule)
        guard !entries.isEmpty else {
            if rule.repeatMode == .once,
               (try? AlarmPlanner.dates(for: rule, after: Date(), calendar: AlarmPlanner.calendar()).isEmpty) == true {
                return "Terminé"
            }
            return "Non programmé — réessayez"
        }
        let expected = expectedEntries.filter { $0.ruleID == rule.id }
        if expected.contains(where: { wanted in !entries.contains(where: { $0.id == wanted.id && $0.signature == wanted.signature }) }) {
            return "Programmation incomplète — réessayez"
        }
        if rule.repeatMode == .weekly { return "Programmé dans iOS · chaque semaine" }
        if rule.repeatMode == .once {
            return "Programmé pour " + entries[0].nextDate.formatted(date: .abbreviated, time: .shortened)
        }
        let last = entries.last!.nextDate
        return "Programmé jusqu’au " + last.formatted(date: .abbreviated, time: .omitted)
    }
}
