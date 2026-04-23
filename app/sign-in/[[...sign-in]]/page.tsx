import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-6">
      <SignIn appearance={{ variables: { colorPrimary: "#c15f3c" } }} />
    </div>
  );
}
