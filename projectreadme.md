# Losub Project

This repository contains the Losub web application and backend services.

## Project Structure

```text
Losub-project/
├── projectreadme.md
├── losub-app/
│   ├── vercel.json
│   ├── components/
│   │   ├── admin-sidebar.html
│   │   └── user-sidebar.html
│   ├── css/
│   │   ├── account.css
│   │   ├── admin-auth.css
│   │   ├── admin-common.css
│   │   ├── admin-dashboard.css
│   │   ├── admin-messaging.css
│   │   ├── admin-shell.css
│   │   ├── admin-verification.css
│   │   ├── airtime.css
│   │   ├── app-shell.css
│   │   ├── auth.css
│   │   ├── base.css
│   │   ├── browse.css
│   │   ├── categories.css
│   │   ├── dashboard.css
│   │   ├── faq.css
│   │   ├── footer.css
│   │   ├── group.css
│   │   ├── hero.css
│   │   ├── how-it-works.css
│   │   ├── manage-group.css
│   │   ├── navbar.css
│   │   ├── notifications.css
│   │   ├── owner.css
│   │   ├── shared.css
│   │   ├── showcase.css
│   │   ├── testimonials.css
│   │   └── wallet.css
│   ├── html/
│   │   ├── account.html
│   │   ├── admin-audit.html
│   │   ├── admin-dashboard.html
│   │   ├── admin-groups.html
│   │   ├── admin-messaging.html
│   │   ├── admin-reassignment.html
│   │   ├── admin-users.html
│   │   ├── admin-verification.html
│   │   ├── admin-wallet.html
│   │   ├── airtime.html
│   │   ├── auth.html
│   │   ├── browse.html
│   │   ├── dashboard.html
│   │   ├── group.html
│   │   ├── index.html
│   │   ├── manage-group.html
│   │   ├── notifications.html
│   │   ├── owner-settings.html
│   │   ├── owner-users.html
│   │   └── wallet.html
│   ├── images/
│   │   └── icons/
│   └── js/
│       ├── account.js
│       ├── admin-audit.js
│       ├── admin-dashboard.js
│       ├── admin-groups.js
│       ├── admin-messaging.js
│       ├── admin-reassignment.js
│       ├── admin-users.js
│       ├── admin-verification.js
│       ├── admin-wallet.js
│       ├── airtime.js
│       ├── app-shell.js
│       ├── auth.js
│       ├── browse.js
│       ├── config.js
│       ├── dashboard.js
│       ├── group.js
│       ├── load-admin-sidebar.js
│       ├── load-user-sidebar.js
│       ├── main.js
│       ├── manage-group.js
│       ├── notifications.js
│       ├── owner-settings.js
│       ├── owner-users.js
│       └── wallet.js
│
└── losub-backend/
    ├── db.js
    ├── Dockerfile
    ├── fly.toml
    ├── package.json
    ├── README.md
    ├── server.js
    ├── middleware/
    │   ├── auth.js
    │   ├── requireAdmin.js
    │   └── requireOwner.js
    ├── routes/
    │   ├── admin.js
    │   ├── auth.js
    │   ├── groups.js
    │   ├── gsubz.js
    │   ├── notifications.js
    │   ├── owner.js
    │   ├── plans.js
    │   ├── vtpass.js
    │   ├── wallet.js
    │   └── webhooks.js
    ├── scripts/
    │   ├── check-user.js
    │   └── make-owner.js
    └── utils/
        ├── logAudit.js
        ├── mailer.js
        ├── notify.js
        └── tokens.js
```

## Overview

- `losub-app/` contains the frontend web app, including HTML pages, CSS styling, JavaScript logic, and shared UI components.
- `losub-backend/` contains the Node.js server, API routes, middleware, database connection logic, and supporting utilities.

## Notes

- The frontend is static HTML/CSS/JS based.
- The backend is a Node.js application with Express-style route structure.
- `projectreadme.md` serves as a summary of the repository structure.
