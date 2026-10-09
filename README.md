# Application Starter

Neutral full-stack application baseline built with Next.js and TypeScript.

This repository contains framework, build, health, and CI plumbing only. It does
not contain product functionality, customer material, or a benchmark solution.

## Prerequisites

- Node.js 24.21.0
- npm 11.19.0

## Install

```bash
npm ci
```

## Develop

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
npm run check
```

## Production launch

```bash
npm run build
npm run start
```

Health endpoint: `GET http://localhost:3000/api/health`
