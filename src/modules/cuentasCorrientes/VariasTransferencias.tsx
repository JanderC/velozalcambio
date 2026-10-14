import { useEffect, useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, dividirDecimales, sumarDecimales } from "../../utils/montos";
import { leerComprobante } from "./ocrComprobante";
import { dineroEn } from "./RepartoMonedas";

// Confirmaciones armadas con varias transferencias del cliente: cada una con su referencia, quién la envió, su monto y
// su captura. Se suman en "Total enviado", a ese total se le aplica una sola vez la comisión (o la tasa) y queda lo que
// se le paga. Se ve el resumen completo y con "Enviar a caja" queda una sola confirmación, con cada transferencia
// guardada aparte.
export type FormulaGeneral = "%" | "x" | "÷";
export interface Transferencia {
  referencia: string;
  remitente: string;
  cantidad: string;
  captura: File | null;
  leyendo?: boolean;
  aviso?: string | null;
}
export const transferenciaVacia = (): Transferencia => ({ referencia: "", remitente: "", cantidad: "", captura: null });

/** El total enviado y lo que queda después de la comisión (o la tasa), en la moneda en que se le paga. */
export function calcularResumen(filas: Transferencia[], formula: FormulaGeneral, valorEscrito: string, llega: string, queda: string) {
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
    const resultado = multiplicarDecimales(totalEnviado, factorDeComision(valor, false), decimales);
    return { ...base, resultado, descuento: sumarDecimales(totalEnviado, `-${resultado}`), error: null };
  }
  const resultado = formula === "÷" ? dividirDecimales(totalEnviado, valor, decimales) : multiplicarDecimales(totalEnviado, valor, decimales);
  return { ...base, resultado, error: resultado && /[1-9]/.test(resultado) ? null : "El total da cero: revisá los montos y la tasa." };
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
    cambiar(i, { captura: imagen, leyendo: true, aviso: null });
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
      });
    } catch {
      cambiar(i, { leyendo: false, aviso: "No pude leer la captura: escribí los datos." });
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

  const r = calcularResumen(filas, formula, valor, llega, queda);
  const hayRepetidas = filas.some((f) => f.referencia.trim() && repetidas[f.referencia.trim().toLowerCase()]);
  const leyendo = filas.some((f) => f.leyendo);

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
        <div className="cc-varias-linea pagar">
          <span>Se le paga</span>
          <b>{r.resultado ? dineroEn(r.resultado, queda) : "—"}</b>
        </div>
        {r.error && filas.some((f) => f.cantidad.trim()) && <small className="cc-varias-aviso">{r.error}</small>}
        <button type="button" className="cc-guardar cc-varias-enviar" onClick={onCargar} disabled={!!r.error || hayRepetidas || leyendo || cargando} title={hayRepetidas ? "Hay una referencia ya registrada" : undefined}>
          {cargando ? "Enviando…" : textoBoton}
        </button>
      </div>
      <small>Pegá cada captura (Ctrl+V) y se llena su fila. Al enviar queda una sola confirmación por lo que se le paga, con cada transferencia guardada aparte.</small>
    </div>
  );
}
