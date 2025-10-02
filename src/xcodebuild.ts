import { spawn, exec } from 'child_process';

const DESTINATION = 'platform=macOS,arch=arm64';

export async function build(options: { scheme: string; warn?: boolean; forTesting?: boolean; src?: string }): Promise<string> {
  const { scheme, warn = false, forTesting = false, src } = options;
  
  try {
    const output = await executeCommand('xcodebuild', [
      forTesting ? 'build-for-testing' : 'build',
      '-scheme', scheme,
      '-quiet',
      '-destination', DESTINATION,
      '-destination-timeout', '0',
    ], src);

    if (output.includes('error:')) {
      const errorLines = output
        .split('\n')
        .filter(line => line.includes('error:'))
        .join('\n');
      return `BUILD FAILED! \n${errorLines}`;
    }

    if (warn) {
      const warnings = output.split('\n').filter(line => line.includes('warning:'));
      if (warnings.length > 0) {
        return 'BUILD SUCCEEDED WITH WARNINGS!\nWarnings:\n' + warnings.join('\n');
      }
    }

    return "BUILD SUCCEEDED!";
  } catch (error) {
    return `BUILD FAILED! \n${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function listTests(scheme: string, src?: string): Promise<string> {
  
  try {
    const output = await executeCommand('xcodebuild', [
      '-destination', DESTINATION,
      '-destination-timeout', '0',
      '-scheme', scheme,
      'test',
      '-enumerate-tests',
      '-test-enumeration-style', 'flat',
      '-test-enumeration-format', 'json'
    ], src);

    const lines = output.split('\n');
    const tests: string[] = [];
    
    for (const line of lines) {
      if (line.includes('identifier')) {
        const match = line.match(/"identifier"\s*:\s*"([^"]+)"/);
        if (match) {
          tests.push(match[1]);
        }
      }
    }
    
    if (tests.length === 0) {
      return 'No tests found for this scheme.';
    }

    return `Found ${tests.length} tests:\n${tests.map((test, i) => `${i + 1}. ${test}`).join('\n')}`;
  } catch (error) {
    return `Failed to list tests: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runTests(scheme: string, only?: string, src?: string): Promise<string> {
  const buildResult = await build({ scheme, forTesting: true, src });
  if (buildResult.includes('BUILD FAILED')) {
    return buildResult;
  }

  const args = [
    '-destination', DESTINATION,
    '-destination-timeout', '0',
    '-scheme', scheme,
    'test',
    '-skipPackageUpdates',
    '-skipPackagePluginValidation',
    '-skipMacroValidation',
    '-skipPackageSignatureValidation'
  ];

  if (only) {
    args.push('-only-testing', only);
  }

  try {
    const output = await executeCommand('xcodebuild', args, src);
    
    const xcresultMatch = output.match(/xcresult[^\s]+/);
    if (!xcresultMatch) {
      return 'Could not find test results.';
    }

    const xcresult = xcresultMatch[0];
    
    const parsed = await parseTestResults(xcresult, src);
    
    const totalTests = parsed.totalTestCount || 0;
    
    if (totalTests === 0) {
      return 'No tests were run. Are you sure the specified test(s) exist?';
    }

    const failures = parsed.testFailures || [];

    if (failures.length === 0) {
      return 'TEST SUCCEEDED';
    }

    let result = 'TEST FAILED\n\nTest Failures:\n';
    failures.forEach((failure: any, i: number) => {
      result += `\n${i + 1}. ${failure.testName || 'Unknown Test'}\n`;
      result += `   Identifier: ${failure.testIdentifierString || 'Unknown'}\n`;
      result += `   Failure: ${failure.failureText || 'No details available'}\n`;
    });

    return result;
  } catch (error) {
    return `TEST FAILED! \n${error instanceof Error ? error.message : String(error)}`;
  }
}


async function parseTestResults(xcresultPath: string, src?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', xcresultPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: src || process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (parseError) {
          reject(new Error(`Failed to parse test results: ${parseError}`));
        }
      } else {
        reject(new Error(`xcresulttool failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function executeCommand(command: string, args: string[] = [], src?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: src || process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', () => {
      resolve(stdout + stderr);
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}