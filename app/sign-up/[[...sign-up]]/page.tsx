import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-6">
      <SignUp appearance={{ variables: { colorPrimary: "#c15f3c" } }} />
    </div>
  );
}
