import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Check, CircleHelp, ClipboardCopy, FileImage, HandCoins, Landmark, MessageCircle, Send, Store, TrendingUp, X } from "lucide-react";
import { ApiError } from "../../api/client";
import { solicitudesWaApi, type SolicitudWa, type TipoSolicitudWa } from "../../api/solicitudesWa.api";
import { whatsappApi } from "../../api/whatsapp.api";
import { getCajas, type Caja } from "../../api/cajas.api";
import { abrirChatEnBurbuja } from "../../components/whatsapp/BurbujaWhatsapp";
import { DOLAR_COMPRA, DOLAR_VENTA, EURO_COMPRA, escrita, useTablero, type Tablero } from "../tasas/tablero";
import "./bandejaSolicitudes.css";

// Lo que piden, en el orden en que más llegan (estudio de las conversaciones de octubre)
const TIPOS: { tipo: TipoSolicitudWa; titulo: string; corto: string; icono: typeof Send }[] = [
  { tipo: "COMPROBANTE", titulo: "Mandó comprobante", corto: "Comprobantes", icono: FileImage },
  { tipo: "PAGO", titulo: "Datos para pagarle", corto: "Datos para pagar", icono: HandCoins },
  { tipo: "TASA", titulo: "Pregunta la tasa", corto: "Tasa", icono: TrendingUp },
  { tipo: "CUENTA", titulo: "Pide la cuenta", corto: "Cuenta", icono: Landmark },
  { tipo: "CONFIRMAR", titulo: "Pide confirmación", corto: "Confirmar", icono: CircleHelp },
  { tipo: "RETIRO", titulo: "Retiro u horario", corto: "Retiro", icono: Store },
  { tipo: "COMPRA", titulo: "Quiere cambiar o comprar", corto: "Compra", icono: Banknote },
];
const LINEA: Record<number, string> = { 1: "Bolívares", 2: "Pesos", 3: "Dólares" };
const info = (t: TipoSolicitudWa) => TIPOS.find((x) => x.tipo === t)!;

function haceCuanto(fecha: string, ahora: number) {
  const min = Math.max(0, Math.floor((ahora - Date.parse(fecha)) / 60_000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h ${min % 60} min` : `hace ${Math.floor(h / 24)} d`;
}
const hora = (f: string) => new Date(f).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });

/** La Tasa del día como mensaje de WhatsApp. */
export function textoTasa(t: Tablero | null) {
  const v = t?.actual?.valores;
  if (!v) return null;
  const fila = (casillas: { clave: string; etiqueta: string }[]) =>
    casillas
      .filter((c) => v[c.clave])
      .map((c) => `${c.etiqueta} *${escrita(v[c.clave])}*`)
      .join(" · ");
  const cuando = t?.actual ? new Date(t.actual.actualizado).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" }) : "";
  const pct = (k: string) => (v[k] ? `${escrita(v[k])}${/%/.test(v[k]!) ? "%" : ""}` : null);
  return [
    `*Tasa del día* (${cuando})`,
    "",
    `💵 *Dólar compra:* ${fila(DOLAR_COMPRA)}`,
    `💵 *Dólar venta:* ${fila(DOLAR_VENTA)}`,
    `💶 *Euro compra:* ${fila(EURO_COMPRA)}${v["euro.venta"] ? ` · venta *${escrita(v["euro.venta"])}*` : ""}`,
    "",
    [v.bs ? `🇻🇪 Bs *${escrita(v.bs)}*` : null, v.zelle ? `Zelle *${escrita(v.zelle)}*` : null, pct("western") ? `Western *${pct("western")}*` : null].filter(Boolean).join(" · "),
    v["usdt.compra"] || v["usdt.venta"] ? `USDT compra *${escrita(v["usdt.compra"])}* · venta *${escrita(v["usdt.venta"])}*` : "",
    "",
    "Tasas sujetas a cambios sin previo aviso.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

/** Los datos de una cuenta de la empresa como mensaje de WhatsApp. */
function textoCuenta(c: Caja) {
  return [
    `*${c.banco || c.nombre}*${c.tipo_cuenta ? ` · ${c.tipo_cuenta.toLowerCase()}` : ""}`,
    c.numero_cuenta ? `N.º ${c.numero_cuenta}` : null,
    c.titular ? `Titular: ${c.titular}${c.identificacion_titular ? ` · ${c.identificacion_titular}` : ""}` : null,
    c.telefono && !c.numero_cuenta ? `Teléfono: ${c.telefono}` : null,
    "",
    "Cuando transfiera, envíenos el comprobante por aquí 🙏",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Atención de Solicitudes: lo que piden los clientes por WhatsApp, clasificado solo y ordenado por quién lleva más
 * esperando. Cada una se atiende con un toque (enviar la tasa, la cuenta, ir a registrar el comprobante, copiar los
 * datos para pagar) y queda quién la atendió. Lo que se responde en el chat se va cerrando solo.
 */
export function BandejaSolicitudes() {
  const [vista, setVista] = useState<"PENDIENTE" | "ATENDIDA">("PENDIENTE");
  const [filtro, setFiltro] = useState<TipoSolicitudWa | "TODAS">("TODAS");
  const [lista, setLista] = useState<SolicitudWa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<Caja[]>([]);
  const [eligiendoCuenta, setEligiendoCuenta] = useState<number | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const tablero = useTablero();

  const cargar = useCallback(async () => {
    try {
      setLista(await solicitudesWaApi.listar(vista));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la bandeja.");
    }
  }, [vista]);
  useEffect(() => {
    setLista(null);
    void cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
      setAhora(Date.now());
    }, 15_000);
    return () => clearInterval(t);
  }, [cargar]);
  useEffect(() => {
    getCajas()
      .then((l) => setCuentas(l.filter((c) => c.activo && c.tipo === "BANCO" && (c.numero_cuenta || c.telefono))))
      .catch(() => setCuentas([]));
  }, []);

  const conteo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of lista ?? []) m[s.tipo] = (m[s.tipo] ?? 0) + 1;
    return m;
  }, [lista]);
  const visibles = (lista ?? []).filter((s) => filtro === "TODAS" || s.tipo === filtro);

  function avisar(t: string) {
    setAviso(t);
    setTimeout(() => setAviso(null), 5000);
  }
  async function atender(s: SolicitudWa, nota?: string) {
    setOcupada(s.id);
    try {
      await solicitudesWaApi.atender(s.id, nota);
      setLista((l) => (l ?? []).filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo marcar.");
    } finally {
      setOcupada(null);
    }
  }
  async function descartar(s: SolicitudWa) {
    setOcupada(s.id);
    try {
      await solicitudesWaApi.descartar(s.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== s.id));
    } finally {
      setOcupada(null);
    }
  }
  /** Envía un texto por el chat de la solicitud (desde el WhatsApp vinculado) y la deja atendida. */
  async function responder(s: SolicitudWa, texto: string, nota: string) {
    setOcupada(s.id);
    setError(null);
    try {
      await whatsappApi.enviar(s.jid, texto);
      await solicitudesWaApi.atender(s.id, nota);
      setLista((l) => (l ?? []).filter((x) => x.id !== s.id));
      avisar(`Enviado a ${nombreDe(s)}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || "No se pudo enviar.");
    } finally {
      setOcupada(null);
      setEligiendoCuenta(null);
    }
  }
  const nombreDe = (s: SolicitudWa) => s.cliente || s.nombre_guardado || s.nombre || (s.telefono ? `+${s.telefono}` : "Cliente");
  const abrirChat = (s: SolicitudWa) => s.telefono && abrirChatEnBurbuja({ telefono: s.telefono, linea: s.linea, nombre: nombreDe(s) });

  const total = (lista ?? []).length;
  return (
    <section className="bs">
      <header className="bs-cabeza">
        <div>
          <h2>
            <MessageCircle size={20} /> Lo que piden por WhatsApp
          </h2>
          <p>Cada mensaje se clasifica solo. La más vieja va primero: que nadie se quede esperando.</p>
        </div>
        <div className="cc-chips" role="radiogroup" aria-label="Pendientes o atendidas">
          <button type="button" role="radio" aria-checked={vista === "PENDIENTE"} className={vista === "PENDIENTE" ? "activo" : ""} onClick={() => setVista("PENDIENTE")}>
            Pendientes{vista === "PENDIENTE" && lista ? ` (${total})` : ""}
          </button>
          <button type="button" role="radio" aria-checked={vista === "ATENDIDA"} className={vista === "ATENDIDA" ? "activo" : ""} onClick={() => setVista("ATENDIDA")}>
            Atendidas hoy{vista === "ATENDIDA" && lista ? ` (${total})` : ""}
          </button>
        </div>
      </header>

      <nav className="bs-filtros" aria-label="Qué piden">
        <button type="button" className={filtro === "TODAS" ? "activo" : ""} onClick={() => setFiltro("TODAS")}>
          Todas <b>{total}</b>
        </button>
        {TIPOS.map((t) => (
          <button key={t.tipo} type="button" className={filtro === t.tipo ? "activo" : ""} onClick={() => setFiltro(t.tipo)} disabled={!conteo[t.tipo]}>
            <t.icono size={14} /> {t.corto} <b>{conteo[t.tipo] ?? 0}</b>
          </button>
        ))}
      </nav>

      {error && <p className="bs-error">{error}</p>}
      {aviso && <p className="bs-ok">{aviso}</p>}
      {!lista && !error && <p className="bs-vacio">Cargando…</p>}
      {lista && visibles.length === 0 && <p className="bs-vacio">{vista === "PENDIENTE" ? "Nada pendiente. ¡Bien!" : "Todavía no se ha atendido nada hoy."}</p>}

      <ul className="bs-lista">
        {visibles.map((s) => {
          const t = info(s.tipo);
          const espera = Math.floor((ahora - Date.parse(s.created_at)) / 60_000);
          return (
            <li key={s.id} className={`bs-item ${s.tipo.toLowerCase()} ${vista === "PENDIENTE" && espera >= 10 ? "demora" : ""}`}>
              <span className="bs-icono" aria-hidden="true">
                <t.icono size={18} />
              </span>
              <div className="bs-cuerpo">
                <div className="bs-linea1">
                  <strong>{nombreDe(s)}</strong>
                  <span className="bs-tipo">{t.titulo}</span>
                  <span className={`bs-wa l${s.linea}`}>{LINEA[s.linea]}</span>
                  {s.mensajes > 1 && <span className="bs-cuantos">{s.mensajes} mensajes</span>}
                </div>
                {s.texto && <p className="bs-texto">{s.texto}</p>}
                {(s.datos.medio || s.datos.monto) && (
                  <div className="bs-datos">
                    {s.datos.medio && <span>{s.datos.medio}</span>}
                    {s.datos.monto && (
                      <span>
                        {s.datos.monto}
                        {s.datos.moneda && !/[a-z$]/i.test(s.datos.monto) ? ` ${s.datos.moneda}` : ""}
                      </span>
                    )}
                  </div>
                )}
                <small className="bs-tiempo">
                  {vista === "PENDIENTE" ? (
                    <>
                      Llegó {hora(s.created_at)} · <b>{haceCuanto(s.created_at, ahora)}</b>
                    </>
                  ) : (
                    <>
                      Atendida {s.atendida_en ? hora(s.atendida_en) : ""} {s.atendida_por_nombre ? `por ${s.atendida_por_nombre}` : s.nota ? `· ${s.nota}` : ""}
                    </>
                  )}
                </small>

                {vista === "PENDIENTE" && (
                  <div className="bs-acciones">
                    {s.tipo === "TASA" && (
                      <button
                        type="button"
                        className="bs-principal"
                        disabled={ocupada === s.id || !textoTasa(tablero)}
                        onClick={() => void responder(s, textoTasa(tablero)!, "Se le envió la tasa del día")}
                        title={textoTasa(tablero) ?? "Todavía no hay Tasa del día cargada"}
                      >
                        <Send size={14} /> Enviar tasa del día
                      </button>
                    )}
                    {(s.tipo === "CUENTA" || s.tipo === "COMPRA") &&
                      (eligiendoCuenta === s.id ? (
                        <span className="bs-cuentas">
                          {cuentas.map((c) => (
                            <button key={c.id} type="button" disabled={ocupada === s.id} onClick={() => void responder(s, textoCuenta(c), `Se le envió la cuenta ${c.nombre}`)}>
                              {c.nombre}
                            </button>
                          ))}
                          <button type="button" className="bs-quitar" onClick={() => setEligiendoCuenta(null)} aria-label="Cancelar">
                            <X size={14} />
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="bs-principal" onClick={() => setEligiendoCuenta(s.id)} disabled={!cuentas.length} title={cuentas.length ? undefined : "No hay cuentas de la empresa con número cargado"}>
                          <Landmark size={14} /> Enviar cuenta
                        </button>
                      ))}
                    {s.tipo === "COMPROBANTE" && (
                      <Link className="bs-principal" to={`/cajas-confirmaciones?buscar=${encodeURIComponent(s.telefono ? s.telefono.replace(/D/g, "").slice(-10) : nombreDe(s))}`} title="Abrir Confirmaciones con este cliente buscado, para registrar la captura">
                        <FileImage size={14} /> Registrar en Confirmaciones
                      </Link>
                    )}
                    {s.tipo === "PAGO" && (
                      <button
                        type="button"
                        className="bs-principal"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(s.texto ?? "")
                            .then(() => avisar("Datos copiados: pégalos donde vas a pagar."))
                            .catch(() => setError("No se pudo copiar."))
                        }
                      >
                        <ClipboardCopy size={14} /> Copiar datos
                      </button>
                    )}
                    <button type="button" onClick={() => abrirChat(s)} disabled={!s.telefono}>
                      <MessageCircle size={14} /> Abrir chat
                    </button>
                    <button type="button" className="bs-listo" onClick={() => void atender(s)} disabled={ocupada === s.id}>
                      <Check size={14} /> Atendida
                    </button>
                    <button type="button" className="bs-descartar" onClick={() => void descartar(s)} disabled={ocupada === s.id} title="No era una solicitud (se quita de la bandeja)">
                      No es solicitud
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
