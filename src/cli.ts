import { type ParseArgsConfig, parseArgs } from "node:util";

// pnpm は `pnpm x:fetch -- --max 300` の `--` もそのまま渡す。npm の書き方で付けても動くように外す
export function cliArgs<O extends NonNullable<ParseArgsConfig["options"]>>(options: O) {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  return parseArgs({ args, options }).values;
}
