import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Wrench } from "lucide-react";
import { whatsappApi } from "../../../api/whatsapp.api";
import { partesFormato } from "../utilidades";

type Linea =
  | { rol: "cliente" | "bot" | "sistema"; texto: string }
  | { rol: "herramienta"; nombre: string; args: Record<string, unknown>; resultado: unknown }
  | { rol: "efecto"; texto: string };

function Formato({ texto }: { texto: string }) {
  return (
    <>
      {partesFormato(texto).map((p, i) =>
        p.estilo === "b" ? <strong key={i}>{p.t}</strong> : p.estilo === "i" ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>
      )}
    </>
  );
}

/** Conversar como cliente sin escribir en la base ni enviar nada. Muestra qué herramientas usó. */
export function Simulador({ sucio }: { sucio: boolean }) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [estado, setEstado] = useState<Record<string, unknown>>({});
  const [registrado, setRegistrado] = useState(false);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [lineas, pensando]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || pensando) return;
    const nuevas: Linea[] = [...lineas, { rol: "cliente", texto: texto.trim() }];
    setLineas(nuevas);
    setTexto("");
    setPensando(true);
    setError(null);
    try {
      const historial = nuevas.filter((l): l is { rol: "cliente" | "bot" | "sistema"; texto: string } => l.rol === "cliente" || l.rol === "bot" || l.rol === "sistema");
      const r = await whatsappApi.simular({ historial, estado, registrado });
      setEstado(r.estado);
      setRegistrado(r.registrado);
      setLineas([
        ...nuevas,
        ...r.herramientas.map((h) => ({ rol: "herramienta" as const, ...h })),
        ...r.efectos.map((t) => ({ rol: "efecto" as const, texto: t })),
        ...r.derivaciones.map((t) => ({ rol: "efecto" as const, texto: `Pasaría a una persona: ${t}` })),
        ...r.sistema.map((t) => ({ rol: "sistema" as const, texto: t })),
        ...r.respuestas.map((t) => ({ rol: "bot" as const, texto: t })),
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPensando(false);
    }
  }

  return (
    <aside className="wa-simulador" aria-label="Simulador">
      <header>
        <div>
          <h2>Simulador</h2>
          <p>Escribí como si fueras un cliente. No se guarda nada ni se envía nada.</p>
        </div>
        <button
          className="wa-icono"
          onClick={() => {
            setLineas([]);
            setEstado({});
            setRegistrado(false);
            setError(null);
          }}
          aria-label="Empezar de nuevo"
          title="Empezar de nuevo"
        >
          <RotateCcw size={17} />
        </button>
      </header>
      {sucio && <p className="wa-sim-aviso">Guardá la configuración para que el simulador use los cambios.</p>}
      <label className="wa-check chico">
        <input type="checkbox" checked={registrado} onChange={(e) => setRegistrado(e.target.checked)} />
        Simular un cliente ya registrado
      </label>
      <div className="wa-sim-mensajes">
        {lineas.length === 0 && <p className="wa-sim-vacio">Probá con: "hola, a cómo está el dólar?" o "quiero vender 100 dólares".</p>}
        {lineas.map((l, i) => {
          if (l.rol === "herramienta") {
            return (
              <details key={i} className="wa-sim-herramienta">
                <summary>
                  <Wrench size={12} /> {l.nombre}
                </summary>
                <pre>{JSON.stringify({ argumentos: l.args, resultado: l.resultado }, null, 2)}</pre>
              </details>
            );
          }
          if (l.rol === "efecto") return <p key={i} className="wa-sim-efecto">{l.texto}</p>;
          return (
            <div key={i} className={`wa-fila ${l.rol === "cliente" ? "suya" : "mia"}`}>
              <div className={`wa-burbuja ${l.rol === "cliente" ? "suya" : "mia"} autor-${l.rol}`}>
                {l.rol !== "cliente" && <span className="wa-autor">{l.rol === "bot" ? "Bot" : "Sistema"}</span>}
                <p className="wa-texto">
                  <Formato texto={l.texto} />
                </p>
              </div>
            </div>
          );
        })}
        {pensando && <p className="wa-sim-escribiendo">escribiendo…</p>}
        {error && <p className="wa-error">{error}</p>}
        <div ref={fin} />
      </div>
      <form className="wa-sim-entrada" onSubmit={enviar}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje del cliente" aria-label="Mensaje del cliente" />
        <button className="wa-enviar" disabled={pensando || !texto.trim()} aria-label="Enviar">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}
