import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Logo } from "../../../components/ui/index.ts";
import { useStartOtp, useVerifyOtp } from "../api/use-auth.ts";

const link = "text-xs text-muted hover:text-fg disabled:opacity-50";

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-danger">{children}</p>;
}

type EmailStepProps = { email: string; setEmail: (v: string) => void; onSent: () => void };

function EmailStep({ email, setEmail, onSent }: EmailStepProps) {
  const start = useStartOtp();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start.mutate(email, { onSuccess: onSent });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Email">
        <Input
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button variant="primary" className="h-9" disabled={start.isPending}>
        {start.isPending ? "Sending…" : "Continue with email"}
      </Button>
      {start.error && <ErrorText>{start.error.message}</ErrorText>}
    </form>
  );
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const verify = useVerifyOtp();
  const resend = useStartOtp();
  const error = verify.error ?? resend.error;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    verify.mutate({ email, code });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-[13px] leading-5 text-muted">
        If <span className="text-fg">{email}</span> can sign in, a 6-digit code is on its way. It expires in 10
        minutes.
      </p>
      <Input
        size="lg"
        mono
        inputClassName="text-center text-lg tracking-[0.5em]"
        required
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        aria-label="Sign-in code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <Button variant="primary" className="h-9" disabled={verify.isPending || code.length !== 6}>
        {verify.isPending ? "Checking…" : "Sign in"}
      </Button>
      <div className="flex justify-between">
        <button type="button" className={link} onClick={onBack}>
          Use a different email
        </button>
        <button type="button" className={link} disabled={resend.isPending} onClick={() => resend.mutate(email)}>
          {resend.isSuccess ? "New code sent" : "Send a new code"}
        </button>
      </div>
      {error && <ErrorText>{error.message}</ErrorText>}
    </form>
  );
}

/** Two steps: email, then the emailed 6-digit code. The first sign-in creates the account. */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[340px] flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo height={28} className="text-fg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight">Sign in to Roost</h1>
            <p className="text-[13px] text-muted">No password. We'll email you a code.</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-panel p-5">
          {step === "email" ? (
            <EmailStep email={email} setEmail={setEmail} onSent={() => setStep("code")} />
          ) : (
            <CodeStep email={email} onBack={() => setStep("email")} />
          )}
        </div>
      </div>
    </div>
  );
}
