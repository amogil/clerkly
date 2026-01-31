import { describe, expect, it } from "vitest";

import { readText } from "../utils/fs";

const REQUIREMENT_IDS = [
  "E.P.1",
  "E.P.2",
  "E.P.3",
  "E.P.4",
  "E.P.6",
  "E.P.7",
  "E.T.1",
  "E.T.4",
  "E.T.5",
  "E.T.6",
  "E.T.7",
  "E.T.8",
  "E.U.1",
  "E.U.2",
  "E.U.3",
  "E.U.4",
  "E.U.5",
  "E.U.6",
  "E.U.7",
  "E.U.8",
  "E.U.9",
  "E.U.10",
  "E.S.1",
  "E.S.2",
  "E.S.3",
  "E.S.4",
  "E.S.5",
  "E.S.6",
  "E.S.7",
  "E.A.1",
  "E.A.2",
  "E.A.3",
  "E.A.4",
  "E.A.5",
  "E.A.6",
  "E.A.7",
  "E.A.8",
  "E.A.11",
  "E.A.12",
  "E.A.13",
  "E.A.14",
  "E.A.15",
  "E.A.16",
  "E.A.18",
  "E.A.19",
  "E.A.20",
  "E.A.21",
  "E.A.22",
  "E.A.23",
  "E.A.24",
  "E.A.25",
  "E.A.26",
  "E.A.27",
  "E.I.1",
  "E.I.2",
  "E.I.3",
  "E.Q.1",
  "E.Q.2",
  "E.TE.1",
  "E.TE.2",
  "E.TE.3",
  "E.TE.4",
  "E.TE.5",
  "E.TE.6",
  "E.TE.7",
  "E.TE.8",
  "E.TE.9",
  "E.TE.10",
  "E.TE.11",
  "E.TE.12",
  "E.TE.13",
  "E.TE.14",
  "E.TE.15",
  "E.TE.16",
  "E.TE.17",
  "E.TE.18",
  "E.TE.19",
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
     Requirements: E.TE.1 */
  it("covers each requirement in unit tests", () => {
    const contents = TEST_FILES.map((file) => readText(file)).join("\n");

    for (const id of REQUIREMENT_IDS) {
      expect(contents).toContain(id);
    }
  });
});
