import { AdventureTable } from "../AdventureTable";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string }>;
}) {
  const params = await searchParams;
  return (
    <AdventureTable
      configured={Boolean(process.env.GOOGLE_AI_STUDIO_KEY)}
      reactorConfigured={Boolean(process.env.REACTOR_API_KEY)}
      initialEngine={
        params.engine === "fast"
          ? "fast"
          : params.engine === "h3"
            ? "h3"
            : "lingbot"
      }
    />
  );
}
