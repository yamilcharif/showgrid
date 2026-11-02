import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The sign-in email links here. Supports both the default link (?code=) and a token_hash template.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const nextParam = params.get("next") ?? "/account";
  // only same-site paths, so the link can't bounce people to another site
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/account";

  const supabase = await createClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;

  return NextResponse.redirect(new URL(ok ? next : "/sign-in?error=link", request.nextUrl.origin));
}
