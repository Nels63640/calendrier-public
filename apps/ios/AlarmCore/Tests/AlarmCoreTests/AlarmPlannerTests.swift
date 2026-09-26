import XCTest
@testable import AlarmCore

final class AlarmPlannerTests: XCTestCase {
    let paris = AlarmPlanner.calendar(timeZone: TimeZone(identifier: "Europe/Paris")!)
    func instant(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }

    func testAlternationAcrossYearAndBeforeAnchor() throws {
        var a = AlarmRule()
        a.repeatMode = .alternating; a.anchorDay = "2026-12-28"; a.weekdays = [1]
        let dates = try AlarmPlanner.dates(for: a, after: instant("2026-12-20T00:00:00Z"), days: 30, calendar: paris)
        XCTAssertEqual(dates.map { AlarmPlanner.civilString($0, calendar: paris) }, ["2026-12-28", "2027-01-11"])
        a.phase = 1
        let b = try AlarmPlanner.dates(for: a, after: instant("2026-12-20T00:00:00Z"), days: 30, calendar: paris)
        XCTAssertEqual(b.map { AlarmPlanner.civilString($0, calendar: paris) }, ["2026-12-21", "2027-01-04", "2027-01-18"])
    }

    func testCivilTimeSurvivesDST() throws {
        var rule = AlarmRule(); rule.weekdays = [7]; rule.hour = 7; rule.minute = 15
        let dates = try AlarmPlanner.dates(for: rule, after: instant("2026-03-21T00:00:00Z"), days: 9, calendar: paris)
        XCTAssertEqual(dates, [instant("2026-03-22T06:15:00Z"), instant("2026-03-29T05:15:00Z")])
    }

    func testMissingAndRepeatedHour() throws {
        var rule = AlarmRule(); rule.weekdays = [7]; rule.hour = 2; rule.minute = 30
        let spring = try AlarmPlanner.dates(for: rule, after: instant("2026-03-29T00:00:00Z"), days: 1, calendar: paris)
        XCTAssertEqual(spring, [instant("2026-03-29T01:30:00Z")])
        let autumn = try AlarmPlanner.dates(for: rule, after: instant("2026-10-25T00:00:00Z"), days: 1, calendar: paris)
        XCTAssertEqual(autumn, [instant("2026-10-25T00:30:00Z")])
    }

    func testWeeklyUsesSingleNativeEntryAndDisabledIgnored() throws {
        var rule = AlarmRule(); rule.weekdays = Set(1...7)
        let plan = try AlarmPlanner.plan([rule], now: instant("2026-09-26T00:00:00Z"), calendar: paris)
        XCTAssertEqual(plan.entries.count, 1); XCTAssertNil(plan.entries[0].fireDate)
        XCTAssertTrue(plan.refreshBefore.isEmpty)
        rule.enabled = false
        XCTAssertTrue(try AlarmPlanner.plan([rule], now: Date(), calendar: paris).entries.isEmpty)
    }

    func testAlternatingCoverageIsExplicitAndBounded() throws {
        var a = AlarmRule(); a.repeatMode = .alternating; a.anchorDay = "2026-09-28"; a.weekdays = Set(1...7)
        var b = a; b.id = UUID(); b.phase = 1; b.hour = 9
        let plan = try AlarmPlanner.plan([a, b], now: instant("2026-09-28T00:00:00Z"), calendar: paris, capacity: 20)
        XCTAssertEqual(plan.entries.count, 20)
        XCTAssertNotNil(plan.refreshBefore[a.id]); XCTAssertNotNil(plan.refreshBefore[b.id])
        XCTAssertEqual(Set(plan.entries.map(\.id)).count, 20)
        for rule in [a, b] {
            let last = plan.entries.filter { $0.ruleID == rule.id }.map(\.nextDate).max()!
            XCTAssertGreaterThan(plan.refreshBefore[rule.id]!, last)
        }
    }

    func testPunctualFutureAndPast() throws {
        var rule = AlarmRule(); rule.repeatMode = .once; rule.date = instant("2026-09-26T12:00:00Z")
        rule.hour = 16; rule.minute = 30
        XCTAssertEqual(try AlarmPlanner.dates(for: rule, after: instant("2026-09-26T00:00:00Z"), calendar: paris),
                       [instant("2026-09-26T14:30:00Z")])
        XCTAssertTrue(try AlarmPlanner.dates(for: rule, after: instant("2026-09-27T00:00:00Z"), calendar: paris).isEmpty)
    }

    func testInvalidRulesAndInsufficientCapacity() throws {
        var rule = AlarmRule(); rule.weekdays = []
        XCTAssertThrowsError(try rule.validate(calendar: paris))
        rule.weekdays = [1]; rule.anchorDay = "2026-02-30"
        XCTAssertThrowsError(try rule.validate(calendar: paris))
        rule.anchorDay = "2026-09-28"
        var other = rule; other.id = UUID()
        XCTAssertThrowsError(try AlarmPlanner.plan([rule, other], now: Date(), calendar: paris, capacity: 1))
    }
}
