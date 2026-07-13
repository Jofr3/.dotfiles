export interface RankableTab {
	ref: string;
	ordinal: number;
	title?: string;
	url?: string;
}

export interface RankedTab<T extends RankableTab> {
	tab: T;
	rank: number;
}

/** Normalize only already-sanitized, public tab metadata for deterministic matching. */
export function normalizeTabSearch(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function matchRank(tab: RankableTab, normalizedQuery: string): number | undefined {
	const ref = normalizeTabSearch(tab.ref);
	const title = normalizeTabSearch(tab.title ?? "");
	const url = normalizeTabSearch(tab.url ?? "");
	if (ref === normalizedQuery) return 0;
	if (title && title === normalizedQuery) return 1;
	if (url && url === normalizedQuery) return 2;
	if (title.startsWith(normalizedQuery)) return 3;
	if (url.startsWith(normalizedQuery)) return 4;
	if (title.includes(normalizedQuery)) return 5;
	if (url.includes(normalizedQuery)) return 6;
	return undefined;
}

/**
 * Rank title/URL search without selecting. Ties always use the session-scoped
 * ordinal, so results do not depend on asynchronous title lookup timing.
 */
export function rankTabCandidates<T extends RankableTab>(tabs: readonly T[], query?: string): Array<RankedTab<T>> {
	const normalizedQuery = query === undefined ? "" : normalizeTabSearch(query);
	if (!normalizedQuery) {
		return [...tabs]
			.sort((left, right) => left.ordinal - right.ordinal)
			.map((tab) => ({ tab, rank: 7 }));
	}
	return tabs
		.map((tab) => {
			const rank = matchRank(tab, normalizedQuery);
			return rank === undefined ? undefined : { tab, rank };
		})
		.filter((candidate): candidate is RankedTab<T> => candidate !== undefined)
		.sort((left, right) => left.rank - right.rank || left.tab.ordinal - right.tab.ordinal);
}

export function formatTabRef(runtimeNonce: string, generation: number, ordinal: number): string {
	if (!/^[a-f0-9]{16}$/.test(runtimeNonce)) throw new Error("Invalid tab-reference runtime nonce");
	if (!Number.isSafeInteger(generation) || generation < 1) throw new Error("Invalid tab-reference generation");
	if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error("Invalid tab-reference ordinal");
	return `tab_${runtimeNonce}_${generation}_${ordinal}`;
}
