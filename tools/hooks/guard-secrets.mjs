// Kiro PreToolUse hook: block shell commands that would stage, commit or push signing secrets.
// Reads the hook payload (JSON) on stdin; exit 2 blocks the tool call with the reason on stderr.
import { execFileSync } from "node:child_process";

let raw = "";
for await (const c of process.stdin) raw += c;
let cmd = "";
try {
  const p = JSON.parse(raw || "{}");
  cmd = JSON.stringify(p.tool_input ?? p.toolInput ?? p.input ?? p);
} catch {
  cmd = raw;
}
const SECRET = /(\.jks|\.keystore|keystore\.properties|upload-key|\.p12|google-services\.json)/i;
if (/git\s+(add|commit|push)/.test(cmd)) {
  if (SECRET.test(cmd) && /git\s+add/.test(cmd)) {
    console.error("Blocked: this command stages a signing secret (keystore / keystore.properties). Keep release keys out of git.");
    process.exit(2);
  }
  try {
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
    const bad = staged.split("\n").filter((f) => SECRET.test(f));
    if (bad.length && /git\s+(commit|push)/.test(cmd)) {
      console.error(`Blocked: signing secrets are staged: ${bad.join(", ")}. Run git restore --staged on them first.`);
      process.exit(2);
    }
  } catch {
    /* not a git repo yet */
  }
}
process.exit(0);
