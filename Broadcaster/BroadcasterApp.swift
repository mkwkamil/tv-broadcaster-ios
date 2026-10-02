import SwiftUI

@main
struct BroadcasterApp: App {
    @StateObject private var language = LanguageStore.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(language)
        }
    }
}
