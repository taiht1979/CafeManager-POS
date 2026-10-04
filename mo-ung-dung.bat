@echo off
title CafeManager POS Launcher
echo ========================================================
echo         CAFEMANAGER POS - STARTING SYSTEM
echo ========================================================
echo.
echo Dang mo Man Hinh Dang Nhap & Phan Quyen tren trinh duyet...
powershell -NoProfile -Command "Start-Process 'frontend\login.html'"
exit
