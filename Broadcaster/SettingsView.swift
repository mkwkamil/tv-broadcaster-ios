import SwiftUI

struct SettingsView: View {
    @ObservedObject var session: AccountSession
    @ObservedObject var directory: TVDirectory
    @EnvironmentObject private var language: LanguageStore
    @State private var confirmDelete = false
    @State private var deleteError: String?
    @State private var showTerms = false

    private let canvas = Color(red: 0.02, green: 0.02, blue: 0.027)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                section(language.t("account")) {
                    row(language.t("firstName"), session.displayName ?? "—")
                    row(language.t("email"), session.email ?? "—")
                    Button(language.t("termsTitle")) { showTerms = true }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.88))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 6)
                }
                section(language.t("language")) {
                    ForEach(AppLanguage.allCases) { item in
                        Button {
                            Task { await session.setLanguage(item) }
                        } label: {
                            HStack {
                                Text(item.nativeName)
                                    .foregroundStyle(.white.opacity(0.92))
                                Spacer()
                                if language.language == item {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color(red: 0.53, green: 0.94, blue: 0.67))
                                }
                            }
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                    }
                }
                VStack(spacing: 12) {
                    Button(language.t("logOut"), action: session.signOut)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Button(language.t("deleteAccount")) { confirmDelete = true }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color(red: 1, green: 0.62, blue: 0.62))
                }
            }
            .padding(20)
        }
        .background(canvas)
        .alert(language.t("deleteAccountTitle"), isPresented: $confirmDelete) {
            Button(language.t("deleteAccount"), role: .destructive) {
                Task {
                    do {
                        try await session.deleteAccount(tvIds: directory.tvs.map(\.id))
                    } catch {
                        deleteError = error.localizedDescription
                    }
                }
            }
            Button(language.t("back"), role: .cancel) {}
        } message: {
            Text(language.t("deleteAccountBody"))
        }
        .alert(language.t("failed"), isPresented: deleteShown) {
            Button("OK", role: .cancel) { deleteError = nil }
        } message: {
            Text(deleteError ?? "")
        }
        .sheet(isPresented: $showTerms) {
            TermsSheet().environmentObject(language)
        }
    }

    private var deleteShown: Binding<Bool> {
        Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.42))
                .textCase(.uppercase)
                .tracking(1.1)
            VStack(alignment: .leading, spacing: 4) {
                content()
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.4))
            Text(value)
                .font(.body)
                .foregroundStyle(.white.opacity(0.92))
        }
        .padding(.vertical, 4)
    }
}
