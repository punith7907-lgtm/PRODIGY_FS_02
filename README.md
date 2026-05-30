# Employee Management System

## Run directly from VS Code

This project supports a standalone frontend mode when opening `frontend/index.html` directly in the browser or VS Code preview.

1. Open `frontend/index.html` in VS Code.
2. Use `Open with Live Server` or the built-in HTML preview, or open the file in your browser.
3. Sign in using the local admin credentials:
   - Username: `admin`
   - Password: `admin123`

> The frontend includes a local-mode emulator so the app works without a separate backend server when loaded from `file:///`, and it will also fall back to local mode if the backend cannot be reached.

## Run with backend

If you want the full backend-backed experience, run the commands directly from the root folder:

```bash
npm install
npm run dev
```

This starts:
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`

