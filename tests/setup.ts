import { vi } from "vitest";

const blockNetwork = () => {
  throw new Error("Network access is blocked in unit tests.");
};

if (typeof fetch !== "undefined") {
  vi.stubGlobal("fetch", blockNetwork);
}
