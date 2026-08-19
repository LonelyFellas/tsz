const DEFAULT_MAX_WORKERS = 2;

export function buildCoverageVitestArgs(cliArgs) {
  const forwardedArgs = cliArgs[0] === "--" ? cliArgs.slice(1) : cliArgs;
  const hasExplicitMaxWorkers = forwardedArgs.some(
    (arg) => arg === "--maxWorkers" || arg.startsWith("--maxWorkers=")
  );

  return [
    "run",
    "--coverage",
    ...(hasExplicitMaxWorkers ? [] : [`--maxWorkers=${DEFAULT_MAX_WORKERS}`]),
    ...forwardedArgs
  ];
}
