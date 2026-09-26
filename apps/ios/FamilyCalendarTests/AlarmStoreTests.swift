import XCTest
import AlarmCore
@testable import FamilyCalendar

@MainActor
final class FakeAlarmDriver: AlarmDriver {
    var authorized = true
    var scheduled: [UUID: AlarmEntry] = [:]
    var schedulingCalls = 0
    var alerting: Set<UUID> = []
    var failSchedule = false
    var failCancel = false
    func requestAuthorization() async throws -> Bool { authorized }
    func identifiers() throws -> Set<UUID> { Set(scheduled.keys) }
    func alertingIdentifiers() throws -> Set<UUID> { alerting }
    func schedule(id: UUID, entry: AlarmEntry) async throws {
        schedulingCalls += 1
        if failSchedule { throw AlarmProblem.capacity }
        scheduled[id] = entry
    }
    func cancel(id: UUID) throws {
        if failCancel { throw AlarmProblem.permission }
        scheduled.removeValue(forKey: id)
    }
}

@MainActor
final class AlarmStoreTests: XCTestCase {
    func file() -> URL { FileManager.default.temporaryDirectory.appending(path: UUID().uuidString + ".json") }

    func testSaveReloadDisableAndRemove() async throws {
        let driver = FakeAlarmDriver(), location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        let store = AlarmStore(driver: driver, file: location)
        var rule = AlarmRule()
        let saved = await store.save(rule)
        XCTAssertTrue(saved); XCTAssertEqual(driver.scheduled.count, 1)
        let calls = driver.schedulingCalls
        let reloaded = AlarmStore(driver: driver, file: location)
        let refreshed = await reloaded.synchronize()
        XCTAssertTrue(refreshed); XCTAssertEqual(driver.schedulingCalls, calls)
        rule.enabled = false
        let disabled = await reloaded.save(rule)
        XCTAssertTrue(disabled); XCTAssertTrue(driver.scheduled.isEmpty)
        let removed = await reloaded.remove(rule)
        XCTAssertTrue(removed); XCTAssertTrue(reloaded.rules.isEmpty)
    }

    func testDeniedPermissionDoesNotClaimScheduled() async throws {
        let driver = FakeAlarmDriver(); driver.authorized = false
        let location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        let store = AlarmStore(driver: driver, file: location)
        let rule = AlarmRule()
        let result = await store.save(rule)
        XCTAssertFalse(result); XCTAssertEqual(driver.schedulingCalls, 0)
        XCTAssertTrue(store.scheduledEntries(for: rule).isEmpty)
        XCTAssertNotNil(store.errorMessage)
    }

    func testSchedulingFailureCanRetryWithoutDuplicates() async throws {
        let driver = FakeAlarmDriver(); driver.failSchedule = true
        let location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        let store = AlarmStore(driver: driver, file: location)
        let rule = AlarmRule()
        let first = await store.save(rule)
        XCTAssertFalse(first); XCTAssertTrue(driver.scheduled.isEmpty)
        driver.failSchedule = false
        let retried = await store.synchronize()
        XCTAssertTrue(retried); XCTAssertEqual(driver.scheduled.count, 1)
        let again = await store.synchronize()
        XCTAssertTrue(again); XCTAssertEqual(driver.scheduled.count, 1)
    }

    func testFailedDeletionKeepsRuleVisible() async throws {
        let driver = FakeAlarmDriver(), location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        let store = AlarmStore(driver: driver, file: location)
        let rule = AlarmRule()
        _ = await store.save(rule)
        driver.failCancel = true
        let removed = await store.remove(rule)
        XCTAssertFalse(removed); XCTAssertEqual(store.rules.count, 1)
        XCTAssertEqual(driver.scheduled.count, 1)
        XCTAssertNotNil(store.errorMessage)
    }

    func testFailedDisableReportsRemainingAlarm() async throws {
        let driver = FakeAlarmDriver(), location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        let store = AlarmStore(driver: driver, file: location)
        var rule = AlarmRule()
        _ = await store.save(rule)
        driver.failCancel = true
        rule.enabled = false
        let result = await store.save(rule)
        XCTAssertFalse(result)
        XCTAssertTrue(store.status(for: rule).contains("incomplète"))
        XCTAssertEqual(driver.scheduled.count, 1)
    }

    func testForegroundRefreshDoesNotStopRingingAlarm() async throws {
        let driver = FakeAlarmDriver(), location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        var rule = AlarmRule()
        rule.repeatMode = .once
        rule.date = Date().addingTimeInterval(-86400)
        let entry = try AlarmPlanner.plan([rule], now: Date().addingTimeInterval(-3 * 86400),
                                          calendar: AlarmPlanner.calendar()).entries[0]
        let systemID = UUID()
        let registration = AlarmRegistration(systemID: systemID, entry: entry, appliedSignature: entry.signature)
        let archive = AlarmArchive(rules: [rule], registrations: [entry.id: registration])
        try JSONEncoder().encode(archive).write(to: location)
        driver.scheduled[systemID] = entry
        driver.alerting.insert(systemID)
        let store = AlarmStore(driver: driver, file: location)
        let refreshed = await store.synchronize()
        XCTAssertTrue(refreshed)
        XCTAssertEqual(driver.scheduled.count, 1)
    }

    func testCorruptStorageDoesNotEraseSystemAlarms() async throws {
        let driver = FakeAlarmDriver(), location = file()
        defer { try? FileManager.default.removeItem(at: location) }
        try Data("invalid".utf8).write(to: location)
        let store = AlarmStore(driver: driver, file: location)
        XCTAssertFalse(store.storageHealthy)
        let saved = await store.save(AlarmRule())
        XCTAssertFalse(saved); XCTAssertEqual(driver.schedulingCalls, 0)
        XCTAssertEqual(try String(contentsOf: location, encoding: .utf8), "invalid")
    }
}
