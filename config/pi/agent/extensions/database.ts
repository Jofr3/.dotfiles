/**
 * Secure direct database_query extension.
 *
 * The implementation lives under database-query/ so its protocol, profile parser,
 * SQL policy, bounded output, and process runner can be tested independently.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDatabaseExtension } from "./database-query/extension.ts";

export { registerDatabaseExtension } from "./database-query/extension.ts";

export default function databaseExtension(pi: ExtensionAPI): void {
	registerDatabaseExtension(pi);
}
