import { useEffect, useState, type FormEvent } from "react";
import { Header } from "../../components/common/Header";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import {
  getTasasPublicas,
  getTasasHistorial,
  registrarTasa,
  getTrmColombia,
  getHistoricoMercado,
  type TasaPublica,
  type TasaHistorial,
} from "../../api/tasas.api";
import { ApiError } from "../../api/client";
import { TrmColombiaPanel } from "./TrmColombiaPanel";
import { TasaDelDiaPanel } from "./TasaDelDiaPanel";
import { MercadoDashboard } from "./MercadoDashboard";
import { TasasExternasPanel } from "./TasasExternasPanel";
import "./tasas.css";

const SECCIONES = [
  { id: "seccion-trm", label: "TRM Colombia" },
  { id: "seccion-tasa-dia", label: "Tasa del Día" },
  { id: "seccion-mercado", label: "Mercado Venezuela" },
  { id: "seccion-externas", label: "Fuentes Externas" },
  { id: "seccion-internas", label: "Tasas Internas" },
  { id: "seccion-historial", label: "Historial" },
];

function irASeccion(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface ResumenEjecutivo {
  trmHoy: number | null;
  paraleloVenezuela: number | null;
  tasaInternaPrincipal: TasaPublica | null;
}

export function TasasPage() {
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasasHoy, setTasasHoy] = useState<TasaPublica[]>([]);
  const [historial, setHistorial] = useState<TasaHistorial[]>([]);
  const [resumen, setResumen] = useState<ResumenEjecutivo | null>(null);
  const [seccionActiva, setSeccionActiva] = useState("seccion-trm");

  const [monedaOrigenId, setMonedaOrigenId] = useState<number | "">("");
  const [monedaDestinoId, setMonedaDestinoId] = useState<number | "">("");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function cargarTodo() {
    const [m, hoy, hist] = await Promise.all([getMonedas(), getTasasPublicas(), getTasasHistorial()]);
    setMonedas(m);
    setTasasHoy(hoy);
    setHistorial(hist);
  }

  async function cargarResumen() {
    const [trm, mercado] = await Promise.all([
      getTrmColombia().catch(() => null),
      getHistoricoMercado(1).catch(() => null),
    ]);
    setResumen({
      trmHoy: trm?.actual?.valor ?? null,
      paraleloVenezuela: mercado?.metricas.paraleloActual ?? null,
      tasaInternaPrincipal: tasasHoy[0] ?? null,
    });
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    cargarResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasasHoy]);

  // Resalta en la barra de navegación la sección que está en pantalla
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setSeccionActiva(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECCIONES.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (!monedaOrigenId || !monedaDestinoId || !valor) {
      setError("Completá origen, destino y valor.");
      return;
    }
    if (monedaOrigenId === monedaDestinoId) {
      setError("La moneda de origen y destino no pueden ser la misma.");
      return;
    }
    setEnviando(true);
    try {
      await registrarTasa({ monedaOrigenId: Number(monedaOrigenId), monedaDestinoId: Number(monedaDestinoId), valor });
      setExito("Tasa registrada correctamente.");
      setValor("");
      cargarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la tasa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tasas-page">
      <Header />

      <div className="tasas-header">
        <h1>Divisas y Tasas</h1>
        <p>TRM oficial, cotizaciones por billete, mercado venezolano en vivo y tasas internas — todo en un solo lugar.</p>
      </div>

      {/* ---------- Resumen ejecutivo ---------- */}
      <div className="tasas-resumen-strip">
        <div className="resumen-item">
          <span className="resumen-label">TRM Colombia hoy</span>
          <span className="resumen-valor">
            {resumen?.trmHoy != null ? `$${resumen.trmHoy.toLocaleString("es-CO", { maximumFractionDigits: 2 })}` : "—"}
          </span>
        </div>
        <div className="resumen-divisor" />
        <div className="resumen-item">
          <span className="resumen-label">Paralelo Venezuela (USD)</span>
          <span className="resumen-valor">
            {resumen?.paraleloVenezuela != null ? resumen.paraleloVenezuela.toLocaleString("es-VE") : "—"}
          </span>
        </div>
        <div className="resumen-divisor" />
        <div className="resumen-item">
          <span className="resumen-label">Tasa interna principal</span>
          <span className="resumen-valor">
            {resumen?.tasaInternaPrincipal
              ? `${resumen.tasaInternaPrincipal.moneda_origen}/${resumen.tasaInternaPrincipal.moneda_destino} · ${Number(resumen.tasaInternaPrincipal.valor).toLocaleString("es-CO")}`
              : "—"}
          </span>
        </div>
      </div>

      {/* ---------- Navegación rápida ---------- */}
      <nav className="tasas-nav-pills">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            className={seccionActiva === s.id ? "activo" : ""}
            onClick={() => irASeccion(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <section id="seccion-trm" className="tasas-seccion">
        <TrmColombiaPanel />
      </section>

      <section id="seccion-tasa-dia" className="tasas-seccion">
        <TasaDelDiaPanel />
      </section>

      <section id="seccion-mercado" className="tasas-seccion">
        <MercadoDashboard />
      </section>

      <section id="seccion-externas" className="tasas-seccion">
        <TasasExternasPanel />
      </section>

      <section id="seccion-internas" className="tasas-seccion">
        <div className="tasas-layout">
          <div className="tasas-hoy">
            {tasasHoy.length === 0 ? (
              <p className="tasas-vacio-texto">Todavía no hay tasas registradas.</p>
            ) : (
              tasasHoy.map((t) => (
                <div className="tasa-card" key={t.moneda_origen}>
                  <div className="tasa-card-par">{t.moneda_origen} / {t.moneda_destino}</div>
                  <div className="tasa-card-valor">{Number(t.valor).toLocaleString("es-CO")}</div>
                  <div className="tasa-card-fecha">{new Date(t.vigente_desde).toLocaleString("es-CO")}</div>
                </div>
              ))
            )}
          </div>

          <div className="tasas-form-panel">
            <h3>Registrar nueva tasa</h3>
            <form className="tasas-form" onSubmit={handleSubmit}>
              <div className="tasas-form-row">
                <label>
                  Moneda origen
                  <select value={monedaOrigenId} onChange={(e) => setMonedaOrigenId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">Seleccionar…</option>
                    {monedas.map((m) => (
                      <option key={m.id} value={m.id}>{m.codigo}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Moneda destino
                  <select value={monedaDestinoId} onChange={(e) => setMonedaDestinoId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">Seleccionar…</option>
                    {monedas.map((m) => (
                      <option key={m.id} value={m.id}>{m.codigo}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Valor
                <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ej. 4150" />
              </label>

              {error && <p className="tasas-form-error">{error}</p>}
              {exito && <p className="tasas-form-exito">{exito}</p>}

              <button type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Registrar tasa"}</button>
            </form>
          </div>
        </div>
      </section>

      <section id="seccion-historial" className="tasas-seccion">
        <div className="tasas-historial">
          <h3>Historial de tasas internas</h3>
          {historial.length === 0 ? (
            <p className="tasas-vacio-texto">Sin registros todavía.</p>
          ) : (
            <table className="tasas-historial-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Par</th>
                  <th>Valor</th>
                  <th>Registrada por</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.vigente_desde).toLocaleString("es-CO")}</td>
                    <td>{h.moneda_origen_codigo} / {h.moneda_destino_codigo}</td>
                    <td>{Number(h.valor).toLocaleString("es-CO")}</td>
                    <td>{h.creado_por_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}