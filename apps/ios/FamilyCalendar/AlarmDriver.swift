import AlarmKit
import AlarmCore
import SwiftUI

@MainActor
protocol AlarmDriver {
    var authorized: Bool { get }
    func requestAuthorization() async throws -> Bool
    func identifiers() throws -> Set<UUID>
    func alertingIdentifiers() throws -> Set<UUID>
    func schedule(id: UUID, entry: AlarmEntry) async throws
    func cancel(id: UUID) throws
}

struct FamilyAlarmMetadata: AlarmMetadata {
    var ruleID: UUID
}

@MainActor
final class SystemAlarmDriver: AlarmDriver {
    private let manager = AlarmManager.shared
    var authorized: Bool { manager.authorizationState == .authorized }

    func requestAuthorization() async throws -> Bool {
        try await manager.requestAuthorization() == .authorized
    }

    func identifiers() throws -> Set<UUID> { Set(try manager.alarms.map(\.id)) }

    func alertingIdentifiers() throws -> Set<UUID> {
        Set(try manager.alarms.filter { $0.state == .alerting }.map(\.id))
    }

    func cancel(id: UUID) throws { try manager.cancel(id: id) }

    func schedule(id: UUID, entry: AlarmEntry) async throws {
        let schedule: Alarm.Schedule
        if let date = entry.fireDate {
            schedule = .fixed(date)
        } else {
            let weekdays: [Locale.Weekday] = [.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday]
            schedule = .relative(.init(
                time: .init(hour: entry.hour, minute: entry.minute),
                repeats: .weekly(entry.weekdays.map { weekdays[$0 - 1] })
            ))
        }
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: entry.title),
            stopButton: AlarmButton(text: "Arrêter", textColor: .white, systemImageName: "stop.circle")
        )
        let attributes = AlarmAttributes(
            presentation: AlarmPresentation(alert: alert),
            metadata: FamilyAlarmMetadata(ruleID: entry.ruleID),
            tintColor: Color.red
        )
        let configuration = AlarmManager.AlarmConfiguration<FamilyAlarmMetadata>.alarm(
            schedule: schedule, attributes: attributes,
            stopIntent: nil, secondaryIntent: nil, sound: .default
        )
        _ = try await manager.schedule(id: id, configuration: configuration)
    }
}
