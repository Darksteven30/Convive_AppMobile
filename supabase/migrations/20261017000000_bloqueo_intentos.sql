-- =============================================================================================
-- Convive · RF01: el contador de intentos fallidos ya no lo puede borrar cualquiera
--
-- Problema: registrar_intento(p_email, p_exitoso) estaba concedida al rol anon. Con
-- p_exitoso = true cualquiera borraba el contador de cualquier correo, así que podía probar
-- contraseñas sin quedar bloqueado nunca (4 intentos, borrar, 4 intentos…). También insertaba
-- filas para correos que no existen.
--
-- Ahora:
--   · registrar_intento_fallido(p_email): solo suma un intento (y bloquea 15 min al quinto), y
--     solo para correos pre-registrados. La sigue usando anon, porque el intento fallido ocurre
--     antes de iniciar sesión.
--   · limpiar_intentos(): solo con sesión iniciada, borra el contador de la propia cuenta y nunca
--     quita un bloqueo activo (una sesión obtenida durante el bloqueo no lo levanta).
--   · desbloquear_cuenta() (recuperación con el código del correo) no cambia.
--
-- Límite conocido: en el plan gratuito de Supabase no existe el hook «Password Verification
-- Attempt» (Teams y Enterprise), así que Supabase Auth no conoce este bloqueo y quien llame a su
-- API directamente no suma intentos. Contra eso protegen los límites por IP de Supabase Auth
-- (Authentication → Rate Limits) y las reglas de contraseña.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

revoke execute on function public.registrar_intento(text, boolean) from public, anon, authenticated;
drop function public.registrar_intento(text, boolean);

-- Suma un intento fallido. Devuelve los intentos que quedan (0 = bloqueada).
create or replace function public.registrar_intento_fallido(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_fallidos integer;
begin
  -- Correos que la administración no registró: no se guardan (la tabla no crece con basura).
  if not exists (select 1 from public.perfiles where email = v_email) then
    return 5;
  end if;

  insert into public.intentos_login as i (email, fallidos)
  values (v_email, 1)
  on conflict (email) do update
    -- Si el bloqueo anterior ya venció, el conteo vuelve a empezar.
    set fallidos = case when i.bloqueado_hasta is not null and i.bloqueado_hasta <= now() then 1 else i.fallidos + 1 end,
        bloqueado_hasta = case when i.bloqueado_hasta is not null and i.bloqueado_hasta <= now() then null else i.bloqueado_hasta end
  returning fallidos into v_fallidos;

  if v_fallidos >= 5 then
    -- Solo se fija al llegar al quinto: más intentos durante el bloqueo no lo alargan.
    update public.intentos_login
       set bloqueado_hasta = coalesce(bloqueado_hasta, now() + interval '15 minutes')
     where email = v_email;
    return 0;
  end if;
  return 5 - v_fallidos;
end;
$$;

-- Tras iniciar sesión: borra el contador de la propia cuenta, salvo que esté bloqueada.
create or replace function public.limpiar_intentos()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.intentos_login
   where email = (select lower(email) from auth.users where id = auth.uid())
     and (bloqueado_hasta is null or bloqueado_hasta <= now());
$$;

revoke execute on function public.registrar_intento_fallido(text) from public, anon, authenticated;
revoke execute on function public.limpiar_intentos() from public, anon, authenticated;
grant execute on function public.registrar_intento_fallido(text) to anon, authenticated;
grant execute on function public.limpiar_intentos() to authenticated;
