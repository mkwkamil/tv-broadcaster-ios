import Foundation

struct HistoryEntry: Identifiable, Equatable {
    var id: String
    var url: String
    var timestamp: Int
}

@MainActor
final class WatchHistory: ObservableObject {
    @Published private(set) var entries: [HistoryEntry] = []

    private var poll: Task<Void, Never>?
    private weak var session: AccountSession?

    func start(session: AccountSession) {
        self.session = session
        poll?.cancel()
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.reload()
                try? await Task.sleep(nanoseconds: 8_000_000_000)
            }
        }
    }

    func stop() {
        poll?.cancel()
        poll = nil
        entries = []
    }

    func record(_ url: String) async {
        guard let session, let uid = session.uid, !url.isEmpty else { return }
        do {
            let token = try await session.validToken()
            let id = UUID().uuidString
            let timestamp = Int(Date().timeIntervalSince1970 * 1000)
            try await FirebaseREST.put(
                "users/\(uid)/history/\(id)",
                body: ["url": url, "timestamp": timestamp],
                token: token
            )
            await reload()
        } catch {
            return
        }
    }

    func remove(_ entry: HistoryEntry) async {
        guard let session, let uid = session.uid else { return }
        do {
            let token = try await session.validToken()
            try await FirebaseREST.delete("users/\(uid)/history/\(entry.id)", token: token)
            entries.removeAll { $0.id == entry.id }
        } catch {
            return
        }
    }

    private func reload() async {
        guard let session, let uid = session.uid else { return }
        do {
            let token = try await session.validToken()
            guard let listed = try await FirebaseREST.get("users/\(uid)/history", token: token) as? [String: Any] else {
                entries = []
                return
            }
            var next: [HistoryEntry] = []
            for (id, value) in listed {
                guard let fields = value as? [String: Any],
                      let url = fields["url"] as? String,
                      let timestamp = (fields["timestamp"] as? NSNumber)?.intValue else { continue }
                next.append(HistoryEntry(id: id, url: url, timestamp: timestamp))
            }
            next.sort { $0.timestamp > $1.timestamp }
            entries = next
        } catch {
            return
        }
    }
}
