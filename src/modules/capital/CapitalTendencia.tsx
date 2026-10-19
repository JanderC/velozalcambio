import { TrendingDown, TrendingUp } from "lucide-react";
import type { CuadreResumen } from "../../api/capital.api";
import { formatearMonto } from "../../utils/montos";

const pesos = (n: number) => `${n < 0 ? "−" : ""}$${formatearMonto(String(Math.round(Math.abs(n))))}`;
const totalDe = (c: CuadreResumen) => Number(c.capital_cop) + Number(c.capital_divisa_cop);

/** El último cuadre guardado hasta hace `dias` días (o el más viejo que haya, si no alcanza). */
function cuadreDeHace(cuadres: CuadreResumen[], dias: number) {
  const limite = Date.now() - dias * 86_400_000;
  return cuadres.find((c) => Date.parse(c.created_at) <= limite) ?? null;
}

/**
 * En una franja chica, arriba: ¿el capital sube o baja? El de ahora (con las tasas de arriba) contra el último cuadre,
 * hace una semana y hace un mes, con una línea pequeña de los últimos cuadres. El detalle está en la gráfica de abajo.
 */
export function CapitalTendencia({ actual, cuadres }: { actual: number; cuadres: CuadreResumen[] }) {
  if (!cuadres.length) return <p className="cap-tend-vacio">Guarda el primer cuadre para ver si el capital sube o baja.</p>;
  const comparaciones = [
    { titulo: "vs. último cuadre", c: cuadres[0]! },
    { titulo: "vs. hace 7 días", c: cuadreDeHace(cuadres, 7) },
    { titulo: "vs. hace 30 días", c: cuadreDeHace(cuadres, 30) },
  ].filter((x): x is { titulo: string; c: CuadreResumen } => !!x.c);

  // la línea chiquita: los últimos 15 cuadres y el de ahora al final
  const serie = [...cuadres.slice(0, 15).reverse().map(totalDe), actual];
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const W = 120;
  const H = 34;
  const x = (i: number) => (i * W) / Math.max(serie.length - 1, 1);
  const y = (v: number) => (max === min ? H / 2 : 3 + ((max - v) * (H - 6)) / (max - min));
  const linea = serie.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const sube = actual >= totalDe(cuadres[0]!);

  return (
    <div className="cap-tend" aria-label="El capital sube o baja">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="cap-tend-linea" role="img" aria-label={`Capital de los últimos cuadres: ${sube ? "sube" : "baja"}`}>
        <path d={linea} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(serie.length - 1)} cy={y(actual)} r={3.5} />
      </svg>
      {comparaciones.map(({ titulo, c }) => {
        const cambio = actual - totalDe(c);
        const pct = totalDe(c) ? (cambio / Math.abs(totalDe(c))) * 100 : 0;
        const arriba = cambio >= 0;
        return (
          <div key={titulo} className={`cap-tend-dato ${arriba ? "sube" : "baja"}`} title={`Cuadre del ${new Date(c.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}: ${pesos(totalDe(c))}`}>
            <span>{titulo}</span>
            <strong>
              {arriba ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {arriba ? "+" : "−"}
              {pesos(Math.abs(cambio)).replace("−", "")}
            </strong>
            <small>
              {arriba ? "ganó" : "perdió"} {Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%
            </small>
          </div>
        );
      })}
    </div>
  );
}
