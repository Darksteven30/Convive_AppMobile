// Datos de ejemplo para la maqueta. Se reemplazarán por llamadas al backend.

/** Segmento de las gráficas de dona (DonutChart). Los datos de General salen del resumen de RF14. */
export type Category = { label: string; value: number; color: string };

export type ExpectedVisitor = { id: string; name: string; unit: string; time: string };

// Visitantes esperados hoy (el registro de entradas y salidas es RF10).
export const expectedVisitors: ExpectedVisitor[] = [];
