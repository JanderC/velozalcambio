import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PencilLine } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { getTasasPublicas, getTrmColombia, getHistoricoMercado, type TasaPublica } from "../../api/tasas.api";
import { TrmColombiaPanel } from "./TrmColombiaPanel";
import { TasaDelDiaPanel } from "./TasaDelDiaPanel";
import { MercadoDashboard } from "./MercadoDashboard";
import { TasasExternasPanel } from "./TasasExternasPanel";
import { ROLES_REGISTRO_TASAS } from "./tasas.roles";
import "./tasas.css";

const SECCIONES = [
  { id: "seccion-tasa-dia", label: "Tasa del Día" },
  { id: "seccion-trm", label: "TRM Colombia" },
  { id: "seccion-mercado", label: "Mercado Venezuela" },
  { id: "seccion-externas", label: "Fuentes Externas" },
  { id: "seccion-internas", label: "Tasas Internas" },
];

function irASeccion(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface ResumenEjecutivo {
  trmHoy: number | null;
  paraleloVenezuela: number | null;
}

// Tablero de consulta: el personal se guía acá durante el día. Solo lectura;
// la carga de tasas vive en /tasas/registro.
export function TasasPage() {
  const { usuario } = useAuth();
  const puedeRegistrar = usuario != null && ROLES_REGISTRO_TASAS.includes(usuario.rol);

  const [tasasHoy, setTasasHoy] = useState<TasaPublica[]>([]);
  const [resumen, setResumen] = useState<ResumenEjecutivo | null>(null);
  const [seccionActiva, setSeccionActiva] = useState("seccion-tasa-dia");

  useEffect(() => {
    getTasasPublicas().then(setTasasHoy).catch(() => setTasasHoy([]));
    Promise.all([getTrmColombia().catch(() => null), getHistoricoMercado(1).catch(() => null)]).then(([trm, mercado]) =>
      setResumen({
        trmHoy: trm?.actual?.valor ?? null,
        paraleloVenezuela: mercado?.metricas.paraleloActual ?? null,
      })
    );
  }, []);

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

  const tasaInternaPrincipal = tasasHoy[0] ?? null;

  return (
    <div className="tasas-page">
      <Header />

      <div className="tasas-header">
        <div>
          <h1>Tablero de Tasas</h1>
          <p>Consulta rápida para atender al cliente: precios del día, TRM oficial y mercado venezolano.</p>
        </div>
        {puedeRegistrar && (
          <Link to="/tasas/registro" className="tasas-header-accion">
            <PencilLine size={16} /> Registrar tasas del día
          </Link>
        )}
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
            {tasaInternaPrincipal
              ? `${tasaInternaPrincipal.moneda_origen}/${tasaInternaPrincipal.moneda_destino} · ${Number(tasaInternaPrincipal.valor).toLocaleString("es-CO")}`
              : "—"}
          </span>
        </div>
      </div>

      {/* ---------- Navegación rápida ---------- */}
      <nav className="tasas-nav-pills">
        {SECCIONES.map((s) => (
          <button key={s.id} className={seccionActiva === s.id ? "activo" : ""} onClick={() => irASeccion(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      <section id="seccion-tasa-dia" className="tasas-seccion">
        <TasaDelDiaPanel />
      </section>

      <section id="seccion-trm" className="tasas-seccion">
        <TrmColombiaPanel />
      </section>

      <section id="seccion-mercado" className="tasas-seccion">
        <MercadoDashboard />
      </section>

      <section id="seccion-externas" className="tasas-seccion">
        <TasasExternasPanel />
      </section>

      <section id="seccion-internas" className="tasas-seccion">
        <div className="tasas-internas">
          <h3>Tasas internas vigentes</h3>
          {tasasHoy.length === 0 ? (
            <p className="tasas-vacio-texto">Todavía no hay tasas registradas.</p>
          ) : (
            <div className="tasas-hoy">
              {tasasHoy.map((t) => (
                <div className="tasa-card" key={`${t.moneda_origen}-${t.moneda_destino}`}>
                  <div className="tasa-card-par">{t.moneda_origen} / {t.moneda_destino}</div>
                  <div className="tasa-card-valor">{Number(t.valor).toLocaleString("es-CO")}</div>
                  <div className="tasa-card-fecha">{new Date(t.vigente_desde).toLocaleString("es-CO")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
