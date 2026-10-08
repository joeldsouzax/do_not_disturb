import { ViduApp } from "./ViduApp";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ViduApp configured={Boolean(process.env.REACTOR_API_KEY)} />;
}
