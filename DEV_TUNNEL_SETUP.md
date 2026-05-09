# VS Code Port Forward / Dev Tunnel Setup

This project uses:

- Frontend: React on `http://localhost:3000`
- Backend: PHP on `http://localhost:8000`
- Database: MySQL from XAMPP on `127.0.0.1:3306`

## Environment Files

Frontend `.env`:

```env
PORT=3000
REACT_APP_API_URL=http://localhost:8000
REACT_APP_API_PATH=/backend/api
REACT_APP_API_TIMEOUT_MS=30000
REACT_APP_API_RETRY_ATTEMPTS=1
```

Backend `backend/.env`:

```env
APP_ENV=development
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ALLOW_DEV_TUNNEL_ORIGINS=true

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=dbmonitoring
DB_USERNAME=root
DB_PASSWORD=
```

For external Dev Tunnel testing, set the frontend to call the forwarded backend URL:

```env
REACT_APP_API_URL=https://YOUR-8000-BACKEND-URL.devtunnels.ms
REACT_APP_API_PATH=/backend/api
```

Then allow the forwarded frontend URL in `backend/.env`:

```env
FRONTEND_URL=https://YOUR-3000-FRONTEND-URL.devtunnels.ms
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://YOUR-3000-FRONTEND-URL.devtunnels.ms
```

Restart both React and PHP after changing `.env` files.

## Start Locally

Start XAMPP MySQL first. The backend connects to MySQL locally; do not forward MySQL unless you have a separate reason to expose it.

Frontend from the project root:

```bat
set PORT=3000 && npm start
```

PowerShell equivalent:

```powershell
$env:PORT = "3000"; npm start
```

Backend from the project root:

```bash
php -S localhost:8000
```

## VS Code Ports

Forward both ports:

- `3000` for React
- `8000` for PHP

When testing from another device/browser through Dev Tunnel, open the forwarded `3000` frontend URL. React will call the forwarded `8000` backend URL when `REACT_APP_API_URL` is set to that backend tunnel URL.

## API Tests

Health check:

```bash
curl http://localhost:8000/backend/api/health.php
```

Expected when MySQL is running:

```json
{
  "success": true,
  "api": { "running": true },
  "database": { "connected": true }
}
```

Login test:

```bash
curl -i -X POST http://localhost:8000/backend/api/login.php ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"your-password\"}"
```

Postman:

- Method: `POST`
- URL: `http://localhost:8000/backend/api/login.php`
- Headers: `Content-Type: application/json`
- Body:

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

## Port Cleanup

Find processes using port `3000`:

```bat
netstat -ano | findstr :3000
```

Stop the process that owns the port:

```bat
taskkill /PID <PID> /F
```

## Common Fixes

- `Network Error`: PHP server is not running, wrong `REACT_APP_API_URL`, or backend port `8000` is not forwarded.
- `Timeout exceeded`: MySQL is stopped, backend is unreachable, or an endpoint is waiting on a slow query.
- `Invalid JSON`: React is hitting a non-PHP page, a PHP warning/error is printed before JSON, or the request body is not JSON.
- `Requested Resource Not Found`: `REACT_APP_API_PATH` does not match how PHP is served. For this project root setup, use `/backend/api`.
- `Login failed`: confirm MySQL is running, `dbmonitoring` exists, credentials match `backend/.env`, and `login.php` returns JSON in the health/API tests.
- `Port conflict`: stop the current process on `3000`, then restart React.
