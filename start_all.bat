@echo off
echo ======================================================================
echo    Starting Beyond Borders Full Stack
echo    Backend:  http://127.0.0.1:8000 (API & Docs: /docs)
echo    Frontend: http://localhost:3000
echo ======================================================================
start "Beyond Borders Backend" cmd /k "start_backend.bat"
start "Beyond Borders Frontend" cmd /k "start_frontend.bat"
echo Both servers launched in separate windows!
