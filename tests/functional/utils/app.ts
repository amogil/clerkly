import fs from "fs/promises";
import os from "os";
import path from "path";
import electronPath from "electron";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

const repoRoot = path.resolve(__dirname, "../../..");
const appEntry = path.join(repoRoot, "dist", "main.js");

export type AuthStubMode = "success" | "failure";
export type LaunchOptions = {
  authMode: AuthStubMode;
  authSequence?: AuthStubMode[];
};

export const createUserDataDir = async (): Promise<string> => {
  return fs.mkdtemp(path.join(os.tmpdir(), "clerkly-e2e-"));
};

export const cleanupUserDataDir = async (userDataDir: string): Promise<void> => {
  await fs.rm(userDataDir, { recursive: true, force: true });
};

export const launchApp = async (
  userDataDir: string,
  options: LaunchOptions,
): Promise<{ app: ElectronApplication; page: Page }> => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (options.authSequence) {
    env.CLERKLY_E2E_AUTH_SEQUENCE = options.authSequence.join(",");
  } else {
    delete env.CLERKLY_E2E_AUTH_SEQUENCE;
  }

  // Requirements: testing-infrastructure.5.1
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appEntry],
    cwd: repoRoot,
    env: {
      ...env,
      CLERKLY_E2E_AUTH_MODE: options.authMode,
      CLERKLY_E2E_USER_DATA: userDataDir,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
};
