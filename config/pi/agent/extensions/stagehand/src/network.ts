import { isIP } from "node:net";

/** Classify literal IPs that must not be reached without private-network opt-in. */
export function isNonPublicIp(rawAddress: string): boolean {
	const address = rawAddress.replace(/^\[|\]$/g, "").toLowerCase();
	if (isIP(address) === 4) {
		const [a, b] = address.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 0 || b === 168)) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224
		);
	}
	if (isIP(address) === 6) {
		if (address.startsWith("::ffff:")) {
			const mapped = address.slice(7);
			if (isIP(mapped) === 4) return isNonPublicIp(mapped);
			const hexadecimal = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
			if (hexadecimal) {
				const high = Number.parseInt(hexadecimal[1], 16);
				const low = Number.parseInt(hexadecimal[2], 16);
				return isNonPublicIp(`${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`);
			}
		}
		return (
			address === "::" ||
			address === "::1" ||
			address.startsWith("fc") ||
			address.startsWith("fd") ||
			address.startsWith("fe8") ||
			address.startsWith("fe9") ||
			address.startsWith("fea") ||
			address.startsWith("feb") ||
			address.startsWith("ff")
		);
	}
	return false;
}
