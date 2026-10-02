import Foundation

struct DetectedStream: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    let page: URL?
}
