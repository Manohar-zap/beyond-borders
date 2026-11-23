@echo off
echo ======================================================================
echo    Starting Beyond Borders FastAPI Backend
echo    API Docs: http://127.0.0.1:8000/docs
echo ======================================================================
cd backend
"C:\Users\Asus\AppData\Local\Programs\Python\Python310\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
