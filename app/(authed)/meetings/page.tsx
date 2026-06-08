import { redirect } from "next/navigation";

// Meetings folded into Sources › Meetings (Phase 0 IA).
export default function MeetingsPage() {
  redirect("/sources");
}
