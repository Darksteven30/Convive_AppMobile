import { useCallback } from 'react';

import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';

/**
 * RF16 · MSG-RF16-03: pide confirmación antes de cerrar sesión. Lo usan el Perfil y el menú ☰.
 * Al confirmar, los guards de navegación llevan al inicio de sesión.
 */
export function useConfirmSignOut() {
  const { signOut } = useSession();
  const { showDialog, showToast } = useFeedback();

  return useCallback(() => {
    showDialog({
      message: MSG.RF16.signOutTitle,
      actions: [
        {
          label: 'Cerrar sesión',
          primary: true,
          onPress: () => {
            signOut().catch(() => showToast('error', MSG.general.unexpected));
          },
        },
        { label: 'Cancelar' },
      ],
    });
  }, [signOut, showDialog, showToast]);
}
