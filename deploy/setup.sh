#!/bin/bash
# EC2初回セットアップスクリプト（Ubuntu 24.04）
# 使い方: ssh後に bash setup.sh を実行

set -e

echo "=== パッケージ更新 ==="
sudo apt update && sudo apt upgrade -y

echo "=== Nginx インストール ==="
sudo apt install -y nginx

echo "=== ドキュメントルート作成 ==="
sudo mkdir -p /var/www/deadlock
sudo chown -R ubuntu:ubuntu /var/www/deadlock

echo "=== Nginx 設定 ==="
sudo tee /etc/nginx/sites-available/deadlock > /dev/null << 'EOF'
server {
    listen 80;
    server_name deadklock-jp.com www.deadklock-jp.com;

    root /var/www/deadlock;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript text/html application/json image/svg+xml;
    gzip_min_length 1024;

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(html)$ {
        expires 1h;
        add_header Cache-Control "public, must-revalidate";
    }

    location ~* \.(json)$ {
        expires 5m;
        add_header Cache-Control "public, must-revalidate";
    }

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
EOF

sudo ln -sf /etc/nginx/sites-available/deadlock /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "=== Let's Encrypt (Certbot) インストール ==="
sudo apt install -y certbot python3-certbot-nginx

echo ""
echo "=== セットアップ完了 ==="
echo "次のコマンドでHTTPS化してください:"
echo "  sudo certbot --nginx -d deadklock-jp.com -d www.deadklock-jp.com"
