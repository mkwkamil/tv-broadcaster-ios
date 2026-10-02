import SwiftUI

struct LoginView: View {
    @ObservedObject var session: AccountSession
    @EnvironmentObject private var language: LanguageStore
    @State private var mode: AuthMode

    init(session: AccountSession, start: AuthMode = .signIn) {
        self.session = session
        _mode = State(initialValue: start)
    }
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var accepted = false
    @State private var showTerms = false

    private let canvas = Color(red: 0.02, green: 0.02, blue: 0.027)
    private let mint = Color(red: 0.53, green: 0.94, blue: 0.67)

    var body: some View {
        ZStack {
            canvas.ignoresSafeArea()
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        brand
                        VStack(alignment: .leading, spacing: 8) {
                            Text(title)
                                .font(.system(size: 34, weight: .semibold))
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.48))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        form
                        if let message = session.errorMessage {
                            Text(message)
                                .font(.footnote)
                                .foregroundStyle(Color(red: 1, green: 0.62, blue: 0.62))
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 28)
                    .padding(.bottom, 24)
                }
                switcher
            }
        }
        .sheet(isPresented: $showTerms) {
            TermsSheet()
                .environmentObject(language)
        }
    }

    private var title: String {
        switch mode {
        case .signIn: return language.t("welcome")
        case .register: return language.t("registerTitle")
        case .finish: return language.t("finishTitle")
        }
    }

    private var subtitle: String {
        switch mode {
        case .signIn: return language.t("welcomeBody")
        case .register: return language.t("registerBody")
        case .finish: return language.t("finishBody")
        }
    }

    private var brand: some View {
        HStack(spacing: 12) {
            Image("BrandMark")
                .resizable()
                .scaledToFill()
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            Text("Broadcaster")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color.white, Color(white: 0.78)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var form: some View {
        VStack(spacing: 14) {
            if mode != .signIn {
                labeled(language.t("firstName"), text: $name)
                    .textContentType(.givenName)
            }
            if mode != .finish {
                labeled(language.t("email"), text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                labeled(language.t("password"), text: $password, secure: true)
                    .textContentType(mode == .register ? .newPassword : .password)
            }
            if mode != .signIn {
                termsRow
            }
            primaryButton
            if mode == .signIn {
                divider
                googleButton
            }
        }
    }

    private var termsRow: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                accepted.toggle()
            } label: {
                Image(systemName: accepted ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundStyle(accepted ? mint : .white.opacity(0.45))
            }
            .buttonStyle(.plain)
            HStack(spacing: 4) {
                Text(language.t("acceptPrefix"))
                    .foregroundStyle(.white.opacity(0.62))
                Button(language.t("terms")) { showTerms = true }
                    .foregroundStyle(.white)
            }
            .font(.subheadline)
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
    }

    private var primaryButton: some View {
        Button(action: submit) {
            Text(session.busy ? language.t("connecting") : primaryTitle)
                .font(.body.weight(.bold))
                .foregroundStyle(Color(red: 0.07, green: 0.12, blue: 0.09))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(mint, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(session.busy || !canSubmit)
        .opacity(canSubmit ? 1 : 0.45)
        .padding(.top, 6)
    }

    private var primaryTitle: String {
        switch mode {
        case .signIn: return language.t("signIn")
        case .register: return language.t("create")
        case .finish: return language.t("save")
        }
    }

    private var canSubmit: Bool {
        switch mode {
        case .signIn:
            return email.contains("@") && password.count >= 6
        case .register:
            return !name.trimmingCharacters(in: .whitespaces).isEmpty && email.contains("@") && password.count >= 6 && accepted
        case .finish:
            return !name.trimmingCharacters(in: .whitespaces).isEmpty && accepted
        }
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1)
            Text(language.t("or"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.38))
            Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1)
        }
        .padding(.vertical, 4)
    }

    private var googleButton: some View {
        Button(action: session.signInWithGoogle) {
            HStack(spacing: 10) {
                Image(systemName: "g.circle")
                Text(language.t("google"))
            }
            .font(.body.weight(.semibold))
            .foregroundStyle(.white.opacity(0.92))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(session.busy)
    }

    private var switcher: some View {
        Group {
            if mode == .signIn {
                Button(language.t("noAccount")) { switchMode(.register) }
            } else if mode == .register {
                Button(language.t("hasAccount")) { switchMode(.signIn) }
            }
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white.opacity(0.72))
        .padding(.bottom, 28)
    }

    private func labeled(_ title: String, text: Binding<String>, secure: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.42))
            Group {
                if secure {
                    SecureField("", text: text)
                } else {
                    TextField("", text: text)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 15)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
            )
        }
    }

    private func switchMode(_ next: AuthMode) {
        session.errorMessage = nil
        accepted = false
        mode = next
    }

    private func submit() {
        switch mode {
        case .signIn:
            Task { await session.signIn(email: email, password: password) }
        case .register:
            guard accepted else {
                session.errorMessage = language.t("termsRequired")
                return
            }
            Task { await session.signUp(name: name, email: email, password: password) }
        case .finish:
            guard accepted else {
                session.errorMessage = language.t("termsRequired")
                return
            }
            Task { await session.saveProfile(name: name) }
        }
    }

}

enum AuthMode {
    case signIn, register, finish
}

struct TermsSheet: View {
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(language.t("termsBody"))
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.86))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(24)
            }
            .background(Color(red: 0.02, green: 0.02, blue: 0.027))
            .navigationTitle(language.t("termsTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("back")) { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}
