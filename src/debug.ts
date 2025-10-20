#!/usr/bin/env node

import { build, listTests, runTests } from "./xcodebuild.js";

function getFlag(flagName: string): string | undefined {
  const args = process.argv.slice(2);
  
  for (const arg of args) {
    if (arg.startsWith(`--${flagName}=`)) {
      return arg.split("=", 2)[1];
    } else if (arg === `--${flagName}`) {
      return "YES";
    }
  }
  
  return undefined;
}

(async () => {
  const action = getFlag("action");
  const scheme = getFlag("scheme");
  const src = getFlag("src");

  if (!action || !scheme || !src) {
    console.error("Missing required arguments");
    process.exit(1);
  }
  
  if (action === "build" || action === "build-tests") {
    const result = await build({
      scheme,
      src,
      forTesting: action === "build-tests",
    });
    console.log(result);
  } else if (action === "list-tests") {
    const result = await listTests({ scheme, src });
    console.log(result);
  } else if (action === "run-tests") {
    const result = await runTests({
      scheme,
      src,
      coverage: Boolean(getFlag("coverage")),
      only: getFlag("only"),
    });
    console.log(result);
  } else {
    console.log("Unknown action: " + action);
    process.exit(1);
  }
})();
