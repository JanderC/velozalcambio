import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, PiggyBank, Plus, Star } from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import { useAuth } from "../../auth/useAuth";
import { ApiError } from "../../api/client";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import {
  actualizarCaja,
  getMovimientosInternos,
  getTableroCajas,
  marcarCajaPrincipal,
  type CajaTablero,
  type MovimientoInterno,
} from "../../api/cajas.api";
import { CajaForm, TIPO_CAJA_LABEL } from "./CajaForm";
import { FondeoForm } from "./FondeoForm";
import { TransferenciaForm } from "./TransferenciaForm";
import { formatearMonto } from "./montos";
import "./cajas.css";

type Dialogo =
  | { tipo: "nueva" }
  | { tipo: "editar"; caja: CajaTablero }
  | { tipo: "fondeo" }
  | { tipo: "transferir"; origenId?: number };

export function CajasPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMIN";

  const [cajas, setCajas] = useState<CajaTablero[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoInterno[]>([]);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const [tablero, movs] = await Promise.all([getTableroCajas(mostrarInactivas), getMovimientosInternos()]);
      setCajas(tablero);
      setMovimientos(movs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cajas.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivas]);

  function terminar(mensaje: string) {
    setDialogo(null);
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

  const principal = cajas.find((c) => c.es_principal);

  return (
    <div className="cajas-page">
      <Header />
      <div className="cajas-header">
        <div>
          <h1>Cajas</h1>
          <p>Alimentá la caja principal y repartí la plata a las demás cajas.</p>
        </div>
        <div className="cajas-header-acciones">
          {esAdmin && (
            <button className="cajas-btn-secundario" onClick={() => setDialogo({ tipo: "nueva" })}>
              <Plus size={16} /> Nueva caja
            </button>
          )}
          {esAdmin && (
            <button className="cajas-btn-secundario" onClick={() => setDialogo({ tipo: "fondeo" })}>
              <PiggyBank size={16} /> Alimentar caja
            </button>
          )}
          <button className="cajas-btn-primario" onClick={() => setDialogo({ tipo: "transferir" })}>
            <ArrowRightLeft size={16} /> Transferir entre cajas
          </button>
        </div>
      </div>

      {!cargando && !principal && (
        <p className="cajas-banner">
          No hay una caja principal configurada.{esAdmin ? " Marcá una con \"Hacer principal\"." : " Pedile al administrador que configure una."}
        </p>
      )}
      {error && <p className="cajas-banner cajas-banner-error">{error}</p>}
      {aviso && <p className="cajas-banner cajas-banner-ok">{aviso}</p>}

      {esAdmin && (
        <label className="cajas-toggle">
          <input type="checkbox" checked={mostrarInactivas} onChange={(e) => setMostrarInactivas(e.target.checked)} />
          Mostrar cajas inactivas
        </label>
      )}

      <div className="cajas-grilla">
        {cajas.map((c) => (
          <article key={c.id} className={`caja-tarjeta${c.es_principal ? " caja-tarjeta-principal" : ""}${c.activo ? "" : " caja-tarjeta-inactiva"}`}>
            <header className="caja-tarjeta-cabecera">
              <div>
                <h3>{c.nombre}</h3>
                <span className="caja-tarjeta-tipo">{TIPO_CAJA_LABEL[c.tipo]}</span>
                {!c.activo && <span className="caja-tarjeta-tipo caja-tarjeta-tipo-inactiva">Inactiva</span>}
              </div>
              {c.es_principal && (
                <span className="caja-tarjeta-principal-badge">
                  <Star size={13} /> Principal
                </span>
              )}
            </header>
            {c.descripcion && <p className="caja-tarjeta-descripcion">{c.descripcion}</p>}

            <div className="caja-tarjeta-saldos">
              {c.saldos.length === 0 ? (
                <p className="caja-tarjeta-vacia">Sin saldo todavía</p>
              ) : (
                c.saldos.map((s) => {
                  const abierto = c.turnos_abiertos.some((t) => t.moneda_id === s.moneda_id);
                  return (
                    <div key={s.moneda_id} className="caja-tarjeta-saldo">
                      <span>{s.moneda_codigo}</span>
                      <strong>{formatearMonto(s.monto)}</strong>
                      <span className={abierto ? "caja-turno caja-turno-abierto" : "caja-turno"}>{abierto ? "Turno abierto" : "Cerrado"}</span>
                    </div>
                  );
                })
              )}
            </div>

            {c.activo && (
              <footer className="caja-tarjeta-acciones">
                <button onClick={() => setDialogo({ tipo: "transferir", origenId: c.id })}>Transferir desde aquí</button>
                {esAdmin && <button onClick={() => setDialogo({ tipo: "editar", caja: c })}>Editar</button>}
                {esAdmin && !c.es_principal && (
                  <button onClick={() => ejecutar(() => marcarCajaPrincipal(c.id), `${c.nombre} ahora es la caja principal.`)}>
                    Hacer principal
                  </button>
                )}
                {esAdmin && !c.es_principal && (
                  <button
                    onClick={() => {
                      if (window.confirm(`¿Desactivar ${c.nombre}? Debe estar en cero y sin turnos abiertos.`)) {
                        ejecutar(() => actualizarCaja(c.id, { activo: false }), `${c.nombre} quedó inactiva.`);
                      }
                    }}
                  >
                    Desactivar
                  </button>
                )}
              </footer>
            )}
            {!c.activo && esAdmin && (
              <footer className="caja-tarjeta-acciones">
                <button onClick={() => ejecutar(() => actualizarCaja(c.id, { activo: true }), `${c.nombre} volvió a estar activa.`)}>Activar</button>
              </footer>
            )}
          </article>
        ))}
      </div>

      <div className="cajas-historial">
        <h3>Fondeos y transferencias recientes</h3>
        <p className="cajas-historial-nota">
          Los turnos se cierran y cuadran en <Link to="/cierre-caja">Cierre de Caja</Link>.
        </p>
        {movimientos.length === 0 ? (
          <p className="caja-tarjeta-vacia">Todavía no hay movimientos entre cajas.</p>
        ) : (
          <div className="cajas-tabla-wrap">
            <table className="cajas-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Desde</th>
                  <th>Hacia</th>
                  <th>Monto</th>
                  <th>Observación</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString("es-CO")}</td>
                    <td>{m.tipo === "FONDEO" ? "Fondeo" : "Transferencia"}</td>
                    <td>{m.tipo === "FONDEO" ? "—" : m.caja_nombre}</td>
                    <td>{m.tipo === "FONDEO" ? m.caja_nombre : m.caja_destino_nombre}</td>
                    <td className="cajas-tabla-monto">{formatearMonto(m.monto)} {m.moneda_codigo}</td>
                    <td>{m.observacion ?? "—"}</td>
                    <td>{m.usuario_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogo?.tipo === "nueva" && (
        <Modal titulo="Nueva caja" onCerrar={() => setDialogo(null)}>
          <CajaForm onGuardada={() => terminar("Caja creada.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "editar" && (
        <Modal titulo={`Editar ${dialogo.caja.nombre}`} onCerrar={() => setDialogo(null)}>
          <CajaForm caja={dialogo.caja} onGuardada={() => terminar("Caja actualizada.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "fondeo" && (
        <Modal titulo="Alimentar caja" onCerrar={() => setDialogo(null)}>
          <FondeoForm cajas={cajas} monedas={monedas} onRegistrado={() => terminar("Fondeo registrado.")} onCancelar={() => setDialogo(null)} />
        </Modal>
      )}
      {dialogo?.tipo === "transferir" && (
        <Modal titulo="Transferir entre cajas" onCerrar={() => setDialogo(null)}>
          <TransferenciaForm
            cajas={cajas}
            monedas={monedas}
            origenInicialId={dialogo.origenId}
            onRegistrada={() => terminar("Transferencia registrada.")}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      )}
    </div>
  );
}
