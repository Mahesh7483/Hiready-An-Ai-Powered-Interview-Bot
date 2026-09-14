@echo off
setlocal
title HIREady experiments - leave this window open

REM ==========================================================================
REM  Produces every number the paper needs, on the updated models.
REM
REM  Put this file in:  Downloads\pro major\
REM  Then double-click it.
REM
REM  TWO STAGES, and the first one matters:
REM
REM   1. CAPABILITY PROBE (~1 minute, 16 calls).
REM      Groq documents strict json_schema for the gpt-oss and qwen models and
REM      says nothing either way about groq/compound. Rather than guess, this
REM      asks the API directly and writes experiments\out\model-capabilities.json,
REM      which every later experiment reads. Without it, experiment 1 skips its
REM      strict-decoding row on compound instead of measuring it.
REM
REM   2. THE SUITE, at the profile you pass (default: power).
REM      power  ~3150 calls, several hours, publishable interval widths
REM      full   ~1500 calls, about two hours
REM      free   ~450 calls, about an hour, directional only
REM
REM  Examples:
REM      RUN-EXPERIMENTS.bat                 (probe, then the power profile)
REM      RUN-EXPERIMENTS.bat --profile free  (probe, then the quick profile)
REM      RUN-EXPERIMENTS.bat --only 2,3      (probe, then just those two)
REM
REM  Safe to stop and restart: finished experiments are skipped. Experiment 4
REM  needs the backend running (node server.js) with a user in MongoDB.
REM ==========================================================================

cd /d "%~dp0Hiready-An-Ai-Powered-Interview-Bot\hiready-backend"

if not exist "experiments\run-all.js" (
  echo.
  echo  ERROR: cannot find experiments\run-all.js
  echo  Expected it under: %CD%\experiments\
  echo.
  pause
  exit /b 1
)

set PROFILE_ARGS=%*
if "%PROFILE_ARGS%"=="" set PROFILE_ARGS=--profile power

echo ==========================================================
echo   HIREady evaluation run
echo   Working directory: %CD%
echo   Arguments: %PROFILE_ARGS%
echo   Progress is also written to experiments\out\run-all.log
echo ==========================================================
echo.

echo [1/2] Probing model capabilities against the live API...
node experiments\probe-capabilities.js
if errorlevel 1 (
  echo.
  echo  Probe failed. Check GROQ_API_KEY in .env, then run this again.
  pause
  exit /b 1
)

echo.
echo [2/2] Running the experiment suite...
node experiments\run-all.js %PROFILE_ARGS%

echo.
echo ==========================================================
echo   Finished. Send back everything in experiments\out\
echo     model-capabilities.json   what the probe found
echo     exp1..exp5 .json          the aggregates the paper reads
echo     *.trials.jsonl            per-trial logs
echo     run-all.log               what happened, including any aborts
echo ==========================================================
pause
