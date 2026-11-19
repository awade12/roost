import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors } from "../../../components/theme.ts";
import { Button } from "../../../components/ui/Button.tsx";
import { errorMessage } from "../../../lib/api-error.ts";
import { useStartOtp, useVerifyOtp } from "../api/use-auth.ts";
import { CodeBoxes } from "./CodeBoxes.tsx";

const RESEND_AFTER_S = 45;

export function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const start = useStartOtp();
  const send = () => start.mutate(email.trim(), { onSuccess: () => onSent(email.trim()) });
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-[13px] font-medium text-muted">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@studio.com"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={send}
          selectionColor={colors.chart}
          className="h-[52px] rounded-xl border border-[#3a3a3a] bg-panel px-4 text-[17px] text-fg"
        />
      </View>
      {start.error ? <Text className="text-sm text-danger">{errorMessage(start.error)}</Text> : null}
      <Button label="Email me a code" onPress={send} disabled={!email.includes("@")} loading={start.isPending} />
    </View>
  );
}

function useCountdown(from: number) {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(from)] as const;
}

export function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const verify = useVerifyOtp();
  const resend = useStartOtp();
  const [left, restart] = useCountdown(RESEND_AFTER_S);
  const change = (v: string) => {
    setCode(v);
    if (v.length === 6) verify.mutate({ email, code: v }, { onError: () => setCode("") });
  };
  return (
    <View className="gap-3">
      <View className="pb-2">
        <CodeBoxes value={code} onChange={change} disabled={verify.isPending} />
      </View>
      {verify.error ? <Text className="text-sm text-danger">{errorMessage(verify.error)}</Text> : null}
      <Button label="Use a different email" variant="secondary" onPress={onBack} />
      <Pressable
        disabled={left > 0 || resend.isPending}
        onPress={() => resend.mutate(email, { onSuccess: restart })}
        className="items-center pt-3"
      >
        <Text className={`font-mono text-xs ${left > 0 ? "text-dim" : "text-muted underline"}`}>
          {left > 0 ? `Didn't get it? Resend in 0:${String(left).padStart(2, "0")}` : resend.isPending ? "Sending…" : "Resend the code"}
        </Text>
      </Pressable>
    </View>
  );
}
