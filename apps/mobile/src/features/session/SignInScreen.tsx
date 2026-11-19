import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Wordmark } from "../../components/brand/Wordmark.tsx";
import { config } from "../../lib/config.ts";
import { CodeStep, EmailStep } from "./sign-in/Steps.tsx";

/** Bottom-weighted so the field and button sit under your thumb. Matches Paper M-01 / M-02. */
export function SignInScreen() {
  const [email, setEmail] = useState<string | null>(null);
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end gap-10 px-6 pb-6">
        <View className="gap-5">
          <Wordmark width={120} />
          <Text className="text-[34px] font-semibold leading-[38px] tracking-tight text-fg">{email ? "Check your\ninbox." : "Your games,\nin your pocket."}</Text>
          {email ? (
            <Text className="text-base leading-[23px] text-muted">
              We sent a 6-digit code to <Text className="text-fg">{email}</Text>. It works for 10 minutes.
            </Text>
          ) : (
            <Text className="text-base leading-[23px] text-muted">Sign in with the email you use for the dashboard. We'll send you a 6-digit code.</Text>
          )}
        </View>
        <View className="gap-6">
          {email ? <CodeStep email={email} onBack={() => setEmail(null)} /> : <EmailStep onSent={setEmail} />}
          {email ? null : <Text className="text-center font-mono text-xs text-[#707070]">{config.serverUrl.replace(/^https?:\/\//, "")}</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
