@echo off
:: ==========================================================
:: ==  Firebase Project Deploy Script                      ==
:: ==  This pushes your local files to your live website.  ==
:: ==========================================================

title Deploying to Firebase - My Retro Task Tracker

echo.
echo ===================================================
echo   Deploying website and database rules to Firebase...
echo ===================================================
echo.

:: This is the main command. It deploys both the "hosting" (your public folder) 
:: and "firestore" (your firestore.rules file).
firebase deploy --only hosting,firestore

echo.
echo ===================================================
echo   Deployment complete!
echo ===================================================
echo.

:: The "pause" command keeps this window open so you can read the output.
pause