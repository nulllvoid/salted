import { makeRedirectUri } from 'expo-auth-session';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
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
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from('profiles').insert({ id: userId, display_name: emailAddr || 'New member' });
      }

      router.replace('/onboarding/profile');
    },
    [router]
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
    void Promise.resolve().then(() => ensureProfileThenContinue(session.user.id, session.user.email ?? ''));
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

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // Dismissed/cancelled — not an error worth showing, the user chose to back out.
      if (result.type !== 'success') return;

      const code = new URL(result.url).searchParams.get('code');
      if (!code) throw new Error('No authorization code returned. Please try again.');

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      // The session lands via useSession(); the effect above routes onward.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setPending(null);
    }
  }

  const theme = useTheme();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Salted</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Build the next meal in 5 seconds. Your cook gets clear instructions, automatically.
        </ThemedText>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.accent }, pending !== null && styles.disabled]}
          onPress={() => signInWith('google')}
          disabled={pending !== null}>
          <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.background }]}>
            {pending === 'google' ? 'Signing in…' : 'Continue with Google'}
          </ThemedText>
        </Pressable>

        {/* Apple requires its own sign-in button wherever another social
            login is offered, but only on iOS — on Android it degrades to a
            clumsy web flow, so it's hidden there. iOS is out of v1 scope
            (CLAUDE.md), so this stays dormant until an iOS build happens. */}
        {Platform.OS === 'ios' && (
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.divider, backgroundColor: theme.backgroundElement },
              pending !== null && styles.disabled,
            ]}
            onPress={() => signInWith('apple')}
            disabled={pending !== null}>
            <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.text }]}>
              {pending === 'apple' ? 'Signing in…' : 'Continue with Apple'}
            </ThemedText>
          </Pressable>
        )}

        {error && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  secondaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  disabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontFamily: Fonts.bodyBold,
  },
});
