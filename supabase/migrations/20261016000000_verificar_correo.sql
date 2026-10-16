-- =============================================================================================
-- Convive · RF01: verificar el correo antes de crear la primera contraseña
--
-- Problema: la app creaba la cuenta con signUp sin comprobar el correo, y el trigger
-- vincular_perfil enlaza el perfil pre-registrado con el primer usuario de Supabase Auth que tenga
-- ese correo. Con «Confirm email» desactivado, cualquiera que conociera un correo pendiente se
-- quedaba con su perfil, su rol (incluido administrador) y su unidad.
--
-- Ahora la app pide un código al correo (signInWithOtp) y solo define la contraseña después de
-- verificarlo (verifyOtp + updateUser). Pedir el código ya crea el usuario de Auth y el trigger lo
-- enlaza, así que «registered» ya no puede significar «tiene usuario enlazado»: una cuenta solo
-- está registrada cuando su correo está verificado y tiene contraseña. Así, quien pida un código
-- o llame signUp con un correo ajeno no deja la cuenta como «registered» ni bloquea al dueño.
--
-- Configuración en Supabase (ver README): SMTP propio, «Confirm email» activado y las plantillas
-- «Confirm signup» y «Magic Link» con el código {{ .Token }}.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- RF01 · Estado del correo (paso 1 del inicio de sesión). Mantiene los permisos (anon y authenticated).
create or replace function public.estado_correo(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null then 'not_found'
    when u.id is null or u.email_confirmed_at is null or coalesce(u.encrypted_password, '') = '' then 'pending'
    else 'registered'
  end
  from (select 1) as uno
  left join public.perfiles p on p.email = lower(btrim(p_email))
  left join auth.users u on u.id = p.user_id;
$$;
