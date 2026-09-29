# Deploy to a VPS (pm2 + nginx) at test.payplus.live

Assumes Ubuntu/Debian with sudo access. The app runs on `127.0.0.1:3100` under pm2 and nginx serves it over HTTPS.

## 1. One-time server setup

```bash
# DNS first: an A record for test.payplus.live pointing at this server's IP.

# Node.js 20.9+ (Next.js 16 requirement); Node 22 LTS shown here
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx apache2-utils
sudo npm install -g pm2

sudo ufw allow 'Nginx Full'   # if ufw is enabled; port 3100 stays private
```

## 2. Upload the code

From the project folder on Windows (PowerShell), without `node_modules`, `.next` or `.env`:

```powershell
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=.git -czf payplus-test-store.tgz .
scp payplus-test-store.tgz user@your-vps:/tmp/
```

On the VPS:

```bash
sudo mkdir -p /var/www/payplus-test-store && sudo chown $USER: /var/www/payplus-test-store
tar -xzf /tmp/payplus-test-store.tgz -C /var/www/payplus-test-store
cd /var/www/payplus-test-store
```

(Or push the repo to a private Git remote and `git clone` it here.)

## 3. Environment file

Create `/var/www/payplus-test-store/.env`:

```env
NEXT_APP_BASE_URL=https://api.payplus.live/api/v2
API_SECRET_KEY=your_api_key_here
PAYPLUS_WEBHOOK_SECRET=
APP_URL=https://test.payplus.live
```

```bash
chmod 600 .env
```

`APP_URL` is used for the payment `returnUrl` and the webhook URL shown in the UI.

## 4. Build and start with pm2

```bash
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # run the command it prints, so the app starts on reboot

curl -I http://127.0.0.1:3100   # expect HTTP 200
```

## 5. HTTPS certificate and nginx

```bash
sudo certbot certonly --nginx -d test.payplus.live
sudo cp deploy/nginx/test.payplus.live.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/test.payplus.live.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Open https://test.payplus.live.

Optional password protection: `sudo htpasswd -c /etc/nginx/.htpasswd-payplus-test <username>`, uncomment the `[auth]` lines in the nginx file, then `sudo nginx -t && sudo systemctl reload nginx`.

## 6. Payplus webhook

1. Payplus dashboard → **Apps & API keys** → your app → **Webhook**: enter `https://test.payplus.live/api/webhook` and save.
2. Copy the `whsec_…` signing secret it shows (only once) into `PAYPLUS_WEBHOOK_SECRET` in `.env`.
3. `pm2 restart payplus-test-store`

## Updating later

Upload the new code as in step 2 (extract over the same folder; `.env` is kept), then:

```bash
cd /var/www/payplus-test-store
npm ci && npm run build && pm2 restart payplus-test-store
```

## Useful commands

```bash
pm2 status
pm2 logs payplus-test-store          # includes "[payplus webhook] …" lines
sudo tail -f /var/log/nginx/test.payplus.live.error.log
```
