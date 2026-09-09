import { H3App } from "./H3App";
import { SetupRequired } from "./SetupRequired";

export const dynamic = "force-dynamic";

export default function Page() {
  return process.env.REACTOR_API_KEY ? <H3App /> : <SetupRequired />;
}
