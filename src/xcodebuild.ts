import { execa } from "execa";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import fs from "fs";

const DESTINATION = "platform=macOS,arch=arm64";
const SKIP_VALIDATIONS_ARGS = [
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
      } else if (match && match[1] === "warning") {
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
    if (warn && errorsAndWarnings.length > 0) {
      return {
        result: "success",
        text: `Build succeeded with warnings\n${errorsAndWarnings}`,
      };
    } else {
    return { result: "success", text: "Build succeeded!" };
    }
  } else {
    if (errorsAndWarnings.length > 0) {
      return { result: "failure", text: `Build failed\n${errorsAndWarnings}` };
    } else {
      return {
        result: "failure",
        text: result.shortMessage ?? "An unknown error has occurred",
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

  console.error("Building...");
  const buildResult = await build({ scheme, forTesting: true, src });

  if (buildResult.result === "failure") {
    return buildResult.text;
  } else {
    console.error(buildResult.text);
  }

  const uuid = randomUUID();
  const resultBundlePath = join(tmpdir(), uuid);

  const xcodebuildTestingArgs = [
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
    ...SKIP_VALIDATIONS_ARGS,
  ];

  let testingMessage = "Running all tests...";

  if (only) {
    const allTests = (await listTests({ scheme, src })).split("\n")
    const matchingTests = allTests.filter((test) => test.includes(only));
    if (matchingTests.length === 0) {
      return `No tests found for the given filter: ${only}.\nAvailable tests are:\n${allTests}`;
    } else {
      const count = `${matchingTests.length} of ${allTests.length}`;
      testingMessage = `Running ${count} tests...`
    }
    xcodebuildTestingArgs.push(...matchingTests.flatMap((test) => ["-only-testing", test]));
  }

  console.error(testingMessage);
  await execa("xcodebuild", xcodebuildTestingArgs, {
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
    /*
    {
    "coveredLines": 921,
    "executableLines": 6005,
    "lineCoverage": 0.1533721898417985,
    "targets": [
      {
        "buildProductPath": "/Users/USER/Library/Developer/Xcode/DerivedData/APP/Build/Products/Debug/APP.app/Contents/MacOS/APP",
        "coveredLines": 0,
        "executableLines": 4180,
        "files": [
          {
            "coveredLines": 0,
            "executableLines": 59,
            "functions": [
              {
                "coveredLines": 0,
                "executableLines": 8,
                "executionCount": 0,
                "lineCoverage": 1, (0-1, 1 is 100% coverage)
                "lineNumber": 17,
                "name": "..."
              },
            ],
            "lineCoverage": 0,
            "name": "MainViewController.swift",
            "path": "/Users/USER/Developer/APP/APP/Views/MainViewFeature/MainViewController.swift"
          },
        }
      */

    const { stdout } = await execa(
      "xcrun",
      ["xccov", "view", "--json", "--report", `${resultBundlePath}.xcresult`],
      {
        cwd: src,
      }
    );
    coverageOutput = `Coverage:\n${stdout}`;
  }

  let statusMessage = "";
  if (totalTests === 0) {
    statusMessage =
      "No tests were run. Are you sure the specified test(s) exist?";
  } else if (failures.length === 0) {
    statusMessage = "Testing succeeded!";
  } else {
    statusMessage = `Testing failed\n${failureDetails.join("\n")}`;
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
      ...SKIP_VALIDATIONS_ARGS,
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
