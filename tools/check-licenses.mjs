// Every runtime dependency must appear in THIRD_PARTY_NOTICES.md, and no GPL/AGPL licence may
// ship (LGPL only for the allow-listed lamejs chunk). Exit 1 on a violation.
import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8").toLowerCase();
const LGPL_OK = new Set(["@breezystack/lamejs"]);
const problems = [];
for (const name of Object.keys(pkg.dependencies ?? {})) {
  const p = `node_modules/${name}/package.json`;
  const lic = existsSync(p) ? String(JSON.parse(readFileSync(p, "utf8")).license ?? "UNKNOWN") : "UNINSTALLED";
  const short = name.replace(/^@[^/]+\//, "").toLowerCase();
  const scope = name.split("/")[0].replace("@", "").toLowerCase();
  if (!notices.includes(short) && !notices.includes(scope)) problems.push(`${name} (${lic}) is not listed in THIRD_PARTY_NOTICES.md`);
  if (/\bA?GPL\b/i.test(lic) && !/LGPL/i.test(lic)) problems.push(`${name} is ${lic}: GPL code may not ship`);
  if (/LGPL/i.test(lic) && !LGPL_OK.has(name)) problems.push(`${name} is ${lic}: only allow-listed LGPL modules may ship`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`licences OK: ${Object.keys(pkg.dependencies ?? {}).length} runtime dependencies listed and allowed`);
