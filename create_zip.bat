@echo off
REM Batch file to zip essential System Log project files.

REM Navigate to the public directory where the files are located.
echo Navigating to public folder...
cd public

REM Check if we are in the public folder (optional, basic check)
IF NOT EXIST "index.html" (
    echo ERROR: index.html not found. Make sure this script is in the parent 'system-log-app' directory
    echo and the 'public' folder with index.html, style.css, and app.js exists.
    pause
    exit /b
)

REM Define the name of the output zip file.
SET ZipFileName=system_log_files.zip
SET OutputPath=..\
REM The ..\ means the zip file will be created in the parent directory (system-log-app).

REM Use PowerShell to create the zip archive.
echo Creating zip file: %ZipFileName% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'index.html', 'style.css', 'app.js' -DestinationPath '%OutputPath%%ZipFileName%' -Force"

IF ERRORLEVEL 1 (
    echo ERROR: PowerShell command failed. Make sure PowerShell is available.
) ELSE (
    echo Successfully created %ZipFileName% in the %OutputPath% directory.
)

REM Navigate back to the original directory (optional).
cd ..

echo.
pause