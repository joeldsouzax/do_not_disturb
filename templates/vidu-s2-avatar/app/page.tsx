import { VoiceTable } from "./VoiceTable";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VoiceTable
      configured={Boolean(
        process.env.GOOGLE_AI_STUDIO_KEY && process.env.REACTOR_API_KEY
      )}
    />
  );
}
