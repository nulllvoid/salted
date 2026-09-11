import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Field, Notice, Screen } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { passwordError, validateNewPassword } from '@/lib/password-auth';

export default function ResetPassword() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    // Web auth-js exchanges the PKCE callback during initialization.
    // A valid session is still required by updateUser on the server.
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session && code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          data = result.data;
        }
        if (active) {
          setReady(!!data.session);
          if (!data.session)
            setError(
              'This reset link has expired or was opened in a different browser. Request a new link from this browser.',
            );
        }
      })
      .catch((err) => {
        if (active) setError(passwordError(err));
      });
    return () => {
      active = false;
    };
  }, [code]);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      validateNewPassword(password, confirmation);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      router.replace('/onboarding');
    } catch (err) {
      setError(passwordError(err));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Screen>
      <ThemedText type="title">A fresh start.</ThemedText>
      <ThemedText>
        Choose a new password with at least 10 characters.
      </ThemedText>
      <Card>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          editable={ready && !pending}
        />
        <Field
          label="Confirm password"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          editable={ready && !pending}
        />
        {error && <Notice error>{error}</Notice>}
        <Button
          busy={pending}
          disabled={!ready}
          onPress={() => {
            void save();
          }}
        >
          Save new password
        </Button>
        <Button
          secondary
          disabled={pending}
          onPress={() => router.replace('/onboarding/password')}
        >
          Back to sign in
        </Button>
      </Card>
    </Screen>
  );
}
