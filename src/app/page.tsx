import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/access";
import { NewWorkspaceForm } from "@/components/NewWorkspaceForm";

export default async function Root() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const list = await listWorkspacesForUser(user);
  if (list.length > 0) redirect(`/w/${list[0].slug}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Welcome, {user.name ?? user.email}</h1>
      {user.isAppAdmin ? (
        <>
          <p className="mt-2 text-ink-soft">Create your first workspace to get started.</p>
          <div className="mt-6">
            <NewWorkspaceForm />
          </div>
        </>
      ) : (
        <p className="mt-2 text-ink-soft">You don&apos;t have access to any workspaces yet. Ask an admin to add you, then refresh this page.</p>
      )}
    </main>
  );
}
