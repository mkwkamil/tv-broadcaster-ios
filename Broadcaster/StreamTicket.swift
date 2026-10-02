import Foundation
import WebKit

enum StreamTicket {
    struct Snapshot {
        let text: String
        let base: URL
    }

    static func playURL(for stream: DetectedStream) async throws -> URL {
        guard needsTicket(stream.url) else { return stream.url }

        let snapshot = try await fetchMediaPlaylist(url: stream.url, referer: stream.page)
        var cookieURLs = [stream.url, snapshot.base]
        if let page = stream.page { cookieURLs.append(page) }
        let cookie = await cookieHeader(for: cookieURLs) ?? ""
        var request = URLRequest(url: URL(string: AppConfig.proxyURL + "/ticket")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "url": stream.url.absoluteString,
            "referer": stream.page?.absoluteString ?? "",
            "playlist": snapshot.text,
            "base": snapshot.base.absoluteString,
            "cookie": cookie,
            "userAgent": AppConfig.browserUserAgent
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw TVSendError.transport("Bilet HLS: \(detail.isEmpty ? "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)" : detail)")
        }
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let play = json["play"] as? String,
            let playURL = URL(string: play)
        else {
            throw TVSendError.transport("Worker nie zwrócił biletu do odtwarzania")
        }
        return playURL
    }

    private static func needsTicket(_ url: URL) -> Bool {
        let path = url.path.lowercased()
        let ext = url.pathExtension.lowercased()
        return ext == "m3u8"
            || path.contains("urlset")
            || path.contains("/hls/")
            || path.contains("playlist")
            || path.contains("master")
    }

    private static func fetchMediaPlaylist(url: URL, referer: URL?) async throws -> Snapshot {
        var current = try await fetchText(url: url, referer: referer)
        if current.text.contains("#EXT-X-STREAM-INF"),
           let variant = pickVariant(in: current.text, base: current.base) {
            current = try await fetchText(url: variant, referer: referer)
        }
        guard current.text.contains("#EXTM3U") else {
            throw TVSendError.transport("Telefon nie dostał playlisty HLS od CDN")
        }
        return Snapshot(text: absolutize(current.text, base: current.base), base: current.base)
    }

    private static func fetchText(url: URL, referer: URL?) async throws -> Snapshot {
        var request = URLRequest(url: url)
        request.setValue(AppConfig.browserUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        if let referer {
            request.setValue(referer.absoluteString, forHTTPHeaderField: "Referer")
            if let origin = referer.originString {
                request.setValue(origin, forHTTPHeaderField: "Origin")
            }
        }
        if let cookie = await cookieHeader(for: [url]) {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let text = String(data: data, encoding: .utf8) ?? ""
        let final = (response as? HTTPURLResponse)?.url ?? url
        guard let http = response as? HTTPURLResponse, (200..<400).contains(http.statusCode) else {
            throw TVSendError.transport("CDN HLS HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
        }
        return Snapshot(text: text, base: final)
    }

    @MainActor
    private static func cookieHeader(for urls: [URL]) async -> String? {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let matching = cookies.filter { cookie in
                    urls.contains { cookieMatches(cookie, url: $0) }
                }
                let header = HTTPCookie.requestHeaderFields(with: matching)["Cookie"]
                continuation.resume(returning: header)
            }
        }
    }

    private static func cookieMatches(_ cookie: HTTPCookie, url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let hostOk = host == domain || host.hasSuffix("." + domain)
        let path = cookie.path.isEmpty ? "/" : cookie.path
        return hostOk && url.path.hasPrefix(path)
    }

    private static func pickVariant(in text: String, base: URL) -> URL? {
        let lines = text.split(whereSeparator: \.isNewline).map { String($0) }
        var best: URL?
        var bestBandwidth = -1
        var index = 0
        while index < lines.count {
            let line = lines[index].trimmingCharacters(in: .whitespaces)
            if line.uppercased().hasPrefix("#EXT-X-STREAM-INF") {
                let bandwidth = bandwidthValue(in: line)
                var next = index + 1
                while next < lines.count {
                    let candidate = lines[next].trimmingCharacters(in: .whitespaces)
                    if candidate.isEmpty {
                        next += 1
                        continue
                    }
                    if candidate.hasPrefix("#") { break }
                    if bandwidth >= bestBandwidth, let url = URL(string: candidate, relativeTo: base)?.absoluteURL {
                        bestBandwidth = bandwidth
                        best = url
                    }
                    break
                }
            }
            index += 1
        }
        return best
    }

    private static func bandwidthValue(in line: String) -> Int {
        guard let range = line.range(of: "BANDWIDTH=", options: .caseInsensitive) else { return 0 }
        let tail = line[range.upperBound...]
        let digits = tail.prefix { $0.isNumber }
        return Int(digits) ?? 0
    }

    private static func absolutize(_ text: String, base: URL) -> String {
        text.split(separator: "\n", omittingEmptySubsequences: false).map { raw in
            let line = String(raw)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { return line }
            if trimmed.hasPrefix("#") {
                return trimmed.replacingURI(base: base)
            }
            if let absolute = URL(string: trimmed, relativeTo: base)?.absoluteString {
                return absolute
            }
            return line
        }.joined(separator: "\n")
    }
}

private extension String {
    func replacingURI(base: URL) -> String {
        var result = ""
        var remaining = self[startIndex...]
        while let match = remaining.range(of: "URI=\"([^\"]+)\"", options: .regularExpression) {
            result += remaining[..<match.lowerBound]
            let token = String(remaining[match])
            let uri = String(token.dropFirst(5).dropLast())
            let absolute = URL(string: uri, relativeTo: base)?.absoluteString ?? uri
            result += "URI=\"\(absolute)\""
            remaining = remaining[match.upperBound...]
        }
        result += remaining
        return result
    }

    var originString: String? {
        guard let url = URL(string: self), let scheme = url.scheme, let host = url.host else { return nil }
        if let port = url.port {
            return "\(scheme)://\(host):\(port)"
        }
        return "\(scheme)://\(host)"
    }
}

private extension URL {
    var originString: String? {
        absoluteString.originString
    }
}
