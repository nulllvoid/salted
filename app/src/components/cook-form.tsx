import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Field, Notice, ui } from './ui';
import { ThemedText } from './themed-text';
import { useAction } from '@/hooks/use-action';
import type { Tables } from '@/types/database';
export function CookForm({
  cook,
  save,
  onSaved,
}: {
  cook: Tables<'cooks'> | null;
  save: (p: {
    name: string;
    phone: string;
    language: string;
  }) => Promise<unknown>;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(cook?.name ?? '');
  const [phone, setPhone] = useState(cook?.phone ?? '+91');
  const [language, setLanguage] = useState(cook?.language ?? 'hi');
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const normalPhone = phone.replace(/[\s()-]/g, '');
  const valid = name.trim().length > 0 && /^\+[1-9]\d{7,14}$/.test(normalPhone);
  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Cook’s name"
        value={name}
        maxLength={80}
        onChangeText={(v) => {
          setName(v);
          setSaved(false);
        }}
      />
      <Field
        label="WhatsApp number"
        value={phone}
        keyboardType="phone-pad"
        onChangeText={(v) => {
          setPhone(v);
          setSaved(false);
        }}
        placeholder="+91 98765 43210"
      />
      <ThemedText type="small" themeColor="textSecondary">
        Include the country code, such as +91.
      </ThemedText>
      <View style={ui.wrap}>
        {[
          { id: 'hi', name: 'Hindi' },
          { id: 'kn', name: 'Kannada' },
          { id: 'en', name: 'English' },
        ].map((l) => (
          <Chip
            key={l.id}
            selected={l.id === language}
            onPress={() => {
              setLanguage(l.id);
              setSaved(false);
            }}
          >
            {l.name}
          </Chip>
        ))}
      </View>
      {action.error && <Notice error>{action.error}</Notice>}
      {saved && <Notice>Cook details saved.</Notice>}
      <Button
        busy={action.pending}
        disabled={!valid}
        onPress={() => {
          void action
            .run(() =>
              save({ name: name.trim(), phone: normalPhone, language }),
            )
            .then((ok) => {
              if (ok) {
                setSaved(true);
                onSaved?.();
              }
            });
        }}
      >
        Save cook details
      </Button>
    </View>
  );
}
