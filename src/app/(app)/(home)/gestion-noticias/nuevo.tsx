import { router } from 'expo-router';

import { NewsForm } from '@/components/news/NewsForm';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { publishNews, type NewsInput } from '@/services/news.service';

/** RF19 · Publicar un comunicado para todo el conjunto (administrador). */
export default function NuevoComunicadoScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();

  const publish = async (input: NewsInput) => {
    if (!user) return;
    await publishNews(input, user);
    showToast('success', MSG.RF19.published);
    router.back();
  };

  return <NewsForm title="Publicar comunicado" submitLabel="Publicar" onSubmit={publish} />;
}
