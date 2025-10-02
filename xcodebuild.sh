#!/bin/bash

DESTINATION='platform=macOS,arch=arm64'

function build() {
  local SCHEME="$1"
  local WARN="$2"

  output="$(xcodebuild -scheme "$SCHEME" -quiet -destination "$DESTINATION" -destination-timeout 0 2>&1)"
  if echo "$output" | grep 'error:'; then
    echo "BUILD FAILED"
    exit 1
  fi

  if $WARN; then
     echo "$output" | grep 'warning:'
  fi

  echo "BUILD SUCCEEDED"
}

function list_tests() {
  local SCHEME="$1"

  xcodebuild -destination "$DESTINATION" -destination-timeout 0 -scheme "$SCHEME" test -enumerate-tests -test-enumeration-style flat -test-enumeration-format json 2>&1 | grep identifier | awk -F'"' '{print $4}'
}

function build_tests() {
    local SCHEME="$1"

    build_output="$(xcodebuild -quiet -destination "$DESTINATION" -destination-timeout 0 -scheme "$SCHEME" build-for-testing 2>&1)"
    if echo "$build_output" | grep 'error:'; then
        echo "BUILD FAILED"
        exit 1
    fi
    echo "BUILD SUCCEEDED"
}

function run_tests() {
    local SCHEME="$1"
    local TEST_ONLY="$2"
    
    if ! build_tests "$SCHEME"; then
      exit 1
    fi

    local test_args=()
    if [ -n "$TEST_ONLY" ]; then
        test_args+=("-only-testing" "$TEST_ONLY")
    fi

    xcresult="$(xcodebuild -destination "$DESTINATION" -destination-timeout 0 -scheme "$SCHEME" test "${test_args[@]}" 2>&1 | grep xcresult | awk '{print $NF}')"
    parsed="$(xcrun xcresulttool get test-results summary --path "$xcresult")"

    total_tests=$(printf "%s\n" "$parsed" | jq -r '.totalTestCount')
    if [[ "$total_tests" == "0" ]]; then
        echo "No tests were run. Are you sure the specified test(s) exist?"
        exit 1
    fi

    results="$(printf "%s\n" "$parsed" | jq -r '.testFailures[] | "TEST NAME: \(.testName)\nTEST IDENTIFIER: \(.testIdentifierString)\nFAILURE TEXT:\n\(.failureText)\n==================="')"

    if [ -n "$results" ]; then
        echo "TEST FAILED"
        echo "$results"
        exit 1
    fi

    echo "TEST SUCCEEDED"
}

function list_packages() {
    xcodebuild -list | grep ":* @ " | sed 's/^[[:space:]]*//' | sort
}

SCHEME=""
TEST_ONLY=""
COMMAND=""
WARN=false

for arg in "${@}"; do
    case $arg in
        --scheme=*)
            SCHEME="${arg#*=}"
            ;;
        --only=*)
            TEST_ONLY="${arg#*=}"
            ;;
        --warn)
            WARN=true
            ;;
        build|list-tests|build-tests|run-tests|list-packages)
            COMMAND="$arg"
            ;;
        *)
            echo "Unknown option: $arg"
            exit 1
            ;;
    esac
done

case "$COMMAND" in
    "build")
        if [ -z "$SCHEME" ]; then
            echo "Usage: $0 build --scheme=<scheme>"
            exit 1
        fi
        build "$SCHEME" "$WARN"
        ;;
    "list-tests")
        if [ -z "$SCHEME" ]; then
            echo "Usage: $0 list-tests --scheme=<scheme>"
            exit 1
        fi
        list_tests "$SCHEME"
        ;;
    "build-tests")
        if [ -z "$SCHEME" ]; then
            echo "Usage: $0 build-tests --scheme=<scheme>"
            exit 1
        fi
        build_tests "$SCHEME"
        ;;
    "run-tests")
        if [ -z "$SCHEME" ]; then
            echo "Usage: $0 run-tests --scheme=<scheme> [--only=<test>]"
            exit 1
        fi
        run_tests "$SCHEME" "$TEST_ONLY"
        ;;
    "list-packages")
        list_packages
        ;;
    *)
        echo "Usage: $0 {build|list-tests|build-tests|run-tests|list-packages} [--scheme=<scheme>] [--only=<test>] [--warn]"
        echo ""
        echo "Commands:"
        echo "  build --scheme=<scheme>                    - Build the specified scheme"
        echo "  list-tests --scheme=<scheme>               - List all tests for the scheme"
        echo "  build-tests --scheme=<scheme>              - Build tests for the scheme"
        echo "  run-tests --scheme=<scheme> [--only=<test>] - Run tests for the scheme (optionally only specific test)"
        echo "  list-packages                              - List all packages in the project"
        exit 1
        ;;
esac

