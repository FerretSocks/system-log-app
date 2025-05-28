@echo off
cls
REM --- TaskBlaster 9000 Backup Script for Windows (V4 - Custom Naming) ---
echo.
echo  TaskBlaster 9000 Backup Utility
echo ===================================
echo.

REM --- Step 1: Prompt user for a custom backup name ---
set "backup_name="
set /p "backup_name=Enter a short name for this backup (e.g., final_version) and press Enter: "

REM If the user just presses enter, provide a default name.
if not defined backup_name set "backup_name=backup"

REM Replace spaces in the name with underscores for a cleaner filename.
set "backup_name=%backup_name: =_%"
echo.

REM --- Step 2: Check if the source file exists ---
set "source_file=public\index.html"
if not exist "%source_file%" (
    echo ERROR: Could not find "%source_file%".
    echo.
    echo Please make sure this script is in your project's root folder,
    echo and that your index.html file is inside the 'public' subfolder.
    echo.
    goto end
)
echo "index.html" found. Proceeding...
echo.

REM --- Step 3: Create a simplified timestamp (without seconds) ---
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "timestamp=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%_%dt:~8,2%-%dt:~10,2%"
echo Timestamp will be: %timestamp%
echo.

REM --- Step 4: Create the Backup folder ---
if not exist "Backup" (
    echo "Backup" folder not found. Creating it...
    mkdir "Backup"
)

REM --- Step 5: Perform the backup with the new custom filename ---
set "backup_file=Backup\%backup_name%_%timestamp%.html"
echo Creating backup file named:
echo "%backup_file%"
echo.
copy "%source_file%" "%backup_file%"

REM --- Step 6: Verify the result ---
if exist "%backup_file%" (
    echo ===================================
    echo  SUCCESS! Backup complete.
    echo ===================================
) else (
    echo ===================================
    echo  ERROR: Backup FAILED!
    echo  The file could not be copied.
    echo ===================================
)

:end
echo.
pause