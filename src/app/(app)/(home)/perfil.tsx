import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { roleLabels } from '@/constants/permissions';
import { colors, radius, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { useConfirmSignOut } from '@/hooks/useConfirmSignOut';
import { AuthError } from '@/services/auth.service';
import { PHONE_LENGTH, isValidPhone, normalizePhone } from '@/utils/validation';

/** RF16 · Perfil: datos del usuario en sesión; solo el teléfono lo puede cambiar él mismo. */
export default function PerfilScreen() {
  const { user } = useSession();
  const confirmSignOut = useConfirmSignOut();

  // Al cerrar sesión hay un render sin usuario antes de que la pantalla se desmonte.
  if (!user) return null;

  return (
    <Screen header={<AppHeader left="back" />}>
      <View style={styles.identity}>
        <BrandLogo size={72} />
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.address}>{user.address}</Text>
        <Text style={styles.role}>{roleLabels[user.role]}</Text>
      </View>

      <SectionTitle title="Datos personales" />
      <View style={styles.data}>
        <DataRow label="Correo" value={user.email} />
        <PhoneRow phone={user.phone} />
        <DataRow label="Casa" value={user.house} />
        <Text style={styles.hint}>{MSG.RF16.readOnlyData}</Text>
      </View>

      <SectionTitle title="Seguridad" />
      <OptionRow
        icon="lock-closed-outline"
        label="Cambiar contraseña"
        onPress={() => router.push('/cambiar-contrasena')}
      />
      <OptionRow icon="log-out-outline" label="Cerrar sesión" onPress={confirmSignOut} />
    </Screen>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}:</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

/** Teléfono con botón «Editar»: 10 dígitos que empiezan por 3 (MSG-RF16-02) y Toast al guardar (MSG-RF16-01). */
function PhoneRow({ phone }: { phone: string }) {
  const { updatePhone } = useSession();
  const { showToast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = normalizePhone(value) !== normalizePhone(phone);
  const canSave = isValidPhone(value) && changed;

  const startEditing = () => {
    setValue(normalizePhone(phone));
    setError(null);
    setEditing(true);
  };

  const change = (text: string) => {
    const digits = normalizePhone(text);
    setValue(digits);
    // El mensaje en línea desaparece cuando el usuario corrige el dato.
    if (error && isValidPhone(digits)) setError(null);
  };

  const save = async () => {
    if (!isValidPhone(value)) {
      setError(MSG.RF16.phoneInvalid);
      return;
    }
    setSaving(true);
    try {
      await updatePhone(value);
      showToast('success', MSG.RF16.phoneUpdated);
      setEditing(false);
    } catch (e) {
      if (e instanceof AuthError && e.code === 'invalid_phone') {
        setError(MSG.RF16.phoneInvalid);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>Teléfono:</Text>
        <Text style={styles.dataValue}>{phone}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Editar teléfono" onPress={startEditing} hitSlop={8}>
          <Text style={styles.link}>Editar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.editor}>
      <TextField
        label="Teléfono"
        value={value}
        onChangeText={change}
        onBlur={() => setError(isValidPhone(value) ? null : MSG.RF16.phoneInvalid)}
        onSubmitEditing={save}
        error={error}
        keyboardType="phone-pad"
        maxLength={PHONE_LENGTH}
        autoComplete="tel"
        autoFocus
      />
      <View style={styles.editorActions}>
        <Button
          label="Cancelar"
          variant="outline"
          pill
          disabled={saving}
          onPress={() => setEditing(false)}
          style={styles.flex}
        />
        <Button
          label="Guardar"
          variant="brand"
          pill
          disabled={!canSave}
          loading={saving}
          onPress={save}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    marginTop: spacing.sm,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  role: {
    marginTop: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    fontSize: 12,
    fontWeight: '600',
    color: colors.brandDark,
    overflow: 'hidden',
  },
  address: {
    fontSize: 13,
    color: colors.textMuted,
  },
  data: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dataLabel: {
    width: 80,
    fontSize: 14,
    color: colors.text,
  },
  dataValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brandDark,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textMuted,
  },
  editor: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
