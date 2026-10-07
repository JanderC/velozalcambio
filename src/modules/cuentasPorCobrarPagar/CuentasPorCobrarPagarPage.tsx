import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, HandCoins, MessageCircle, Plus, Search, Share2, UserPlus } from "lucide-react";
import { Header } from "../../components/common/Header";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { cambiarGrupoCobro, getCuentasCorrientes, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { alAbrirWhatsApp, enlaceWhatsApp, telefonoWhatsApp } from "../../utils/whatsapp";
import { HojaCuenta } from "../cuentasCorrientes/HojaCuenta";
import { compartirImagen, copiarImagen, descargarBlob } from "../cuentasCorrientes/imagenReporte";
import "../cuentasCorrientes/cuentasCorrientes.css";
import { SIN_GRUPO, detalleMoneda, dinero, enPesos, fechaDeHoy, grupoDe, gruposDe, mensajeDeCobro, mismoGrupo, totalEnPesos, totalesPorMoneda } from "./cobrar";
import { NuevoClienteCobrarModal } from "./NuevoClienteCobrarModal";
import { generarReporteCobrar } from "./reporteCobrar";
import "./cuentasPorCobrar.css";

const NUEVO_GRUPO = "__nuevo__";

/**
 * Cuentas por Cobrar: clientes propios del módulo, agrupados como en el Excel (Cerveloza, Zelle, Préstamos…).
 * Cada grupo es una tabla "Nombre Cliente / Monto COP" con su total; al tocar un cliente se abre su hoja, que se
 * lleva igual que una cuenta corriente (cargos, abonos, WhatsApp, reporte).
 */
export function CuentasPorCobrarPagarPage() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[] | null>(null);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const [creandoEn, setCreandoEn] = useState<string | null>(null); // el grupo donde se está creando un cliente
  const [reporte, setReporte] = useState<{ blob: Blob; url: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setCuentas(await getCuentasCorrientes({ vista: "cobrar" }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar las cuentas por cobrar.");
    }
  }, []);
  useEffect(() => {
    void cargar();
    getMonedas()
      .then(setMonedas)
      .catch(() => {});
  }, [cargar]);

  const todas = useMemo(() => cuentas ?? [], [cuentas]);
  const grupos = useMemo(() => gruposDe(todas), [todas]);
  // lo buscado: por nombre o por teléfono (comparando solo los dígitos)
  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    if (!texto) return todas;
    const digitos = texto.replace(/\D/g, "");
    return todas.filter((c) => c.tercero_nombre.toLowerCase().includes(texto) || (digitos.length >= 3 && (c.tercero_telefono ?? "").replace(/\D/g, "").includes(digitos)));
  }, [todas, buscar]);
  const delGrupo = useCallback((lista: CuentaCorrienteResumen[], g: string) => lista.filter((c) => mismoGrupo(grupoDe(c), g)), []);
  const general = useMemo(() => totalEnPesos(todas), [todas]);
  const otrasMonedas = useMemo(() => totalesPorMoneda(todas), [todas]);
  const abierta = abiertaId !== null ? (todas.find((c) => c.id === abiertaId) ?? null) : null;
  const buscando = buscar.trim() !== "";

  async function compartirReporte() {
    setGenerando(true);
    setError(null);
    try {
      const blob = await generarReporteCobrar(grupos.map((g) => ({ nombre: g, cuentas: delGrupo(todas, g) })));
      // en el teléfono abre el menú de compartir (WhatsApp); en el computador se muestra para copiarla o descargarla
      if (!(await compartirImagen(blob, `cuentas-por-cobrar-${fechaDeHoy().replace(/\//g, "-")}.png`))) {
        setCopiado(false);
        setReporte({ blob, url: URL.createObjectURL(blob) });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerando(false);
    }
  }
  function cerrarReporte() {
    if (reporte) URL.revokeObjectURL(reporte.url);
    setReporte(null);
  }

  async function moverDeGrupo(cuenta: CuentaCorrienteResumen, destino: string) {
    let grupo: string | null = destino;
    if (destino === NUEVO_GRUPO) {
      grupo = window.prompt("Nombre del grupo nuevo:")?.trim() || null;
      if (!grupo) return;
    }
    try {
      await cambiarGrupoCobro(cuenta.id, grupo === SIN_GRUPO ? null : grupo);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar el grupo.");
    }
  }

  // ---------- La hoja de un cliente ----------
  if (abierta) {
    return (
      <div className="cc-page cxc-page">
        <Header />
        <div className="cxc-barra-cliente">
          <button type="button" className="cxc-volver" onClick={() => setAbiertaId(null)}>
            <ArrowLeft size={16} /> Volver a Cuentas por Cobrar
          </button>
          {puedeEditar && (
            <label>
              Grupo
              <select value={grupos.find((g) => mismoGrupo(g, grupoDe(abierta))) ?? SIN_GRUPO} onChange={(e) => void moverDeGrupo(abierta, e.target.value)}>
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {!grupos.includes(SIN_GRUPO) && grupoDe(abierta) === SIN_GRUPO && <option value={SIN_GRUPO}>{SIN_GRUPO}</option>}
                <option value={NUEVO_GRUPO}>+ Grupo nuevo…</option>
              </select>
            </label>
          )}
        </div>
        {error && <p className="cxc-error">{error}</p>}
        <div className="cc-layout con-hoja cxc-hoja">
          <HojaCuenta key={abierta.id} cuenta={abierta} onActualizar={cargar} onVolver={() => setAbiertaId(null)} />
        </div>
      </div>
    );
  }

  // ---------- El tablero ----------
  return (
    <div className="cc-page cxc-page">
      <Header />

      <header className="cxc-hero">
        <div className="cxc-hero-titulo">
          <span className="cxc-hero-icono">
            <HandCoins size={26} />
          </span>
          <div>
            <h1>Cuentas por Cobrar</h1>
            <p>
              {todas.length} {todas.length === 1 ? "cliente" : "clientes"} en {grupos.filter((g) => g !== SIN_GRUPO).length} grupos · al {fechaDeHoy()}
            </p>
          </div>
        </div>
        <div className="cxc-hero-total">
          <span>Total por cobrar</span>
          <strong>{dinero(general.total, "COP")}</strong>
          <small>
            COP
            {otrasMonedas.length > 0 && ` · incluye ${otrasMonedas.map((m) => dinero(m.total, m.codigo)).join(" + ")}`}
            {general.sinTasa > 0 && ` · ${general.sinTasa} sin tasa a pesos`}
          </small>
        </div>
        <div className="cxc-hero-acciones">
          {puedeEditar && (
            <button type="button" className="cxc-btn-oro" onClick={() => setCreandoEn(grupos[0] ?? "")}>
              <UserPlus size={17} /> Nuevo cliente
            </button>
          )}
          <button type="button" className="cxc-btn-claro" onClick={compartirReporte} disabled={generando || !cuentas}>
            <Share2 size={16} /> {generando ? "Generando…" : "Compartir reporte"}
          </button>
        </div>
      </header>

      <div className="cxc-buscador">
        <Search size={20} />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente por nombre o teléfono" aria-label="Buscar cliente" />
        {buscando && (
          <span>
            {visibles.length} {visibles.length === 1 ? "resultado" : "resultados"}
          </span>
        )}
      </div>

      {error && <p className="cxc-error">{error}</p>}
      {!cuentas && !error && <p className="cxc-aviso">Cargando…</p>}

      {cuentas && (
        <div className="cxc-tablero">
          {grupos.map((g) => {
            const lista = delGrupo(visibles, g);
            // al buscar, los grupos sin coincidencias no estorban
            if (buscando && lista.length === 0) return null;
            const total = totalEnPesos(lista);
            return (
              <section key={g} className="cxc-grupo" aria-label={`Cuentas por Cobrar ${g}`}>
                <header>
                  <h2>
                    Cuentas por Cobrar <b>{g}</b>
                  </h2>
                  <span className="cxc-cuantos">{lista.length}</span>
                  {puedeEditar && g !== SIN_GRUPO && (
                    <button type="button" onClick={() => setCreandoEn(g)} title={`Agregar un cliente a ${g}`} aria-label={`Agregar un cliente a ${g}`}>
                      <Plus size={16} />
                    </button>
                  )}
                </header>
                <table>
                  <thead>
                    <tr>
                      <th>Nombre cliente</th>
                      <th className="num">Monto COP</th>
                      <th aria-label="WhatsApp" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => {
                      const pesos = enPesos(c);
                      const detalle = detalleMoneda(c);
                      const telefono = telefonoWhatsApp(c.tercero_telefono);
                      const mensaje = mensajeDeCobro(c);
                      return (
                        <tr key={c.id} onClick={() => setAbiertaId(c.id)} title="Abrir la hoja del cliente: movimientos, abonos y reporte">
                          <td>
                            <span className="cxc-nombre">{c.tercero_nombre}</span>
                            {detalle && <small>{detalle}</small>}
                          </td>
                          <td className={`num ${pesos?.startsWith("-") ? "favor" : ""}`}>{pesos === null ? <span className="cxc-sin-tasa">sin tasa</span> : dinero(pesos, "COP")}</td>
                          <td className="cxc-wa">
                            <a
                              href={enlaceWhatsApp(telefono, mensaje)}
                              onClick={(e) => {
                                e.stopPropagation();
                                alAbrirWhatsApp(e, telefono, mensaje);
                              }}
                              target="_blank"
                              rel="noreferrer"
                              className={telefono ? "" : "sin-telefono"}
                              title={telefono ? "Enviarle el saldo por WhatsApp" : "Sin teléfono registrado: al abrir WhatsApp se elige el contacto"}
                              aria-label={`Enviar el saldo a ${c.tercero_nombre} por WhatsApp`}
                            >
                              <MessageCircle size={16} />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {lista.length === 0 && (
                      <tr className="cxc-vacio">
                        <td colSpan={3}>Sin clientes en este grupo.</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{dinero(total.total, "COP")}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </section>
            );
          })}
          {buscando && visibles.length === 0 && <p className="cxc-aviso">Ningún cliente coincide con “{buscar.trim()}”.</p>}
        </div>
      )}

      {/* El resumen, como al pie del Excel: el total de cada grupo y el total general */}
      {cuentas && !buscando && (
        <section className="cxc-resumen" aria-label="Total por cobrar">
          <h2>Total por cobrar</h2>
          <table>
            <tbody>
              {grupos.map((g) => {
                const lista = delGrupo(todas, g);
                return (
                  <tr key={g}>
                    <td>
                      {g} <span>{lista.length}</span>
                    </td>
                    <td className="num">{dinero(totalEnPesos(lista).total, "COP")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{dinero(general.total, "COP")}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {creandoEn !== null && (
        <NuevoClienteCobrarModal
          grupos={grupos}
          grupoInicial={creandoEn}
          monedas={monedas}
          onCerrar={() => setCreandoEn(null)}
          onCreado={() => {
            setCreandoEn(null);
            void cargar();
          }}
        />
      )}

      {reporte && (
        <Modal titulo="Reporte de Cuentas por Cobrar" ancho="ancho" onCerrar={cerrarReporte}>
          <div className="cc-reporte">
            <div className="cc-reporte-acciones">
              <button
                type="button"
                className="cc-guardar"
                onClick={() =>
                  copiarImagen(reporte.blob)
                    .then(() => setCopiado(true))
                    .catch(() => setError("Este navegador no deja copiar la imagen: usá Descargar."))
                }
              >
                {copiado ? "Copiada: pegala en WhatsApp (Ctrl+V)" : "Copiar imagen"}
              </button>
              <button type="button" className="cc-btn-secundario" onClick={() => descargarBlob(reporte.blob, `cuentas-por-cobrar-${fechaDeHoy().replace(/\//g, "-")}.png`)}>
                Descargar
              </button>
            </div>
            <img src={reporte.url} alt="Reporte de cuentas por cobrar" />
          </div>
        </Modal>
      )}
    </div>
  );
}
