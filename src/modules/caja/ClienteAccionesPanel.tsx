import { useEffect, useState } from "react";
import type { ResumenTercero, CuentaCorriente } from "../../api/terceros.api";
import { cambiarEstadoCuentaCorriente } from "../../api/cuentasCorrientes.api";
import { getSolicitudesPorCliente, type Solicitud } from "../../api/transacciones.api";
import { RegistrarOperacionForm } from "./RegistrarOperacionForm";
import { AccordionSection } from "../../components/common/AccordionSection";

type VistaCuentas = "disponibles" | "bloqueadas" | "cerradas" | null;

export function ClienteAccionesPanel({
  resumen,
  onCerrar,
  onActualizar,
}: {
  resumen: ResumenTercero;
  onCerrar: () => void;
  onActualizar: () => void;
}) {
  const { tercero, cuentas } = resumen;
  const [vistaCuentas, setVistaCuentas] = useState<VistaCuentas>(null);
  const [mostrarPagos, setMostrarPagos] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);

  useEffect(() => {
    getSolicitudesPorCliente(tercero.id)
      .then(setSolicitudes)
      .catch(() => setSolicitudes([]));
  }, [tercero.id]);

  async function cambiarEstado(cuenta: CuentaCorriente, nuevoEstado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA") {
    await cambiarEstadoCuentaCorriente(cuenta.id, nuevoEstado);
    onActualizar();
  }

  return (
    <div className="cliente-panel">
      <AccordionSection titulo={`C.I.: ${tercero.identificacion ?? "sin identificación"}`} icono="👤">
        <dl className="cliente-datos">
          <dt>Nombre</dt>
          <dd>{tercero.nombre}</dd>
          <dt>Teléfono</dt>
          <dd>{tercero.telefono ?? "—"}</dd>
          <dt>Tipo</dt>
          <dd>
            <span className={`cliente-tipo cliente-tipo-${tercero.tipo.toLowerCase()}`}>{tercero.tipo}</span>
          </dd>
          <dt>Cliente desde</dt>
          <dd>{new Date(tercero.created_at).toLocaleDateString("es-CO")}</dd>
        </dl>
        <button className="cliente-panel-cerrar" onClick={onCerrar}>
          Buscar otro cliente
        </button>
      </AccordionSection>

      <AccordionSection titulo="Seguimiento de Solicitudes" icono="📝">
        {solicitudes === null && <p className="cliente-panel-vacio">Cargando…</p>}
        {solicitudes?.length === 0 && <p className="cliente-panel-vacio">Este cliente no tiene solicitudes pendientes.</p>}
        {solicitudes && solicitudes.length > 0 && (
          <table className="cuentas-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Banco</th>
                <th>Monto</th>
                <th>Referencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.created_at).toLocaleString("es-CO")}</td>
                  <td>{s.caja_nombre}</td>
                  <td>{Number(s.monto_origen).toLocaleString("es-CO")} {s.moneda_codigo}</td>
                  <td>{s.referencia_codigo ?? "—"}</td>
                  <td><span className="estado-pendiente">Pendiente</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AccordionSection>

      <AccordionSection titulo="Opciones del Cliente" icono="⚙️">
        <div className="opciones-botones">
          <button className="btn-opcion btn-opcion-dorado" onClick={() => setMostrarPagos((v) => !v)}>
            Gestión de Pagos
          </button>
        </div>
        {mostrarPagos && (
          <div className="opciones-contenido">
            <RegistrarOperacionForm terceroId={tercero.id} onCompletado={onActualizar} />
          </div>
        )}
      </AccordionSection>

      <AccordionSection titulo="Cuentas del Cliente" icono="💳">
        <div className="opciones-botones">
          <button className="btn-opcion" onClick={() => setVistaCuentas(vistaCuentas === "disponibles" ? null : "disponibles")}>
            Cuentas Disponibles ({cuentas.disponibles.length})
          </button>
          <button className="btn-opcion" onClick={() => setVistaCuentas(vistaCuentas === "bloqueadas" ? null : "bloqueadas")}>
            Cuentas Bloqueadas ({cuentas.bloqueadas.length})
          </button>
          <button className="btn-opcion" onClick={() => setVistaCuentas(vistaCuentas === "cerradas" ? null : "cerradas")}>
            Cuentas que ya no tiene ({cuentas.cerradas.length})
          </button>
        </div>

        {vistaCuentas && (
          <div className="opciones-contenido">
            {vistaCuentas === "disponibles" && (
              <CuentasLista
                cuentas={cuentas.disponibles}
                onBloquear={(c) => cambiarEstado(c, "BLOQUEADA")}
                onCerrar={(c) => cambiarEstado(c, "CERRADA")}
              />
            )}
            {vistaCuentas === "bloqueadas" && (
              <CuentasLista cuentas={cuentas.bloqueadas} onDesbloquear={(c) => cambiarEstado(c, "DISPONIBLE")} />
            )}
            {vistaCuentas === "cerradas" && (
              <CuentasLista cuentas={cuentas.cerradas} onReabrir={(c) => cambiarEstado(c, "DISPONIBLE")} />
            )}
          </div>
        )}
      </AccordionSection>
    </div>
  );
}

function CuentasLista({
  cuentas,
  onBloquear,
  onDesbloquear,
  onCerrar,
  onReabrir,
}: {
  cuentas: CuentaCorriente[];
  onBloquear?: (c: CuentaCorriente) => void;
  onDesbloquear?: (c: CuentaCorriente) => void;
  onCerrar?: (c: CuentaCorriente) => void;
  onReabrir?: (c: CuentaCorriente) => void;
}) {
  if (cuentas.length === 0) {
    return <p className="cliente-panel-vacio">No hay cuentas en esta categoría.</p>;
  }

  return (
    <table className="cuentas-tabla">
      <thead>
        <tr>
          <th>Canal</th>
          <th>Moneda</th>
          <th>Saldo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {cuentas.map((c) => (
          <tr key={c.id}>
            <td>{c.canal_nombre}</td>
            <td>{c.moneda_codigo}</td>
            <td>{Number(c.saldo_actual).toLocaleString("es-CO")}</td>
            <td className="cuentas-tabla-acciones">
              {onBloquear && <button onClick={() => onBloquear(c)}>Bloquear</button>}
              {onDesbloquear && <button onClick={() => onDesbloquear(c)}>Desbloquear</button>}
              {onCerrar && <button onClick={() => onCerrar(c)}>Cerrar</button>}
              {onReabrir && <button onClick={() => onReabrir(c)}>Reabrir</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}