import { useEffect, useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, dividirDecimales, sumarDecimales } from "../../utils/montos";
import { leerComprobante } from "./ocrComprobante";
import { lecturaDudosa } from "./comprobantesVarios";
import { dineroEn } from "./RepartoMonedas";

// Confirmaciones armadas con varias transferencias del cliente: cada una con su referencia, quién la envió, su monto y
// su captura. Se suman en "Total enviado", a ese total se le aplica una sola vez la comisión (o la tasa) y queda lo que
// se le paga. Se ve el resumen completo y con "Enviar a caja" queda una sola confirmación, con cada transferencia
// guardada aparte.
export type FormulaGeneral = "%" | "x" | "÷";
// a dónde va: a caja (confirmación para pagar en taquilla) o a Cuentas por Pagar (se le junta hasta completar lo que va a recibir)
export type DestinoVarias = "caja" | "pagar";
export interface Transferencia {
  referencia: string;
  remitente: string;
  cantidad: string;
  captura: File | null;
  leyendo?: boolean;
  aviso?: string | null;
  dudosa?: boolean; // la IA no la leyó bien: se pide verificar antes de procesar
}
export const transferenciaVacia = (): Transferencia => ({ referencia: "", remitente: "", cantidad: "", captura: null });

/**
 * El total enviado y lo que queda después de la comisión (o la tasa), en la moneda en que se le paga.
 * Comisión incluida: lo enviado ya trae el % sumado (2.650 = 2.500 + 6%), se le paga 2.650 ÷ 1,06 = 2.500.
 */
export function calcularResumen(filas: Transferencia[], formula: FormulaGeneral, valorEscrito: string, llega: string, queda: string, incluida = false) {
  const cantidades = filas.map((f) => (f.cantidad.trim() ? (leerNumero(f.cantidad)?.replace(/^-/, "") ?? null) : null));
  const totalEnviado = cantidades.reduce<string>((s, c) => (c ? sumarDecimales(s, c) : s), "0");
  const valor = valorEscrito.trim() ? (leerNumero(valorEscrito.replace(/%/g, ""))?.replace(/^-/, "") ?? null) : null;
  const decimales = queda === "COP" ? 0 : 2;
  const base = { cantidades, totalEnviado, valor, resultado: null as string | null, descuento: null as string | null };
  if (filas.length === 0) return { ...base, error: "Agregá al menos una transferencia." };
  if (cantidades.some((c) => !c || !/[1-9]/.test(c))) return { ...base, error: "Falta el monto de una transferencia." };
  if (!valor || !/[1-9]/.test(valor)) {
    if (valorEscrito.trim()) return { ...base, error: "La comisión o la tasa no es un número válido." };
    // sin comisión ni tasa: se le paga lo mismo que envió (solo si llega en la moneda en que se le paga)
    if (llega !== queda) return { ...base, error: `Falta la tasa para pasar ${llega} a ${queda}.` };
    return { ...base, resultado: totalEnviado, error: null };
  }
  if (formula === "%") {
    if (Number(valor) >= 100) return { ...base, error: "La comisión tiene que ser menor al 100%." };
    // con comisión se le paga en la misma moneda en que envió: 2.784 USD − 6% no son 2.627 pesos
    if (llega !== queda) return { ...base, error: `Con comisión se le paga en ${llega}. Para pagarle en ${queda} usá × Tasa o ÷ Dividir.` };
    const resultado = aplicarFormula(totalEnviado, formula, valor, decimales, incluida)!;
    return { ...base, resultado, descuento: sumarDecimales(totalEnviado, `-${resultado}`), error: null };
  }
  const resultado = aplicarFormula(totalEnviado, formula, valor, decimales, incluida);
  return { ...base, resultado, error: resultado && /[1-9]/.test(resultado) ? null : "El total da cero: revisá los montos y la tasa." };
}

/** Lo enviado con la comisión o la tasa aplicada (en la moneda en que se le paga). */
export function aplicarFormula(total: string, formula: FormulaGeneral, valor: string, decimales: number, incluida = false): string | null {
  if (formula === "%") return multiplicarDecimales(total, factorDeComision(valor, incluida), decimales);
  return formula === "÷" ? dividirDecimales(total, valor, decimales) : multiplicarDecimales(total, valor, decimales);
}

/**
 * Cuánto lleva y cuánto le falta para lo que va a recibir (ej. 3.000 USD). Lo que ya tenía guardado en Cuentas por Pagar
 * (lo enviado antes, sin descontar) se suma a lo de ahora y se le aplica la misma comisión o tasa. null sin meta.
 */
export function progresoMeta(
  r: { totalEnviado: string; valor: string | null },
  metaEscrita: string,
  previo: string | null,
  formula: FormulaGeneral,
  incluida: boolean,
  llega: string,
  queda: string
) {
  const meta = metaEscrita.trim() ? (leerNumero(metaEscrita)?.replace(/^-/, "") ?? null) : null;
  if (!meta || !/[1-9]/.test(meta)) return null;
  const bruto = sumarDecimales(previo ?? "0", r.totalEnviado);
  const conValor = !!r.valor && /[1-9]/.test(r.valor) && !(formula === "%" && llega !== queda);
  const lleva = conValor ? aplicarFormula(bruto, formula, r.valor!, queda === "COP" ? 0 : 2, incluida) : llega === queda ? bruto : null;
  const falta = lleva ? sumarDecimales(meta, `-${lleva}`) : null;
  // lo que falta, en lo que tiene que enviar (antes de la comisión o la tasa)
  const faltaEnviar =
    falta && Number(falta) > 0
      ? conValor
        ? formula === "%"
          ? dividirDecimales(falta, factorDeComision(r.valor!, incluida), 2)
          : formula === "÷"
            ? multiplicarDecimales(falta, r.valor!, 2)
            : dividirDecimales(falta, r.valor!, 2)
        : falta
      : null;
  return { meta, lleva, falta, faltaEnviar };
}

/** "Lleva 2.627 USD de 3.000 USD · falta 373 USD" (para el aviso al cliente). */
export function textoProgreso(p: NonNullable<ReturnType<typeof progresoMeta>>, queda: string) {
  if (!p.lleva || !p.falta) return "";
  const n = Number(p.falta);
  return `Lleva: ${dineroEn(p.lleva, queda)} de ${dineroEn(p.meta, queda)}\n${n > 0 ? `Falta: ${dineroEn(p.falta, queda)}` : n === 0 ? "Completo" : `Se pasa por: ${dineroEn(p.falta.replace(/^-/, ""), queda)}`}`;
}

export function VariasTransferencias({
  llega,
  queda,
  filas,
  onCambio,
  formula,
  onFormula,
  valor,
  onValor,
  incluida,
  onIncluida,
  meta,
  onMeta,
  previo,
  destino,
  onDestino,
  repetidas,
  cargando,
  textoBoton,
  onCargar,
}: {
  llega: string; // en qué moneda llegan las transferencias (la del medio)
  queda: string; // en qué moneda se le paga
  filas: Transferencia[];
  onCambio: (filas: Transferencia[]) => void;
  formula: FormulaGeneral;
  onFormula: (f: FormulaGeneral) => void;
  valor: string;
  onValor: (v: string) => void;
  incluida: boolean; // la comisión ya viene sumada en lo enviado
  onIncluida: (v: boolean) => void;
  meta: string; // cuánto va a recibir en total (opcional): se ve cuánto lleva y cuánto falta
  onMeta: (v: string) => void;
  previo: string | null; // lo que ya tiene en Cuentas por Pagar (enviado antes, en la moneda en que llega)
  destino: DestinoVarias;
  onDestino?: (d: DestinoVarias) => void; // sin esto no se ofrece mandarlo a Cuentas por Pagar
  repetidas: Record<string, string>; // referencia -> aviso de que ya está registrada
  cargando: boolean;
  textoBoton: string;
  onCargar: () => void;
}) {
  const [activa, setActiva] = useState(0); // la fila donde se pega la próxima captura
  const archivo = useRef<HTMLInputElement>(null);
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const activaRef = useRef(activa);
  activaRef.current = activa;

  const cambiar = (i: number, cambio: Partial<Transferencia>) => {
    const nuevas = filasRef.current.map((f, j) => (j === i ? { ...f, ...cambio } : f));
    filasRef.current = nuevas;
    onCambio(nuevas);
  };

  // Una captura por fila: se lee y llena la referencia, el monto y quién envió
  async function ponerCaptura(imagen: File, i: number) {
    cambiar(i, { captura: imagen, leyendo: true, aviso: null, dudosa: false });
    try {
      const d = await leerComprobante(imagen);
      const f = filasRef.current[i];
      if (!f) return;
      cambiar(i, {
        leyendo: false,
        referencia: f.referencia || d.referencia || "",
        cantidad: f.cantidad || (d.monto ? formatearMonto(d.monto) : ""),
        remitente: f.remitente || d.remitente || "",
        aviso: d.referencia || d.monto ? null : "No pude leer la captura: escribí los datos.",
        dudosa: lecturaDudosa(d),
      });
    } catch {
      cambiar(i, { leyendo: false, aviso: "No pude leer la captura: escribí los datos.", dudosa: true });
    }
  }

  // Pegar (Ctrl+V) va a la fila en la que se está escribiendo; si esa ya tiene captura, a una libre o a una nueva
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const imagenes = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!imagenes.length) return;
      // lo que se pega en el chat de WhatsApp sigue yendo al chat
      if ((e.target as HTMLElement | null)?.closest?.(".wb-raiz, .wa-composer")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      let i = activaRef.current;
      for (const imagen of imagenes) {
        let lista = filasRef.current;
        if (!lista[i] || lista[i]!.captura) {
          const libre = lista.findIndex((f) => !f.captura);
          if (libre >= 0) i = libre;
          else {
            lista = [...lista, transferenciaVacia()];
            filasRef.current = lista;
            onCambio(lista);
            i = lista.length - 1;
          }
        }
        void ponerCaptura(imagen, i);
        i += 1;
      }
    };
    // en captura, antes que el pegado general del formulario
    document.addEventListener("paste", alPegar, true);
    return () => document.removeEventListener("paste", alPegar, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = calcularResumen(filas, formula, valor, llega, queda, incluida);
  const hayRepetidas = filas.some((f) => f.referencia.trim() && repetidas[f.referencia.trim().toLowerCase()]);
  const leyendo = filas.some((f) => f.leyendo);
  const aPagar = destino === "pagar";
  // a Cuentas por Pagar va lo enviado tal cual: alcanza con que estén los montos
  const montosListos = filas.length > 0 && r.cantidades.every((c) => !!c && /[1-9]/.test(c));
  const p = progresoMeta(r, meta, previo, formula, incluida, llega, queda);
  const conPrevio = !!previo && /[1-9]/.test(previo);

  return (
    <div className="cc-varias" role="group" aria-label="Varias transferencias">
      <input
        ref={archivo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ponerCaptura(f, activa);
          e.target.value = "";
        }}
      />
      {filas.map((f, i) => {
        const repetida = f.referencia.trim() ? repetidas[f.referencia.trim().toLowerCase()] : undefined;
        return (
          <div className={`cc-varias-fila ${repetida ? "repetida" : ""} ${activa === i ? "activa" : ""}`} key={i} onFocusCapture={() => setActiva(i)}>
            <span className="cc-varias-num" title={`Transferencia ${i + 1}`}>
              {i + 1}
            </span>
            <label>
              Referencia
              <input value={f.referencia} onChange={(e) => cambiar(i, { referencia: e.target.value })} placeholder="N.º de transferencia" autoComplete="off" />
            </label>
            <label>
              Quién envió
              <input value={f.remitente} onChange={(e) => cambiar(i, { remitente: e.target.value })} placeholder="(opcional)" autoComplete="off" />
            </label>
            <label>
              Monto ({llega})
              <input className="num" value={f.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} inputMode="decimal" placeholder="0" autoComplete="off" />
            </label>
            <span className="cc-varias-acciones">
              <button type="button" className={f.captura ? "con" : ""} onClick={() => (setActiva(i), archivo.current?.click())} title={f.captura ? "Captura cargada (tocá para cambiarla)" : "Cargar la captura (o pegala con Ctrl+V)"}>
                <Camera size={14} /> {f.leyendo ? "Leyendo…" : f.captura ? "✓" : ""}
              </button>
              {filas.length > 1 && (
                <button type="button" onClick={() => onCambio(filas.filter((_, j) => j !== i))} aria-label={`Quitar la transferencia ${i + 1}`} title="Quitar">
                  <X size={14} />
                </button>
              )}
            </span>
            {(repetida || f.aviso) && <small className="cc-varias-aviso">{repetida ?? f.aviso}</small>}
          </div>
        );
      })}
      <button
        type="button"
        className="cc-varias-agregar"
        onClick={() => {
          onCambio([...filas, transferenciaVacia()]);
          setActiva(filas.length);
        }}
      >
        <Plus size={13} /> Agregar transferencia
      </button>

      {/* El resumen: lo enviado, la comisión (o la tasa) una sola vez sobre el total, y lo que se le paga */}
      <div className="cc-varias-resumen">
        <ol>
          {filas.map((f, i) => (
            <li key={i}>
              <span>
                Transferencia {i + 1}
                {f.referencia.trim() ? ` · Ref ${f.referencia.trim()}` : ""}
              </span>
              <b>{r.cantidades[i] ? dineroEn(r.cantidades[i]!, llega) : "—"}</b>
            </li>
          ))}
        </ol>
        <div className="cc-varias-linea total">
          <span>Total enviado</span>
          <b>{dineroEn(r.totalEnviado, llega)}</b>
        </div>
        <div className="cc-varias-linea formula">
          <div className="cc-modo-tasa" role="group" aria-label="Comisión o tasa sobre el total">
            {(["%", "x", "÷"] as const).map((op) => (
              <button type="button" key={op} className={formula === op ? "activo" : ""} onClick={() => onFormula(op)} aria-pressed={formula === op}>
                {op === "%" ? "− Comisión %" : op === "x" ? "× Tasa" : "÷ Dividir"}
              </button>
            ))}
          </div>
          <input className="num" value={valor} onChange={(e) => onValor(e.target.value)} inputMode="decimal" placeholder={formula === "%" ? "ej. 6" : "tasa"} autoComplete="off" aria-label="Comisión o tasa sobre el total" />
          <b className={formula === "%" ? "neg" : ""}>
            {formula === "%" ? (r.descuento ? `− ${dineroEn(r.descuento, llega)}` : "—") : r.resultado && r.valor ? `${formula} ${formatearMonto(r.valor)}` : "—"}
          </b>
        </div>
        {formula === "%" && r.valor && /[1-9]/.test(r.valor) && (
          <label className="cc-check cc-varias-incluida">
            <input type="checkbox" checked={incluida} onChange={(e) => onIncluida(e.target.checked)} />
            Lo enviado ya trae el {formatearMonto(r.valor)}% sumado
          </label>
        )}
        <div className="cc-varias-linea pagar">
          <span>Se le paga</span>
          <b>{r.resultado ? dineroEn(r.resultado, queda) : "—"}</b>
        </div>
        <div className="cc-varias-linea meta">
          <span>Va a recibir</span>
          <input className="num" value={meta} onChange={(e) => onMeta(e.target.value)} inputMode="decimal" placeholder={`ej. 3.000 ${queda} (opcional)`} autoComplete="off" aria-label="Cuánto va a recibir en total" />
        </div>
        {p && (
          <small className="cc-varias-progreso">
            {p.lleva && p.falta ? (
              <>
                Lleva <b>{dineroEn(p.lleva, queda)}</b> de {dineroEn(p.meta, queda)}
                {conPrevio ? ` (con ${dineroEn(previo!, llega)} que ya tenía en Cuentas por Pagar)` : ""} ·{" "}
                {Number(p.falta) > 0 ? (
                  <>
                    falta <b>{dineroEn(p.falta, queda)}</b>
                    {p.faltaEnviar && p.faltaEnviar !== p.falta ? ` (≈ ${dineroEn(p.faltaEnviar, llega)} por enviar)` : ""}
                  </>
                ) : Number(p.falta) === 0 ? (
                  <b>completo</b>
                ) : (
                  `se pasa por ${dineroEn(p.falta.replace(/^-/, ""), queda)}`
                )}
              </>
            ) : (
              "Escribí la comisión o la tasa para ver cuánto lleva."
            )}
          </small>
        )}
        {!p && conPrevio && <small className="cc-varias-progreso">Ya tiene {dineroEn(previo!, llega)} enviados en Cuentas por Pagar.</small>}
        {onDestino && (
          <div className="cc-varias-destino">
            <span>Va a</span>
            <div className="cc-chips" role="radiogroup" aria-label="A dónde va">
              <button type="button" role="radio" aria-checked={!aPagar} className={!aPagar ? "activo" : ""} onClick={() => onDestino("caja")}>
                Caja (taquilla)
              </button>
              <button type="button" role="radio" aria-checked={aPagar} className={aPagar ? "activo" : ""} onClick={() => onDestino("pagar")}>
                Cuentas por Pagar
              </button>
            </div>
          </div>
        )}
        {aPagar && (
          <small className="cc-varias-progreso">
            Queda guardado en Cuentas por Pagar lo enviado ({dineroEn(r.totalEnviado, llega)}), sin descontar la comisión. Cuando complete, desde allá se envía a taquilla con la comisión.
          </small>
        )}
        {r.error && !aPagar && filas.some((f) => f.cantidad.trim()) && <small className="cc-varias-aviso">{r.error}</small>}
        <button
          type="button"
          className="cc-guardar cc-varias-enviar"
          onClick={onCargar}
          disabled={(aPagar ? !montosListos : !!r.error) || hayRepetidas || leyendo || cargando}
          title={hayRepetidas ? "Hay una referencia ya registrada" : undefined}
        >
          {cargando ? "Enviando…" : aPagar ? "Enviar a Cuentas por Pagar" : textoBoton}
        </button>
      </div>
      <small>Pegá cada captura (Ctrl+V) y se llena su fila. Al enviar queda una sola confirmación por lo que se le paga, con cada transferencia guardada aparte.</small>
    </div>
  );
}
