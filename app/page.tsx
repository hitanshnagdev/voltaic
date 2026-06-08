import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Landing from "@/components/landing";

export const metadata = {
  title: "Voltaic — Working memory for construction",
  description:
    "Voltaic joins your construction meetings, drafts your RFIs, change orders, and compliance reports, and flags anything said that contradicts the contract — every claim cited to the source document.",
};

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/feed");
  return <Landing />;
}
