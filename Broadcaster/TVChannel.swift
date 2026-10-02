import Foundation

enum TVSendError: LocalizedError {
    case badURL
    case offline
    case http(Int)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return LanguageStore.text("badMovie")
        case .offline: return LanguageStore.text("tvOffline")
        case .http(let code): return "Firebase HTTP \(code)"
        case .transport(let message): return message
        }
    }
}

enum TVChannel {
    static func send(url: URL, referer: URL?, tvId: String, token: String) async throws {
        guard !tvId.isEmpty else { throw TVSendError.offline }

        var payload: [String: Any] = [
            "url": url.absoluteString,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "status": "pending"
        ]
        if let referer {
            payload["referer"] = referer.absoluteString
        }

        let root = AppConfig.firebaseDBURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var components = URLComponents(string: root + "/tvs/" + tvId + "/queue.json") else {
            throw TVSendError.badURL
        }
        components.queryItems = [URLQueryItem(name: "auth", value: token)]
        guard let target = components.url else { throw TVSendError.badURL }

        var request = URLRequest(url: target)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw TVSendError.transport("Brak odpowiedzi")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw TVSendError.http(http.statusCode)
        }
    }
}
