import { useRouter } from 'expo-router';
import { makeRedirectUri } from 'expo-auth-session';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Field, Notice, Screen, ui } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import {
  parseLoginIdentifier,
  passwordError,
  validateNewPassword,
} from '@/lib/password-auth';

export default function PasswordLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<
    'login' | 'signup' | 'verify' | 'recover' | 'reset'
  >('login');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const lock = useRef(false);
  const usernameEnabled =
    process.env.EXPO_PUBLIC_USERNAME_LOGIN_ENABLED === 'true';
  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setError(null);
    setMessage(null);
    setCode('');
    setRecoverySent(false);
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'reset') {
        validateNewPassword(password, confirmation);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        router.replace('/onboarding');
        return;
      }
      const identity = parseLoginIdentifier(identifier);
      if (mode === 'recover') {
        if ('username' in identity)
          throw new Error(
            'Enter the email address or phone number associated with your account.',
          );
        if (recoverySent) {
          const { error } = await supabase.auth.verifyOtp({
            ...identity,
            token: code.trim(),
            type: 'phone' in identity ? 'sms' : 'recovery',
          });
          if (error) throw error;
          setMode('reset');
          setPassword('');
          return;
        }
        if ('phone' in identity) {
          const { error } = await supabase.auth.signInWithOtp({
            phone: identity.phone,
            options: { shouldCreateUser: false },
          });
          if (error) throw error;
          setRecoverySent(true);
          setMessage(
            'Enter the verification code sent to your phone to choose a new password.',
          );
          return;
        }
        // Keep PKCE recovery in the client that requested the email.
        const { error } = await supabase.auth.resetPasswordForEmail(
          identity.email,
          {
            redirectTo: makeRedirectUri({ path: 'reset-password' }),
          },
        );
        if (error) throw error;
        setRecoverySent(true);
        setMessage(
          'If an account matches, you’ll receive a password reset email. Open its link to choose a new password. If the email includes a code, you can enter it below.',
        );
        return;
      }
      if (mode === 'verify') {
        if (!('phone' in identity)) throw new Error('Enter your phone number.');
        const { error } = await supabase.auth.verifyOtp({
          phone: identity.phone,
          token: code.trim(),
          type: 'sms',
        });
        if (error) throw error;
        router.replace('/onboarding');
        return;
      }
      if (mode === 'signup') {
        if (!(method in identity))
          throw new Error(
            `Enter your ${method === 'email' ? 'email address' : 'phone number with country code'}.`,
          );
        validateNewPassword(password, confirmation);
        let requestedUsername: string | undefined;
        if (usernameEnabled && username.trim()) {
          const parsed = parseLoginIdentifier(username);
          if (!('username' in parsed))
            throw new Error('Choose a username starting with a letter.');
          requestedUsername = parsed.username;
        }
        if ('username' in identity)
          throw new Error(
            'Create your account with an email address or phone number.',
          );
        const { data, error } = await supabase.auth.signUp({
          ...identity,
          password,
          options: { data: { username: requestedUsername } },
        });
        if (error) throw error;
        setPassword('');
        setConfirmation('');
        if (data.session) {
          router.replace('/onboarding');
          return;
        }
        if ('phone' in identity) {
          setMode('verify');
          setMessage('Enter the verification code sent to your phone.');
        } else {
          setMode('login');
          setMessage(
            'Check your inbox to confirm your email, then sign in. If you already have an account, use your existing password.',
          );
        }
        return;
      }
      if (!password) throw new Error('Enter your password.');
      if ('username' in identity) {
        if (!usernameEnabled)
          throw new Error(
            'Username sign-in is being set up. Please use your email or phone for now.',
          );
        const { data, error } = await supabase.functions.invoke(
          'password_login',
          { body: { username: identity.username, password } },
        );
        if (error || !data?.access_token || !data?.refresh_token)
          throw new Error(
            data?.message ||
              'We couldn’t sign you in. Check your details and try again.',
          );
        const { error: sessionError } = await supabase.auth.setSession(data);
        if (sessionError) throw sessionError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          ...identity,
          password,
        });
        if (error) throw error;
      }
      setPassword('');
      router.replace('/onboarding');
    } catch (err) {
      setError(passwordError(err));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const title = {
    login: 'Welcome back.',
    signup: 'A seat at the table.',
    verify: 'Check your phone.',
    recover: 'Forgot your password?',
    reset: 'Choose a new password.',
  }[mode];
  return (
    <Screen>
      <Button
        secondary
        disabled={pending}
        onPress={() =>
          mode === 'login' ? router.replace('/onboarding') : changeMode('login')
        }
      >
        Back
      </Button>
      <ThemedText type="smallBold" themeColor="accentText">
        SALTED
      </ThemedText>
      <ThemedText type="title">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {mode === 'signup'
          ? 'Create an account to plan meals with your household.'
          : mode === 'login'
            ? 'Sign in to your shared table.'
            : 'We’ll help you get back to your household.'}
      </ThemedText>
      <Card>
        {mode === 'signup' && (
          <View style={ui.wrap}>
            {(['email', 'phone'] as const).map((value) => (
              <Chip
                key={value}
                selected={method === value}
                onPress={() => {
                  if (!pending) {
                    setMethod(value);
                    setIdentifier('');
                  }
                }}
              >
                {value === 'email' ? 'Email' : 'Phone'}
              </Chip>
            ))}
          </View>
        )}
        {mode !== 'reset' && (
          <Field
            label={
              mode === 'login'
                ? usernameEnabled
                  ? 'Username, email or phone'
                  : 'Email or phone'
                : mode === 'recover'
                  ? 'Email or phone'
                  : method === 'phone' || mode === 'verify'
                    ? 'Phone number'
                    : 'Email address'
            }
            value={identifier}
            onChangeText={setIdentifier}
            editable={!pending && mode !== 'verify' && !recoverySent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'login' ? 'username' : 'off'}
            placeholder={
              mode === 'signup' && method === 'phone'
                ? '+91 9876543210'
                : undefined
            }
          />
        )}
        {mode === 'signup' && usernameEnabled && (
          <Field
            label="Username (optional)"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            maxLength={30}
          />
        )}
        {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
          <>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              editable={!pending}
              onSubmitEditing={() => {
                if (mode === 'login') void submit();
              }}
            />
            <Button
              secondary
              disabled={pending}
              onPress={() => setVisible((v) => !v)}
            >
              {visible ? 'Hide password' : 'Show password'}
            </Button>
            {mode !== 'login' && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Use at least 10 characters.
                </ThemedText>
                <Field
                  label="Confirm password"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  secureTextEntry={!visible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  editable={!pending}
                />
              </>
            )}
          </>
        )}
        {(mode === 'verify' || (mode === 'recover' && recoverySent)) && (
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            editable={!pending}
          />
        )}
        {message && <Notice>{message}</Notice>}
        {error && <Notice error>{error}</Notice>}
        <Button
          busy={pending}
          disabled={mode === 'recover' && recoverySent && !code.trim()}
          onPress={() => {
            void submit();
          }}
        >
          {mode === 'login'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'verify'
                ? 'Verify phone'
                : mode === 'reset'
                  ? 'Save new password'
                  : recoverySent
                    ? 'Verify code'
                    : 'Send recovery instructions'}
        </Button>
      </Card>
      {mode === 'login' && (
        <>
          <Button
            secondary
            disabled={pending}
            onPress={() => changeMode('recover')}
          >
            Forgot password?
          </Button>
          <Button
            secondary
            disabled={pending}
            onPress={() => changeMode('signup')}
          >
            Create an account
          </Button>
        </>
      )}
    </Screen>
  );
}
