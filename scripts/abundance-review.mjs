// Notes from the "Abundance" list, read by Claude in the daily procedure (docs/DAILY_PROCEDURE.md).
//   pnpm abundance:review --list                # new notes -> reports/abundance/<date>/new.json
//   pnpm abundance:review --submit=marks.json   # [{ id, status: "read" | "valued" | "done", teamNote?, thanks? }]
// Every listed note gets a mark so it is not read twice; `thanks` goes to the author through the Nova inbox.
// Finished proposals go into docs/abundance/PROPOSALS.md, the raw text stays in Supabase (the repo is public).
import "./lib/envProxy.mjs";
import { getJson, parseArgs, postJson, readJsonFile, saveReport } from "./lib/claudeActions.mjs";

const args = parseArgs();
const path = "/api/internal/abundance";

if (args.list) {
  const payload = await getJson(path);
  const file = saveReport("abundance", "new.json", payload);
  const fromOperator = payload.notes.filter((note) => note.operator).length;
  console.log(`${payload.notes.length} new notes (${fromOperator} from the operator). Saved: ${file}`);
} else if (args.submit) {
  for (const mark of readJsonFile(args.submit)) {
    const { status, text } = await postJson(path, mark);
    console.log(mark.id, status, text);
  }
} else {
  console.error("Use --list or --submit=<file>.");
  process.exit(1);
}
