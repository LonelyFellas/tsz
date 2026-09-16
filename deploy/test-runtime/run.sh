#!/usr/bin/env bash
set -euo pipefail
# 容器内真实 Nginx/HTTP/文件系统，systemd 命令适配为测试子进程。
mkdir -p /opt/tsz-admin/dist/assets /opt/tsz-web/apps/web/.next/static /etc/letsencrypt/live/test.tianshengzhi.com /etc/nginx/conf.d
rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf
printf legacy > /opt/tsz-admin/dist/index.html
printf old-css > /opt/tsz-admin/dist/assets/legacy.css
printf old-js > /opt/tsz-web/apps/web/.next/static/legacy.js
cat >/opt/tsz-web/apps/web/server.js <<'JS'
require('http').createServer((req, res) => res.end('old web')).listen(3000, '127.0.0.1');
JS
node /opt/tsz-web/apps/web/server.js &
echo $! >/tmp/tsz-web.service.pid
node -e 'require("http").createServer((req,res)=>{res.statusCode=require("fs").existsSync("/tmp/fail-api")?503:401;res.end()}).listen(8383,"127.0.0.1")' &
openssl req -x509 -nodes -newkey rsa:2048 -keyout /etc/letsencrypt/live/test.tianshengzhi.com/privkey.pem -out /etc/letsencrypt/live/test.tianshengzhi.com/fullchain.pem -days 1 -subj /CN=test.tianshengzhi.com -addext 'subjectAltName=DNS:test.tianshengzhi.com,DNS:admin-test.tianshengzhi.com' >/dev/null 2>&1
export CURL_CA_BUNDLE=/etc/letsencrypt/live/test.tianshengzhi.com/fullchain.pem
: >/etc/letsencrypt/options-ssl-nginx.conf
cat >/etc/nginx/conf.d/tsz.conf <<'CONF'
server { listen 8081; root /opt/tsz-admin/dist; }
CONF
cat >/etc/nginx/conf.d/tsz-test-domains.conf <<'CONF'
server { listen 443 ssl; server_name admin-test.tianshengzhi.com; root /opt/tsz-admin/dist;
ssl_certificate /etc/letsencrypt/live/test.tianshengzhi.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/test.tianshengzhi.com/privkey.pem; }
CONF
cat >/etc/nginx/conf.d/zentao-ip.conf <<'CONF'
server { listen 8090; location / { proxy_pass http://127.0.0.1:3000; } }
CONF
cat >/usr/local/bin/systemctl <<'CONTROL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> /tmp/systemctl-calls
case "$1" in
 daemon-reload) exit 0 ;;
 reload) nginx -s reload; exit 0 ;;
 enable)
   unit="${@: -1}"
   if [[ -f "/tmp/$unit.pid" ]] && kill -0 "$(cat "/tmp/$unit.pid")" 2>/dev/null; then exit 0; fi
   port="${unit#tsz-web@}"; port="${port%.service}"
   cd "/opt/tsz-releases/web/slots/$port"
   PORT="$port" HOSTNAME=127.0.0.1 nohup node apps/web/server.js 9>&- >/tmp/web-$port.log 2>&1 &
   echo $! > "/tmp/$unit.pid" ;;
 disable|stop)
   unit="${@: -1}"
   if [[ -f "/tmp/$unit.pid" ]]; then kill "$(cat "/tmp/$unit.pid")" || true; rm "/tmp/$unit.pid"; /bin/sleep 0.1; fi ;;
 *) exit 1 ;;
esac
CONTROL
chmod +x /usr/local/bin/systemctl
cat >/usr/local/bin/sleep <<'SLEEP'
#!/bin/sh
if [ "$1" = 30 ]; then exit 0; fi
exec /bin/sleep "$@"
SLEEP
chmod +x /usr/local/bin/sleep
nginx
node /repo/deploy/test-runtime/scenarios.mjs
