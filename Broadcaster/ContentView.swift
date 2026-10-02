import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var model = BrowserViewModel()
    @State private var showBrowser = false
    @State private var connectError: String?

    private let gold = Color(red: 0.98, green: 0.78, blue: 0.25)

    private let canvas = Color(red: 0.02, green: 0.02, blue: 0.027)

    var body: some View {
        ZStack {
            canvas.ignoresSafeArea()
            if showBrowser {
                browser
                    .transition(.opacity)
            } else {
                lobby
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(.dark)
        .tint(.white)
        .alert("Przejść dalej?", isPresented: popupBinding) {
            Button("Zezwól") { model.allowPopup() }
            Button("Odrzuć", role: .cancel) { model.denyPopup() }
        } message: {
            Text(model.pendingPopup?.absoluteString ?? "")
        }
        .onChange(of: model.roomCode) { _, _ in
            model.persistRoom()
        }
        .onChange(of: model.browseGeneration) { _, _ in
            model.showingFavorites = false
        }
        .onChange(of: model.toast) { _, message in
            guard message != nil else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                if model.toast == message { model.toast = nil }
            }
        }
    }

    private var popupBinding: Binding<Bool> {
        Binding(
            get: { model.pendingPopup != nil },
            set: { if !$0 { model.denyPopup() } }
        )
    }

    private var lobby: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image("BrandMark")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("Broadcaster")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.white, Color(white: 0.84), Color(white: 0.62)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                Spacer(minLength: 8)
                Button(action: {}) {
                    Image(systemName: "gearshape")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(.white.opacity(0.88))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 20)
            .padding(.trailing, 12)
            .padding(.top, 8)

            Spacer()

            VStack(spacing: 28) {
                Text("KOD POKOJU")
                    .font(.caption.weight(.semibold))
                    .tracking(3)
                    .foregroundStyle(.white.opacity(0.45))

                TextField("CAST01", text: $model.roomCode)
                    .font(.system(size: 40, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(.vertical, 18)
                    .padding(.horizontal, 12)
                    .background {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
                            )
                            .shadow(color: Color.white.opacity(0.12), radius: 16)
                            .shadow(color: Color.white.opacity(0.06), radius: 28)
                    }
                    .padding(.horizontal, 36)

                Button(action: connect) {
                    Text("Połącz")
                        .font(.body.weight(.bold))
                        .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
                        .padding(.horizontal, 35)
                        .padding(.vertical, 15)
                        .background(Color(red: 0.20, green: 0.83, blue: 0.60).opacity(0.14), in: Capsule())
                        .overlay(
                            Capsule().stroke(Color(red: 0.29, green: 0.87, blue: 0.50).opacity(0.45), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(model.roomCode.count < 4)
                .opacity(model.roomCode.count < 4 ? 0.4 : 1)

                if let connectError {
                    Text(connectError)
                        .font(.caption)
                        .foregroundStyle(Color(red: 1, green: 0.62, blue: 0.62))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }

            Spacer()
            Spacer()
        }
    }

    private func connect() {
        model.persistRoom()
        connectError = nil
        Task {
            do {
                try await TVChannel.markConnected(room: model.roomCode)
                model.showingFavorites = true
                withAnimation(.easeInOut(duration: 0.25)) {
                    showBrowser = true
                }
            } catch {
                connectError = error.localizedDescription
            }
        }
    }

    private var browser: some View {
        VStack(spacing: 0) {
            toolbar
            hairline
            ZStack {
                BrowserWebView(model: model)
                    .opacity(model.showingFavorites ? 0 : 1)
                    .allowsHitTesting(!model.showingFavorites)
                if model.showingFavorites {
                    favoritesHome
                        .zIndex(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(canvas)
            hairline
            drawer
        }
        .background(canvas)
    }

    private var hairline: some View {
        Rectangle()
            .fill(Color.white.opacity(0.12))
            .frame(height: 1)
    }

    private var favoritesHome: some View {
        Group {
            if model.favorites.isEmpty {
                VStack(spacing: 14) {
                    Image(systemName: "star")
                        .font(.system(size: 34, weight: .light))
                    Text("Jeszcze nic nie dodano\ndo ulubionych")
                        .multilineTextAlignment(.center)
                    Text("Otwórz stronę i stuknij gwiazdkę")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.35))
                }
                .font(.body)
                .foregroundStyle(.white.opacity(0.45))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                GeometryReader { geo in
                    let tileHeight = max(72, (geo.size.height - 20) / 5.5)
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(model.favorites) { page in
                                favoriteTile(page)
                                    .frame(height: tileHeight)
                            }
                        }
                        .padding(12)
                    }
                }
            }
        }
        .background(canvas)
    }

    private func favoriteTile(_ page: FavoritePage) -> some View {
        Button {
            model.addressText = page.url
            model.loadAddress()
        } label: {
            HStack(spacing: 12) {
                favoriteIcon(page)
                VStack(alignment: .leading, spacing: 4) {
                    Text(page.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(1)
                    Text(page.url)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.38))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Usuń z ulubionych", role: .destructive) {
                model.removeFavorite(page)
            }
        }
    }

    @ViewBuilder
    private func favoriteIcon(_ page: FavoritePage) -> some View {
        if let icon = page.icon, let image = UIImage(data: icon) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            Image(systemName: "globe")
                .font(.body)
                .foregroundStyle(.white.opacity(0.55))
                .frame(width: 36, height: 36)
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private var toolbar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 2) {
                iconButton("chevron.left", enabled: model.canGoBack) {
                    if model.showingFavorites, model.currentPageURL != nil {
                        model.showingFavorites = false
                    } else {
                        model.goBack()
                    }
                }
                iconButton("chevron.right", enabled: model.canGoForward) {
                    if model.showingFavorites { model.showingFavorites = false }
                    model.goForward()
                }
                iconButton("arrow.clockwise", enabled: !model.showingFavorites, action: model.reload)
                iconButton(
                    model.isCurrentFavorite ? "star.fill" : "star",
                    enabled: model.currentPageURL != nil,
                    tint: model.isCurrentFavorite ? gold : .white.opacity(0.92),
                    action: model.toggleFavorite
                )
                Spacer(minLength: 8)
                iconButton("house", enabled: true) {
                    model.showingFavorites = true
                }
                iconButton("power", enabled: true) {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showBrowser = false
                    }
                }
            }

            HStack(spacing: 10) {
                TextField("https://…", text: $model.addressText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .onSubmit { model.loadAddress() }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.08), lineWidth: 1))

                Button("Otwórz", action: model.loadAddress)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.03))
    }

    private func iconButton(
        _ systemName: String,
        enabled: Bool,
        tint: Color = .white.opacity(0.92),
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.body.weight(.semibold))
                .foregroundStyle(enabled ? tint : .white.opacity(0.28))
                .frame(width: 34, height: 36)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private var drawer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(model.streams.isEmpty ? "Brak źródeł" : foundTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.45))
                    .textCase(.uppercase)
                    .tracking(1.2)
                Spacer()
                if !model.streams.isEmpty {
                    Button("Wyczyść", action: model.clearStreams)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.7))
                }
                Button("Skanuj", action: model.scanPage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(model.currentPageURL == nil ? 0.28 : 0.7))
                    .disabled(model.currentPageURL == nil)
                if let toast = model.toast {
                    Text(toast)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
                }
            }

            if !model.streams.isEmpty {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(model.streams) { stream in
                            streamRow(stream)
                        }
                    }
                }
                .frame(maxHeight: 160)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.03))
    }

    private func streamRow(_ stream: DetectedStream) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(streamLabel(stream))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                Text(stream.url.absoluteString)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.4))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            Button("Uruchom") {
                model.sendToTV(stream)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
        }
        .padding(10)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.06), lineWidth: 1))
    }

    private func streamLabel(_ stream: DetectedStream) -> String {
        let host = stream.url.host ?? "plik"
        let name = stream.url.lastPathComponent
        if name.isEmpty { return host }
        return "\(host) · \(name)"
    }

    private var foundTitle: String {
        model.streams.count == 1 ? "Znaleziono film" : "Znalezione pliki: \(model.streams.count)"
    }
}
