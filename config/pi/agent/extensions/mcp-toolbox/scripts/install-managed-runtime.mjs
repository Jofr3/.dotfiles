import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { get } from "node:https";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.5.0";
const EXPECTED_BYTES = 304_021_960;
const EXPECTED_SHA256 = "7df2d9941ce34e53af0eacc74e09b29f6ac38543b010b637a0938f2dd2d75609";
const SOURCE = new URL(`https://storage.googleapis.com/mcp-toolbox-for-databases/v${VERSION}/linux/amd64/toolbox`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "runtime/linux-amd64/toolbox");
const temporary = `${destination}.download-${process.pid}`;

if (process.platform !== "linux" || process.arch !== "x64") {
	throw new Error("Managed MCP Toolbox runtime installation currently supports only Linux x64.");
}

await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
await rm(temporary, { force: true });

const hash = createHash("sha256");
let bytes = 0;
try {
	await new Promise((resolveDownload, rejectDownload) => {
		const request = get(SOURCE, { timeout: 300_000 }, (response) => {
			if (response.statusCode !== 200) {
				response.resume();
				rejectDownload(new Error(`Managed Toolbox download failed with HTTP ${response.statusCode ?? "unknown"}.`));
				return;
			}
			const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
			response.on("data", (chunk) => {
				bytes += chunk.length;
				if (bytes > EXPECTED_BYTES) response.destroy(new Error("Managed Toolbox download exceeded its pinned size."));
				hash.update(chunk);
			});
			response.once("error", rejectDownload);
			output.once("error", rejectDownload);
			output.once("finish", resolveDownload);
			response.pipe(output);
		});
		request.once("timeout", () => request.destroy(new Error("Managed Toolbox download timed out.")));
		request.once("error", rejectDownload);
	});
	const downloaded = await stat(temporary);
	if (bytes !== EXPECTED_BYTES || downloaded.size !== EXPECTED_BYTES || hash.digest("hex") !== EXPECTED_SHA256) {
		throw new Error("Managed Toolbox download failed its pinned size or SHA-256 check.");
	}
	await chmod(temporary, 0o700);
	await rename(temporary, destination);
	console.log(`Installed pinned Google MCP Toolbox ${VERSION} runtime.`);
} catch (error) {
	await rm(temporary, { force: true });
	throw error;
}
