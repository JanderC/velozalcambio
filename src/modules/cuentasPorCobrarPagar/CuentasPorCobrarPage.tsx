import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Header } from "../../components/common/Header";
import { AccordionSection } from "../../components/common/AccordionSection";
import {
  getCuentasPorCobrar,
  crearCuentaPorCobrar,
  registrarAbonoCobrar,
  type CuentaPorCobrar,
} from "../../api/cuentasPorCobrar.api";
import { CuentaForm } from "./CuentaForm";
import { AbonoForm } from "./AbonoForm";

const ESTADOS = ["PENDIENTE", "ABONADA", "PAGADA", "VENCIDA"];

export function CuentasPorCobrarPage() {
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [abonandoId, setAbonandoId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const data = await getCuentasPorCobrar(estadoFiltro || undefined);
      setCuentas(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro]);

  async function handleCrear(data: { terceroId: number; monedaId: number; montoOriginal: string }) {
    await crearCuentaPorCobrar(data);
    setMostrarForm(false);
    cargar();
  }

  async function handleAbono(id: number, data: { monto: string; cajaId: number; metodoPagoId?: number }) {
    await registrarAbonoCobrar(id, data);
    setAbonandoId(null);
    cargar();
  }

  return (
    <div className="cuentas-page">
      <Header />
      <div className="cuentas-page-header">
        <div>
          <h1>Cuentas por Cobrar</h1>
          <p>Lo que los clientes le deben a la casa de cambio.</p>
        </div>
        <button className="btn-opcion" onClick={() => setMostrarForm((v) => !v)}>
          + Nueva cuenta
        </button>
      </div>

      {mostrarForm && (
        <AccordionSection titulo="Nueva cuenta por cobrar" icono={<Plus size={18} />}>
          <CuentaForm onGuardar={handleCrear} onCancelar={() => setMostrarForm(false)} />
        </AccordionSection>
      )}

      <div className="cuentas-filtro">
        <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div className="cuentas-tabla-wrap">
        {cargando ? (
          <p className="cuentas-hint">Cargando…</p>
        ) : cuentas.length === 0 ? (
          <p className="cuentas-hint">No hay cuentas por cobrar registradas.</p>
        ) : (
          <table className="cuentas-cxc-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Moneda</th>
                <th>Monto original</th>
                <th>Saldo pendiente</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <>
                  <tr key={c.id}>
                    <td>{c.tercero_nombre}</td>
                    <td>{c.moneda_codigo}</td>
                    <td>{Number(c.monto_original).toLocaleString("es-CO")}</td>
                    <td>{Number(c.saldo_pendiente).toLocaleString("es-CO")}</td>
                    <td><span className={`estado-badge estado-${c.estado.toLowerCase()}`}>{c.estado}</span></td>
                    <td>
                      {c.estado !== "PAGADA" && (
                        <button className="btn-abonar" onClick={() => setAbonandoId(abonandoId === c.id ? null : c.id)}>
                          {abonandoId === c.id ? "Cerrar" : "Abonar"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {abonandoId === c.id && (
                    <tr>
                      <td colSpan={6} className="cuentas-abono-fila">
                        <AbonoForm
                          saldoPendiente={c.saldo_pendiente}
                          monedaCodigo={c.moneda_codigo}
                          onGuardar={(data) => handleAbono(c.id, data)}
                          onCancelar={() => setAbonandoId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}