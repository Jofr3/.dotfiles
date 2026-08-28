import { appendFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const prompt = args.at(-1) ?? "";
const systemIndex = args.indexOf("--append-system-prompt");
if (systemIndex >= 0 && !existsSync(args[systemIndex + 1])) process.exit(41);
const task = /<delegated_task>\s*([\s\S]*?)\s*<\/delegated_task>/.exec(prompt)?.[1] ?? prompt;

if (process.env.FAKE_CHILD_START_LOG) {
	appendFileSync(process.env.FAKE_CHILD_START_LOG, `${process.pid}\t${task.replace(/\s+/g, " ")}\n`, "utf8");
}
if (task.includes("NO_EVENTS")) process.exit(0);
if (task.includes("FAIL_BEFORE_OUTPUT")) {
	process.stderr.write("synthetic child failure\n");
	process.exit(7);
}
if (task.includes("PRIORITY_REJECT") && process.env.PI_DYNAMIC_SUBAGENT_SERVICE_TIER === "priority") {
	process.stderr.write("unsupported priority tier\n");
	process.exit(8);
}
if (task.includes("TOOL")) {
	console.log(JSON.stringify({ type: "tool_execution_start", toolName: "read", args: { path: "fixture.txt" } }));
	console.log(JSON.stringify({
		type: "tool_execution_end",
		toolName: "read",
		isError: false,
		result: { usage: { input: 2, output: 3, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 } } },
	}));
}

let output = `child:${task}`;
if (task.includes("EMPTY")) output = "";
if (task.includes("LONG")) output = "🙂".repeat(800);
if (task.includes("ENV")) {
	output = JSON.stringify({
		sessionId: process.env.PI_SESSION_ID ?? null,
		sessionFile: process.env.PI_SESSION_FILE ?? null,
		provider: process.env.PI_PROVIDER ?? null,
		model: process.env.PI_MODEL ?? null,
		reasoning: process.env.PI_REASONING_LEVEL ?? null,
		child: process.env.PI_DYNAMIC_SUBAGENT_CHILD ?? null,
	});
}

console.log(JSON.stringify({
	type: "message_end",
	message: {
		role: "assistant",
		content: output ? [{ type: "text", text: output }] : [],
		usage: {
			input: 10,
			output: 4,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 14,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.02 },
		},
		stopReason: "stop",
		provider: "fake",
		model: "fake-model",
	},
}));

if (task.includes("PARTIAL_FAIL")) {
	process.stderr.write("synthetic failure after partial output\n");
	process.exit(9);
}
if (task.includes("HANG")) await new Promise(() => setInterval(() => {}, 1000));
