import { execa } from "execa";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const DESTINATION = "platform=macOS,arch=arm64";

export async function build(options: {
  scheme: string;
  warn?: boolean;
  forTesting?: boolean;
  src?: string;
}): Promise<{ result: "success" | "failure"; text: string }> {
  const { scheme, warn = false, forTesting = false, src = process.cwd() } = options;

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
  if (result.exitCode !== 0) {
    if (result.all.match(errorLineMatcher)) {
      const errorsOrWarnings = result.all
        .split("\n")
        .map((line) => {
          const match = line.match(errorLineMatcher);
          if (match && match[1] === "error") {
            return { type: "error", message: line };
          } else if (match && match[1] === "warning") {
            return { type: "warning", message: line };
          }
        })
        .filter((item) => item !== undefined);

      let output: string[] = [];
      if (warn) {
        output.push(...errorsOrWarnings.map((item) => item.message));
      } else {
        output.push(
          ...errorsOrWarnings
            .filter((item) => item.type === "error")
            .map((item) => item.message)
        );
      }

      return { result: "failure", text: `BUILD FAILED\n${output.join("\n")}` };
    } else {
      return {
        result: "failure",
        text: `Error: an unknown error occurred:\n${result.all}`,
      };
    }
  } else {
    if (warn) {
      const output = result.all ?? "";
      const warnings = output
        .split("\n")
        .filter((line) => line.match(errorLineMatcher));
      if (warnings.length > 0) {
        return {
          result: "success",
          text: `BUILD SUCCEEDED WITH WARNINGS\n${warnings.join("\n")}`,
        };
      }
    }
    return { result: "success", text: "BUILD SUCCEEDED" };
  }
}

export async function listTests(options: {
  scheme: string;
  src?: string;
}): Promise<string> {
  const { scheme, src = process.cwd() } = options;

  const result = await execa(
    "xcodebuild",
    [
      "test",
      "-destination",
      DESTINATION,
      "-destination-timeout",
      "0",
      "-scheme",
      scheme,
      "-enumerate-tests",
      "-test-enumeration-style",
      "flat",
      "-test-enumeration-format",
      "json",
    ],
    {
      cwd: src,
      all: true,
      reject: false,
    }
  );

  if (result.exitCode !== 0) {
    return `Failed to list tests.`;
  }

  const lines = result.all?.split("\n");
  const tests: string[] = [];

  for (const line of lines) {
    if (line.includes("identifier")) {
      const match = line.match(/"identifier"\s*:\s*"([^"]+)"/);
      if (match) {
        tests.push(match[1]);
      }
    }
  }

  if (tests.length === 0) {
    return "No tests found for this scheme.";
  }

  return `Found ${tests.length} tests:\n${tests
    .map((test, i) => `${i + 1}. ${test}`)
    .join("\n")}`;
}

export async function runTests(options: {
  scheme: string;
  only?: string;
  src?: string;
}): Promise<string> {
  const { scheme, only, src = process.cwd() } = options;

  const buildResult = await build({ scheme, forTesting: true, src });

  if (buildResult.result === "failure") {
    return buildResult.text;
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
    "-skipPackageUpdates",
    "-skipPackagePluginValidation",
    "-skipMacroValidation",
    "-skipPackageSignatureValidation",
    "-resultBundlePath",
    resultBundlePath,
  ];

  if (only) {
    args.push("-only-testing", only);
  }

  const testResult = await execa("xcodebuild", args, {
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

  if (totalTests === 0) {
    return "No tests were run. Are you sure the specified test(s) exist?";
  }

  const failures = parsed.testFailures || [];

  if (failures.length === 0) {
    return "TEST SUCCEEDED";
  }

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

  return `TEST FAILED\n${failureDetails.join("\n")}`;
}
