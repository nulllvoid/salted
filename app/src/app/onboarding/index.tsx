import { makeRedirectUri } from 'expo-auth-session';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Card, Notice, Screen } from '@/components/ui';

import { ThemedText } from '@/components/themed-text';

import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';

import { supabase } from '@/lib/supabase';

type OAuthProvider = 'google' | 'apple';

// Onboarding step 1, OAuth variant (docs/02-prd.md §F1). Phone OTP is blocked
// on India DLT/SMS-provider setup. Continues into onboarding/profile.tsx
// (about you), then onboarding/choose.tsx (create or join a group).
export default function OnboardingSignInScreen() {
  const router = useRouter();
  const session = useSession();
  const { groups } = useActiveGroup();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureProfileThenContinue = useCallback(
    async (userId: string, emailAddr: string) => {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
        .throwOnError();

      if (!existingProfile) {
        await supabase
          .from('profiles')
          .insert({
            id: userId,
            display_name: emailAddr.split('@')[0] || 'New member',
          })
          .throwOnError();
      }

      router.replace('/onboarding/profile');
    },
    [router],
  );

  // On web, the OAuth provider redirects back to this same page with the
  // session already established (detectSessionInUrl) — pick that up
  // and continue into profile creation once it lands. But a returning user
  // who lands here directly (stale bookmark, back-navigation, deep link)
  // with a session AND at least one group already shouldn't be routed
  // through onboarding at all — send them straight to the app, same as the
  // root `/` redirect already does.
  useEffect(() => {
    if (!session || groups === undefined) return;
    if (groups.length > 0) {
      router.replace('/(tabs)');
      return;
    }
    void ensureProfileThenContinue(
      session.user.id,
      session.user.email ?? '',
    ).catch(() =>
      setError('We couldn’t finish signing you in. Please try again.'),
    );
  }, [session, groups, ensureProfileThenContinue, router]);

  // Native can't use a plain redirect: the system auth sheet has to hand the
  // callback URL back to us, so we ask Supabase for the URL instead of
  // navigating (skipBrowserRedirect), open it ourselves, then exchange the
  // returned `code` for a session (PKCE — see src/lib/supabase.ts). On web
  // the redirect is the normal one and detectSessionInUrl finishes the job,
  // so there's nothing to exchange here.
  async function signInWith(provider: OAuthProvider) {
    setError(null);
    setPending(provider);
    try {
      const redirectTo = makeRedirectUri();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
      });
      if (oauthError) throw oauthError;
      if (Platform.OS === 'web' || !data?.url) return;

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );
      // Dismissed/cancelled — not an error worth showing, the user chose to back out.
      if (result.type !== 'success') return;

      const code = new URL(result.url).searchParams.get('code');
      if (!code)
        throw new Error('No authorization code returned. Please try again.');

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      // The session lands via useSession(); the effect above routes onward.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sign-in failed. Please try again.',
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <Screen>
      <ThemedText type="smallBold" themeColor="accentText">
        LESS PLANNING. MORE SHARING.
      </ThemedText>
      <ThemedText type="title" style={{ fontSize: 64, lineHeight: 72 }}>
        Salted
      </ThemedText>
      <ThemedText type="subtitle">
        {'Good food.\nOne less group chat.'}
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        Choose meals together, get a ready-to-shop grocery list, and give your
        cook a clear plan.
      </ThemedText>
      <Card>
        <ThemedText type="smallBold">
          A little routine that takes care of dinner.
        </ThemedText>
        <ThemedText>01 Pick dishes everyone can enjoy.</ThemedText>
        <ThemedText>02 Share one shopping list.</ThemedText>
        <ThemedText>03 Send clear instructions to your cook.</ThemedText>
      </Card>
      <Button
        busy={pending === 'google'}
        disabled={pending !== null}
        onPress={() => {
          void signInWith('google');
        }}
      >
        Continue with Google
      </Button>
      {Platform.OS === 'ios' &&
        process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED === 'true' && (
          <Button
            secondary
            busy={pending === 'apple'}
            disabled={pending !== null}
            onPress={() => {
              void signInWith('apple');
            }}
          >
            Continue with Apple
          </Button>
        )}
      {error && <Notice error>{error}</Notice>}
      <ThemedText type="small" themeColor="textSecondary">
        For households that share meals and a cook. Your cook doesn’t need
        another app.
      </ThemedText>
    </Screen>
  );
}
