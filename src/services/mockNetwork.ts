// Latencia simulada de red compartida por los servicios mock.
// Las pruebas de integración la ponen en 0 para que todo se resuelva dentro de act().

export const mockNetwork = { delayMs: 600 };

export function simulateNetwork(factor = 1): Promise<void> {
  const ms = mockNetwork.delayMs * factor;
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
