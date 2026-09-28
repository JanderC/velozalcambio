import type { Rol } from "../../types/auth.types";

// Mismos roles que el backend exige en POST /tasas y POST /tasas/detalle.
export const ROLES_REGISTRO_TASAS: Rol[] = ["ADMIN", "ASESOR"];
