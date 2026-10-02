import Foundation
import UIKit
import WebKit

@MainActor
final class BrowserViewModel: ObservableObject {
    @Published var addressText = ""
    @Published var displayedHost = ""
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var streams: [DetectedStream] = []
    @Published var pendingPopup: URL?
    @Published var toast: String?
    @Published var pageTitle = ""
    @Published var favorites: [FavoritePage] = []
    @Published var browseGeneration = 0
    @Published var showingFavorites = true

    weak var webView: WKWebView?

    init() {
        if let data = UserDefaults.standard.data(forKey: AppConfig.favoritesDefaultsKey),
           let storedFavorites = try? JSONDecoder().decode([FavoritePage].self, from: data) {
            favorites = storedFavorites
        }
    }

    func loadAddress() {
        let trimmed = addressText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = Self.normalizedURL(from: trimmed) else { return }
        addressText = url.absoluteString
        streams = []
        browseGeneration += 1
        webView?.load(URLRequest(url: url))
    }

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
    }

    func reload() {
        streams = []
        webView?.reload()
    }

    func clearStreams() {
        streams = []
    }

    func scanPage() {
        guard currentPageURL != nil else { return }
        webView?.evaluateJavaScript("window.__broadcasterScan && window.__broadcasterScan()") { _, _ in }
    }

    func goHome() {
        streams = []
        addressText = ""
        displayedHost = ""
        webView?.stopLoading()
        webView?.load(URLRequest(url: URL(string: "about:blank")!))
    }

    func considerPopup(_ url: URL) {
        guard let offer = Self.popupDecision(url, page: currentPageURL) else { return }
        pendingPopup = offer
    }

    func allowPopup() {
        guard let url = pendingPopup else { return }
        pendingPopup = nil
        streams = []
        browseGeneration += 1
        webView?.load(URLRequest(url: url))
    }

    func denyPopup() {
        pendingPopup = nil
    }

    func addStream(url: URL, page: URL?) {
        guard Self.isPlayableStream(url, page: page) else { return }
        if streams.contains(where: { $0.url == url }) { return }
        streams.append(DetectedStream(url: url, page: page))
    }

    func sendToTV(_ stream: DetectedStream, tvId: String, online: Bool, token: String) async -> String? {
        guard online else {
            toast = LanguageStore.shared.t("tvOffline")
            return nil
        }
        toast = LanguageStore.shared.t("preparing")
        do {
            let playURL = try await StreamTicket.playURL(for: stream, token: token)
            try await TVChannel.send(url: playURL, referer: stream.page, tvId: tvId, token: token)
            toast = LanguageStore.shared.t("sent")
            return playURL.absoluteString
        } catch {
            toast = error.localizedDescription
            return nil
        }
    }

    func syncNavigation(from webView: WKWebView) {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        pageTitle = webView.title ?? ""
        if let url = webView.url, url.scheme == "http" || url.scheme == "https" {
            displayedHost = url.host ?? url.absoluteString
            if !webView.isLoading {
                addressText = url.absoluteString
            }
        }
    }

    var currentPageURL: URL? {
        guard let url = webView?.url, url.scheme == "http" || url.scheme == "https" else { return nil }
        return url
    }

    var isCurrentFavorite: Bool {
        guard let url = currentPageURL else { return false }
        return favorites.contains { $0.matches(url) }
    }

    func toggleFavorite() {
        guard let url = currentPageURL else { return }
        if let index = favorites.firstIndex(where: { $0.matches(url) }) {
            favorites.remove(at: index)
            saveFavorites()
            return
        }

        let title = pageTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let page = FavoritePage(
            id: UUID(),
            title: title.isEmpty ? (url.host ?? url.absoluteString) : title,
            url: url.absoluteString,
            icon: nil
        )
        favorites.insert(page, at: 0)
        saveFavorites()
        Task { await attachIcon(to: page.id, pageURL: url) }
    }

    func removeFavorite(_ page: FavoritePage) {
        favorites.removeAll { $0.id == page.id }
        saveFavorites()
    }

    private func saveFavorites() {
        if let data = try? JSONEncoder().encode(favorites) {
            UserDefaults.standard.set(data, forKey: AppConfig.favoritesDefaultsKey)
        }
    }

    private func attachIcon(to id: UUID, pageURL: URL) async {
        let icon = await Self.fetchIcon(for: pageURL, webView: webView)
        guard let icon, let index = favorites.firstIndex(where: { $0.id == id }) else { return }
        favorites[index].icon = icon
        saveFavorites()
    }

    private static func fetchIcon(for pageURL: URL, webView: WKWebView?) async -> Data? {
        var candidates: [URL] = []
        if let webView {
            let script = """
            (function() {
              var icon = document.querySelector('link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"]');
              return icon && icon.href ? icon.href : '';
            })()
            """
            if let href = try? await webView.evaluateJavaScript(script) as? String,
               let iconURL = URL(string: href),
               iconURL.scheme == "http" || iconURL.scheme == "https" {
                candidates.append(iconURL)
            }
        }
        if let host = pageURL.host, let favicon = URL(string: "https://\(host)/favicon.ico") {
            candidates.append(favicon)
        }

        for candidate in candidates {
            guard let (data, response) = try? await URLSession.shared.data(from: candidate),
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode),
                  let image = UIImage(data: data) else { continue }
            let side: CGFloat = 64
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
            let scaled = renderer.image { _ in
                image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
            }
            if let png = scaled.pngData() { return png }
        }
        return nil
    }

    static func isPlayableStream(_ url: URL, page: URL?) -> Bool {
        if let page, page.scheme == "about" { return false }

        let host = url.host?.lowercased() ?? ""
        if host.contains("jwpltx.com")
            || host.contains("doubleclick")
            || host.contains("googleads")
            || host.contains("googlesyndication") {
            return false
        }

        let path = url.path.lowercased()
        let ext = url.pathExtension.lowercased()
        let junk = ["gif", "png", "jpg", "jpeg", "webp", "svg", "js", "css", "json", "xml", "ico", "html", "htm"]
        if junk.contains(ext) { return false }

        if ["m3u8", "mp4", "mkv", "webm", "mpd"].contains(ext) { return true }
        if path.contains("/hls/") || path.contains("/dash/") || path.contains("urlset") { return true }
        if path.contains("playlist") || path.contains("master") { return true }
        return false
    }

    static func popupDecision(_ url: URL, page: URL?) -> URL? {
        guard url.scheme == "http" || url.scheme == "https" else { return nil }
        if isSameSite(url, page: page) || isPlayerDestination(url) { return url }
        if let buried = buriedPlayerURL(in: url) { return buried }
        if isAdPopup(url) { return nil }
        return url
    }

    private static let playerSegments: Set<String> = ["e", "embed", "v", "watch", "file"]
    private static let adQueryNames: Set<String> = [
        "psid", "zoneid", "zone_id", "clickid", "js_build", "request_ab", "request_ab2"
    ]
    private static let buriedQueryNames: Set<String> = ["pl", "url", "redirect", "dest", "target", "u"]

    private static func isPlayerDestination(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        if host.hasPrefix("play.") || host.hasPrefix("player.") || host.hasPrefix("embed.") {
            return true
        }
        let path = url.path.lowercased()
        if path.contains("/embed") { return true }
        let first = path.split(separator: "/").first.map(String.init) ?? ""
        return playerSegments.contains(first)
    }

    private static func isAdPopup(_ url: URL) -> Bool {
        if isNumberedHexPath(url.path) { return true }
        if let host = url.host, isGluedAdDomain(host) { return true }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        if (components.percentEncodedQuery?.count ?? 0) > 180 { return true }
        for item in components.queryItems ?? [] {
            let name = item.name.lowercased()
            if adQueryNames.contains(name) { return true }
            if (item.value ?? "").lowercased().contains("iclick") { return true }
        }
        return false
    }

    private static func buriedPlayerURL(in url: URL) -> URL? {
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        for item in items where buriedQueryNames.contains(item.name.lowercased()) {
            guard let raw = item.value else { continue }
            let decoded = raw.removingPercentEncoding ?? raw
            guard let inner = URL(string: decoded),
                  inner.scheme == "http" || inner.scheme == "https",
                  isPlayerDestination(inner) else { continue }
            return inner
        }
        return nil
    }

    private static func isNumberedHexPath(_ path: String) -> Bool {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.count >= 2, parts[0].allSatisfy(\.isNumber), parts[0].count <= 3 else { return false }
        let token = parts[1]
        guard token.count >= 20 else { return false }
        return token.allSatisfy(\.isHexDigit)
    }

    private static func isGluedAdDomain(_ host: String) -> Bool {
        var labels = host.lowercased().split(separator: ".").map(String.init)
        if labels.first == "www" { labels.removeFirst() }
        guard labels.count >= 2 else { return false }
        let name = labels[labels.count - 2]
        return name.count >= 18 && name.allSatisfy(\.isLetter)
    }

    private static func isSameSite(_ url: URL, page: URL?) -> Bool {
        guard let pageHost = siteKey(page?.host), let popupHost = siteKey(url.host) else { return false }
        return pageHost == popupHost
    }

    private static func siteKey(_ host: String?) -> String? {
        guard var labels = host?.lowercased().split(separator: ".").map(String.init), !labels.isEmpty else { return nil }
        if labels.first == "www" { labels.removeFirst() }
        if labels.count >= 2 { return labels.suffix(2).joined(separator: ".") }
        return labels.joined(separator: ".")
    }

    static func normalizedURL(from raw: String) -> URL? {
        if raw.isEmpty { return nil }
        if raw.contains(" "), !raw.contains("://") {
            var comps = URLComponents(string: "https://www.google.com/search")
            comps?.queryItems = [URLQueryItem(name: "q", value: raw)]
            return comps?.url
        }
        if let url = URL(string: raw), url.scheme == "http" || url.scheme == "https" {
            return url
        }
        return URL(string: "https://\(raw)")
    }
}
