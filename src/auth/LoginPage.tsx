import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth.api";
import { getTasasPublicas, type TasaPublica } from "../api/tasas.api";
import { useAuth } from "./useAuth";
import { ApiError } from "../api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [tasas, setTasas] = useState<TasaPublica[] | null>(null);
  const { iniciarSesion, avisoSesion } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    getTasasPublicas()
      .then(setTasas)
      .catch(() => setTasas([])); // el ticker es decorativo -- si falla, no bloquea el login
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { token, usuario } = await login(email, password);
      iniciarSesion(token, usuario);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-brand">
        <div className="login-brand-inner">
          <div className="login-mark">$</div>
          <h1 className="login-wordmark">
            Pago Veloz <span>al Cambio</span>
          </h1>
          <p className="login-tagline">Intercambio de divisas, al instante.</p>

          <div className="login-ticker">
            <span className="login-ticker-label">Tasas de hoy</span>
            {tasas === null && <p className="login-ticker-empty">Cargando…</p>}
            {tasas?.length === 0 && (
              <p className="login-ticker-empty">Todavía no se registró la tasa de hoy.</p>
            )}
            {tasas?.map((t) => (
              <div className="login-ticker-row" key={t.moneda_origen}>
                <span>{t.moneda_origen} / {t.moneda_destino}</span>
                <span className="login-ticker-valor">{Number(t.valor).toLocaleString("es-CO")}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Ingresar</h2>
          <p className="login-form-subtitle">Accedé con tu cuenta para continuar.</p>

          <label>
            Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {avisoSesion && !error && <p className="login-error">{avisoSesion}</p>}
          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={cargando}>
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </section>
    </div>
  );
}