import XCTest
import AlarmCore
@testable import FamilyCalendar

@MainActor
final class FakeAlarmDriver: AlarmDriver {
    var authorized = true
    var scheduled: [UUID: AlarmEntry] = [:]
    var schedulingCalls = 0
    var failSchedule = false
    var failCancel = false
    func requestAuthorization() async throws -> Bool { authorized }
    func identifiers() throws -> Set<UUID> { Set(scheduled.keys) }
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
