import Foundation

struct PairedTV: Identifiable, Equatable {
    var id: String
    var name: String
    var online: Bool
}

@MainActor
final class TVDirectory: ObservableObject {
    @Published private(set) var tvs: [PairedTV] = []
    @Published var selectedID: String?
    @Published var pairError: String?
    @Published private(set) var pairing = false

    var selected: PairedTV? {
        tvs.first { $0.id == selectedID }
    }

    private var poll: Task<Void, Never>?
    private weak var session: AccountSession?

    func start(session: AccountSession) {
        self.session = session
        poll?.cancel()
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.reload()
                try? await Task.sleep(nanoseconds: 4_000_000_000)
            }
        }
    }

    func stop() {
        poll?.cancel()
        poll = nil
        tvs = []
        selectedID = nil
        pairError = nil
    }

    func pair(code rawCode: String, name rawName: String) async -> Bool {
        let code = rawCode.filter(\.isNumber)
        guard code.count == 6 else {
            pairError = LanguageStore.shared.t("codeDigits")
            return false
        }
        let name = String(rawName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        guard !name.isEmpty else {
            pairError = LanguageStore.shared.t("pairName")
            return false
        }
        guard let session, let uid = session.uid else {
            pairError = LanguageStore.shared.t("signInAgain")
            return false
        }
        pairing = true
        pairError = nil
        defer { pairing = false }
        do {
            let token = try await session.validToken()
            guard let record = try await FirebaseREST.get("codes/\(code)", token: token) as? [String: Any],
                  let tvId = record["tvId"] as? String else {
                pairError = LanguageStore.shared.t("noTvCode")
                return false
            }
            guard record["accepting"] as? Bool == true else {
                pairError = LanguageStore.shared.t("codeHidden")
                return false
            }
            let pairedAt = Int(Date().timeIntervalSince1970 * 1000)
            try await FirebaseREST.put("tvs/\(tvId)/trusted/\(uid)", body: ["pairedAt": pairedAt], token: token)
            try await FirebaseREST.put(
                "users/\(uid)/tvs/\(tvId)",
                body: ["name": name, "pairedAt": pairedAt],
                token: token
            )
            selectedID = tvId
            await reload()
            return true
        } catch {
            pairError = error.localizedDescription
            return false
        }
    }

    func remove(_ tv: PairedTV) async {
        guard let session, let uid = session.uid else { return }
        do {
            let token = try await session.validToken()
            try await FirebaseREST.delete("tvs/\(tv.id)/trusted/\(uid)", token: token)
            try await FirebaseREST.delete("users/\(uid)/tvs/\(tv.id)", token: token)
            if selectedID == tv.id { selectedID = nil }
            tvs.removeAll { $0.id == tv.id }
        } catch {
            pairError = error.localizedDescription
        }
    }

    private func reload() async {
        guard let session, let uid = session.uid else { return }
        do {
            let token = try await session.validToken()
            guard let listed = try await FirebaseREST.get("users/\(uid)/tvs", token: token) as? [String: Any] else {
                tvs = []
                if selectedID != nil { selectedID = nil }
                return
            }
            var next: [PairedTV] = []
            for (tvId, value) in listed {
                guard let fields = value as? [String: Any] else { continue }
                let trusted = try await FirebaseREST.get("tvs/\(tvId)/trusted/\(uid)", token: token)
                if trusted == nil {
                    try? await FirebaseREST.delete("users/\(uid)/tvs/\(tvId)", token: token)
                    continue
                }
                let presence = try await FirebaseREST.get("tvs/\(tvId)/presence", token: token) as? [String: Any]
                let online = Self.isOnline(presence)
                let name = (fields["name"] as? String)?.nilIfBlank ?? LanguageStore.shared.t("tvs")
                next.append(PairedTV(id: tvId, name: name, online: online))
            }
            next.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            tvs = next
            if let selectedID, !next.contains(where: { $0.id == selectedID }) {
                self.selectedID = nil
            }
        } catch {
            return
        }
    }

    private static func isOnline(_ presence: [String: Any]?) -> Bool {
        guard let presence, presence["online"] as? Bool == true else { return false }
        let seen: Double
        if let number = presence["lastSeen"] as? NSNumber {
            seen = number.doubleValue
        } else {
            return false
        }
        let age = Date().timeIntervalSince1970 * 1000 - seen
        return age < 30_000
    }
}

private extension String {
    var nilIfBlank: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}
