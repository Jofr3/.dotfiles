function invalidMySqlConnection(): never {
	throw new Error("Invalid MySQL URL or Go-style TCP DSN.");
}

function decodeDatabaseName(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return invalidMySqlConnection();
	}
}

/** Normalize a mysql:// URL or go-sql-driver/mysql TCP DSN into a mysql:// URL. */
export function normalizeMySqlUrl(raw: string): string {
	const value = raw.trim();
	if (/^mysql:\/\//i.test(value)) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return invalidMySqlConnection();
		}
		if (url.protocol.toLowerCase() !== "mysql:" || !url.hostname || url.hash) return invalidMySqlConnection();
		return url.toString();
	}

	// Go DSN: username[:password]@tcp(host[:port])/database[?parameters].
	// Locate the network marker before interpreting '?' or '@', because both are valid in a Go DSN password.
	const networkMarker = value.lastIndexOf("@tcp(");
	if (networkMarker <= 0) return invalidMySqlConnection();
	const addressStart = networkMarker + "@tcp(".length;
	const addressEnd = value.indexOf(")/", addressStart);
	if (addressEnd < 0) return invalidMySqlConnection();

	const credentials = value.slice(0, networkMarker);
	const credentialSeparator = credentials.indexOf(":");
	const username = credentialSeparator < 0 ? credentials : credentials.slice(0, credentialSeparator);
	const password = credentialSeparator < 0 ? "" : credentials.slice(credentialSeparator + 1);
	if (!username) return invalidMySqlConnection();

	const address = value.slice(addressStart, addressEnd);
	if (!address || /[\s/?#@]/.test(address)) return invalidMySqlConnection();
	let url: URL;
	try {
		url = new URL(`mysql://${address}`);
	} catch {
		return invalidMySqlConnection();
	}
	if (!url.hostname || url.username || url.password || url.pathname || url.search || url.hash) {
		return invalidMySqlConnection();
	}

	const databaseAndQuery = value.slice(addressEnd + ")/".length);
	const querySeparator = databaseAndQuery.indexOf("?");
	const encodedDatabase = querySeparator < 0 ? databaseAndQuery : databaseAndQuery.slice(0, querySeparator);
	const query = querySeparator < 0 ? "" : databaseAndQuery.slice(querySeparator + 1);
	if (encodedDatabase.includes("#") || query.includes("#")) return invalidMySqlConnection();
	const database = decodeDatabaseName(encodedDatabase);

	// URL setters preserve raw '%' characters, so encode first to produce valid URI credentials.
	url.username = encodeURIComponent(username);
	url.password = encodeURIComponent(password);
	url.pathname = `/${encodeURIComponent(database)}`;
	if (querySeparator >= 0) url.search = new URLSearchParams(query).toString();
	return url.toString();
}
