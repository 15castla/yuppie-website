import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/Button";
import { signOut } from "./actions";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminClient = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-24 text-center text-foreground">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Admin Dashboard
      </h1>
      <p className="text-base text-foreground/70">Signed in as {user.email}</p>
      <p className="max-w-md text-sm text-foreground/60">
        Application review tools are coming soon.
      </p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
