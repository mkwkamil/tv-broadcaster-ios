import SwiftUI

struct TVListView: View {
    @ObservedObject var directory: TVDirectory
    var onOpen: (PairedTV) -> Void

    @EnvironmentObject private var language: LanguageStore
    @State private var adding = false
    @State private var code = ""
    @State private var askName = false
    @State private var draftName = ""

    private let canvas = Color(red: 0.02, green: 0.02, blue: 0.027)

    var body: some View {
        VStack(spacing: 0) {
            header
            if adding {
                codeEntry
            } else if directory.tvs.isEmpty {
                empty
            } else {
                list
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(canvas)
        .alert(language.t("tvNameTitle"), isPresented: $askName) {
            TextField(language.t("salon"), text: $draftName)
            Button(language.t("save")) {
                let entered = code
                let name = draftName
                Task {
                    if await directory.pair(code: entered, name: name), let tv = directory.selected {
                        adding = false
                        code = ""
                        onOpen(tv)
                    }
                }
            }
            Button(language.t("back"), role: .cancel) {}
        } message: {
            Text(language.t("tvNameBody"))
        }
    }

    private var header: some View {
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
        }
        .padding(.leading, 20)
        .padding(.trailing, 12)
        .padding(.top, 8)
    }

    private var empty: some View {
        VStack(spacing: 18) {
            Spacer()
            Text(language.t("noTvs"))
                .font(.title3.weight(.semibold))
            Text(language.t("noTvsBody"))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.45))
                .multilineTextAlignment(.center)
            addButton
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    private var list: some View {
        VStack(spacing: 12) {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(directory.tvs) { tv in
                        tvRow(tv)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 8)
            }
            addButton
                .padding(.bottom, 24)
        }
    }

    private func tvRow(_ tv: PairedTV) -> some View {
        let mint = Color(red: 0.53, green: 0.94, blue: 0.67)
        return Button {
            guard tv.online else { return }
            onOpen(tv)
        } label: {
            HStack(spacing: 16) {
                Image(systemName: "tv")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(tv.online ? mint : Color.white.opacity(0.32))
                    .frame(width: 64, height: 64)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(tv.online
                                ? Color(red: 0.20, green: 0.83, blue: 0.60).opacity(0.16)
                                : Color.white.opacity(0.05))
                    )
                VStack(alignment: .leading, spacing: 6) {
                    Text(tv.name)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(tv.online ? 0.94 : 0.42))
                    Text(tv.online ? language.t("available") : language.t("unavailable"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(tv.online ? mint : Color(red: 1, green: 0.62, blue: 0.62))
                }
                Spacer(minLength: 8)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(language.t("removeTv"), role: .destructive) {
                Task { await directory.remove(tv) }
            }
        }
    }

    private var addButton: some View {
        Button {
            code = ""
            directory.pairError = nil
            adding = true
        } label: {
            Text(language.t("addTv"))
                .font(.body.weight(.bold))
                .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
                .padding(.horizontal, 28)
                .padding(.vertical, 15)
                .background(Color(red: 0.20, green: 0.83, blue: 0.60).opacity(0.14), in: Capsule())
                .overlay(Capsule().stroke(Color(red: 0.29, green: 0.87, blue: 0.50).opacity(0.45), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var codeEntry: some View {
        VStack(spacing: 22) {
            Spacer()
            Text(language.t("codeTitle"))
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundStyle(.white.opacity(0.45))
            TextField("000000", text: $code)
                .font(.system(size: 40, weight: .semibold))
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .onChange(of: code) { _, value in
                    let digits = String(value.filter(\.isNumber).prefix(6))
                    if digits != value { code = digits }
                }
                .padding(.vertical, 18)
                .padding(.horizontal, 12)
                .background {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.white.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .stroke(Color.white.opacity(0.14), lineWidth: 1)
                        )
                }
                .padding(.horizontal, 36)
            Button {
                draftName = language.t("salon")
                askName = true
            } label: {
                Text(directory.pairing ? language.t("connecting") : language.t("next"))
                    .font(.body.weight(.bold))
                    .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
                    .padding(.horizontal, 35)
                    .padding(.vertical, 15)
                    .background(Color(red: 0.20, green: 0.83, blue: 0.60).opacity(0.14), in: Capsule())
                    .overlay(Capsule().stroke(Color(red: 0.29, green: 0.87, blue: 0.50).opacity(0.45), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(code.count < 6 || directory.pairing)
            .opacity(code.count < 6 ? 0.4 : 1)
            if let pairError = directory.pairError {
                Text(pairError)
                    .font(.caption)
                    .foregroundStyle(Color(red: 1, green: 0.62, blue: 0.62))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Button(language.t("back")) { adding = false }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
            Spacer()
            Spacer()
        }
    }
}
