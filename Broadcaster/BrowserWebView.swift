import SwiftUI
import WebKit

struct BrowserWebView: UIViewRepresentable {
    @ObservedObject var model: BrowserViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        if let jsURL = Bundle.main.url(forResource: "Sniffer", withExtension: "js"),
           let source = try? String(contentsOf: jsURL, encoding: .utf8) {
            let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            config.userContentController.addUserScript(script)
        }
        config.userContentController.add(context.coordinator, name: "broadcaster")

        let webView = WKWebView(frame: .zero, configuration: config)
        let canvas = UIColor(red: 0.02, green: 0.02, blue: 0.027, alpha: 1)
        webView.isOpaque = false
        webView.backgroundColor = canvas
        webView.scrollView.backgroundColor = canvas
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.observe(webView)
        model.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        model.webView = uiView
        uiView.isHidden = model.showingFavorites
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let model: BrowserViewModel
        private var observations: [NSKeyValueObservation] = []

        init(model: BrowserViewModel) {
            self.model = model
        }

        func observe(_ webView: WKWebView) {
            observations = [
                webView.observe(\.canGoBack, options: .new) { [weak self] view, _ in
                    Task { @MainActor in self?.model.syncNavigation(from: view) }
                },
                webView.observe(\.canGoForward, options: .new) { [weak self] view, _ in
                    Task { @MainActor in self?.model.syncNavigation(from: view) }
                },
                webView.observe(\.isLoading, options: .new) { [weak self] view, _ in
                    Task { @MainActor in
                        self?.model.isLoading = view.isLoading
                        self?.model.syncNavigation(from: view)
                    }
                },
                webView.observe(\.url, options: .new) { [weak self] view, _ in
                    Task { @MainActor in self?.model.syncNavigation(from: view) }
                }
            ]
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in
                self.model.streams = []
                self.model.syncNavigation(from: webView)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in self.model.syncNavigation(from: webView) }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                Task { @MainActor in self.model.considerPopup(url) }
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                Task { @MainActor in self.model.considerPopup(url) }
            }
            return nil
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "broadcaster",
                  let body = message.body as? [String: Any],
                  body["kind"] as? String == "stream",
                  let raw = body["url"] as? String,
                  let url = URL(string: raw)
            else { return }

            let page = (body["page"] as? String).flatMap(URL.init(string:))
            Task { @MainActor in
                self.model.addStream(url: url, page: page)
            }
        }
    }
}
