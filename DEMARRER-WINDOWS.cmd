@echo off
setlocal
cd /d "%~dp0"
echo Demarrage de l'API 1Entrer avec Docker Desktop.
echo Ouvrez Docker Desktop avant de continuer.
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop est absent ou son moteur n'est pas pret.
  echo Demarrez Docker Desktop, attendez son demarrage, puis relancez ce fichier.
  pause
  exit /b 1
)
echo L'API sera accessible sur http://localhost:3000
echo Il s'agit d'une API : aucune page web d'accueil n'est prevue.
echo Gardez cette fenetre ouverte. Ctrl+C permet d'arreter le service.
docker compose up --build
pause
