// Handshake test for the creature-adb MCP server: initialize, list tools, call `devices`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["tools/mcp/adb-mcp.mjs"] }));
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const r = await client.callTool({ name: "devices", arguments: {} });
console.log(r.content[0].text.trim());
await client.close();
