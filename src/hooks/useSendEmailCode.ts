import { useCallback, useState } from 'react';

import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';

/**
 * Envía al correo un código de 6 dígitos y avisa con el Toast MSG-RF01-07. Lo usan la recuperación de
 * la contraseña (requestPasswordReset) y la verificación del correo al crearla (requestAccountCode).
 */
export function useSendEmailCode(email: string, request: (email: string) => Promise<void>) {
  const { showToast } = useFeedback();
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    setSending(true);
    try {
      await request(email);
      showToast('success', MSG.RF01.resetCodeSent(email));
      return true;
    } catch {
      showToast('error', MSG.general.unexpected);
      return false;
    } finally {
      setSending(false);
    }
  }, [email, request, showToast]);

  return { send, sending };
}
