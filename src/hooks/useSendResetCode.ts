import { useCallback, useState } from 'react';

import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { requestPasswordReset } from '@/services/auth.service';

/** Envía el código de recuperación al correo y avisa con el Toast MSG-RF01-07. */
export function useSendResetCode(email: string) {
  const { showToast } = useFeedback();
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    setSending(true);
    try {
      await requestPasswordReset(email);
      showToast('success', MSG.RF01.resetCodeSent(email));
      return true;
    } catch {
      showToast('error', MSG.general.unexpected);
      return false;
    } finally {
      setSending(false);
    }
  }, [email, showToast]);

  return { send, sending };
}
