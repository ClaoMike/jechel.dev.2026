#!/usr/bin/env bash
# Every backend test (unit + integration; the integration tests need Docker running), with coverage of the
# API: the report is written to coverage/index.html (and a summary printed), whether the tests passed or not.
set -uo pipefail
cd "$(dirname "$0")"

rm -rf TestResults coverage
dotnet test --collect:"XPlat Code Coverage" --settings coverage.runsettings --results-directory TestResults
status=$?

dotnet tool restore > /dev/null
dotnet tool run reportgenerator -reports:'TestResults/*/coverage.cobertura.xml' -targetdir:coverage \
  -reporttypes:'Html;TextSummary' -title:'jechel.dev API' > /dev/null \
  && sed -n '/^Summary/,/^$/p' coverage/Summary.txt
exit $status
