@echo off
REM IPROTIC — inicia o agente local de automacao.
REM Duplo-clique para rodar manualmente, ou copie um ATALHO deste
REM arquivo para a pasta de Inicializacao do Windows (Win+R,
REM digite "shell:startup", Enter) para ele subir sozinho a cada login.

cd /d "%~dp0"
python iprotic_local_agent.py

echo.
echo O agente foi encerrado.
pause
