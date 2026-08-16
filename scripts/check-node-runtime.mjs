import { fileURLToPath } from "node:url";

export const EXPECTED_NODE_VERSION = "22.23.1";

export function assertExpectedNodeVersion(actualVersion) {
  const normalizedVersion = actualVersion.replace(/^v/, "");
  if (normalizedVersion !== EXPECTED_NODE_VERSION) {
    throw new Error(
      `Node.js ${EXPECTED_NODE_VERSION} is required; found ${actualVersion}. Run "nvm use" and retry.`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertExpectedNodeVersion(process.version);
  } catch (error) {
    console.error(`[node-version] ${error.message}`);
    process.exitCode = 1;
  }
}
