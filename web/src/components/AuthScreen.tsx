import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ProjectStore } from "../storage";
import type { UserSession } from "../types";

export function AuthScreen({ store, onSignedIn }: { store: ProjectStore; onSignedIn: (session: UserSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
    setError("");
    setBusy(true);
    try {
      const session =
        mode === "in"
          ? await store.signIn(email, password || "local-demo")
          : await store.signUp(email, password || "local-demo");
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přihlášení selhalo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" />
          <span>Homola Field Cloud</span>
        </div>
        <h1>
          Projekty, vytyčení a naměřená data <em>na jednom místě.</em>
        </h1>
        <p className="auth-setup">{store.setupMessage}</p>
        <label>
          E-mail
          <input
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        {store.isCloudConfigured && (
          <label>
            Heslo
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit("in");
              }}
            />
          </label>
        )}
        {error && <div className="error-box">{error}</div>}
        <div className="auth-actions">
          <button className="primary-button" disabled={busy || !email.trim()} onClick={() => submit("in")}>
            Přihlásit
          </button>
          <button className="ghost-button" disabled={busy || !email.trim()} onClick={() => submit("up")}>
            Založit účet
          </button>
        </div>
        <div className="trust-row">
          <ShieldCheck size={17} />
          <span>Každý uživatel vidí jen svoje projekty přes Row Level Security.</span>
        </div>
      </section>
    </main>
  );
}
