import XCTest

final class AlarmScreenTests: XCTestCase {
    @MainActor
    func testOpenAlarmEditor() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars["Réveils"].waitForExistence(timeout: 10))
        let list = XCTAttachment(screenshot: app.screenshot())
        list.name = "Liste des réveils"
        list.lifetime = .keepAlways
        add(list)
        app.buttons["Ajouter"].tap()
        XCTAssertTrue(app.navigationBars["Réglages du réveil"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Enregistrer"].exists)
        let editor = XCTAttachment(screenshot: app.screenshot())
        editor.name = "Éditeur de réveil"
        editor.lifetime = .keepAlways
        add(editor)
        app.buttons["Fermer"].tap()
        XCTAssertTrue(app.navigationBars["Réveils"].exists)
    }
}
