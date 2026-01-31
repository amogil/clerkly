import { describe, expect, it } from "vitest";

import { readText } from "../utils/fs";

const REQUIREMENT_IDS = [
  "platform-foundation.1.1",
  "platform-foundation.1.2", 
  "platform-foundation.1.3",
  "platform-foundation.1.4",
  "platform-foundation.1.5",
  "platform-foundation.1.6",
  "platform-foundation.2.1",
  "platform-foundation.2.2",
  "platform-foundation.2.3",
  "platform-foundation.2.4",
  "platform-foundation.2.5",
  "platform-foundation.2.6",
  "branding-system.1.1",
  "branding-system.1.2",
  "sidebar-navigation.1.1",
  "sidebar-navigation.1.2",
  "sidebar-navigation.1.3",
  "sidebar-navigation.1.4",
  "sidebar-navigation.1.5",
  "sidebar-navigation.1.6",
  "sidebar-navigation.1.7",
  "sidebar-navigation.1.8",
  "data-storage.1.1",
  "data-storage.1.2",
  "data-storage.1.3",
  "data-storage.1.4",
  "data-storage.1.5",
  "data-storage.1.6",
  "google-oauth-auth.1.1",
  "google-oauth-auth.1.2",
  "google-oauth-auth.1.3",
  "google-oauth-auth.1.4",
  "google-oauth-auth.1.5",
  "google-oauth-auth.1.6",
  "google-oauth-auth.1.7",
  "google-oauth-auth.1.8",
  "google-oauth-auth.1.9",
  "google-oauth-auth.1.10",
  "google-oauth-auth.1.11",
  "google-oauth-auth.1.12",
  "google-oauth-auth.1.13",
  "google-oauth-auth.1.14",
  "google-oauth-auth.1.15",
  "google-oauth-auth.1.16",
  "google-oauth-auth.1.17",
  "google-oauth-auth.1.18",
  "google-oauth-auth.1.19",
  "google-oauth-auth.1.20",
  "google-oauth-auth.1.21",
  "google-oauth-auth.1.22",
  "google-oauth-auth.1.23",
  "google-oauth-auth.1.24",
  "platform-foundation.3.1",
  "platform-foundation.3.2",
  "platform-foundation.3.3",
  "platform-foundation.4.1",
  "platform-foundation.4.2",
  "testing-infrastructure.1.1",
  "testing-infrastructure.1.2",
  "testing-infrastructure.1.3",
  "testing-infrastructure.1.4",
  "testing-infrastructure.1.5",
  "testing-infrastructure.1.6",
  "testing-infrastructure.1.7",
  "testing-infrastructure.1.8",
  "testing-infrastructure.1.9",
  "testing-infrastructure.1.10",
  "testing-infrastructure.1.11",
  "testing-infrastructure.1.12",
  "testing-infrastructure.1.13",
  "testing-infrastructure.1.14",
  "testing-infrastructure.1.15",
  "testing-infrastructure.1.16",
  "testing-infrastructure.1.17",
  "testing-infrastructure.1.18",
  "testing-infrastructure.1.19",
];

const TEST_FILES = [
  "tests/requirements/platform.test.ts",
  "tests/requirements/tooling.test.ts",
  "tests/requirements/ui.test.ts",
  "tests/requirements/storage.test.ts",
  "tests/requirements/auth.test.ts",
  "tests/requirements/ipc.test.ts",
  "tests/requirements/logging.test.ts",
  "tests/requirements/testing.test.ts",
];

describe("Requirement coverage", () => {
  /* Preconditions: requirement test files exist.
     Action: scan tests for requirement IDs.
     Assertions: each requirement is referenced in test comments.
     Requirements: testing-infrastructure.1.1 */
  it("covers each requirement in unit tests", () => {
    const contents = TEST_FILES.map((file) => readText(file)).join("\n");

    for (const id of REQUIREMENT_IDS) {
      expect(contents).toContain(id);
    }
  });
});
