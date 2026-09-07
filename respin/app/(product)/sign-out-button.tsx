"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@respin/auth/client";
import { buttonClass } from "../ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={buttonClass("quiet")}
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
