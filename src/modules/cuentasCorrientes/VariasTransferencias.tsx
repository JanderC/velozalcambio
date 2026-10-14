import { useEffect, useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { formatearMonto, leerNumero, multiplicarDecimales, dividirDecimales, sumarDecimales } from "../../utils/montos";
import { leerComprobante } from "./ocrComprobante";
import { dineroEn } from "./RepartoMonedas";

// Confirmaciones armadas con varias transferencias del cliente: cada una con su referencia, quién la envió, su monto,
// su fórmula (tasa, dividir o comisión) y su captura. Se ve el total y con "Cargar" queda una sola confirmación,
// con cada transferencia guardada aparte.
export type FormulaTransferencia = "x" | "÷" | "%";
export interface Transferencia {
  referencia: string;
  remitente: string;
  cantidad: string;
  formula: FormulaTransferencia;
  valor: string; // la tasa o el % de comisión (vacío: sin convertir)
  captura: File | null;
  leyendo?: boolean;
  aviso?: string | null;
}
export const transferenciaVacia = (formula: FormulaTransferencia = "x", valor = ""): Transferencia => ({ referencia: "", remitente: "", cantidad: "", formula, valor, captura: null });

/** La cuenta de una transferencia: cantidad × tasa, ÷ tasa, − % o tal cual (si llega en la moneda de la cuenta). */
export function calcularTransferencia(t: Transferencia, llega: string, queda: string) {
  const cantidad = t.cantidad.trim() ? (leerNumero(t.cantidad)?.replace(/^-/, "") ?? null) : null;
  const valor = t.valor.trim() ? (leerNumero(t.valor.replace(/%/g, ""))?.replace(/^-/, "") ?? null) : null;
  const decimales = queda === "COP" ? 0 : 2;
  if (!cantidad || !/[1-9]/.test(cantidad)) return { cantidad: null, valor, resultado: null, formula: "DIRECTO" as const, error: "Falta el monto de una transferencia." };
  if (!valor || !/[1-9]/.test(valor)) {
    if (t.valor.trim()) return { cantidad, valor: null, resultado: null, formula: "DIRECTO" as const, error: "Una tasa o comisión no es un número válido." };
    if (llega !== queda) return { cantidad, valor: null, resultado: null, formula: "DIRECTO" as const, error: `Falta la tasa para pasar ${llega} a ${queda} en una transferencia.` };
    return { cantidad, valor: null, resultado: cantidad, formula: "DIRECTO" as const, error: null };
  }
  if (t.formula === "%") {
    if (Number(valor) >= 100) return { cantidad, valor, resultado: null, formula: "COMISION" as const, error: "La comisión tiene que ser menor al 100%." };
    const factor = sumarDecimales("1", `-${multiplicarDecimales(valor, "0.01", 8)}`);
    return { cantidad, valor, resultado: multiplicarDecimales(cantidad, factor, decimales), formula: "COMISION" as const, error: null };
  }
  const resultado = t.formula === "÷" ? dividirDecimales(cantidad, valor, decimales) : multiplicarDecimales(cantidad, valor, decimales);
  return { cantidad, valor, resultado, formula: t.formula === "÷" ? ("DIVIDIR" as const) : ("TASA" as const), error: resultado && /[1-9]/.test(resultado) ? null : "Una transferencia da cero: revisá monto y tasa." };
}

export function VariasTransferencias({
  llega,
  queda,
  filas,
  onCambio,
  repetidas,
  cargando,
  onCargar,
}: {
  llega: string; // en qué moneda llegan las transferencias (la del medio)
  queda: string; // en qué moneda queda la confirmación
  filas: Transferencia[];
  onCambio: (filas: Transferencia[]) => void;
  repetidas: Record<string, string>; // referencia -> aviso de que ya está registrada
  cargando: boolean;
  onCargar: () => void;
}) {
  const [activa, setActiva] = useState(0); // la fila donde se pega la próxima captura
  const archivo = useRef<HTMLInputElement>(null);
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const activaRef = useRef(activa);
  activaRef.current = activa;

  const cambiar = (i: number, cambio: Partial<Transferencia>) => onCambio(filasRef.current.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

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

  // Pegar (Ctrl+V) va a la fila en la que se está escribiendo; si esa ya tiene captura, a una nueva
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const imagenes = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!imagenes.length) return;
      // lo que se pega en el chat de WhatsApp sigue yendo al chat
      if ((e.target as HTMLElement | null)?.closest?.(".wb-raiz, .wa-composer")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      let lista = filasRef.current;
      let i = activaRef.current;
      for (const imagen of imagenes) {
        if (!lista[i] || lista[i]!.captura) {
          const libre = lista.findIndex((f) => !f.captura);
          if (libre >= 0) i = libre;
          else {
            const anterior = lista[lista.length - 1];
            lista = [...lista, transferenciaVacia(anterior?.formula, anterior?.valor)];
            onCambio(lista);
            filasRef.current = lista;
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

  const cuentas = filas.map((f) => calcularTransferencia(f, llega, queda));
  const totalEnviado = cuentas.reduce((s, c) => (c.cantidad ? sumarDecimales(s, c.cantidad) : s), "0");
  const total = cuentas.reduce((s, c) => (c.resultado ? sumarDecimales(s, c.resultado) : s), "0");
  const todasBien = filas.length > 0 && cuentas.every((c) => !c.error) && !filas.some((f) => f.leyendo);
  const hayRepetidas = filas.some((f) => f.referencia.trim() && repetidas[f.referencia.trim().toLowerCase()]);

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
        const c = cuentas[i]!;
        const repetida = f.referencia.trim() ? repetidas[f.referencia.trim().toLowerCase()] : undefined;
        return (
          <div className={`cc-varias-fila ${repetida ? "repetida" : ""} ${activa === i ? "activa" : ""}`} key={i} onFocusCapture={() => setActiva(i)}>
            <span className="cc-varias-num">{i + 1}</span>
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
            <div className="cc-varias-formula">
              <div className="cc-modo-tasa" role="group" aria-label="Tasa, dividir o comisión">
                {(["x", "÷", "%"] as const).map((op) => (
                  <button type="button" key={op} className={f.formula === op ? "activo" : ""} onClick={() => cambiar(i, { formula: op })} aria-pressed={f.formula === op}>
                    {op === "x" ? "× Tasa" : op === "÷" ? "÷ Dividir" : "− Comisión %"}
                  </button>
                ))}
              </div>
              <input className="num" value={f.valor} onChange={(e) => cambiar(i, { valor: e.target.value })} inputMode="decimal" placeholder={llega === queda ? "sin tasa" : f.formula === "%" ? "%" : "tasa"} autoComplete="off" aria-label="Tasa o comisión de esta transferencia" />
            </div>
            <output className="cc-varias-resultado">{c.resultado ? `= ${dineroEn(c.resultado, queda)}` : "= —"}</output>
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
      <div className="cc-varias-pie">
        <button
          type="button"
          className="cc-varias-agregar"
          onClick={() => {
            const anterior = filas[filas.length - 1];
            onCambio([...filas, transferenciaVacia(anterior?.formula, anterior?.valor)]);
            setActiva(filas.length);
          }}
        >
          <Plus size={13} /> Agregar transferencia
        </button>
        <span className="cc-varias-total">
          {filas.length} {filas.length === 1 ? "transferencia" : "transferencias"} · enviado {dineroEn(totalEnviado, llega)} · total <b>{dineroEn(total, queda)}</b>
        </span>
        <button type="button" className="cc-guardar" onClick={onCargar} disabled={!todasBien || hayRepetidas || cargando} title={hayRepetidas ? "Hay una referencia ya registrada" : undefined}>
          {cargando ? "Cargando…" : "Cargar"}
        </button>
      </div>
      <small>Pegá cada captura (Ctrl+V) y se llena su fila. Con "Cargar" queda una sola confirmación por el total, con cada transferencia guardada aparte.</small>
    </div>
  );
}
