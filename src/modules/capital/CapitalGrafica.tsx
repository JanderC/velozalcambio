import { useEffect, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { CuadreResumen } from "../../api/capital.api";
import { formatearMonto } from "../../utils/montos";

const pesos = (n: number) => `${n < 0 ? "−" : ""}$${formatearMonto(String(Math.round(Math.abs(n))))}`;
/** $1.234.567.890 -> "$1.234,6 M" para los ejes */
const corto = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 1 })} mil M`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  return `${s}$${Math.round(a / 1000).toLocaleString("es-CO")} mil`;
};
const dia = (f: string) => new Date(f).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
const diaHora = (f: string) => new Date(f).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * ¿El capital sube o baja? El capital total en pesos (lo de pesos + lo de divisas en pesos) de cada cuadre guardado,
 * del más viejo al más nuevo. Una sola línea: el título dice qué es, al pasar el dedo o el mouse sale cada cuadre.
 */
export function CapitalGrafica({ cuadres }: { cuadres: CuadreResumen[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  const [activo, setActivo] = useState<number | null>(null);
  // el lienzo aparece cuando llegan los cuadres: ahí se mide su ancho (y cada vez que cambia)
  const hayDatos = cuadres.length >= 2;
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    setAncho(el.clientWidth);
    return () => ro.disconnect();
  }, [hayDatos]);

  // los últimos 30 cuadres, en orden de fecha
  const puntos = cuadres
    .slice(0, 30)
    .reverse()
    .map((c) => ({ fecha: c.created_at, total: Number(c.capital_cop) + Number(c.capital_divisa_cop), quien: c.usuario_nombre }));

  if (puntos.length < 2) {
    return <p className="cap-graf-vacio">Cuando haya al menos dos cuadres guardados, aquí se ve si el capital sube o baja.</p>;
  }

  const alto = 220;
  const m = { arriba: 16, abajo: 28, izq: 76, der: 16 };
  const min = Math.min(...puntos.map((p) => p.total));
  const max = Math.max(...puntos.map((p) => p.total));
  const holgura = (max - min || Math.abs(max) || 1) * 0.12;
  const y0 = min - holgura;
  const y1 = max + holgura;
  const x = (i: number) => m.izq + (i * (ancho - m.izq - m.der)) / (puntos.length - 1);
  const y = (v: number) => m.arriba + ((y1 - v) * (alto - m.arriba - m.abajo)) / (y1 - y0);
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${alto - m.abajo} L${x(0).toFixed(1)},${alto - m.abajo} Z`;
  const marcas = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];

  const ultimo = puntos[puntos.length - 1]!;
  const anterior = puntos[puntos.length - 2]!;
  const cambio = ultimo.total - anterior.total;
  const pct = anterior.total ? (cambio / Math.abs(anterior.total)) * 100 : 0;
  const sube = cambio >= 0;
  const elegido = activo !== null ? puntos[activo]! : null;

  // el punto más cercano al mouse o al dedo
  function mover(clientX: number) {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const px = clientX - r.left;
    let mejor = 0;
    puntos.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i;
    });
    setActivo(mejor);
  }

  return (
    <div className="cap-graf">
      <div className="cap-graf-cabeza">
        <h2>¿El capital sube o baja?</h2>
        <p className={`cap-graf-cambio ${sube ? "sube" : "baja"}`}>
          {sube ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          <span>
            {sube ? "Subió" : "Bajó"} <b>{pesos(Math.abs(cambio))}</b> ({sube ? "+" : "−"}
            {Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%) desde el cuadre anterior
          </span>
        </p>
      </div>
      <div
        ref={caja}
        className="cap-graf-lienzo"
        onMouseMove={(e) => mover(e.clientX)}
        onMouseLeave={() => setActivo(null)}
        onTouchStart={(e) => e.touches[0] && mover(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && mover(e.touches[0].clientX)}
      >
        <svg width={ancho} height={alto} role="img" aria-label={`Capital total en pesos de los últimos ${puntos.length} cuadres: ${sube ? "subió" : "bajó"} ${pesos(Math.abs(cambio))} en el último`}>
          {marcas.map((v, i) => (
            <g key={i}>
              <line x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} className="cap-graf-grilla" />
              <text x={m.izq - 8} y={y(v) + 4} textAnchor="end" className="cap-graf-eje">
                {corto(v)}
              </text>
            </g>
          ))}
          <text x={x(0)} y={alto - 8} textAnchor="start" className="cap-graf-eje">
            {dia(puntos[0]!.fecha)}
          </text>
          <text x={x(puntos.length - 1)} y={alto - 8} textAnchor="end" className="cap-graf-eje">
            {dia(ultimo.fecha)}
          </text>
          <path d={area} className="cap-graf-area" />
          <path d={linea} className="cap-graf-linea" />
          {elegido && activo !== null && <line x1={x(activo)} x2={x(activo)} y1={m.arriba} y2={alto - m.abajo} className="cap-graf-guia" />}
          {puntos.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.total)} r={i === activo || i === puntos.length - 1 ? 5 : 3.5} className="cap-graf-punto" />
          ))}
        </svg>
        {elegido && activo !== null && (
          <div className="cap-graf-tip" style={{ left: Math.min(Math.max(x(activo) - 90, 4), ancho - 184), top: Math.max(y(elegido.total) - 78, 0) }}>
            <b>{pesos(elegido.total)}</b>
            <span>{diaHora(elegido.fecha)}</span>
            {activo > 0 && (
              <span>
                {elegido.total - puntos[activo - 1]!.total >= 0 ? "▲ subió " : "▼ bajó "}
                {pesos(Math.abs(elegido.total - puntos[activo - 1]!.total))}
              </span>
            )}
            <small>por {elegido.quien}</small>
          </div>
        )}
      </div>
      <small className="cap-graf-nota">Capital total en pesos (lo de pesos + las divisas en pesos) de los últimos {puntos.length} cuadres guardados.</small>
    </div>
  );
}
