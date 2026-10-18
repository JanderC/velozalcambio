import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, TrendingUp, Users } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { getRendimiento, type RendimientoEmpleado } from "../../api/reportes.api";
import "./rendimiento.css";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** Un empujoncito según cuánto lleva: el número es lo que importa, el mensaje acompaña. */
function animo(n: number) {
  if (n === 0) return "¡Arranquemos el día!";
  if (n < 10) return "¡Buen comienzo!";
  if (n < 30) return "¡Vas muy bien!";
  if (n < 60) return "¡Excelente ritmo!";
  return "¡Día récord, crack!";
}

/**
 * Lo que lleva hecho hoy el usuario, arriba de su pantalla de trabajo: en taquilla, los clientes que atendió; en
 * Confirmaciones, las confirmaciones que registró. Se actualiza solo.
 */
export function MiDiaHoy({ tipo }: { tipo: "taquilla" | "confirmaciones" }) {
  const { usuario } = useAuth();
  const [yo, setYo] = useState<RendimientoEmpleado | null>(null);

  useEffect(() => {
    if (!usuario) return;
    let vigente = true;
    const cargar = () =>
      getRendimiento(hoy())
        // el administrador recibe a todo el equipo: se toma su propia fila
        .then((r) => vigente && setYo(r.empleados.find((e) => e.usuarioId === usuario.id) ?? null))
        .catch(() => {});
    void cargar();
    const t = setInterval(cargar, 30_000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [usuario]);

  if (!yo) return null;
  const n = tipo === "taquilla" ? yo.clientesTaquilla : yo.confirmaciones.cantidad;
  return (
    <div className="rend-mi-dia" role="status">
      {tipo === "taquilla" ? <Users size={18} /> : <FileCheck2 size={18} />}
      <span>
        Hoy llevas <strong>{n}</strong> {tipo === "taquilla" ? (n === 1 ? "cliente atendido" : "clientes atendidos") : n === 1 ? "confirmación" : "confirmaciones"}
        {tipo === "taquilla" && n > 0 && (
          <small>
            {yo.ventanilla.cantidad} en ventanilla · {yo.pagadas.cantidad} pagos
          </small>
        )}
        {tipo === "confirmaciones" && yo.confirmaciones.clientes > 0 && <small>a {yo.confirmaciones.clientes} {yo.confirmaciones.clientes === 1 ? "cliente" : "clientes"}</small>}
      </span>
      <em>{animo(n)}</em>
      <Link to="/rendimiento" title="Ver mi rendimiento">
        <TrendingUp size={15} /> Ver más
      </Link>
    </div>
  );
}
