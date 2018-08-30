@echo off

echo 本批处理脚本用于安装必须的Node.js模块。

if exist node_modules if not exist node_modules\.staging goto check

:install

echo 安装中，请耐心等待……
npm install

goto end

:check
choice -c "YN" -m "检测到模块已经安装，是否继续？"
if %errorlevel%==1 goto install
goto end

:end
pause
exit
