@echo off

echo ��������ű����ڰ�װ�����Node.jsģ�顣

if exist node_modules if not exist node_modules\.staging goto check

:install

echo ��װ�У������ĵȴ�����
npm install

goto end

:check
choice -c "YN" -m "��⵽ģ���Ѿ���װ���Ƿ������"
if %errorlevel%==1 goto install
goto end

:end
pause
exit
