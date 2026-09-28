import type { LucideIcon } from "lucide-react";
import type { Rol } from "./auth.types";

export interface ModuloConfig {
  id: string;
  titulo: string;
  categoria: string;
  acento: string; // color de acento (borde + ícono), no el fondo completo de la tarjeta
  icono: LucideIcon;
  ruta: string;
  rolesPermitidos: Rol[];
}