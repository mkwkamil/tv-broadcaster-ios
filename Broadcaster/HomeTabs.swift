import SwiftUI

struct HomeTabs: View {
    @ObservedObject var session: AccountSession
    @ObservedObject var directory: TVDirectory
    @ObservedObject var history: WatchHistory
    var onOpen: (PairedTV) -> Void

    @EnvironmentObject private var language: LanguageStore
    @State private var replayNote: String?

    private let canvas = Color(red: 0.02, green: 0.02, blue: 0.027)
    private let mint = Color(red: 0.53, green: 0.94, blue: 0.67)

    var body: some View {
        TabView {
            TVListView(directory: directory, onOpen: onOpen)
                .tabItem { Label(language.t("tvs"), systemImage: "tv") }
            historyTab
                .tabItem { Label(language.t("history"), systemImage: "clock") }
            SettingsView(session: session, directory: directory)
                .tabItem { Label(language.t("settings"), systemImage: "gearshape") }
        }
        .tint(mint)
        .background(canvas)
    }

    private var historyTab: some View {
        VStack(spacing: 0) {
            if !directory.tvs.isEmpty {
                HStack {
                    Text(language.t("playOn"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.45))
                    Spacer()
                    Menu {
                        ForEach(directory.tvs) { tv in
                            Button(tv.name) { directory.selectedID = tv.id }
                        }
                    } label: {
                        Text(directory.selected?.name ?? language.t("chooseTv"))
                            .font(.subheadline.weight(.semibold))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
            }
            if history.entries.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    Text(language.t("historyEmpty"))
                        .font(.title3.weight(.semibold))
                    Text(language.t("historyEmptyBody"))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.45))
                        .multilineTextAlignment(.center)
                    Spacer()
                    Spacer()
                }
                .padding(.horizontal, 32)
            } else {
                List {
                    ForEach(history.entries) { entry in
                        Button {
                            Task { await replay(entry) }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(dateText(entry.timestamp))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.45))
                                Text(entry.url)
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.9))
                                    .lineLimit(2)
                                    .truncationMode(.middle)
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(Color.white.opacity(0.04))
                        .contextMenu {
                            Button(language.t("deleteItem"), role: .destructive) {
                                Task { await history.remove(entry) }
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
            if let replayNote {
                Text(replayNote)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(mint)
                    .padding(.bottom, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(canvas)
    }

    private func dateText(_ timestamp: Int) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
        return date.formatted(
            .dateTime
                .day().month(.abbreviated).year().hour().minute()
                .locale(Locale(identifier: language.language.rawValue))
        )
    }

    private func replay(_ entry: HistoryEntry) async {
        let tv = directory.selected ?? directory.tvs.first(where: \.online)
        guard let tv, tv.online, let url = URL(string: entry.url) else {
            replayNote = language.t("tvOffline")
            return
        }
        directory.selectedID = tv.id
        do {
            let token = try await session.validToken()
            try await TVChannel.send(url: url, referer: nil, tvId: tv.id, token: token)
            replayNote = language.t("sent")
        } catch {
            replayNote = error.localizedDescription
        }
    }
}
