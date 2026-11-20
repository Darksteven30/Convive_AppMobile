import { router } from 'expo-router';

import { PersonForm } from '@/components/community/PersonForm';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { preregisterPerson, type PersonInput } from '@/services/community.service';

/** RF20 · Pre-registrar a una persona: cuando entre con su correo, creará su contraseña (RF01). */
export default function NuevaPersonaScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();

  const preregister = async (input: PersonInput) => {
    if (!user) return;
    const person = await preregisterPerson(input, user);
    showToast('success', MSG.RF20.personPreregistered(person.email));
    router.back();
  };

  return <PersonForm title="Pre-registrar persona" submitLabel="Pre-registrar" onSubmit={preregister} />;
}
