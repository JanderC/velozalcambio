import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../api/client";
import { capitalApi, type BancoDelSistema, type MovimientoBanco } from "../../api/capital.api";
import { formatearMonto, leerNumero } from "../../utils/montos";

export type AccionBanco = "movimiento" | "traslado" | "renombrar" | "historial" | "saldo";

/** Lo que se va escribiendo, con los puntos de miles puestos solos y decimales con coma. */
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,]/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return "";
  return formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}
const dinero = (monto: string | number, codigo: string) => {
  const n = formatearMonto(Number(monto).toFixed(2));
  return codigo === "COP" ? `$${formatearMonto(String(Math.round(Number(monto))))}` : codigo === "VES" ? `Bs. ${n}` : `${n} ${codigo}`;
};

/**
 * Lo que se le hace a una cuenta de banco desde el capital: un ingreso o un egreso (con qué fue), pasar plata a otra
 * cuenta, cambiarle el nombre o ver sus últimos movimientos.
 */
export function BancoAccionModal({
  accion,
  banco,
  bancos,
  onHecho,
  onCerrar,
}: {
  accion: AccionBanco;
  banco: BancoDelSistema;
  bancos: BancoDelSistema[];
  onHecho: (mensaje: string) => void;
  onCerrar: () => void;
}) {
  const moneda = banco.moneda ?? "COP";
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [destinoId, setDestinoId] = useState<number | "">("");
  const [nombre, setNombre] = useState(banco.nombre);
  const [historial, setHistorial] = useState<MovimientoBanco[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a dónde se puede trasladar: las otras cuentas que manejan la misma moneda
  const destinos = bancos.filter((b) => b.id !== banco.id && (b.moneda ?? "COP") === moneda);

  useEffect(() => {
    if (accion !== "historial") return;
    capitalApi
      .movimientosBanco(banco.id)
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, [accion, banco.id]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nMonto = leerNumero(monto)?.replace(/^-/, "") ?? null;
    setEnviando(true);
    try {
      if (accion === "saldo") {
        const real = leerNumero(monto);
        if (real === null) throw new Error("Escribí lo que hay de verdad en la cuenta.");
        const r = await capitalApi.cargarSaldoBanco(banco.id, moneda, real);
        onHecho(`${banco.nombre}: quedó en ${dinero(r.ahora, moneda)} (antes ${dinero(r.antes, moneda)}).`);
      } else if (accion === "renombrar") {
        if (nombre.trim().length < 2) throw new Error("Escribí el nombre de la cuenta.");
        await capitalApi.renombrarBanco(banco.id, nombre.trim());
        onHecho(`La cuenta ahora se llama ${nombre.trim()}.`);
      } else if (accion === "movimiento") {
        if (!nMonto || !/[1-9]/.test(nMonto)) throw new Error("Escribí el monto.");
        if (nota.trim().length < 2) throw new Error("Escribí qué fue (ej. pago a proveedor, consignación…).");
        const r = await capitalApi.movimientoBanco(banco.id, { tipo, moneda, monto: nMonto, nota: nota.trim() });
        onHecho(`${banco.nombre}: ${tipo === "INGRESO" ? "ingreso" : "egreso"} de ${dinero(nMonto, moneda)}. Queda en ${dinero(r.ahora, moneda)}.`);
      } else if (accion === "traslado") {
        if (destinoId === "") throw new Error("Elegí a qué cuenta pasa la plata.");
        if (!nMonto || !/[1-9]/.test(nMonto)) throw new Error("Escribí el monto.");
        const r = await capitalApi.transferirBancos({ origenId: banco.id, destinoId, moneda, monto: nMonto, nota: nota.trim() || undefined });
        onHecho(`Se pasaron ${dinero(nMonto, moneda)} de ${r.de} a ${r.a}.`);
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "No se pudo guardar.");
      setEnviando(false);
    }
  }

  const titulo = accion === "saldo" ? "Cargar saldo real" : accion === "renombrar" ? "Editar cuenta" : accion === "movimiento" ? "Ingreso o egreso" : accion === "traslado" ? "Pasar a otra cuenta" : "Movimientos de la cuenta";

  if (accion === "historial") {
    return (
      <Modal titulo={`${titulo} · ${banco.nombre}`} ancho="ancho" onCerrar={onCerrar}>
        <div className="cap-historial-banco">
          {historial === null ? (
            <p className="cap-vacio">Cargando…</p>
          ) : historial.length === 0 ? (
            <p className="cap-vacio">Todavía no tiene movimientos.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Qué fue</th>
                  <th className="num">Monto</th>
                  <th className="num">Quedó en</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {new Date(m.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" })}
                      {m.usuario && <small> · {m.usuario}</small>}
                    </td>
                    <td>{m.observacion ?? (m.tipo === "INGRESO" ? "Ingreso" : "Egreso")}</td>
                    <td className={`num ${m.tipo === "EGRESO" ? "cap-neg" : "cap-pos"}`}>
                      {m.tipo === "EGRESO" ? "− " : "+ "}
                      {dinero(m.monto, m.codigo)}
                    </td>
                    <td className="num">{dinero(m.saldo_nuevo, m.codigo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={`${titulo} · ${banco.nombre}`} onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        {accion === "saldo" ? (
          <label>
            Lo que hay de verdad en la cuenta ({moneda})
            <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" placeholder="0" autoComplete="off" autoFocus />
            <small>La diferencia con lo que dice el sistema queda anotada como un movimiento de la cuenta.</small>
          </label>
        ) : accion === "renombrar" ? (
          <label>
            Nombre de la cuenta
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoFocus />
          </label>
        ) : (
          <>
            {accion === "movimiento" && (
              <div className="cc-chips" role="radiogroup" aria-label="Ingreso o egreso">
                <button type="button" role="radio" aria-checked={tipo === "INGRESO"} className={tipo === "INGRESO" ? "activo" : ""} onClick={() => setTipo("INGRESO")}>
                  Ingreso (entra plata)
                </button>
                <button type="button" role="radio" aria-checked={tipo === "EGRESO"} className={tipo === "EGRESO" ? "activo" : ""} onClick={() => setTipo("EGRESO")}>
                  Egreso (sale plata)
                </button>
              </div>
            )}
            {accion === "traslado" && (
              <label>
                Pasa a
                <select value={destinoId} onChange={(e) => setDestinoId(e.target.value ? Number(e.target.value) : "")} autoFocus>
                  <option value="">{destinos.length ? "Elegir la cuenta…" : `No hay otra cuenta en ${moneda}`}</option>
                  {destinos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Monto ({moneda})
              <input value={monto} onChange={(e) => setMonto(conPuntos(e.target.value))} inputMode="decimal" placeholder="0" autoComplete="off" autoFocus={accion === "movimiento"} />
            </label>
            <label>
              {accion === "movimiento" ? "Qué fue" : "Nota (opcional)"}
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={accion === "movimiento" ? "ej. Pago a proveedor, consignación de un cliente…" : "ej. Para cubrir pagos de Nequi"} maxLength={200} autoComplete="off" />
            </label>
          </>
        )}
        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Guardando…" : accion === "saldo" ? "Cargar saldo" : accion === "renombrar" ? "Guardar" : accion === "traslado" ? "Pasar la plata" : `Registrar ${tipo === "INGRESO" ? "ingreso" : "egreso"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
