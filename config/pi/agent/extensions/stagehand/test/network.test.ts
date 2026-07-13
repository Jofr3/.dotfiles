import assert from "node:assert/strict";
import test from "node:test";
import { isNonPublicIp } from "../src/network.ts";

test("private and metadata IPv4 ranges are blocked", () => {
	for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "224.0.0.1"]) {
		assert.equal(isNonPublicIp(address), true, address);
	}
	assert.equal(isNonPublicIp("8.8.8.8"), false);
});

test("IPv4-mapped IPv6 literals cannot bypass private-network classification", () => {
	for (const address of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1", "::ffff:a9fe:a9fe"]) {
		assert.equal(isNonPublicIp(address), true, address);
	}
	assert.equal(isNonPublicIp("::ffff:808:808"), false);
});

test("private, loopback, link-local, and multicast IPv6 ranges are blocked", () => {
	for (const address of ["::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1"]) {
		assert.equal(isNonPublicIp(address), true, address);
	}
	assert.equal(isNonPublicIp("2001:4860:4860::8888"), false);
});
