import { useEffect, useRef, useState } from "react";
import { PenLine, Trash2, Upload } from "lucide-react";
import type { FirmaImagen } from "./documentoContrato";

/**
 * Limpia una firma para el documento: lo casi blanco queda transparente y se recorta al trazo (sin márgenes de
 * papel). Devuelve un PNG como data URL, o null si la imagen no tiene trazo.
 */
async function limpiarFirma(fuente: string): Promise<string | null> {
  const img = await new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = mal;
    i.src = fuente;
  });
  const escala = Math.min(1, 900 / img.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  const c = lienzo.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const datos = c.getImageData(0, 0, lienzo.width, lienzo.height);
  const px = datos.data;
  let x0 = lienzo.width, y0 = lienzo.height, x1 = -1, y1 = -1;
  for (let y = 0; y < lienzo.height; y++) {
    for (let x = 0; x < lienzo.width; x++) {
      const i = (y * lienzo.width + x) * 4;
      const claro = (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
      // el papel (o lo transparente) no es firma
      if (px[i + 3]! < 30 || claro > 200) {
        px[i + 3] = 0;
        continue;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  c.putImageData(datos, 0, 0);
  const margen = 6;
  const ancho = Math.min(lienzo.width, x1 - x0 + 1 + margen * 2);
  const alto = Math.min(lienzo.height, y1 - y0 + 1 + margen * 2);
  const recorte = document.createElement("canvas");
  recorte.width = ancho;
  recorte.height = alto;
  recorte.getContext("2d")!.drawImage(lienzo, Math.max(0, x0 - margen), Math.max(0, y0 - margen), ancho, alto, 0, 0, ancho, alto);
  return recorte.toDataURL("image/png");
}

/** La firma (data URL) como la pide el Word: los bytes y un tamaño que entra sobre la línea de firma. */
export async function firmaParaWord(dataUrl: string | null): Promise<FirmaImagen | null> {
  if (!dataUrl) return null;
  const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
  const img = await new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = mal;
    i.src = dataUrl;
  });
  const escala = Math.min(180 / img.width, 70 / img.height);
  return { datos: bytes, ancho: Math.round(img.width * escala), alto: Math.round(img.height * escala) };
}

/** Subir la imagen de una firma o dibujarla con el mouse o el dedo. */
export function FirmaControl({ titulo, valor, onCambio, ayuda }: { titulo: string; valor: string | null; onCambio: (v: string | null) => void; ayuda?: string }) {
  const [dibujando, setDibujando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  async function subir(f: File) {
    setError(null);
    const leida = await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.readAsDataURL(f);
    });
    const limpia = await limpiarFirma(leida).catch(() => null);
    if (!limpia) return setError("No se ve ninguna firma en esa imagen. Probá con una foto de la firma en papel blanco.");
    onCambio(limpia);
  }

  return (
    <div className="cc-firma">
      <span className="cc-firma-titulo">{titulo}</span>
      {valor && !dibujando ? (
        <img className="cc-firma-vista" src={valor} alt={`Firma: ${titulo}`} />
      ) : !dibujando ? (
        <span className="cc-firma-vacia">Sin firma: queda la línea para firmar a mano</span>
      ) : null}
      {dibujando && (
        <Lienzo
          onListo={async (url) => {
            setDibujando(false);
            if (url) {
              const limpia = await limpiarFirma(url).catch(() => null);
              if (limpia) onCambio(limpia);
            }
          }}
        />
      )}
      {!dibujando && (
        <div className="cc-firma-botones">
          <button type="button" onClick={() => archivo.current?.click()}>
            <Upload size={13} /> Subir imagen
          </button>
          <button type="button" onClick={() => setDibujando(true)}>
            <PenLine size={13} /> Dibujar
          </button>
          {valor && (
            <button type="button" className="quitar" onClick={() => onCambio(null)}>
              <Trash2 size={13} /> Quitar
            </button>
          )}
          <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void subir(e.target.files[0])} />
        </div>
      )}
      {ayuda && <small>{ayuda}</small>}
      {error && <small className="cc-firma-error">{error}</small>}
    </div>
  );
}

/** Un recuadro para firmar con el mouse o el dedo. */
function Lienzo({ onListo }: { onListo: (dataUrl: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazando = useRef(false);
  const [vacio, setVacio] = useState(true);
  useEffect(() => {
    const c = lienzo.current!.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 480, 180);
    c.lineWidth = 2.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#1e3a8a";
  }, []);
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * 480) / r.width, y: ((e.clientY - r.top) * 180) / r.height };
  };
  return (
    <div className="cc-firma-lienzo">
      <canvas
        ref={lienzo}
        width={480}
        height={180}
        aria-label="Firmar aquí"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          trazando.current = true;
          const c = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          c.beginPath();
          c.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!trazando.current) return;
          const c = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          c.lineTo(p.x, p.y);
          c.stroke();
          setVacio(false);
        }}
        onPointerUp={() => (trazando.current = false)}
        onPointerLeave={() => (trazando.current = false)}
      />
      <div className="cc-firma-botones">
        <button
          type="button"
          onClick={() => {
            const c = lienzo.current!.getContext("2d")!;
            c.fillStyle = "#ffffff";
            c.fillRect(0, 0, 480, 180);
            setVacio(true);
          }}
        >
          Borrar
        </button>
        <button type="button" onClick={() => onListo(null)}>
          Cancelar
        </button>
        <button type="button" className="usar" disabled={vacio} onClick={() => onListo(lienzo.current!.toDataURL("image/png"))}>
          Usar esta firma
        </button>
      </div>
    </div>
  );
}
