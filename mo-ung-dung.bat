@echo off
title CafeManager POS Launcher
echo ========================================================
echo         CAFEMANAGER POS - STARTING SYSTEM
echo ========================================================
echo.
echo Dang mo giao dien tren trinh duyet mac dinh...
powershell -NoProfile -Command "Start-Process 'frontend\index.html'"
exit
