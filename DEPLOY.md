# Deployment Guide

## 1. Quick Start (Docker)

To start the application on your VPS:

```bash
# Build and start the container
docker-compose up -d --build

# Check if it's running
docker-compose ps

# View logs (to see if server started successfully)
docker-compose logs -f
```

The application will be running on **port 3000** inside the container, mapped to **port 3000** on the host.

## 2. Nginx Configuration

Since you are using Nginx with the domain `againstai.asind.dev`, you need to configure it as a reverse proxy.

**Common Error:** `net::ERR_CERT_COMMON_NAME_INVALID`
This means your SSL certificate does not match `againstai.asind.dev`. This often happens if you are using a default "snake-oil" certificate or a certificate for a different domain.

### Step 1: Install/Renew Certificate
Run Certbot to get a valid Let's Encrypt certificate:

```bash
sudo certbot --nginx -d againstai.asind.dev
```

### Step 2: Nginx Config File
Edit your site config (usually in `/etc/nginx/sites-available/againstai.asind.dev` or `default`):

```nginx
server {
    server_name againstai.asind.dev;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSL Configuration (Certbot should add this automatically)
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/againstai.asind.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/againstai.asind.dev/privkey.pem;
}

server {
    if ($host = againstai.asind.dev) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name againstai.asind.dev;
    return 404;
}
```

### Step 3: Restart Nginx
```bash
sudo systemctl restart nginx
```

## 3. Verification

1.  **Check Docker:** `docker ps` should show `against-ai-app` running.
2.  **Check Nginx:** `sudo systemctl status nginx` should be active.
3.  **Check Browser:** Go to `https://againstai.asind.dev`.
    *   If you see the "Against AI" loading screen, the frontend is working.
    *   If you see "Secure Connection Established" in the footer, the socket connection works.
