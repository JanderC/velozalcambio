import { useState } from "react";
import { CuentasPorCobrarPage } from "./CuentasPorCobrarPage";
import { CuentasPorPagarPage } from "./CuentasPorPagarPage";

export function CuentasPorCobrarPagarPage() {
  const [tab, setTab] = useState<"cobrar" | "pagar">("cobrar");

  return (
    <div>
      <div className="cuentas-tabs">
        <button className={tab === "cobrar" ? "activo" : ""} onClick={() => setTab("cobrar")}>
          Por Cobrar
        </button>
        <button className={tab === "pagar" ? "activo" : ""} onClick={() => setTab("pagar")}>
          Por Pagar
        </button>
      </div>
      {tab === "cobrar" ? <CuentasPorCobrarPage /> : <CuentasPorPagarPage />}
    </div>
  );
}