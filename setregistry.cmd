@echo off
choice -c "YN" -m "是否将下载源设为速度更快的国内镜像？"
if %errorlevel%==1 npm config set registry https://registry.npm.taobao.org