#!/usr/bin/env node

import { build, runTests } from "./xcodebuild.ts";

(async () => {
  const result = await build({ scheme: process.argv[2], src: process.argv[3] });
  console.log(result);
})();
