// Finanzas con Supabase (RF03 y RF04). Cumple el mismo contrato que el servicio simulado
// (finance.types.ts). El esquema y las funciones están en supabase/migrations/20261012000000_finanzas.sql:
// registrar_movimiento() valida y guarda; movimientos_financieros() consulta con las reglas de RF04.
// El conjunto y el usuario salen de la sesión en el servidor (auth.uid()), no de lo que envía la app.

import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import {
  ALL_CATEGORIES,
  FinanceError,
  MOVEMENT_ROLES,
  REPORT_ROLES,
  byName,
  byTypeAndName,
  oldestFirst,
  type Attachment,
  type Category,
  type FinanceBackend,
  type FinancialReport,
  type Movement,
  type MovementErrors,
  type MovementInput,
  type MovementType,
  type ReportErrors,
  type ReportFilters,
} from '@/services/finance.types';
import { computeTotals, validateMovement, validateReportFilters } from '@/services/finance.validation';

/** Bucket privado de los soportes; cada conjunto tiene su carpeta. */
export const ATTACHMENTS_BUCKET = 'soportes-financieros';

/** Fila de la tabla categorias_financieras. */
type CategoryRow = { id: string; nombre: string; tipo: MovementType; activa: boolean };

/** Fila que devuelve movimientos_financieros(). */
type MovementRow = {
  id: string;
  tipo: MovementType;
  categoria_id: string;
  categoria: string;
  /** numeric(18,2): PostgREST puede devolverlo como número o como texto. */
  monto: number | string;
  fecha: string;
  descripcion: string;
  soporte_ruta: string | null;
  soporte_nombre: string | null;
  soporte_tipo: string | null;
  soporte_bytes: number | null;
  registrado_por_id: string;
  registrado_por: string;
  created_at: string;
};

/** Fila que devuelve registrar_movimiento(). */
type CreatedRow = {
  id: string;
  categoria: string;
  registrado_por_id: string;
  registrado_por: string;
  created_at: string;
};

type RpcError = { message?: string };

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.nombre,
  type: row.tipo,
  active: row.activa,
});

export function toMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    type: row.tipo,
    categoryId: row.categoria_id,
    categoryName: row.categoria,
    amount: Number(row.monto),
    date: row.fecha,
    description: row.descripcion,
    attachment: row.soporte_ruta
      ? {
          uri: '',
          storagePath: row.soporte_ruta,
          name: row.soporte_nombre ?? 'Soporte',
          mimeType: row.soporte_tipo ?? 'application/octet-stream',
          size: row.soporte_bytes ?? undefined,
        }
      : null,
    createdBy: { id: row.registrado_por_id, name: row.registrado_por },
    createdAt: row.created_at,
  };
}

/** Traduce los errores de registrar_movimiento() al mensaje del campo correspondiente. */
function toMovementError(error: RpcError): FinanceError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new FinanceError('forbidden');
  const fields: [string, keyof MovementErrors, string][] = [
    ['categoria_invalida', 'categoryId', MSG.RF03.categoryRequired],
    ['monto_invalido', 'amount', MSG.RF03.amountInvalid],
    ['fecha_futura', 'date', MSG.RF03.futureDate],
    ['descripcion_invalida', 'description', MSG.RF03.descriptionShort],
    ['soporte_invalido', 'attachment', MSG.RF03.invalidFile],
  ];
  const match = fields.find(([code]) => message.includes(code));
  return match ? new FinanceError('validation', { [match[1]]: match[2] }) : null;
}

/** Bytes del archivo elegido: en el celular con expo-file-system y en web con fetch (blob:/data:). */
async function readAttachment(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** «{conjunto}/{fecha}-{aleatorio}.pdf»: único y sin datos personales en el nombre. */
function attachmentPath(conjuntoId: string, mimeType: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${conjuntoId}/${Date.now()}-${random}.${EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? 'bin'}`;
}

/** Sube el soporte a la carpeta del conjunto y devuelve su ruta y su tamaño real. */
async function uploadAttachment(attachment: Attachment): Promise<{ path: string; size: number }> {
  const supabase = getSupabase();
  const { data: conjuntoId, error: conjuntoError } = await supabase.rpc('mi_conjunto');
  if (conjuntoError || !conjuntoId) throw conjuntoError ?? new Error('sin_conjunto');

  const bytes = await readAttachment(attachment.uri);
  const path = attachmentPath(conjuntoId as string, attachment.mimeType);
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType: attachment.mimeType.toLowerCase(), upsert: false });
  if (error) throw error;
  return { path, size: bytes.byteLength };
}

async function listCategories(type: MovementType): Promise<Category[]> {
  const { data, error } = await getSupabase()
    .from('categorias_financieras')
    .select('id, nombre, tipo, activa')
    .eq('tipo', type)
    .eq('activa', true);
  if (error) throw error;
  return ((data ?? []) as CategoryRow[]).map(toCategory).sort(byName);
}

async function listReportCategories(): Promise<Category[]> {
  const { data, error } = await getSupabase().from('categorias_financieras').select('id, nombre, tipo, activa');
  if (error) throw error;
  return ((data ?? []) as CategoryRow[]).map(toCategory).sort(byTypeAndName);
}

async function listMovements(): Promise<Movement[]> {
  const { data, error } = await getSupabase().rpc('movimientos_financieros');
  if (error) throw error;
  return ((data ?? []) as MovementRow[]).map(toMovement);
}

async function createMovement(input: MovementInput, user: User): Promise<Movement> {
  if (!MOVEMENT_ROLES.includes(user.role)) {
    throw new FinanceError('forbidden');
  }
  // La categoría la valida el servidor contra el catálogo.
  const errors = validateMovement(input, undefined, null);
  if (Object.keys(errors).length > 0) {
    throw new FinanceError('validation', errors);
  }

  const supabase = getSupabase();
  const uploaded = input.attachment ? await uploadAttachment(input.attachment) : null;
  const description = input.description.trim();

  const { data, error } = await supabase
    .rpc('registrar_movimiento', {
      p_tipo: input.type,
      p_categoria_id: input.categoryId,
      p_monto: input.amount,
      p_fecha: input.date,
      p_descripcion: description,
      p_soporte_ruta: uploaded?.path ?? null,
      p_soporte_nombre: input.attachment?.name ?? null,
      p_soporte_tipo: input.attachment?.mimeType.toLowerCase() ?? null,
      p_soporte_bytes: uploaded?.size ?? null,
    })
    .maybeSingle();

  if (error || !data) {
    // El movimiento no quedó guardado: el soporte subido sobra.
    if (uploaded) await supabase.storage.from(ATTACHMENTS_BUCKET).remove([uploaded.path]);
    throw (error && toMovementError(error)) ?? error ?? new Error('sin_respuesta');
  }

  const row = data as CreatedRow;
  return {
    ...input,
    description,
    id: row.id,
    categoryName: row.categoria,
    attachment:
      input.attachment && uploaded
        ? { ...input.attachment, mimeType: input.attachment.mimeType.toLowerCase(), size: uploaded.size, storagePath: uploaded.path }
        : null,
    createdBy: { id: row.registrado_por_id, name: row.registrado_por },
    createdAt: row.created_at,
  };
}

async function getFinancialReport(filters: ReportFilters, user: User): Promise<FinancialReport> {
  if (!REPORT_ROLES.includes(user.role)) {
    throw new FinanceError('forbidden');
  }
  const errors = validateReportFilters(filters);
  if (Object.keys(errors).length > 0) {
    throw new FinanceError<ReportErrors>('validation', errors);
  }

  const allCategories = filters.categoryId === ALL_CATEGORIES;
  const { data, error } = await getSupabase().rpc('movimientos_financieros', {
    p_desde: filters.from,
    p_hasta: filters.to,
    p_categoria_id: allCategories ? null : filters.categoryId,
  });
  if (error) {
    if ((error as RpcError).message?.includes('sin_permiso')) throw new FinanceError('forbidden');
    throw error;
  }

  const items = ((data ?? []) as MovementRow[]).map(toMovement).sort(oldestFirst);
  let categoryName = 'Todas';
  if (!allCategories) {
    categoryName = items[0]?.categoryName ?? (await findCategoryName(filters.categoryId));
  }

  return {
    filters,
    categoryName,
    movements: items,
    totals: computeTotals(items),
    generatedAt: new Date().toISOString(),
    generatedBy: { id: user.id, name: user.name },
  };
}

/** Nombre de una categoría cuando el reporte no trae movimientos de ella. */
async function findCategoryName(id: string): Promise<string> {
  const { data } = await getSupabase().from('categorias_financieras').select('nombre').eq('id', id).maybeSingle();
  return (data as { nombre: string } | null)?.nombre ?? 'Sin categoría';
}

export const financeBackend = {
  listCategories,
  listReportCategories,
  listMovements,
  createMovement,
  getFinancialReport,
} satisfies FinanceBackend;
