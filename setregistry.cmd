@echo off
choice -c "YN" -m "�Ƿ�����Դ��Ϊ�ٶȸ���Ĺ��ھ���"
if %errorlevel%==1 npm config set registry https://registry.npm.taobao.org