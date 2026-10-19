import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CircleCheckBig, HandCoins, MessageCircle, Plus, Search, Send, Share2, UserPlus } from "lucide-react";
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
import { TransferenciaCobrarModal } from "./TransferenciaCobrarModal";
import { PagoTotalCobrarModal } from "./PagoTotalCobrarModal";
import { EnviarAConfirmacionesModal } from "../cuentasCorrientes/EnviarAConfirmacionesModal";
import { generarReporteCobrar } from "./reporteCobrar";
import "./cuentasPorCobrar.css";

const NUEVO_GRUPO = "__nuevo__";

/**
 * Cuentas por Cobrar: clientes propios del módulo, agrupados como en el Excel (Cerveloza, Zelle, Préstamos…).
 * Cada grupo es una tabla "Nombre Cliente / Monto COP" con su total; al tocar un cliente se abre su hoja, que se
 * lleva igual que una cuenta corriente (cargos, abonos, WhatsApp, reporte).
 */
export function CuentasPorCobrarPagarPage({ modo = "cobrar" }: { modo?: "cobrar" | "pagar" }) {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  // Cuentas por Pagar: el mismo tablero, con lo que le debo a cada cliente (en positivo) y "Enviar a taquilla" en su hoja
  const pagar = modo === "pagar";
  const NOMBRE = pagar ? "Cuentas por Pagar" : "Cuentas por Cobrar";
  // lo que le debo está en negativo: acá se muestra en positivo
  const ver = (v: string) => (!pagar ? v : v.startsWith("-") ? v.slice(1) : /[1-9]/.test(v) ? `-${v}` : v);
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[] | null>(null);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  // ?cuenta=: se entra directo a esa cuenta (desde Capital de giros)
  const [parametros] = useSearchParams();
  const [abiertaId, setAbiertaId] = useState<number | null>(() => Number(parametros.get("cuenta")) || null);
  const [creandoEn, setCreandoEn] = useState<string | null>(null); // el grupo donde se está creando un cliente
  const [transfiriendo, setTransfiriendo] = useState(false); // registrar una transferencia que le hicimos a alguien
  const [pagandoId, setPagandoId] = useState<number | null>(null); // el cliente que paga todo lo que debe
  const [pagosHechos, setPagosHechos] = useState(0); // al pagar con la hoja abierta, la hoja se vuelve a cargar
  const pagando = pagandoId !== null ? ((cuentas ?? []).find((c) => c.id === pagandoId) ?? null) : null;
  const debe = (c: CuentaCorrienteResumen) => !pagar && !c.saldo_actual.startsWith("-") && /[1-9]/.test(c.saldo_actual);
  const [reporte, setReporte] = useState<{ blob: Blob; url: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setCuentas(await getCuentasCorrientes({ vista: modo }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `No se pudieron cargar las ${NOMBRE.toLowerCase()}.`);
    }
  }, [modo, NOMBRE]);
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
  // Cuentas por Cobrar: a veces el cliente me manda de más y soy yo el que le debe. Eso va aparte, y se le envía a
  // taquilla para que venga a recogerlo.
  const lesDebo = useMemo(() => (pagar ? [] : todas.filter((c) => c.saldo_actual.startsWith("-") && /[1-9]/.test(c.saldo_actual))), [todas, pagar]);
  const meDeben = useMemo(() => (pagar ? todas : todas.filter((c) => !c.saldo_actual.startsWith("-"))), [todas, pagar]);
  const totalCobrar = useMemo(() => totalEnPesos(meDeben), [meDeben]);
  const totalLesDebo = useMemo(() => totalEnPesos(lesDebo), [lesDebo]);
  const [verLesDebo, setVerLesDebo] = useState(false);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);
  const enviando = enviandoId !== null ? (todas.find((c) => c.id === enviandoId) ?? null) : null;
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
            <ArrowLeft size={16} /> Volver a {NOMBRE}
          </button>
          {puedeEditar && debe(abierta) && (
            <button type="button" className="cxc-pagar-todo" onClick={() => setPagandoId(abierta.id)} title="El cliente paga todo lo que debe: se anota el abono por el saldo completo">
              <CircleCheckBig size={16} /> Pagar todo ({dinero(abierta.saldo_actual, abierta.moneda_codigo)})
            </button>
          )}
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
          {/* la hoja se vuelve a montar al pagar, para que muestre el abono recién anotado */}
          <HojaCuenta
            key={`${abierta.id}-${pagosHechos}`}
            cuenta={abierta}
            onActualizar={cargar}
            onVolver={() => setAbiertaId(null)}
            // el movimiento se llevó aparte, en otra moneda: se abre la cuenta de este cliente en esa moneda
            onAbrirCuenta={(id) => void cargar().then(() => setAbiertaId(id))}
          />
        </div>
        {pagando && (
          <PagoTotalCobrarModal
            cuenta={pagando}
            onCerrar={() => setPagandoId(null)}
            onPagado={() => {
              setPagandoId(null);
              setPagosHechos((v) => v + 1);
              void cargar();
            }}
          />
        )}
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
            <h1>{NOMBRE}</h1>
            <p>
              {todas.length} {todas.length === 1 ? "cliente" : "clientes"} en {grupos.filter((g) => g !== SIN_GRUPO).length} grupos · al {fechaDeHoy()}
            </p>
          </div>
        </div>
        <div className="cxc-hero-total">
          <span>{pagar ? "Total que debo" : "Total por cobrar"}</span>
          <strong>{dinero(ver(pagar ? general.total : totalCobrar.total), "COP")}</strong>
          <small>
            COP
            {otrasMonedas.length > 0 && ` · incluye ${otrasMonedas.map((m) => dinero(ver(m.total), m.codigo)).join(" + ")}`}
            {general.sinTasa > 0 && ` · ${general.sinTasa} sin tasa a pesos`}
          </small>
        </div>
        {!pagar && (
          <button
            type="button"
            className={`cxc-hero-debo ${lesDebo.length ? "" : "vacio"} ${verLesDebo ? "abierto" : ""}`}
            onClick={() => setVerLesDebo((v) => !v)}
            disabled={!lesDebo.length}
            title="Clientes a los que les debo: se les envía a taquilla para que vengan a recoger"
          >
            <span>Total por pagar</span>
            <strong>{dinero(totalLesDebo.total.replace(/^-/, ""), "COP")}</strong>
            <small>
              {lesDebo.length ? `${lesDebo.length} ${lesDebo.length === 1 ? "cliente" : "clientes"} · ${verLesDebo ? "ocultar" : "ver y enviar a taquilla"}` : "no le debo a nadie"}
            </small>
          </button>
        )}
        <div className="cxc-hero-acciones">
          {puedeEditar && !pagar && (
            <button type="button" className="cxc-btn-oro" onClick={() => setTransfiriendo(true)} title="Le hicimos una transferencia a alguien: se pega la captura y queda en su cuenta por cobrar">
              <ArrowUpRight size={17} /> Registrar transferencia
            </button>
          )}
          {puedeEditar && (
            <button type="button" className="cxc-btn-claro" onClick={() => setCreandoEn(grupos[0] ?? "")}>
              <UserPlus size={17} /> Nuevo cliente
            </button>
          )}
          {!pagar && (
          <button type="button" className="cxc-btn-claro" onClick={compartirReporte} disabled={generando || !cuentas}>
            <Share2 size={16} /> {generando ? "Generando…" : "Compartir reporte"}
          </button>
          )}
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

      {verLesDebo && lesDebo.length > 0 && (
        <section className="cxc-les-debo" aria-label="Clientes a los que les debo">
          <header>
            <h2>Les debo · por enviar a taquilla</h2>
            <span>{dinero(totalLesDebo.total.replace(/^-/, ""), "COP")}</span>
          </header>
          <ul>
            {lesDebo.map((c) => (
              <li key={c.id}>
                <button type="button" className="cxc-les-debo-nombre" onClick={() => setAbiertaId(c.id)} title="Abrir su hoja">
                  {c.tercero_nombre}
                  <small>{grupoDe(c)}</small>
                </button>
                <strong>{dinero(c.saldo_actual.replace(/^-/, ""), c.moneda_codigo)}</strong>
                {puedeEditar && (
                  <button type="button" className="cxc-enviar" onClick={() => setEnviandoId(c.id)}>
                    <Send size={14} /> Enviar a taquilla
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cuentas && (
        <div className="cxc-tablero">
          {grupos.map((g) => {
            const lista = delGrupo(visibles, g);
            // al buscar, los grupos sin coincidencias no estorban
            if (buscando && lista.length === 0) return null;
            const total = totalEnPesos(lista);
            return (
              <section key={g} className="cxc-grupo" aria-label={`${NOMBRE} ${g}`}>
                <header>
                  <h2>
                    {NOMBRE} <b>{g}</b>
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
                          <td className={`num ${pesos !== null && ver(pesos).startsWith("-") ? "favor" : ""}`}>{pesos === null ? <span className="cxc-sin-tasa">sin tasa</span> : dinero(ver(pesos), "COP")}</td>
                          <td className="cxc-wa">
                            {puedeEditar && !pagar && c.saldo_actual.startsWith("-") && /[1-9]/.test(c.saldo_actual) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnviandoId(c.id);
                                }}
                                title={`Le debo ${dinero(c.saldo_actual.replace(/^-/, ""), c.moneda_codigo)}: enviárselo a taquilla para que venga a recogerlo`}
                                aria-label={`Enviar a taquilla lo que le debo a ${c.tercero_nombre}`}
                              >
                                <Send size={15} />
                              </button>
                            )}
                            {puedeEditar && debe(c) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPagandoId(c.id);
                                }}
                                title={`Pagar todo: ${c.tercero_nombre} paga los ${dinero(c.saldo_actual, c.moneda_codigo)} que debe`}
                                aria-label={`Registrar que ${c.tercero_nombre} paga todo lo que debe`}
                              >
                                <CircleCheckBig size={16} />
                              </button>
                            )}
                            {!pagar && (
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
                            )}
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
                      <td className="num">{dinero(ver(total.total), "COP")}</td>
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
        <section className="cxc-resumen" aria-label={pagar ? "Total que debo" : "Total por cobrar"}>
          <h2>{pagar ? "Total que debo" : "Total por cobrar"}</h2>
          <table>
            <tbody>
              {grupos.map((g) => {
                const lista = delGrupo(todas, g);
                return (
                  <tr key={g}>
                    <td>
                      {g} <span>{lista.length}</span>
                    </td>
                    <td className="num">{dinero(ver(totalEnPesos(lista).total), "COP")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{dinero(ver(general.total), "COP")}</td>
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
          modulo={pagar ? "POR_PAGAR" : "POR_COBRAR"}
          onCerrar={() => setCreandoEn(null)}
          onCreado={() => {
            setCreandoEn(null);
            void cargar();
          }}
        />
      )}

      {pagando && (
        <PagoTotalCobrarModal
          cuenta={pagando}
          onCerrar={() => setPagandoId(null)}
          onPagado={() => {
            setPagandoId(null);
            void cargar();
          }}
        />
      )}

      {enviando && (
        <EnviarAConfirmacionesModal
          cuenta={enviando}
          montoInicial={enviando.saldo_actual.replace(/^-/, "")}
          onCerrar={() => setEnviandoId(null)}
          onEnviado={() => void cargar()}
        />
      )}

      {transfiriendo && (
        <TransferenciaCobrarModal
          cuentas={todas}
          grupos={grupos}
          monedas={monedas}
          onRegistrada={() => void cargar()}
          onAbrirHoja={(id) => setAbiertaId(id)}
          onCerrar={() => setTransfiriendo(false)}
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
