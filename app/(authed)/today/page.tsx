import { redirect } from "next/navigation";

// Today folded into the Feed (Phase 0 IA).
export default function TodayPage() {
  redirect("/feed");
}
