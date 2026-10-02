import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

@MainActor
final class AccountSession: ObservableObject {
    @Published private(set) var email: String?
    @Published private(set) var displayName: String?
    @Published private(set) var uid: String?
    @Published private(set) var busy = false
    @Published private(set) var profileReady = false
    @Published private(set) var termsAccepted = false
    @Published var errorMessage: String?

    private var idToken: String?
    private var refreshToken: String?
    private var expiresAt = Date.distantPast
    private var pendingProfileName: String?
    private let google = GoogleSignInCoordinator()

    var isSignedIn: Bool { uid != nil }

    func restore() async {
        guard let stored = KeychainStore.load() else { return }
        idToken = stored.idToken
        refreshToken = stored.refreshToken
        expiresAt = stored.expiresAt
        uid = stored.uid
        email = stored.email
        displayName = stored.name
        termsAccepted = stored.termsAccepted ?? false

        if expiresAt <= Date() {
            do {
                _ = try await validToken()
            } catch let error as AccountError {
                if error.meansAccountGone {
                    signOut()
                } else {
                    profileReady = true
                }
                return
            } catch {
                profileReady = true
                return
            }
        }
        await loadProfile()
    }

    func validToken() async throws -> String {
        if let idToken, expiresAt > Date() { return idToken }
        guard let refreshToken else { throw AccountError.signedOut }
        let body = "grant_type=refresh_token&refresh_token=\(refreshToken)"
        let data = try await AuthAPI.post(
            url: "https://securetoken.googleapis.com/v1/token?key=\(AppConfig.firebaseAPIKey)",
            json: nil,
            form: body
        )
        let json = try AuthAPI.object(from: data)
        let token = (json["id_token"] as? String) ?? (json["idToken"] as? String)
        let refreshed = (json["refresh_token"] as? String) ?? refreshToken
        let user = (json["user_id"] as? String) ?? uid
        guard let token, let user else { throw AccountError.signedOut }
        apply(idToken: token, refreshToken: refreshed, expiresIn: json["expires_in"] ?? json["expiresIn"], uid: user, email: email ?? "")
        return token
    }

    func signIn(email: String, password: String) async {
        await authenticate(path: "accounts:signInWithPassword", email: email, password: password)
    }

    func signUp(name: String, email: String, password: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = LanguageStore.text("nameRequired")
            return
        }
        pendingProfileName = trimmed
        await authenticate(path: "accounts:signUp", email: email, password: password)
        pendingProfileName = nil
    }

    func signInWithGoogle() {
        errorMessage = nil
        google.start { [weak self] idToken in
            Task { @MainActor in
                await self?.exchangeGoogle(idToken: idToken)
            }
        } onFailure: { [weak self] message in
            Task { @MainActor in
                self?.errorMessage = message
            }
        }
    }

    func signOut() {
        KeychainStore.clear()
        idToken = nil
        refreshToken = nil
        expiresAt = .distantPast
        uid = nil
        email = nil
        displayName = nil
        termsAccepted = false
        profileReady = false
        errorMessage = nil
    }

    func saveProfile(name: String) async {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        guard !trimmed.isEmpty else {
            errorMessage = LanguageStore.text("nameRequired")
            return
        }
        guard let uid else { return }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            let token = try await validToken()
            let now = Int(Date().timeIntervalSince1970 * 1000)
            try await FirebaseREST.put("users/\(uid)/name", body: trimmed, token: token)
            try await FirebaseREST.put("users/\(uid)/termsAcceptedAt", body: now, token: token)
            let language = LanguageStore.shared.language.rawValue
            try await FirebaseREST.put("users/\(uid)/language", body: language, token: token)
            displayName = trimmed
            termsAccepted = true
            profileReady = true
            persistSession()
        } catch {
            errorMessage = error.localizedDescription
            profileReady = true
        }
    }

    func setLanguage(_ language: AppLanguage) async {
        LanguageStore.shared.set(language)
        guard let uid else { return }
        guard let token = try? await validToken() else { return }
        try? await FirebaseREST.put("users/\(uid)/language", body: language.rawValue, token: token)
    }

    func deleteAccount(tvIds: [String]) async throws {
        let token = try await validToken()
        guard let uid else { throw AccountError.signedOut }
        for tvId in tvIds {
            try await FirebaseREST.delete("tvs/\(tvId)/trusted/\(uid)", token: token)
        }
        try await FirebaseREST.delete("users/\(uid)", token: token)
        _ = try await AuthAPI.post(
            url: "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=\(AppConfig.firebaseAPIKey)",
            json: ["idToken": token],
            form: nil
        )
        signOut()
    }

    private func authenticate(path: String, email: String, password: String) async {
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard mail.contains("@"), mail.contains(".") else {
            errorMessage = LanguageStore.text("badEmail")
            return
        }
        guard password.count >= 6 else {
            errorMessage = LanguageStore.text("shortPassword")
            return
        }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            let data = try await AuthAPI.post(
                url: "https://identitytoolkit.googleapis.com/v1/\(path)?key=\(AppConfig.firebaseAPIKey)",
                json: ["email": mail, "password": password, "returnSecureToken": true],
                form: nil
            )
            try await adopt(data, fallbackEmail: mail)
        } catch let error as AccountError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func exchangeGoogle(idToken: String) async {
        busy = true
        errorMessage = nil
        defer { busy = false }
        let postBody = "id_token=\(idToken)&providerId=google.com"
        do {
            let data = try await AuthAPI.post(
                url: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=\(AppConfig.firebaseAPIKey)",
                json: [
                    "postBody": postBody,
                    "requestUri": "https://broadcaster.local",
                    "returnSecureToken": true
                ],
                form: nil
            )
            try await adopt(data, fallbackEmail: "")
        } catch let error as AccountError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func adopt(_ data: Data, fallbackEmail: String) async throws {
        let json = try AuthAPI.object(from: data)
        guard let token = json["idToken"] as? String,
              let refresh = json["refreshToken"] as? String,
              let user = json["localId"] as? String else {
            throw AccountError.message(LanguageStore.text("signInFail"))
        }
        let mail = (json["email"] as? String)?.nilIfEmpty ?? fallbackEmail
        apply(idToken: token, refreshToken: refresh, expiresIn: json["expiresIn"], uid: user, email: mail)
        if !mail.isEmpty {
            try? await FirebaseREST.put("users/\(user)/email", body: mail, token: token)
        }
        if let pendingProfileName {
            await saveProfile(name: pendingProfileName)
        } else {
            await loadProfile()
        }
    }

    private func loadProfile() async {
        guard let uid else {
            profileReady = false
            return
        }
        do {
            let token = try await validToken()
            let record = try await FirebaseREST.get("users/\(uid)", token: token) as? [String: Any]
            displayName = record?["name"] as? String
            termsAccepted = record?["termsAcceptedAt"] != nil
            if let code = record?["language"] as? String, let language = AppLanguage(rawValue: code) {
                LanguageStore.shared.set(language)
            } else {
                try? await FirebaseREST.put(
                    "users/\(uid)/language",
                    body: LanguageStore.shared.language.rawValue,
                    token: token
                )
            }
            persistSession()
        } catch let error as AccountError {
            if error.meansAccountGone {
                signOut()
                return
            }
        } catch let error as FirebaseRESTError {
            if case .http(let code) = error, code == 401 || code == 403 {
                signOut()
                return
            }
        } catch {
        }
        profileReady = true
    }

    private func apply(idToken: String, refreshToken: String, expiresIn: Any?, uid: String, email: String) {
        let seconds = Double((expiresIn as? String) ?? "\(expiresIn ?? "3600")") ?? 3600
        let expiry = Date().addingTimeInterval(max(60, seconds - 60))
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.expiresAt = expiry
        self.uid = uid
        self.email = email.nilIfEmpty
        persistSession()
    }

    private func persistSession() {
        guard let idToken, let refreshToken, let uid else { return }
        KeychainStore.save(StoredSession(
            idToken: idToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            uid: uid,
            email: email ?? "",
            name: displayName,
            termsAccepted: termsAccepted
        ))
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

enum AccountError: LocalizedError {
    case signedOut
    case message(String)
    case server(code: String, text: String)

    private static let goneCodes: Set<String> = [
        "USER_NOT_FOUND",
        "USER_DELETED",
        "USER_DISABLED",
        "INVALID_ID_TOKEN",
        "TOKEN_EXPIRED",
        "INVALID_REFRESH_TOKEN",
        "INVALID_GRANT_TYPE",
        "MISSING_REFRESH_TOKEN",
        "CREDENTIAL_TOO_OLD_LOGIN_AGAIN"
    ]

    var errorDescription: String? {
        switch self {
        case .signedOut: return LanguageStore.text("signInAgain")
        case .message(let text): return text
        case .server(_, let text): return text
        }
    }

    var meansAccountGone: Bool {
        switch self {
        case .signedOut: return true
        case .message: return false
        case .server(let code, _): return Self.goneCodes.contains(code)
        }
    }
}

private enum AuthAPI {
    static func post(url: String, json: [String: Any]?, form: String?) async throws -> Data {
        guard let target = URL(string: url) else { throw AccountError.message(LanguageStore.text("badAddress")) }
        var request = URLRequest(url: target)
        request.httpMethod = "POST"
        if let json {
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if let form {
            request.httpBody = form.data(using: .utf8)
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AccountError.message(LanguageStore.text("noReply"))
        }
        guard (200..<300).contains(http.statusCode) else {
            let code = serverCode(from: data)
            throw AccountError.server(code: code, text: message(for: code))
        }
        return data
    }

    private static func serverCode(from data: Data) -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = json["error"] as? [String: Any],
              let raw = error["message"] as? String else {
            return ""
        }
        return raw.split(separator: " ").first.map(String.init) ?? raw
    }

    static func object(from data: Data) throws -> [String: Any] {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AccountError.message(LanguageStore.text("signInFail"))
        }
        return json
    }

    static func message(for code: String) -> String {
        switch code {
        case "EMAIL_EXISTS": return LanguageStore.text("emailTaken")
        case "INVALID_EMAIL": return LanguageStore.text("badEmail")
        case "WEAK_PASSWORD", "PASSWORD_DOES_NOT_MEET_REQUIREMENTS": return LanguageStore.text("shortPassword")
        case "INVALID_LOGIN_CREDENTIALS", "EMAIL_NOT_FOUND", "INVALID_PASSWORD": return LanguageStore.text("badLogin")
        case "TOO_MANY_ATTEMPTS_TRY_LATER": return LanguageStore.text("tooMany")
        case "OPERATION_NOT_ALLOWED": return LanguageStore.text("notAllowed")
        case "USER_DISABLED": return LanguageStore.text("disabled")
        default: return LanguageStore.text("signInFail")
        }
    }
}

private struct StoredSession: Codable {
    var idToken: String
    var refreshToken: String
    var expiresAt: Date
    var uid: String
    var email: String
    var name: String?
    var termsAccepted: Bool?
}

private enum KeychainStore {
    private static let service = "com.kporebski.broadcaster.auth"
    private static let account = "session"

    static func save(_ session: StoredSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        SecItemAdd(insert as CFDictionary, nil)
    }

    static func load() -> StoredSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

final class GoogleSignInCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var verifier = ""

    func start(onSuccess: @escaping (String) -> Void, onFailure: @escaping (String) -> Void) {
        verifier = Self.randomVerifier()
        let challenge = Self.challenge(verifier)
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: AppConfig.googleClientID),
            URLQueryItem(name: "redirect_uri", value: AppConfig.googleReversedClientID + ":/oauth2callback"),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "prompt", value: "select_account")
        ]
        guard let url = components?.url else {
            onFailure(LanguageStore.text("googleFail"))
            return
        }
        let verifier = self.verifier
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: AppConfig.googleReversedClientID) { callback, error in
            if let auth = error as? ASWebAuthenticationSessionError, auth.code == .canceledLogin { return }
            guard let callback, let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else {
                onFailure(LanguageStore.text("googleFail"))
                return
            }
            Task {
                do {
                    let idToken = try await Self.exchange(code: code, verifier: verifier)
                    onSuccess(idToken)
                } catch {
                    onFailure(LanguageStore.text("googleFail"))
                }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        session.start()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    private static func exchange(code: String, verifier: String) async throws -> String {
        guard let url = URL(string: "https://oauth2.googleapis.com/token") else {
            throw AccountError.message(LanguageStore.text("googleFail"))
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let redirect = AppConfig.googleReversedClientID + ":/oauth2callback"
        let form = [
            "code=\(Self.formEscape(code))",
            "client_id=\(Self.formEscape(AppConfig.googleClientID))",
            "redirect_uri=\(Self.formEscape(redirect))",
            "grant_type=authorization_code",
            "code_verifier=\(Self.formEscape(verifier))"
        ].joined(separator: "&")
        request.httpBody = form.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let idToken = json["id_token"] as? String else {
            throw AccountError.message(LanguageStore.text("googleFail"))
        }
        return idToken
    }

    private static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func formEscape(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=?")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func challenge(_ verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
