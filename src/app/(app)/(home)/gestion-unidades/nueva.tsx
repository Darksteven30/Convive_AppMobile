import { router } from 'expo-router';

import { UnitForm } from '@/components/community/UnitForm';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { saveUnit, type UnitInput } from '@/services/community.service';

/** RF20 · Crear una unidad del conjunto (administrador). */
export default function NuevaUnidadScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();

  const create = async (input: UnitInput) => {
    if (!user) return;
    await saveUnit(null, input, user);
    showToast('success', MSG.RF20.unitSaved);
    router.back();
  };

  return <UnitForm title="Nueva unidad" onSubmit={create} />;
}
