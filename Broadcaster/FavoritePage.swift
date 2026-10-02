import Foundation

struct FavoritePage: Identifiable, Codable, Hashable {
    let id: UUID
    var title: String
    var url: String
    var icon: Data?

    func matches(_ other: URL) -> Bool {
        FavoritePage.normalize(url) == FavoritePage.normalize(other.absoluteString)
    }

    static func normalize(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasSuffix("/") { value.removeLast() }
        if let hash = value.firstIndex(of: "#") {
            value = String(value[..<hash])
        }
        return value
    }
}
