import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { colors, layout, radius, spacing } from '@/constants/theme';

// Mensajes al usuario de la sección 7.2 del documento:
// - Toast: barra inferior que se cierra sola a los 3 s (verde éxito, gris información, rojo error).
// - Diálogo modal: título, texto y uno o dos botones; bloquea hasta que el usuario responde.

export const TOAST_DURATION_MS = 3000;

type ToastType = 'success' | 'info' | 'error';
type Toast = { id: number; type: ToastType; message: string };

type DialogAction = { label: string; onPress?: () => void; primary?: boolean };
type Dialog = { title?: string; message: string; actions: DialogAction[] };

type FeedbackContextValue = {
  showToast: (type: ToastType, message: string) => void;
  showDialog: (dialog: Dialog) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const toastColors: Record<ToastType, string> = {
  success: colors.toastSuccess,
  info: colors.toastInfo,
  error: colors.danger,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((type: ToastType, message: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, type, message });
  }, []);

  const showDialog = useCallback((value: Dialog) => setDialog(value), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const closeDialog = (action?: DialogAction) => {
    setDialog(null);
    action?.onPress?.();
  };

  const value = useMemo(() => ({ showToast, showDialog }), [showToast, showDialog]);

  return (
    <FeedbackContext value={value}>
      {children}

      {toast ? (
        <View pointerEvents="box-none" style={[styles.toastWrapper, { bottom: insets.bottom + 72 }]}>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID={`toast-${toast.type}`}
            style={[styles.toast, { backgroundColor: toastColors[toast.type] }]}
          >
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        </View>
      ) : null}

      <Modal transparent visible={dialog !== null} animationType="fade" onRequestClose={() => closeDialog()}>
        <View style={styles.overlay}>
          {dialog ? (
            <View accessibilityRole="alert" style={styles.dialog}>
              {dialog.title ? <Text style={styles.dialogTitle}>{dialog.title}</Text> : null}
              <Text style={styles.dialogMessage}>{dialog.message}</Text>
              <View style={styles.dialogActions}>
                {dialog.actions.map((action) => (
                  <Button
                    key={action.label}
                    label={action.label}
                    variant={action.primary ? 'primary' : 'secondary'}
                    onPress={() => closeDialog(action)}
                    block
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </FeedbackContext>
  );
}

export function useFeedback() {
  const context = use(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback debe usarse dentro de <FeedbackProvider>.');
  }
  return context;
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  toastText: {
    color: colors.onPrimary,
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    zIndex: 1,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  dialogMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  dialogActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
