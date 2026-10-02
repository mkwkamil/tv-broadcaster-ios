import Foundation

enum TVSendError: LocalizedError {
    case badRoom
    case badURL
    case http(Int)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .badRoom: return "Ustaw kod pokoju (min. 4 znaki)"
        case .badURL: return "Nieprawidłowy adres filmu"
        case .http(let code): return "Firebase HTTP \(code)"
        case .transport(let message): return message
        }
    }
}

enum TVChannel {
    static func send(url: URL, referer: URL?, room: String) async throws {
        let code = room.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard code.count >= 4 else { throw TVSendError.badRoom }

        var payload: [String: Any] = [
            "url": url.absoluteString,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "status": "pending"
        ]
        if let referer {
            payload["referer"] = referer.absoluteString
        }

        let endpoint = AppConfig.firebaseDBURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            + "/rooms/" + code + "/queue.json"
        guard let target = URL(string: endpoint) else { throw TVSendError.badURL }

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

    static func markConnected(room: String) async throws {
        let code = room.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard code.count >= 4 else { throw TVSendError.badRoom }

        let endpoint = AppConfig.firebaseDBURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            + "/rooms/" + code + "/phone.json"
        guard let target = URL(string: endpoint) else { throw TVSendError.badURL }

        var request = URLRequest(url: target)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "connected": true,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
        ])

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TVSendError.http((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }
}
