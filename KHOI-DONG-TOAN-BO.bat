@echo off
title CafeManager POS - B2B SaaS Master Launcher
echo ========================================================
echo        CAFEMANAGER POS - HE THONG B2B SAAS
echo ========================================================
echo.
echo [1] Dang mo Trang Chu He Thong (Unified Portal)...
powershell -NoProfile -Command "Start-Process 'frontend\index.html'"

echo.
echo ========================================================
echo   CAC PHAN HE THEO PHAN QUYEN VAI TRO CHUYEN BIET:
echo   1. Trang Chu va Portal:     frontend\index.html
echo   2. Quan Ly Quan (Admin):    frontend\store-admin-dashboard.html
echo   3. Thu Ngan POS (Cashier):  frontend\pos.html
echo   4. Order Dien Thoai(Waiter):frontend\waiter-order.html
echo   5. Pha Che (Barista KDS):   frontend\barista.html
echo   6. SaaS Super Admin:        frontend\super-admin-dashboard.html
echo ========================================================
echo.
exit
