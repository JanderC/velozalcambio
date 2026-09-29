import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, PiggyBank, Plus, Search, Star, X } from "lucide-react";
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
import type { TipoCaja } from "../../api/cajas.api";
import { FondeoForm } from "./FondeoForm";
import { TransferenciaForm } from "./TransferenciaForm";
import { formatearMonto } from "./montos";
import "./cajas.css";

// Una fila por moneda con saldo O con turno abierto: un turno en una moneda
// sin saldo también hay que cerrarlo, así que no puede quedar oculto.
function filasPorMoneda(caja: CajaTablero) {
  const filas = caja.saldos.map((s) => ({
    monedaId: s.moneda_id,
    codigo: s.moneda_codigo,
    monto: s.monto,
    abierto: caja.turnos_abiertos.some((t) => t.moneda_id === s.moneda_id),
  }));
  for (const t of caja.turnos_abiertos) {
    if (!filas.some((f) => f.monedaId === t.moneda_id)) {
      filas.push({ monedaId: t.moneda_id, codigo: t.moneda_codigo, monto: "0", abierto: true });
    }
  }
  return filas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// Mismas reglas que valida el backend al desactivar; se muestran antes de intentarlo.
function motivosParaNoDesactivar(caja: CajaTablero) {
  const motivos: string[] = [];
  if (caja.turnos_abiertos.length > 0) {
    motivos.push(`tiene turnos abiertos en ${caja.turnos_abiertos.map((t) => t.moneda_codigo).join(", ")} (cerralos en Cierre de Caja)`);
  }
  const conSaldo = caja.saldos.filter((s) => Number(s.monto) !== 0);
  if (conSaldo.length > 0) {
    motivos.push(`todavía tiene saldo: ${conSaldo.map((s) => `${s.moneda_codigo} ${formatearMonto(s.monto)}`).join(", ")} (transferilo a otra caja)`);
  }
  return motivos;
}

const REFRESCO_MS = 8000;

const FILTROS_TIPO: { valor: TipoCaja | ""; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todas" },
  { valor: "FISICA", etiqueta: "Físicas" },
  { valor: "FUERTE", etiqueta: "Fuertes" },
  { valor: "BANCO", etiqueta: "Bancos" },
];

function claveSaldo(cajaId: number, monedaId: number) {
  return `${cajaId}-${monedaId}`;
}

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
  // Filtros y "en vivo"
  const [monedaFiltro, setMonedaFiltro] = useState<number | "">("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoCaja | "">("");
  const [busqueda, setBusqueda] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  const [cambiados, setCambiados] = useState<Set<string>>(new Set());
  const saldosPrevios = useRef<Map<string, string> | null>(null);

  // silencioso = refresco automático: no muestra "cargando" ni pisa el aviso del usuario
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const [tablero, movs] = await Promise.all([getTableroCajas(mostrarInactivas), getMovimientosInternos()]);

        // Qué saldos cambiaron desde la última lectura (para resaltarlos)
        const actuales = new Map<string, string>();
        for (const c of tablero) for (const s of c.saldos) actuales.set(claveSaldo(c.id, s.moneda_id), s.monto);
        const previos = saldosPrevios.current;
        if (previos) {
          const distintos = new Set([...actuales].filter(([k, v]) => previos.get(k) !== v).map(([k]) => k));
          if (distintos.size > 0) {
            setCambiados(distintos);
            setTimeout(() => setCambiados(new Set()), 2500);
          }
        }
        saldosPrevios.current = actuales;

        setCajas(tablero);
        setMovimientos(movs);
        setActualizadoEn(new Date());
        if (silencioso) setError((e) => (e === "No se pudieron cargar las cajas." ? null : e));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cajas.");
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [mostrarInactivas]
  );

  useEffect(() => {
    getMonedas().then(setMonedas).catch(() => setMonedas([]));
  }, []);

  useEffect(() => {
    saldosPrevios.current = null;
    cargar();
    // En vivo: refresca solo mientras la pestaña está visible
    const intervalo = setInterval(() => {
      if (!document.hidden) cargar(true);
    }, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  // Monedas que tienen plata en alguna caja (para los filtros y los totales)
  const monedasConSaldo = useMemo(() => {
    const codigos = new Map<number, string>();
    for (const c of cajas) for (const s of c.saldos) if (Number(s.monto) !== 0) codigos.set(s.moneda_id, s.moneda_codigo);
    return [...codigos.entries()].map(([id, codigo]) => ({ id, codigo })).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [cajas]);

  const cajasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cajas.filter((c) => {
      if (tipoFiltro && c.tipo !== tipoFiltro) return false;
      if (q && !`${c.nombre} ${c.banco ?? ""}`.toLowerCase().includes(q)) return false;
      if (monedaFiltro !== "") {
        const tiene = c.saldos.some((s) => s.moneda_id === monedaFiltro) || c.turnos_abiertos.some((t) => t.moneda_id === monedaFiltro);
        if (!tiene) return false;
      }
      return true;
    });
  }, [cajas, tipoFiltro, busqueda, monedaFiltro]);

  // Total por moneda de las cajas que quedan con los filtros de tipo y búsqueda
  const totalesPorMoneda = useMemo(() => {
    return monedasConSaldo.map((m) => ({
      ...m,
      total: cajasFiltradas.reduce((suma, c) => suma + Number(c.saldos.find((s) => s.moneda_id === m.id)?.monto ?? 0), 0),
    }));
  }, [monedasConSaldo, cajasFiltradas]);

  // Con una moneda elegida: cuánto tiene cada caja y qué parte del total es
  const reparto = useMemo(() => {
    if (monedaFiltro === "") return null;
    const filas = cajasFiltradas
      .map((c) => ({ caja: c, monto: c.saldos.find((s) => s.moneda_id === monedaFiltro)?.monto ?? "0" }))
      .sort((a, b) => Number(b.monto) - Number(a.monto));
    const total = filas.reduce((suma, f) => suma + Number(f.monto), 0);
    return { filas, total, codigo: monedasConSaldo.find((m) => m.id === monedaFiltro)?.codigo ?? monedas.find((m) => m.id === monedaFiltro)?.codigo ?? "" };
  }, [monedaFiltro, cajasFiltradas, monedasConSaldo, monedas]);

  const hayFiltros = monedaFiltro !== "" || tipoFiltro !== "" || busqueda.trim() !== "";

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
  const turnosAbiertos = cajas.flatMap((c) =>
    c.turnos_abiertos.map((t) => ({ cajaId: c.id, caja: c.nombre, monedaId: t.moneda_id, codigo: t.moneda_codigo }))
  );

  return (
    <div className="cajas-page">
      <Header />
      <div className="cajas-header">
        <div>
          <h1>Cajas</h1>
          <p>Alimentá la caja principal y repartí la plata a las demás cajas.</p>
          <span className="cajas-en-vivo" title="Los saldos se actualizan solos">
            <span className="cajas-pulso" /> En vivo · cada {REFRESCO_MS / 1000} s
            {actualizadoEn && <> · actualizado {actualizadoEn.toLocaleTimeString("es-CO")}</>}
          </span>
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
      {turnosAbiertos.length > 0 && (
        <p className="cajas-banner cajas-banner-info">
          {turnosAbiertos.length === 1 ? "Hay 1 turno abierto" : `Hay ${turnosAbiertos.length} turnos abiertos`} (se abren por moneda, cerralos al final del día):{" "}
          {turnosAbiertos.map((t, i) => (
            <span key={`${t.cajaId}-${t.monedaId}`}>
              {i > 0 && ", "}
              <Link to={`/cierre-caja?cajaId=${t.cajaId}&monedaId=${t.monedaId}`}>{t.caja} {t.codigo}</Link>
            </span>
          ))}
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

      {/* ---------- Filtros y saldos en vivo ---------- */}
      <section className="cajas-filtros">
        <div className="cajas-filtros-fila">
          <div className="cajas-chips" role="group" aria-label="Filtrar por moneda">
            <button className={monedaFiltro === "" ? "activo" : ""} onClick={() => setMonedaFiltro("")}>Todas las monedas</button>
            {totalesPorMoneda.map((m) => (
              <button key={m.id} className={monedaFiltro === m.id ? "activo" : ""} onClick={() => setMonedaFiltro(monedaFiltro === m.id ? "" : m.id)}>
                <strong>{m.codigo}</strong> {formatearMonto(String(m.total))}
              </button>
            ))}
          </div>
        </div>
        <div className="cajas-filtros-fila">
          <div className="cajas-chips cajas-chips-tipo" role="group" aria-label="Filtrar por tipo">
            {FILTROS_TIPO.map((f) => (
              <button key={f.valor} className={tipoFiltro === f.valor ? "activo" : ""} onClick={() => setTipoFiltro(f.valor)}>
                {f.etiqueta}
              </button>
            ))}
          </div>
          <label className="cajas-buscar">
            <Search size={15} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar caja o banco" />
            {busqueda && <button onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda"><X size={14} /></button>}
          </label>
          {hayFiltros && (
            <button
              className="cajas-limpiar"
              onClick={() => {
                setMonedaFiltro("");
                setTipoFiltro("");
                setBusqueda("");
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>

        {reparto && (
          <div className="cajas-reparto">
            <div className="cajas-reparto-cabecera">
              <span>¿Dónde está el {reparto.codigo}?</span>
              <strong>Total {formatearMonto(String(reparto.total))} {reparto.codigo}</strong>
            </div>
            {reparto.filas.length === 0 ? (
              <p className="caja-tarjeta-vacia">Ninguna caja tiene {reparto.codigo} con estos filtros.</p>
            ) : (
              reparto.filas.map((f) => {
                const porcentaje = reparto.total > 0 ? (Number(f.monto) / reparto.total) * 100 : 0;
                const cambio = cambiados.has(claveSaldo(f.caja.id, Number(monedaFiltro)));
                return (
                  <div key={f.caja.id} className={`cajas-reparto-fila${cambio ? " saldo-cambio" : ""}`}>
                    <span className="cajas-reparto-nombre">
                      {f.caja.nombre}
                      <small>{TIPO_CAJA_LABEL[f.caja.tipo]}</small>
                    </span>
                    <span className="cajas-reparto-barra">
                      <span style={{ width: `${Math.max(porcentaje, Number(f.monto) > 0 ? 1.5 : 0)}%` }} />
                    </span>
                    <strong>{formatearMonto(f.monto)}</strong>
                    <span className="cajas-reparto-pct">{porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {cajasFiltradas.length === 0 && !cargando && (
        <p className="cajas-sin-resultados">Ninguna caja coincide con los filtros.</p>
      )}

      <div className="cajas-grilla">
        {cajasFiltradas.map((c) => (
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
              {filasPorMoneda(c).length === 0 ? (
                <p className="caja-tarjeta-vacia">Sin saldo todavía</p>
              ) : (
                filasPorMoneda(c)
                  .filter((f) => monedaFiltro === "" || f.monedaId === monedaFiltro)
                  .map((f) => (
                  <div key={f.monedaId} className={`caja-tarjeta-saldo${cambiados.has(claveSaldo(c.id, f.monedaId)) ? " saldo-cambio" : ""}`}>
                    <span>{f.codigo}</span>
                    <strong>{formatearMonto(f.monto)}</strong>
                    {f.abierto ? (
                      <Link
                        to={`/cierre-caja?cajaId=${c.id}&monedaId=${f.monedaId}`}
                        className="caja-turno caja-turno-abierto"
                        title={`Cerrar el turno de ${c.nombre} en ${f.codigo}`}
                      >
                        Turno abierto · cerrar
                      </Link>
                    ) : (
                      <span className="caja-turno">Cerrado</span>
                    )}
                  </div>
                ))
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
                      const motivos = motivosParaNoDesactivar(c);
                      if (motivos.length > 0) {
                        setAviso(null);
                        setError(`No se puede desactivar "${c.nombre}": ${motivos.join("; y ")}.`);
                        return;
                      }
                      if (window.confirm(`¿Desactivar ${c.nombre}? Dejará de aparecer en las operaciones.`)) {
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
