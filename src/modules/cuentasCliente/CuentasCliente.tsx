import { useEffect, useState } from "react";
import { Pencil, Plus, Power, RotateCcw, Wallet } from "lucide-react";
import {
  actualizarCuentaTercero,
  desactivarCuentaTercero,
  ETIQUETA_TIPO_CUENTA,
  getCuentasTercero,
  type CuentaTercero,
} from "../../api/cuentasTercero.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import type { Rol } from "../../types/auth.types";
import { Modal } from "../../components/common/Modal";
import { CuentaClienteForm } from "./CuentaClienteForm";
import "./cuentasCliente.css";

const ROLES_AGREGAR: Rol[] = ["ADMIN", "ASESOR", "CAJERO"];
const ROLES_DESACTIVAR: Rol[] = ["ADMIN", "ASESOR"];

// Lo que identifica la cuenta de un vistazo: número o teléfono o email, según el tipo.
export function datoPrincipalCuenta(c: CuentaTercero) {
  return c.numero_cuenta ?? c.telefono ?? c.email ?? null;
}

export function nombreCuenta(c: CuentaTercero) {
  return c.alias ?? ETIQUETA_TIPO_CUENTA[c.tipo];
}

// Pestaña "Cuentas" de la ficha: dónde recibe o envía dinero el cliente.
export function CuentasCliente({
  terceroId,
  titularSugerido,
  onCambio,
}: {
  terceroId: number;
  titularSugerido?: string;
  onCambio?: () => void;
}) {
  const { usuario } = useAuth();
  const puedeAgregar = usuario != null && ROLES_AGREGAR.includes(usuario.rol);
  const puedeDesactivar = usuario != null && ROLES_DESACTIVAR.includes(usuario.rol);

  const [verInactivas, setVerInactivas] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaTercero[] | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [formulario, setFormulario] = useState<{ cuenta?: CuentaTercero } | null>(null);
  const [desactivando, setDesactivando] = useState<CuentaTercero | null>(null);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    getCuentasTercero(terceroId, verInactivas)
      .then((c) => { if (vigente) setCuentas(c); })
      .catch((err) => {
        if (!vigente) return;
        setCuentas([]);
        setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cuentas.");
      });
    return () => { vigente = false; };
  }, [terceroId, verInactivas, version]);

  function despuesDeCambio(mensaje: string) {
    setAviso(mensaje);
    setError(null);
    setVersion((v) => v + 1);
    onCambio?.();
  }

  async function confirmarDesactivar() {
    if (!desactivando) return;
    const c = desactivando;
    setProcesandoId(c.id);
    try {
      await desactivarCuentaTercero(c.id);
      setDesactivando(null);
      despuesDeCambio(`Cuenta "${nombreCuenta(c)}" desactivada.`);
    } catch (err) {
      setDesactivando(null);
      setError(err instanceof ApiError ? err.message : "No se pudo desactivar la cuenta.");
    } finally {
      setProcesandoId(null);
    }
  }

  async function reactivar(c: CuentaTercero) {
    setProcesandoId(c.id);
    setError(null);
    try {
      await actualizarCuentaTercero(c.id, { activo: true });
      despuesDeCambio(`Cuenta "${nombreCuenta(c)}" reactivada.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reactivar la cuenta.");
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <div className="cta-seccion">
      <div className="cta-encabezado">
        <label className="cta-toggle">
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
          Mostrar desactivadas
        </label>
        {puedeAgregar && (
          <button className="cta-btn-primario" onClick={() => { setFormulario({}); setAviso(null); }}>
            <Plus size={16} /> Agregar cuenta
          </button>
        )}
      </div>

      {aviso && <p className="cta-aviso">{aviso}</p>}
      {error && <p className="cta-error">{error}</p>}

      {cuentas === null && <p className="cta-vacio">Cargando…</p>}
      {cuentas?.length === 0 && (
        <p className="cta-vacio">
          {verInactivas ? "Este cliente no tiene cuentas registradas." : "Este cliente no tiene cuentas activas."}
          {puedeAgregar && " Agregá una con el botón de arriba."}
        </p>
      )}

      {cuentas && cuentas.length > 0 && (
        <div className="cta-tarjetas">
          {cuentas.map((c) => {
            const principal = datoPrincipalCuenta(c);
            return (
              <div key={c.id} className={`cta-tarjeta ${c.activo ? "" : "inactiva"}`}>
                <div className="cta-tarjeta-top">
                  <span className="cta-tarjeta-tipo"><Wallet size={14} /> {ETIQUETA_TIPO_CUENTA[c.tipo]}</span>
                  {c.moneda_codigo && <span className="cta-moneda">{c.moneda_codigo}</span>}
                  {!c.activo && <span className="cta-inactiva-tag">Desactivada</span>}
                </div>
                <strong className="cta-tarjeta-nombre">{nombreCuenta(c)}</strong>
                <dl>
                  {c.banco && <div><dt>Banco</dt><dd>{c.banco}</dd></div>}
                  {principal && (
                    <div>
                      <dt>{c.numero_cuenta ? "Número" : c.telefono ? "Teléfono" : "Email"}</dt>
                      <dd>{principal}{c.tipo_cuenta ? ` · ${c.tipo_cuenta === "AHORRO" ? "Ahorro" : "Corriente"}` : ""}</dd>
                    </div>
                  )}
                  {c.numero_cuenta && c.telefono && <div><dt>Teléfono</dt><dd>{c.telefono}</dd></div>}
                  {(c.numero_cuenta || c.telefono) && c.email && <div><dt>Email</dt><dd>{c.email}</dd></div>}
                  <div>
                    <dt>Titular</dt>
                    <dd>{c.titular}{c.identificacion_titular ? ` · ${c.identificacion_titular}` : ""}</dd>
                  </div>
                </dl>
                <div className="cta-tarjeta-acciones">
                  {c.activo ? (
                    <>
                      {puedeAgregar && (
                        <button className="cta-btn-mini" onClick={() => { setFormulario({ cuenta: c }); setAviso(null); }}>
                          <Pencil size={13} /> Editar
                        </button>
                      )}
                      {puedeDesactivar && (
                        <button className="cta-btn-mini cta-btn-peligro" onClick={() => setDesactivando(c)} disabled={procesandoId === c.id}>
                          <Power size={13} /> Desactivar
                        </button>
                      )}
                    </>
                  ) : (
                    puedeAgregar && (
                      <button className="cta-btn-mini" onClick={() => reactivar(c)} disabled={procesandoId === c.id}>
                        <RotateCcw size={13} /> {procesandoId === c.id ? "Reactivando…" : "Reactivar"}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formulario && (
        <Modal titulo={formulario.cuenta ? "Editar cuenta" : "Agregar cuenta del cliente"} onCerrar={() => setFormulario(null)}>
          <CuentaClienteForm
            terceroId={terceroId}
            cuenta={formulario.cuenta}
            titularSugerido={titularSugerido}
            onGuardado={(c) => {
              const editada = formulario.cuenta != null;
              setFormulario(null);
              despuesDeCambio(editada ? `Cuenta "${nombreCuenta(c)}" actualizada.` : `Cuenta "${nombreCuenta(c)}" agregada.`);
            }}
            onCancelar={() => setFormulario(null)}
          />
        </Modal>
      )}

      {desactivando && (
        <Modal titulo="¿Desactivar esta cuenta?" onCerrar={() => setDesactivando(null)}>
          <p className="cta-confirmar-texto">
            <strong>{nombreCuenta(desactivando)}</strong>
            {datoPrincipalCuenta(desactivando) ? ` · ${datoPrincipalCuenta(desactivando)}` : ""}. La cuenta no se borra: deja de
            aparecer en la lista y en las pantallas de cambio. Se puede reactivar desde "Mostrar desactivadas".
          </p>
          <div className="cta-acciones">
            <button className="cta-btn-secundario" onClick={() => setDesactivando(null)}>Cancelar</button>
            <button className="cta-btn-peligro-solido" onClick={confirmarDesactivar} disabled={procesandoId === desactivando.id}>
              {procesandoId === desactivando.id ? "Desactivando…" : "Desactivar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
