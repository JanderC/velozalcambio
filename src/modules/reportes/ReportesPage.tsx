import { useState } from "react";
import { Header } from "../../components/common/Header";
import { CapitalConsolidadoView } from "./CapitalConsolidadoView";
import { MovimientosCajaView } from "./MovimientosCajaView";
import { MovimientosCCView } from "./MovimientosCCView";
import { EstadoCuentaView } from "./EstadoCuentaTerceroView";
import { CuadresCajaView } from "./CuadresCajaView";
import "./reportes.css";

type Tab = "capital" | "caja" | "cuenta-corriente" | "estado-cuenta" | "cuadres";

export function ReportesPage() {
  const [tab, setTab] = useState<Tab>("capital");

  return (
    <div className="reportes-page">
      <Header />
      <div className="reportes-header">
        <h1>Reportes</h1>
        <p>Capital consolidado, movimientos y cuadres de caja.</p>
      </div>

      <div className="reportes-tabs">
        <button className={tab === "capital" ? "activo" : ""} onClick={() => setTab("capital")}>Capital Consolidado</button>
        <button className={tab === "caja" ? "activo" : ""} onClick={() => setTab("caja")}>Movimientos de Caja</button>
        <button className={tab === "cuenta-corriente" ? "activo" : ""} onClick={() => setTab("cuenta-corriente")}>Cuentas Corrientes</button>
        <button className={tab === "estado-cuenta" ? "activo" : ""} onClick={() => setTab("estado-cuenta")}>Estado de Cuenta</button>
        <button className={tab === "cuadres" ? "activo" : ""} onClick={() => setTab("cuadres")}>Cuadres de Caja</button>
      </div>

      <div className="reportes-body">
        {tab === "capital" && <CapitalConsolidadoView />}
        {tab === "caja" && <MovimientosCajaView />}
        {tab === "cuenta-corriente" && <MovimientosCCView />}
        {tab === "estado-cuenta" && <EstadoCuentaView />}
        {tab === "cuadres" && <CuadresCajaView />}
      </div>
    </div>
  );
}