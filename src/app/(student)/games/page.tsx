import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { InteractiveGames } from "@/components/interactive-games";

export default async function Page() {
  const { db, profile } = await requirePage();
  const [historyResult, premiumGamesResult] = await Promise.all([
    db
      .from("learning_game_sessions")
      .select("id,mode,status,correct_count,question_count,started_at")
      .eq("user_id", profile.id)
      .order("started_at", { ascending: false })
      .limit(10),
    db.rpc("has_entitlement", { p_feature: "premium_games" }),
  ]);
  return <InteractiveGames history={check(historyResult)} tier={check(premiumGamesResult) ? "PREMIUM" : "FREE"} />;
}
