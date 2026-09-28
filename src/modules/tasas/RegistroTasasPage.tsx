import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Eye, History, Scale } from "lucide-react";
import { Header } from "../../components/common/Header";
import { getTasasPublicas, getTasasHistorial, type TasaPublica, type TasaHistorial } from "../../api/tasas.api";
import { TasaDelDiaPanel } from "./TasaDelDiaPanel";
import { CotizacionDiaForm } from "./CotizacionDiaForm";
import { RegistrarTasaForm } from "./RegistrarTasaForm";
import "./tasas.css";

// Carga diaria de tasas (ADMIN/ASESOR). A la derecha, la Tasa del Día tal como
// la ve el personal en el tablero, para verificar cada precio al guardarlo.
export function RegistroTasasPage() {
  const [versionCotizaciones, setVersionCotizaciones] = useState(0);
  const [tasasHoy, setTasasHoy] = useState<TasaPublica[]>([]);
  const [historial, setHistorial] = useState<TasaHistorial[]>([]);

  function cargarTasasInternas() {
    getTasasPublicas().then(setTasasHoy).catch(() => setTasasHoy([]));
    getTasasHistorial().then(setHistorial).catch(() => setHistorial([]));
  }

  useEffect(() => {
    cargarTasasInternas();
  }, []);

  return (
    <div className="tasas-page">
      <Header />

      <div className="tasas-header">
        <div>
          <h1>Registro de Tasas</h1>
          <p>Cargá los precios del día. Lo que guardes aparece al instante en el Tablero de Tasas.</p>
        </div>
        <Link to="/tasas" className="tasas-header-accion secundaria">
          <Eye size={16} /> Ver tablero
        </Link>
      </div>

      <div className="registro-layout">
        <div className="registro-card">
          <div className="registro-card-titulo">
            <Banknote size={18} />
            <div>
              <h3>Cotización del día</h3>
              <span>Billetes y giros, por moneda y etiqueta.</span>
            </div>
          </div>
          <CotizacionDiaForm onGuardado={() => setVersionCotizaciones((v) => v + 1)} />
        </div>

        <div className="registro-preview">
          <span className="registro-preview-label">Así lo ve el personal</span>
          <TasaDelDiaPanel recargar={versionCotizaciones} />
        </div>
      </div>

      <div className="registro-layout">
        <div className="registro-card">
          <div className="registro-card-titulo">
            <Scale size={18} />
            <div>
              <h3>Tasa interna</h3>
              <span>Tasa de referencia entre dos monedas.</span>
            </div>
          </div>
          <RegistrarTasaForm onGuardado={cargarTasasInternas} />
        </div>

        <div className="registro-card">
          <div className="registro-card-titulo">
            <Scale size={18} />
            <div>
              <h3>Vigentes ahora</h3>
              <span>La última tasa registrada de cada par.</span>
            </div>
          </div>
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
      </div>

      <div className="tasas-historial">
        <h3><History size={16} className="icono-inline" /> Historial de tasas internas</h3>
        {historial.length === 0 ? (
          <p className="tasas-vacio-texto">Sin registros todavía.</p>
        ) : (
          <div className="tasas-historial-scroll">
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
          </div>
        )}
      </div>
    </div>
  );
}
