import {
  deployedApiSha,
  deployedApiSpec,
  verifyApiContract
} from "./api-contract.mjs";

// Production still resolves the API from the live server, independently of the
// pinned target used by ordinary CI. stdout remains only the checked API SHA.
export async function checkDeployedApiContract() {
  const sha = deployedApiSha();
  await verifyApiContract({ sha, spec: deployedApiSpec(sha) });
  return sha;
}

if (import.meta.main) {
  if (process.argv.length !== 2)
    throw new Error(
      "deployed API verification does not accept a target override"
    );
  console.log(await checkDeployedApiContract());
}
