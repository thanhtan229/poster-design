@echo off
rem [TINIX] Nhấp đúp để mở TinixPoster: chạy editor + service (nếu chưa chạy) rồi mở trình duyệt.
rem Tắt app: nhấn Ctrl+C trong cửa sổ này (hoặc đóng cửa sổ).
rem Kiểm tra mà không chạy gì:  Mo-TinixPoster.cmd --check
setlocal
chcp 65001 >nul
title TinixPoster
cd /d "%~dp0"

set "URL=http://127.0.0.1:5173"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Chua tim thay Node.js. Cai Node.js ^(ban LTS^) tu https://nodejs.org roi mo lai file nay.
  pause
  exit /b 1
)

if not exist "node_modules\" goto :need_setup
if not exist "service\node_modules\" goto :need_setup

call :port_open 5173
set "EDITOR_UP=%errorlevel%"
call :port_open 7001
set "SERVICE_UP=%errorlevel%"

if /i "%~1"=="--check" (
  echo Node.js: OK
  echo Thu muc: %CD%
  if "%EDITOR_UP%"=="0" (echo Editor  ^(5173^): dang chay) else (echo Editor  ^(5173^): chua chay)
  if "%SERVICE_UP%"=="0" (echo Service ^(7001^): dang chay) else (echo Service ^(7001^): chua chay)
  exit /b 0
)

if "%EDITOR_UP%%SERVICE_UP%"=="00" (
  echo TinixPoster dang chay san - mo trinh duyet...
  start "" "%URL%"
  timeout /t 3 >nul
  exit /b 0
)

if "%EDITOR_UP%%SERVICE_UP%" neq "11" (
  echo [!] Chi mot phan cua app dang chay ^(editor=%EDITOR_UP% service=%SERVICE_UP%, 0 = dang chay^).
  echo     Dong cua so dang chay app cu ^(Ctrl+C^) roi mo lai file nay.
  pause
  exit /b 1
)

rem Doi ca hai cong mo roi tu mo trinh duyet (chay nen, toi da ~3 phut).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports=5173,7001; for($i=0;$i -lt 180;$i++){ $ok=$true; foreach($p in $ports){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',$p); $c.Close() } catch { $ok=$false } }; if($ok){ Start-Process '%URL%'; break }; Start-Sleep -Seconds 1 }"

echo Dang khoi dong TinixPoster... trinh duyet se tu mo khi san sang.
echo Giu cua so nay mo trong luc dung. Nhan Ctrl+C de tat app.
echo.
call npm run tinix:dev
exit /b %errorlevel%

:need_setup
echo [!] Chua cai thu vien cho du an. Mo PowerShell tai thu muc nay va chay:
echo       npm run tinix:setup
echo     roi mo lai file nay.
pause
exit /b 1

rem ── :port_open <port>  → errorlevel 0 neu co tien trinh dang nghe 127.0.0.1:<port>
:port_open
netstat -ano -p tcp | findstr /r /c:"127\.0\.0\.1:%~1 .*LISTENING" >nul
exit /b %errorlevel%
