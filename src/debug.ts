#!/usr/bin/env node

import { build, listTests, runTests } from "./xcodebuild.js";

(async () => {
  const action = process.argv[2];
  const scheme = process.argv[3];
  const src = process.argv[4];
  if (action === "build" || action === "build-tests") {
    const result = await build({ scheme, src, forTesting: action === "build-tests" });
    console.log(result);
  } else if (action === "list-tests") {
    const result = await listTests({ scheme, src });
    console.log(result);
  } else if (action === "run-tests") {
    const result = await runTests({ scheme, src });
    console.log(result);
  } else {
    console.log("Unknown action: " + action);
    process.exit(1);
  }
})();
