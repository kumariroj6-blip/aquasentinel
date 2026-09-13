@echo off
title AquaSentinel - Live Public Sharing Server
echo =======================================================
echo    AquaSentinel Live Sharing Server for SIH Demo
echo =======================================================
echo.
echo 1. Starting local web server on port 8080...
start /b python -m http.server 8080
timeout /t 2 /nobreak >nul
echo.
echo 2. Establishing secure public HTTPS tunnel...
echo    (This will give you a public URL you can send to anyone!)
echo.
echo Note: Keep this window open while sharing. Press Ctrl+C to stop.
echo =======================================================
echo.
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=30 -o ServerAliveCountMax=5 -R 80:localhost:8080 nokey@localhost.run
pause
