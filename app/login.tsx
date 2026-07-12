import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { colors, fonts } from '../lib/theme'
import { DISCOVERY, exchangeWhoopCode } from '../lib/whoop'
import { syncUserRow } from '../lib/auth'

const CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID!
const WHOOP_SCOPES = ['offline', 'read:cycles', 'read:body_measurement', 'read:profile']

export default function LoginScreen() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'dimer', path: 'auth/callback' })
  const discovery = DISCOVERY

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: WHOOP_SCOPES,
      redirectUri,
      usePKCE: true,
    },
    discovery
  )

  async function handleConnect() {
    console.log('[Whoop] redirect_uri:', redirectUri)
    console.log('[Whoop] request ready:', !!request)
    const result = await promptAsync()
    console.log('[Whoop] promptAsync result:', JSON.stringify(result))
    if (result.type !== 'success') return
    try {
      // Exchange goes through the whoop-proxy edge function: Whoop's token
      // endpoint has no CORS headers, and the client secret lives server-side.
      const ok = await exchangeWhoopCode({
        code: result.params.code,
        redirect_uri: redirectUri,
        code_verifier: request!.codeVerifier!,
      })
      if (!ok) return
      // Create the Supabase users row now that we have a Whoop identity, so
      // food saves (which FK to users) work immediately.
      await syncUserRow()
      router.replace('/dashboard')
    } catch (e) {
      console.log('[Whoop] token exchange error:', e)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <Text style={s.logo}>DIMER</Text>
          <Text style={s.tagline}>KNOW YOUR DEFICIT. OWN YOUR DAY.</Text>
        </View>

        {/* Decorative ring */}
        <View style={s.ringWrap}>
          <Svg width={130} height={130} viewBox="0 0 130 130" style={{ transform: [{ rotate: '-90deg' }] }}>
            <Defs>
              <LinearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={colors.ring.from} />
                <Stop offset="100%" stopColor={colors.ring.to} />
              </LinearGradient>
            </Defs>
            <Circle cx={65} cy={65} r={52} stroke={colors.cardBorder} strokeWidth={11} fill="none" />
            <Circle cx={65} cy={65} r={52} stroke="url(#lg)" strokeWidth={11} fill="none"
              strokeDasharray={327} strokeDashoffset={82} strokeLinecap="round" />
          </Svg>
          <View style={s.ringIcon}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.5}>
              <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </View>

        {/* Copy */}
        <View style={s.copy}>
          <Text style={s.heading}>Connect Your Whoop</Text>
          <Text style={s.body}>
            Dimer reads your daily burn from Whoop so you always know exactly how much room you have to eat.
          </Text>
        </View>

        {/* CTA */}
        <View style={s.ctaWrap}>
          <Pressable
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
            onPress={handleConnect}
            accessibilityLabel="Connect with Whoop"
          >
            <Text style={s.ctaText}>Connect with Whoop →</Text>
          </Pressable>
          <Text style={s.ctaSub}>Requires Whoop 4.0+ · OAuth 2.0 PKCE</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingBottom: 16 },
  logoWrap: { alignItems: 'center', paddingTop: 32 },
  logo: { fontFamily: fonts.display, fontSize: 44, color: colors.primary, letterSpacing: 4 },
  tagline: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, letterSpacing: 2, marginTop: 6 },
  ringWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative', height: 140 },
  ringIcon: { position: 'absolute' },
  copy: { gap: 10 },
  heading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  ctaWrap: { gap: 10 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  ctaText: { fontFamily: fonts.labelSemiBold, fontSize: 14, color: colors.bg, letterSpacing: 1, textTransform: 'uppercase' },
  ctaSub: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, textAlign: 'center' },
})
