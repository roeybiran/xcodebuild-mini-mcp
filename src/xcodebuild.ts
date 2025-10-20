import { execa } from "execa";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import fs from "fs";

const DESTINATION = "platform=macOS,arch=arm64";
const SKIP_ARGS = [
  "-skipPackageUpdates",
  "-skipPackagePluginValidation",
  "-skipMacroValidation",
  "-skipPackageSignatureValidation",
];

export async function build(options: {
  scheme: string;
  warn?: boolean;
  forTesting?: boolean;
  src?: string;
}): Promise<{ result: "success" | "failure"; text: string }> {
  const {
    scheme,
    warn = false,
    forTesting = false,
    src = process.cwd(),
  } = options;

  const result = await execa(
    "xcodebuild",
    [
      forTesting ? "build-for-testing" : "build",
      "-scheme",
      scheme,
      "-quiet",
      "-destination",
      DESTINATION,
      "-destination-timeout",
      "0",
    ],
    {
      cwd: src,
      all: true,
      reject: false,
    }
  );

  const errorLineMatcher = /\d: (error|warning): /;
  const errorsAndWarnings = result.all
    .split("\n")
    .map((line) => {
      const match = line.match(errorLineMatcher);
      if (match && match[1] === "error") {
        return { message: line, type: "error" };
      } else if (warn && match && match[1] === "warning") {
        return { message: line, type: "warning" };
      }
    })
    .sort((a, b) => {
      if (!a || !b) return 0;
      if (a.type === "error" && b.type === "warning") return -1;
      if (a.type === "warning" && b.type === "error") return 1;
      return 0;
    })
    .map((item) => item?.message ?? "")
    .join("\n");

  if (result.exitCode === 0) {
    if (errorsAndWarnings.length > 0) {
      return {
        result: "success",
        text: `BUILD SUCCEEDED WITH WARNINGS\n${errorsAndWarnings}`,
      };
    }
    return { result: "success", text: "BUILD SUCCEEDED" };
  } else {
    if (errorsAndWarnings.length > 0) {
      return { result: "failure", text: `BUILD FAILED\n${errorsAndWarnings}` };
    } else {
      return {
        result: "failure",
        text: result.shortMessage ?? "AN UNKNOWN ERRORR HAS OCCURRED",
      };
    }
  }
}

export async function runTests(options: {
  scheme: string;
  only?: string;
  src?: string;
  coverage?: boolean;
}): Promise<string> {
  const { scheme, only, src = process.cwd(), coverage = false } = options;

  const buildResult = await build({ scheme, forTesting: true, src });

  if (buildResult.result === "failure") {
    return buildResult.text;
  } else {
    console.error(buildResult.text);
  }

  const uuid = randomUUID();
  const resultBundlePath = join(tmpdir(), uuid);

  const args = [
    "test",
    "-destination",
    DESTINATION,
    "-destination-timeout",
    "0",
    "-scheme",
    scheme,
    "-resultBundlePath",
    resultBundlePath,
    "-enableCodeCoverage",
    coverage ? "YES" : "NO",
    ...SKIP_ARGS,
  ];

  if (only) {
    const allTests = await listTests({ scheme, src });
    const matchingTests = allTests
      .split("\n")
      .filter((test) => test.includes(only))
      .flatMap((test) => ["-only-testing", test]);
    if (matchingTests.length === 0) {
      return `No tests found for the given filter: ${only}`;
    } else {
      // console.error(`Running tests:\n${matchingTests.join("\n")}`);
    }
    args.push(...matchingTests);
  }

  await execa("xcodebuild", args, {
    cwd: src,
    all: true,
    reject: false,
  });

  const xcresultOutput = await execa(
    "xcrun",
    [
      "xcresulttool",
      "get",
      "test-results",
      "summary",
      "--path",
      resultBundlePath,
    ],
    {
      cwd: src,
    }
  );

  let parsed;
  try {
    parsed = JSON.parse(xcresultOutput.stdout);
  } catch (parseError) {
    return `Error: failed to parse test results JSON: ${parseError}`;
  }

  const totalTests = parsed.totalTestCount || 0;
  const failures = parsed.testFailures || [];

  const failureDetails: {
    Number: number;
    TestName: string;
    Identifier: string;
    Failure: string;
  }[] = failures.map((failure: any, i: number) => {
    return [
      `Test: ${failure.testName || "UNKNOWN"}`,
      `Test Identifier: ${failure.testIdentifierString || "UNKNOWN"}`,
      `Test Failure: ${failure.failureText || "UNKNOWN"}`,
      `--------------------------------`,
    ].join("\n");
  });

  let coverageOutput = "";
  if (coverage) {
    const { stdout } = await execa(
      "xcrun",
      ["xccov", "view", "--report", `${resultBundlePath}.xcresult`],
      {
        cwd: src,
      }
    );
    coverageOutput = `COVERAGE:\n${stdout}`;
  }

  let statusMessage = "";
  if (totalTests === 0) {
    statusMessage =
      "No tests were run. Are you sure the specified test(s) exist?";
  } else if (failures.length === 0) {
    statusMessage = "TEST SUCCEEDED";
  } else {
    statusMessage = `TEST FAILED\n${failureDetails.join("\n")}`;
  }

  return `${statusMessage}\n${coverageOutput}`;
}

export async function listTests(options: {
  scheme: string;
  src?: string;
}): Promise<string> {
  const { scheme, src = process.cwd() } = options;

  const uuid = randomUUID();
  const testEnumerationOutputPath = join(tmpdir(), uuid);

  const result = await execa(
    "xcodebuild",
    [
      "test",
      "-destination",
      DESTINATION,
      "-quiet",
      "-destination-timeout",
      "0",
      "-scheme",
      scheme,
      "-enumerate-tests",
      "-test-enumeration-style",
      "flat",
      "-test-enumeration-format",
      "json",
      "-test-enumeration-output-path",
      testEnumerationOutputPath,
      ...SKIP_ARGS,
    ],
    {
      cwd: src,
      reject: false,
    }
  );

  if (result.exitCode !== 0) {
    return `Failed to list tests: ${result.stderr}`;
  }

  let tests: string[] = [];

  // {
  //   "errors": [],
  //   "values": [
  //     {
  //       "disabledTests": [],
  //       "enabledTests": [
  //         {
  //           "identifier": "foo/`bar tests`/`baz`()"
  //         }
  //       ],
  //       "testPlan": "Project"
  //     }
  //   ]
  // }

  try {
    const jsonResult = JSON.parse(
      fs.readFileSync(testEnumerationOutputPath, "utf8")
    );
    tests = jsonResult.values[0].enabledTests.map(
      (test: any) => test.identifier
    );
  } catch (error) {
    return `Failed to parse test results: ${error}`;
  }

  if (tests.length === 0) {
    return "No tests found for this scheme.";
  }

  return tests.join("\n");
}
