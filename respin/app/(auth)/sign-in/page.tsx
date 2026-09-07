import { isGoogleConfigured } from "@respin/auth";
import { AuthForm } from "../auth-form";

export default function SignInPage() {
  return <AuthForm mode="sign-in" googleEnabled={isGoogleConfigured()} />;
}
