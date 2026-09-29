import { useEffect, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { actualizarCaja, getTableroCajas, type CajaTablero } from "../../api/cajas.api";
import { actualizarMetodoPago, getMetodosPago, type MetodoPago } from "../../api/metodosPago.api";
import { CuentaEmpresaForm, nombrePais, TIPO_CUENTA_LABEL } from "./CuentaEmpresaForm";
import { MetodoPagoForm } from "./MetodoPagoForm";
import { formatearMonto } from "../cajas/montos";
import "../cajas/cajas.css";
import "./cuentasEmpresa.css";

type Dialogo =
  | { tipo: "nueva-cuenta" }
  | { tipo: "editar-cuenta"; cuenta: CajaTablero }
  | { tipo: "nuevo-metodo" }
  | { tipo: "editar-metodo"; metodo: MetodoPago };

// Mismas reglas que valida el backend al desactivar una cuenta
function motivosParaNoDesactivar(cuenta: CajaTablero) {
  const motivos: string[] = [];
  if (cuenta.turnos_abiertos.length > 0) {
    motivos.push(`tiene turnos abiertos en ${cuenta.turnos_abiertos.map((t) => t.moneda_codigo).join(", ")} (cerralos en Cierre de Caja)`);
  }
  const conSaldo = cuenta.saldos.filter((s) => Number(s.monto) !== 0);
  if (conSaldo.length > 0) {
    motivos.push(`todavía tiene saldo: ${conSaldo.map((s) => `${s.moneda_codigo} ${formatearMonto(s.monto)}`).join(", ")} (transferilo a otra caja)`);
  }
  if (cuenta.metodos_pago.length > 0) {
    motivos.push(`tiene métodos de pago vinculados: ${cuenta.metodos_pago.map((m) => m.nombre).join(", ")} (desvinculalos abajo)`);
  }
  return motivos;
}

export function CuentasEmpresaPage() {
  const [cuentas, setCuentas] = useState<CajaTablero[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    try {
      const [tablero, listaMetodos] = await Promise.all([getTableroCajas(true), getMetodosPago(true)]);
      setCuentas(tablero.filter((c) => c.tipo === "BANCO"));
      setMetodos(listaMetodos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cuentas.");
    }
  }

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
    cargar();
  }, []);

  function terminar(mensaje: string) {
    setDialogo(null);
    setError(null);
    setAviso(mensaje);
    cargar();
  }

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      setAviso(mensaje);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    }
  }

  const cuentasActivas = cuentas.filter((c) => c.activo);
  const cuentasVisibles = mostrarInactivas ? cuentas : cuentasActivas;

  return (
    <div className="cajas-page">
      <Header />
      <div className="cajas-header">
        <div>
          <h1>Cuentas y Métodos de Pago</h1>
          <p>Cuentas bancarias y billeteras de la empresa, y los medios por donde pagan los clientes.</p>
        </div>
      </div>

      {error && <p className="cajas-banner cajas-banner-error">{error}</p>}
      {aviso && <p className="cajas-banner cajas-banner-ok">{aviso}</p>}

      {/* ---------- Cuentas ---------- */}
      <div className="cuentas-seccion-cabecera">
        <h2>Cuentas de la empresa</h2>
        <div className="cuentas-seccion-acciones">
          <label className="cajas-form-check-inline">
            <input type="checkbox" checked={mostrarInactivas} onChange={(e) => setMostrarInactivas(e.target.checked)} />
            Mostrar inactivas
          </label>
          <button className="cajas-btn-primario" onClick={() => setDialogo({ tipo: "nueva-cuenta" })}>
            <Plus size={16} /> Nueva cuenta
          </button>
        </div>
      </div>

      {cuentasVisibles.length === 0 ? (
        <p className="cuentas-vacio">Todavía no hay cuentas. Creá la primera con "Nueva cuenta".</p>
      ) : (
        <div className="cajas-grilla">
          {cuentasVisibles.map((c) => (
            <article key={c.id} className={`caja-tarjeta${c.activo ? "" : " caja-tarjeta-inactiva"}`}>
              <header className="caja-tarjeta-cabecera">
                <div>
                  <h3><Landmark size={15} className="icono-inline" /> {c.nombre}</h3>
                  {c.banco && <span className="caja-tarjeta-tipo">{c.banco}</span>}
                  {c.pais && <span className="caja-tarjeta-tipo">{nombrePais(c.pais)}</span>}
                  {c.moneda_codigo && <span className="caja-tarjeta-tipo">{c.moneda_codigo}</span>}
                  {!c.activo && <span className="caja-tarjeta-tipo caja-tarjeta-tipo-inactiva">Inactiva</span>}
                </div>
              </header>

              <dl className="cuenta-datos">
                {c.numero_cuenta && (<><dt>{c.tipo_cuenta ? `Cuenta ${TIPO_CUENTA_LABEL[c.tipo_cuenta].toLowerCase()}` : "Cuenta"}</dt><dd>{c.numero_cuenta}</dd></>)}
                {!c.numero_cuenta && c.tipo_cuenta && (<><dt>Tipo</dt><dd>{TIPO_CUENTA_LABEL[c.tipo_cuenta]}</dd></>)}
                {c.titular && (<><dt>Titular</dt><dd>{c.titular}{c.identificacion_titular ? ` · ${c.identificacion_titular}` : ""}</dd></>)}
                {!c.titular && c.identificacion_titular && (<><dt>Identificación</dt><dd>{c.identificacion_titular}</dd></>)}
                {c.telefono && (<><dt>Teléfono</dt><dd>{c.telefono}</dd></>)}
                {c.email && (<><dt>Email</dt><dd>{c.email}</dd></>)}
                <dt>Saldo</dt>
                <dd>{c.saldos.length === 0 ? "—" : c.saldos.map((s) => `${s.moneda_codigo} ${formatearMonto(s.monto)}`).join(" · ")}</dd>
              </dl>
              {c.descripcion && <p className="caja-tarjeta-descripcion">{c.descripcion}</p>}

              <div className="cuenta-metodos">
                {c.metodos_pago.length === 0 ? (
                  <span className="caja-turno">Sin métodos de pago vinculados</span>
                ) : (
                  c.metodos_pago.map((m) => <span key={m.id} className="cuenta-metodo-chip">{m.nombre}</span>)
                )}
              </div>

              <footer className="caja-tarjeta-acciones">
                {c.activo ? (
                  <>
                    <button onClick={() => setDialogo({ tipo: "editar-cuenta", cuenta: c })}>Editar</button>
                    <button
                      onClick={() => {
                        const motivos = motivosParaNoDesactivar(c);
                        if (motivos.length > 0) {
                          setAviso(null);
                          setError(`No se puede desactivar "${c.nombre}": ${motivos.join("; y ")}.`);
                          return;
                        }
                        if (window.confirm(`¿Desactivar la cuenta ${c.nombre}?`)) {
                          ejecutar(() => actualizarCaja(c.id, { activo: false }), `${c.nombre} quedó inactiva.`);
                        }
                      }}
                    >
                      Desactivar
                    </button>
                  </>
                ) : (
                  <button onClick={() => ejecutar(() => actualizarCaja(c.id, { activo: true }), `${c.nombre} volvió a estar activa.`)}>Activar</button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* ---------- Métodos de pago ---------- */}
      <div className="cuentas-seccion-cabecera">
        <h2>Métodos de pago</h2>
        <div className="cuentas-seccion-acciones">
          <button className="cajas-btn-primario" onClick={() => setDialogo({ tipo: "nuevo-metodo" })}>
            <Plus size={16} /> Nuevo método
          </button>
        </div>
      </div>

      <div className="cajas-historial">
        <div className="cajas-tabla-wrap">
          <table className="cajas-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cuenta vinculada</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {metodos.map((m) => (
                <tr key={m.id} className={m.activo ? "" : "cuentas-fila-inactiva"}>
                  <td><strong>{m.nombre}</strong></td>
                  <td>
                    <select
                      className="cuentas-select-inline"
                      value={m.cuenta_id ?? ""}
                      disabled={!m.activo}
                      onChange={(e) => {
                        const cuentaId = e.target.value ? Number(e.target.value) : null;
                        ejecutar(
                          () => actualizarMetodoPago(m.id, { cuentaId }),
                          cuentaId ? `${m.nombre} quedó vinculado a ${cuentasActivas.find((c) => c.id === cuentaId)?.nombre}.` : `${m.nombre} quedó sin cuenta.`
                        );
                      }}
                    >
                      <option value="">Sin cuenta</option>
                      {cuentasActivas.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                      {/* Si está vinculado a una cuenta inactiva, que igual se vea */}
                      {m.cuenta_id && !cuentasActivas.some((c) => c.id === m.cuenta_id) && (
                        <option value={m.cuenta_id}>{m.cuenta_nombre} (inactiva)</option>
                      )}
                    </select>
                  </td>
                  <td>
                    <span className={m.activo ? "cuentas-estado-activo" : "cuentas-estado-inactivo"}>{m.activo ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className="caja-tarjeta-acciones">
                    <button onClick={() => setDialogo({ tipo: "editar-metodo", metodo: m })}>Editar</button>
                    <button onClick={() => ejecutar(() => actualizarMetodoPago(m.id, { activo: !m.activo }), `${m.nombre} ${m.activo ? "desactivado" : "activado"}.`)}>
                      {m.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialogo?.tipo === "nueva-cuenta" && (
        <Modal titulo="Nueva cuenta" onCerrar={() => setDialogo(null)}>
          <CuentaEmpresaForm monedas={monedas} onGuardada={() => terminar("Cuenta creada.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "editar-cuenta" && (
        <Modal titulo={`Editar ${dialogo.cuenta.nombre}`} onCerrar={() => setDialogo(null)}>
          <CuentaEmpresaForm cuenta={dialogo.cuenta} monedas={monedas} onGuardada={() => terminar("Cuenta actualizada.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "nuevo-metodo" && (
        <Modal titulo="Nuevo método de pago" onCerrar={() => setDialogo(null)}>
          <MetodoPagoForm cuentas={cuentasActivas} onGuardado={() => terminar("Método de pago creado.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "editar-metodo" && (
        <Modal titulo={`Editar ${dialogo.metodo.nombre}`} onCerrar={() => setDialogo(null)}>
          <MetodoPagoForm metodo={dialogo.metodo} cuentas={cuentasActivas} onGuardado={() => terminar("Método de pago actualizado.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
    </div>
  );
}
