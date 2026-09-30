import { useEffect, useMemo, useState } from "react";
import { CircleCheck, KeyRound, Plug, RefreshCw, Save, TriangleAlert } from "lucide-react";
import {
  whatsappApi,
  type ConfigWa,
  type ModeloIa,
  type OpcionesConfig,
  type Proveedor,
} from "../../../api/whatsapp.api";
import { Simulador } from "./Simulador";

const PROVEEDORES: { valor: Proveedor; nombre: string; prefijo: string }[] = [
  { valor: "gemini", nombre: "Google Gemini", prefijo: "AIza…" },
  { valor: "anthropic", nombre: "Claude (Anthropic)", prefijo: "sk-ant-…" },
  { valor: "openai", nombre: "OpenAI", prefijo: "sk-…" },
  { valor: "groq", nombre: "Groq", prefijo: "gsk_…" },
  { valor: "openrouter", nombre: "OpenRouter", prefijo: "sk-or-…" },
  { valor: "deepseek", nombre: "DeepSeek", prefijo: "sk-…" },
];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function detectar(clave: string): Proveedor | null {
  const c = clave.trim();
  if (c.startsWith("sk-ant-")) return "anthropic";
  if (c.startsWith("sk-or-")) return "openrouter";
  if (c.startsWith("gsk_")) return "groq";
  if (c.startsWith("AIza")) return "gemini";
  return null;
}

export function ConfigIaPanel() {
  const [config, setConfig] = useState<ConfigWa | null>(null);
  const [claves, setClaves] = useState<Partial<Record<Proveedor, string>>>({});
  const [opciones, setOpciones] = useState<OpcionesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    whatsappApi
      .config()
      .then((r) => {
        setConfig(r.config);
        setClaves(r.claves);
      })
      .catch((e) => setError((e as Error).message));
    whatsappApi.opciones().then(setOpciones).catch(() => {});
  }, []);

  function cambiar<K extends keyof ConfigWa>(seccion: K, cambios: Partial<ConfigWa[K]>) {
    setConfig((c) => (c ? { ...c, [seccion]: { ...c[seccion], ...cambios } } : c));
    setSucio(true);
    setGuardado(null);
  }

  async function guardar() {
    if (!config) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await whatsappApi.guardarConfig(config);
      setConfig(r.config);
      setSucio(false);
      setGuardado("Configuración guardada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  if (!config) {
    return <div className="wa-panel-scroll">{error ? <p className="wa-error">{error}</p> : <p className="wa-lista-aviso">Cargando…</p>}</div>;
  }

  return (
    <div className="wa-ia">
      <div className="wa-ia-form">
        <SeccionIa config={config} claves={claves} setClaves={setClaves} cambiar={cambiar} />

        <section className="wa-tarjeta">
          <h2>Personalidad</h2>
          <label>
            Nombre con el que se presenta
            <input value={config.personalidad.nombreAsistente} onChange={(e) => cambiar("personalidad", { nombreAsistente: e.target.value })} />
          </label>
          <label>
            Tono y reglas propias del negocio
            <textarea rows={4} value={config.personalidad.instrucciones} onChange={(e) => cambiar("personalidad", { instrucciones: e.target.value })} />
          </label>
          <p className="wa-ayuda">
            Las reglas importantes ya vienen incluidas: nunca escribe montos ni cuentas (los manda el sistema), no inventa tasas, pasa a una persona solo
            cuando hace falta y escribe mensajes cortos.
          </p>
        </section>

        <section className="wa-tarjeta">
          <h2>Negocio</h2>
          <div className="wa-grid2">
            <label>
              Nombre
              <input value={config.negocio.nombre} onChange={(e) => cambiar("negocio", { nombre: e.target.value })} />
            </label>
            <label>
              Número de WhatsApp del negocio
              <input
                value={config.negocio.numeroWhatsapp}
                onChange={(e) => cambiar("negocio", { numeroWhatsapp: e.target.value })}
                placeholder="573001234567"
                inputMode="tel"
              />
            </label>
          </div>
          <label>
            Qué hace el negocio
            <textarea rows={2} value={config.negocio.descripcion} onChange={(e) => cambiar("negocio", { descripcion: e.target.value })} />
          </label>
          <div className="wa-grid2">
            <label>
              Dirección
              <input value={config.negocio.direccion} onChange={(e) => cambiar("negocio", { direccion: e.target.value })} />
            </label>
            <label>
              Zona horaria
              <input value={config.negocio.zonaHoraria} onChange={(e) => cambiar("negocio", { zonaHoraria: e.target.value })} />
            </label>
          </div>
          <label>
            Información para responder dudas (requisitos, límites, preguntas frecuentes)
            <textarea rows={4} value={config.negocio.infoAdicional} onChange={(e) => cambiar("negocio", { infoAdicional: e.target.value })} />
          </label>
          <label className="wa-corto">
            Minutos que se congela la tasa mientras el cliente paga
            <input
              type="number"
              min={5}
              max={240}
              value={config.negocio.minutosTasa}
              onChange={(e) => cambiar("negocio", { minutosTasa: Number(e.target.value) })}
            />
          </label>

          <h3>Cuentas de la empresa por moneda</h3>
          <p className="wa-ayuda">Dónde paga el cliente y desde dónde se le paga. Sus datos los envía el sistema, tal cual.</p>
          {opciones && (
            <div className="wa-grid2">
              {opciones.monedas.map((m) => (
                <label key={m.codigo}>
                  {m.codigo} · {m.nombre}
                  <select
                    value={config.negocio.cajasPorMoneda[m.codigo] ?? ""}
                    onChange={(e) => {
                      const siguiente = { ...config.negocio.cajasPorMoneda };
                      if (e.target.value) siguiente[m.codigo] = Number(e.target.value);
                      else delete siguiente[m.codigo];
                      cambiar("negocio", { cajasPorMoneda: siguiente });
                    }}
                  >
                    <option value="">— Automática (si hay una sola) —</option>
                    {opciones.cajas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.moneda ? ` (${c.moneda})` : ""}
                        {c.numero_cuenta ? ` ···${c.numero_cuenta.slice(-4)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <h3>Tasas que puede usar el bot</h3>
          <p className="wa-ayuda">Sin ninguna marcada, usa todas las de precio fijo. Las tasas se cargan en el módulo Tasas.</p>
          {opciones && opciones.cotizaciones.length === 0 && (
            <p className="wa-alerta">
              <TriangleAlert size={15} /> No hay tasas vigentes cargadas. Sin tasas, el bot no cotiza y pasa la conversación a una persona.
            </p>
          )}
          <div className="wa-checks">
            {opciones?.cotizaciones.map((c) => (
              <label key={c.clave} className="wa-check">
                <input
                  type="checkbox"
                  checked={config.negocio.cotizacionesPermitidas.includes(c.clave)}
                  onChange={(e) =>
                    cambiar("negocio", {
                      cotizacionesPermitidas: e.target.checked
                        ? [...config.negocio.cotizacionesPermitidas, c.clave]
                        : config.negocio.cotizacionesPermitidas.filter((x) => x !== c.clave),
                    })
                  }
                />
                {c.monedaCodigo} · {c.tipo === "COMPRA" ? "compra" : "venta"} · {c.etiqueta} {c.categoria === "GIRO" ? "(giro)" : ""}
              </label>
            ))}
          </div>
        </section>

        <section className="wa-tarjeta">
          <h2>Horario de atención de personas</h2>
          <div className="wa-horario">
            {DIAS.map((nombre, dia) => {
              const d = config.horario.dias.find((x) => x.dia === dia);
              return (
                <div key={dia} className="wa-horario-dia">
                  <label className="wa-check">
                    <input
                      type="checkbox"
                      checked={!!d}
                      onChange={(e) =>
                        cambiar("horario", {
                          dias: e.target.checked
                            ? [...config.horario.dias, { dia, desde: "08:00", hasta: "18:00" }].sort((a, b) => a.dia - b.dia)
                            : config.horario.dias.filter((x) => x.dia !== dia),
                        })
                      }
                    />
                    {nombre}
                  </label>
                  {d && (
                    <>
                      <input
                        type="time"
                        value={d.desde}
                        aria-label={`${nombre} desde`}
                        onChange={(e) => cambiar("horario", { dias: config.horario.dias.map((x) => (x.dia === dia ? { ...x, desde: e.target.value } : x)) })}
                      />
                      <input
                        type="time"
                        value={d.hasta}
                        aria-label={`${nombre} hasta`}
                        onChange={(e) => cambiar("horario", { dias: config.horario.dias.map((x) => (x.dia === dia ? { ...x, hasta: e.target.value } : x)) })}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <label className="wa-check">
            <input
              type="checkbox"
              checked={config.horario.responderFueraDeHorario}
              onChange={(e) => cambiar("horario", { responderFueraDeHorario: e.target.checked })}
            />
            El bot responde también fuera de horario (avisa que las solicitudes se verifican al abrir)
          </label>
        </section>

        <SeccionAntibloqueo config={config} cambiar={cambiar} />

        <section className="wa-tarjeta">
          <h2>Asistente del dueño</h2>
          <p className="wa-ayuda">
            Le escribe al dueño por WhatsApp cuando un cliente necesita una persona. Desde ahí responde <strong>1</strong> (lo atiende él),{" "}
            <strong>2</strong> (sigue el bot) o le dicta al bot qué contestar. Si usa el mismo número del bot, las órdenes van por el chat "Tú".
          </p>
          <div className="wa-grid2">
            <label>
              Nombre
              <input value={config.dueno.nombre} onChange={(e) => cambiar("dueno", { nombre: e.target.value })} />
            </label>
            <label>
              Teléfono (con código de país)
              <input value={config.dueno.telefono} onChange={(e) => cambiar("dueno", { telefono: e.target.value })} placeholder="573001234567" inputMode="tel" />
            </label>
            <label>
              Resumen de pendientes cada (min, 0 = nunca)
              <input
                type="number"
                min={0}
                value={config.dueno.resumenCadaMin}
                onChange={(e) => cambiar("dueno", { resumenCadaMin: Number(e.target.value) })}
              />
            </label>
            <label>
              Silencio (sin avisos)
              <span className="wa-rango">
                <input type="time" value={config.dueno.silencioDesde} onChange={(e) => cambiar("dueno", { silencioDesde: e.target.value })} aria-label="Silencio desde" />
                a
                <input type="time" value={config.dueno.silencioHasta} onChange={(e) => cambiar("dueno", { silencioHasta: e.target.value })} aria-label="Silencio hasta" />
              </span>
            </label>
          </div>
          <label className="wa-check">
            <input type="checkbox" checked={config.dueno.avisos} onChange={(e) => cambiar("dueno", { avisos: e.target.checked })} />
            Avisarle por WhatsApp
          </label>
        </section>

        <section className="wa-tarjeta">
          <h2>Respuestas rápidas del panel</h2>
          <label>
            Una por línea
            <textarea
              rows={5}
              value={config.panel.respuestasRapidas.join("\n")}
              onChange={(e) => cambiar("panel", { respuestasRapidas: e.target.value.split("\n") })}
              onBlur={() => cambiar("panel", { respuestasRapidas: config.panel.respuestasRapidas.map((r) => r.trim()).filter(Boolean) })}
            />
          </label>
        </section>

        <div className="wa-guardar">
          {error && <span className="wa-error">{error}</span>}
          {guardado && !sucio && (
            <span className="wa-ok">
              <CircleCheck size={15} /> {guardado}
            </span>
          )}
          {sucio && <span className="wa-sub">Hay cambios sin guardar</span>}
          <button className="wa-btn" onClick={guardar} disabled={guardando || !sucio}>
            <Save size={16} /> {guardando ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>

      <Simulador sucio={sucio} />
    </div>
  );
}

function SeccionIa({
  config,
  claves,
  setClaves,
  cambiar,
}: {
  config: ConfigWa;
  claves: Partial<Record<Proveedor, string>>;
  setClaves: (c: Partial<Record<Proveedor, string>>) => void;
  cambiar: <K extends keyof ConfigWa>(seccion: K, cambios: Partial<ConfigWa[K]>) => void;
}) {
  const [nuevaClave, setNuevaClave] = useState("");
  const [modelos, setModelos] = useState<ModeloIa[] | null>(null);
  const [filtroModelo, setFiltroModelo] = useState("");
  const [estado, setEstado] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const proveedor = config.ia.proveedor;
  const detectado = detectar(nuevaClave);

  useEffect(() => {
    setModelos(null);
  }, [proveedor]);

  async function guardarClave() {
    setOcupado(true);
    setEstado(null);
    try {
      const p = detectado ?? proveedor;
      const r = await whatsappApi.guardarClave(nuevaClave, p);
      setClaves(r.claves);
      setNuevaClave("");
      if (r.proveedor !== proveedor) cambiar("ia", { proveedor: r.proveedor, modelo: "", modelosRespaldo: [] });
      setEstado({ tipo: "ok", texto: `Clave de ${PROVEEDORES.find((x) => x.valor === r.proveedor)?.nombre} guardada. Ahora cargá los modelos.` });
    } catch (e) {
      setEstado({ tipo: "error", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function cargarModelos() {
    setOcupado(true);
    setEstado(null);
    try {
      const lista = await whatsappApi.modelos(proveedor);
      setModelos(lista);
      if (lista.length === 0) setEstado({ tipo: "info", texto: "El proveedor no devolvió modelos con herramientas." });
    } catch (e) {
      setEstado({ tipo: "error", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setEstado({ tipo: "info", texto: "Probando… (primero guardá si cambiaste el modelo)" });
    try {
      const r = await whatsappApi.probar(proveedor, config.ia.modelo);
      if (r.ok) setEstado({ tipo: "ok", texto: `Funciona y usa herramientas (${r.ms} ms). Respondió: "${r.respuesta}"` });
      else if (r.error) setEstado({ tipo: "error", texto: r.error });
      else setEstado({ tipo: "error", texto: `Respondió pero NO usó la herramienta: este modelo no sirve para el bot. Respuesta: "${r.respuesta}"` });
    } catch (e) {
      setEstado({ tipo: "error", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const visibles = useMemo(
    () => (modelos ?? []).filter((m) => !filtroModelo || m.id.toLowerCase().includes(filtroModelo.toLowerCase()) || m.nombre.toLowerCase().includes(filtroModelo.toLowerCase())),
    [modelos, filtroModelo]
  );

  return (
    <section className="wa-tarjeta">
      <h2>Inteligencia artificial</h2>
      <label className="wa-check destacado">
        <input type="checkbox" checked={config.ia.activa} onChange={(e) => cambiar("ia", { activa: e.target.checked })} />
        Bot activo (responde a los clientes)
      </label>

      <label>
        Proveedor
        <select value={proveedor} onChange={(e) => cambiar("ia", { proveedor: e.target.value as Proveedor, modelo: "", modelosRespaldo: [] })}>
          {PROVEEDORES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nombre}
              {claves[p.valor] ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>

      <label>
        API key {claves[proveedor] ? <span className="wa-sub">(guardada: {claves[proveedor]})</span> : null}
        <span className="wa-inline">
          <input
            type="password"
            value={nuevaClave}
            onChange={(e) => setNuevaClave(e.target.value)}
            placeholder={claves[proveedor] ? "Pegá una nueva para reemplazarla" : PROVEEDORES.find((p) => p.valor === proveedor)?.prefijo}
            autoComplete="off"
          />
          <button className="wa-btn chico" onClick={guardarClave} disabled={ocupado || nuevaClave.trim().length < 10}>
            <KeyRound size={14} /> Guardar clave
          </button>
        </span>
      </label>
      {detectado && detectado !== proveedor && (
        <p className="wa-sub">Parece una clave de {PROVEEDORES.find((p) => p.valor === detectado)?.nombre}: se guardará para ese proveedor y se seleccionará solo.</p>
      )}

      <div className="wa-inline">
        <button className="wa-btn chico secundario" onClick={cargarModelos} disabled={ocupado || !claves[proveedor]}>
          <RefreshCw size={14} /> Cargar modelos en vivo
        </button>
        <button className="wa-btn chico secundario" onClick={probar} disabled={ocupado || !config.ia.modelo || !claves[proveedor]}>
          <Plug size={14} /> Probar conexión
        </button>
      </div>

      <label>
        Modelo
        {modelos ? (
          <>
            <input value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} placeholder="Filtrar modelos…" />
            <select
              size={Math.min(8, Math.max(3, visibles.length))}
              value={config.ia.modelo}
              onChange={(e) => {
                const m = modelos.find((x) => x.id === e.target.value);
                cambiar("ia", { modelo: e.target.value, vision: m?.vision ?? config.ia.vision });
              }}
            >
              {visibles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre !== m.id ? `${m.nombre} — ${m.id}` : m.id}
                  {m.vision ? " · ve fotos" : ""}
                </option>
              ))}
            </select>
          </>
        ) : (
          <input value={config.ia.modelo} onChange={(e) => cambiar("ia", { modelo: e.target.value })} placeholder="Cargá los modelos o escribí el id" />
        )}
      </label>

      <label>
        Modelos de respaldo si el principal está limitado (ids separados por coma)
        <input
          value={config.ia.modelosRespaldo.join(", ")}
          onChange={(e) =>
            cambiar("ia", {
              modelosRespaldo: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <label className="wa-check">
        <input type="checkbox" checked={config.ia.vision} onChange={(e) => cambiar("ia", { vision: e.target.checked })} />
        El modelo puede ver fotos (lee monto, referencia y banco de los comprobantes)
      </label>

      {estado && <p className={estado.tipo === "error" ? "wa-error" : estado.tipo === "ok" ? "wa-ok" : "wa-sub"}>{estado.texto}</p>}

      <div className="wa-alerta">
        <TriangleAlert size={15} />
        <span>
          Nunca subas una API key a git ni la pegues en un chat: Google desactiva las claves que encuentra publicadas. Groq bloquea algunos países; "Probar
          conexión" prueba desde el servidor, que es desde donde va a funcionar.
        </span>
      </div>
    </section>
  );
}

function SeccionAntibloqueo({ config, cambiar }: { config: ConfigWa; cambiar: <K extends keyof ConfigWa>(s: K, c: Partial<ConfigWa[K]>) => void }) {
  const a = config.antibloqueo;
  const num = (campo: keyof ConfigWa["antibloqueo"], etiqueta: string, min = 0) => (
    <label>
      {etiqueta}
      <input type="number" min={min} value={a[campo] as number} onChange={(e) => cambiar("antibloqueo", { [campo]: Number(e.target.value) })} />
    </label>
  );
  return (
    <section className="wa-tarjeta">
      <h2>Anti-bloqueo</h2>
      <p className="wa-ayuda">Meta bloquea números por patrones de spam. Estos topes aplican a todo lo que sale, del bot y de las personas.</p>
      <div className="wa-grid3">
        {num("porMinuto", "Mensajes por minuto (si se llena, espera)", 1)}
        {num("porDia", "Mensajes por día (si se llena, falla)", 10)}
        {num("antiBucleMax", "Respuestas del bot a un chat en 5 min antes de pausarse", 3)}
        {num("pausaMinMs", "Pausa mínima entre mensajes (ms)")}
        {num("pausaMaxMs", "Pausa máxima entre mensajes (ms)")}
        {num("viejosMinutos", "Mensajes más viejos que (min) al reconectar: los atiende una persona", 1)}
      </div>
      <h3>Contactos nuevos (nunca nos escribieron)</h3>
      <div className="wa-grid3">
        {num("friosPorDia", "Tope por día")}
        {num("friosPausaMinS", "Pausa mínima (s)", 10)}
        {num("friosPausaMaxS", "Pausa máxima (s)", 10)}
        <label>
          Solo desde
          <input type="time" value={a.friosDesde} onChange={(e) => cambiar("antibloqueo", { friosDesde: e.target.value })} />
        </label>
        <label>
          hasta
          <input type="time" value={a.friosHasta} onChange={(e) => cambiar("antibloqueo", { friosHasta: e.target.value })} />
        </label>
      </div>
    </section>
  );
}
