import { useState, type ReactNode } from "react";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import type { BancoDelSistema } from "../../api/capital.api";
import { formatearMonto, leerNumero } from "../../utils/montos";
import type { AccionBanco } from "./BancoAccionModal";

const pesos = (n: number) => `${n < 0 ? "−" : ""}$${formatearMonto(String(Math.round(Math.abs(n))))}`;
const conDecimales = (n: number) => `${n < 0 ? "−" : ""}${formatearMonto(Math.abs(n).toFixed(2))}`;
function conPuntos(escrito: string) {
  let t = escrito.replace(/[^\d.,-]/g, "");
  const negativo = t.startsWith("-");
  t = t.replace(/-/g, "");
  if (!t.includes(",") && t.endsWith(".")) t = `${t.slice(0, -1)},`;
  const coma = t.indexOf(",");
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = coma === -1 ? "" : t.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  if (!entero && coma === -1) return negativo ? "-" : "";
  return (negativo ? "-" : "") + formatearMonto(entero || "0") + (coma === -1 ? "" : `,${decimal}`);
}

/** Lo que tiene una cuenta en su moneda (las viejas de pesos no traen moneda). */
export const saldoDe = (b: BancoDelSistema, moneda: string) => Number(b.saldos.find((x) => x.codigo === moneda)?.monto ?? 0);

/** El menú de una cuenta: las acciones, sin ocupar espacio en la fila. */
export function MenuBanco({ onAccion }: { onAccion: (a: AccionBanco) => void }) {
  const elegir = (e: React.MouseEvent, a: AccionBanco) => {
    const menu = e.currentTarget.closest("details");
    if (menu) menu.open = false;
    onAccion(a);
  };
  return (
    <details className="cap-menu">
      <summary aria-label="Acciones de la cuenta" title="Acciones de la cuenta">
        <MoreHorizontal size={16} />
      </summary>
      <div className="cap-menu-lista">
        <button type="button" onClick={(e) => elegir(e, "movimiento")}>
          Ingreso o egreso
        </button>
        <button type="button" onClick={(e) => elegir(e, "traslado")}>
          Pasar a otra cuenta
        </button>
        <button type="button" onClick={(e) => elegir(e, "saldo")}>
          Cargar saldo real
        </button>
        <button type="button" onClick={(e) => elegir(e, "renombrar")}>
          Editar nombre
        </button>
        <button type="button" onClick={(e) => elegir(e, "historial")}>
          Ver movimientos
        </button>
      </div>
    </details>
  );
}

/**
 * Las cuentas de banco de una moneda (Bancolombia y Nequi en pesos, o las de bolívares), en un cuadro compacto: lo que
 * dice el sistema y, para el cierre de la noche, lo que hay de verdad en cada una (se registran todas de una vez).
 * Las demás acciones de cada cuenta van en su menú (⋯).
 */
export function CuadroBancos({
  titulo,
  color,
  moneda,
  bancos,
  soloLectura,
  tasaAPesos,
  onAccion,
  onCrear,
  onCierre,
  children,
}: {
  titulo: string;
  color: string;
  moneda: "COP" | "VES";
  bancos: BancoDelSistema[];
  soloLectura: boolean;
  tasaAPesos?: number; // bolívares: pesos por bolívar, para el total en pesos
  onAccion: (accion: AccionBanco, bancoId: number) => void;
  onCrear: (nombre: string) => Promise<boolean>;
  onCierre: (valores: { bancoId: number; saldo: string }[]) => Promise<boolean>;
  children?: ReactNode; // lo que se anota a mano (personas, otras cuentas fuera del sistema)
}) {
  const [cierre, setCierre] = useState<Record<number, string>>({});
  const [registrando, setRegistrando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const fmt = (n: number) => (moneda === "COP" ? pesos(n) : `Bs ${conDecimales(n)}`);
  const total = bancos.reduce((s, b) => s + saldoDe(b, moneda), 0);
  const escritos = bancos
    .map((b) => ({ banco: b, valor: cierre[b.id]?.trim() ? leerNumero(cierre[b.id]!) : null }))
    .filter((x): x is { banco: BancoDelSistema; valor: string } => x.valor !== null);
  const totalCierre = bancos.reduce((s, b) => {
    const v = cierre[b.id]?.trim() ? leerNumero(cierre[b.id]!) : null;
    return s + (v !== null ? Number(v) : saldoDe(b, moneda));
  }, 0);

  async function registrar() {
    setRegistrando(true);
    const ok = await onCierre(escritos.map((x) => ({ bancoId: x.banco.id, saldo: x.valor })));
    if (ok) setCierre({});
    setRegistrando(false);
  }

  return (
    <section className={`cap-bloque ${color} cap-bancos`}>
      <h2>{titulo}</h2>
      <div className="cap-tabla">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th className="num">Sistema</th>
              {!soloLectura && <th className="num">Cierre</th>}
              {!soloLectura && <th />}
            </tr>
          </thead>
          <tbody>
            {bancos.map((b) => {
              const enSistema = saldoDe(b, moneda);
              const escrito = cierre[b.id]?.trim() ? leerNumero(cierre[b.id]!) : null;
              const diferencia = escrito !== null ? Number(escrito) - enSistema : 0;
              return (
                <tr key={b.id}>
                  <td className="cap-banco-nombre">{b.nombre}</td>
                  <td className="num">{fmt(enSistema)}</td>
                  {!soloLectura && (
                    <td className="num cap-banco-cierre">
                      <input
                        value={cierre[b.id] ?? ""}
                        onChange={(e) => setCierre((c) => ({ ...c, [b.id]: conPuntos(e.target.value) }))}
                        inputMode="decimal"
                        placeholder="lo que hay"
                        aria-label={`Lo que hay hoy en ${b.nombre}`}
                      />
                      {escrito !== null && Math.abs(diferencia) >= 0.005 && (
                        <small className={diferencia > 0 ? "cap-pos" : "cap-neg"}>
                          {diferencia > 0 ? "+" : "−"}
                          {fmt(Math.abs(diferencia)).replace("−", "")}
                        </small>
                      )}
                    </td>
                  )}
                  {!soloLectura && (
                    <td className="cap-menu-celda">
                      <MenuBanco onAccion={(a) => onAccion(a, b.id)} />
                    </td>
                  )}
                </tr>
              );
            })}
            {bancos.length === 0 && (
              <tr>
                <td colSpan={4} className="cap-vacio">
                  Todavía no hay cuentas.
                </td>
              </tr>
            )}
            {!soloLectura &&
              (nueva !== null ? (
                <tr className="cap-banco-nuevo">
                  <td colSpan={2}>
                    <input
                      value={nueva}
                      onChange={(e) => setNueva(e.target.value)}
                      placeholder={moneda === "COP" ? "Nombre (ej. Nequi 2)" : "Nombre (ej. Banesco)"}
                      autoFocus
                      aria-label="Nombre de la cuenta nueva"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void onCrear(nueva).then((ok) => ok && setNueva(null));
                        if (e.key === "Escape") setNueva(null);
                      }}
                    />
                  </td>
                  <td className="cap-banco-accion" colSpan={2}>
                    <button type="button" onClick={() => void onCrear(nueva).then((ok) => ok && setNueva(null))}>
                      Crear
                    </button>
                    <button type="button" className="secundario" onClick={() => setNueva(null)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ) : (
                <tr className="cap-agregar">
                  <td colSpan={4}>
                    <button type="button" onClick={() => setNueva("")}>
                      <Plus size={13} /> Agregar cuenta
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total en las cuentas</td>
              <td className="num">{fmt(total)}</td>
              {!soloLectura && <td className="num">{escritos.length ? fmt(totalCierre) : ""}</td>}
              {!soloLectura && <td />}
            </tr>
            {moneda === "VES" && (
              <tr className="cap-fila-oscura">
                <td>En pesos {tasaAPesos ? `(× ${formatearMonto(String(tasaAPesos))})` : "(falta la tasa)"}</td>
                <td className="num">{pesos(total * (tasaAPesos ?? 0))}</td>
                {!soloLectura && <td />}
                {!soloLectura && <td />}
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      {!soloLectura && escritos.length > 0 && (
        <div className="cap-cierre-barra">
          <span>
            Cierre: {escritos.length} {escritos.length === 1 ? "cuenta" : "cuentas"} con lo que hay de verdad. Las diferencias quedan anotadas como movimiento de cada cuenta.
          </span>
          <button type="button" onClick={() => void registrar()} disabled={registrando}>
            <Check size={15} /> {registrando ? "Registrando…" : "Registrar cierre"}
          </button>
        </div>
      )}
      {children}
    </section>
  );
}
