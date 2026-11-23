@echo off
echo ======================================================================
echo    Starting Beyond Borders Next.js Frontend
echo    Opening at: http://localhost:3000
echo ======================================================================
cd frontend
if not exist node_modules (
    echo Installing npm dependencies...
    npm install
)
npm run dev
pause
