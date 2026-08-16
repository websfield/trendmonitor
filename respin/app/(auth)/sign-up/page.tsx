import { isGoogleConfigured } from "@respin/auth";
import { AuthForm } from "../auth-form";

export default function SignUpPage() {
  return <AuthForm mode="sign-up" googleEnabled={isGoogleConfigured()} />;
}
