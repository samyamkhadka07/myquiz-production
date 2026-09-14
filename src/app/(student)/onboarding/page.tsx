import { redirect } from "next/navigation";
import { StudentOnboarding } from "@/components/student-onboarding";
import { requirePage } from "@/lib/server/auth";
import { taxonomy } from "@/lib/server/data";

export default async function Page() {
  const { profile } = await requirePage();
  if (profile.onboarding_completed_at) redirect("/dashboard");
  return (
    <>
      <p className="eyebrow">A focused start</p>
      <h1>Build your MEC preparation plan</h1>
      <p>
        Three short choices give MyQuiz a useful starting point. Your persisted learning evidence
        takes over as you practice.
      </p>
      <StudentOnboarding taxonomy={await taxonomy()} />
    </>
  );
}
