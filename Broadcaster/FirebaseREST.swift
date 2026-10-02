import Foundation

enum FirebaseRESTError: LocalizedError {
    case badURL
    case http(Int)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return LanguageStore.text("badAddress")
        case .http(let code): return "Firebase HTTP \(code)"
        case .transport(let message): return message
        }
    }
}

enum FirebaseREST {
    static func get(_ path: String, token: String?) async throws -> Any? {
        let data = try await request(path, method: "GET", body: nil, token: token)
        if data.isEmpty || data == Data("null".utf8) { return nil }
        return try JSONSerialization.jsonObject(with: data)
    }

    static func put(_ path: String, body: Any, token: String?) async throws {
        let data = try jsonBody(body)
        _ = try await request(path, method: "PUT", body: data, token: token)
    }

    private static func jsonBody(_ body: Any) throws -> Data {
        if JSONSerialization.isValidJSONObject(body) {
            return try JSONSerialization.data(withJSONObject: body)
        }
        if let text = body as? String {
            return try JSONEncoder().encode(text)
        }
        if let number = body as? Int {
            return try JSONEncoder().encode(number)
        }
        if let number = body as? Double {
            return try JSONEncoder().encode(number)
        }
        if let flag = body as? Bool {
            return try JSONEncoder().encode(flag)
        }
        throw FirebaseRESTError.badURL
    }

    static func delete(_ path: String, token: String?) async throws {
        _ = try await request(path, method: "DELETE", body: nil, token: token)
    }

    private static func request(_ path: String, method: String, body: Data?, token: String?) async throws -> Data {
        let root = AppConfig.firebaseDBURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var components = URLComponents(string: root + "/" + path + ".json") else {
            throw FirebaseRESTError.badURL
        }
        if let token {
            components.queryItems = [URLQueryItem(name: "auth", value: token)]
        }
        guard let url = components.url else { throw FirebaseRESTError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw FirebaseRESTError.transport(LanguageStore.text("noReply"))
        }
        guard (200..<300).contains(http.statusCode) else {
            throw FirebaseRESTError.http(http.statusCode)
        }
        return data
    }
}
