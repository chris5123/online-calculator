# Election Tally & Verification System

A web-based election tally and verification application built with Vite and
vanilla JavaScript. It provides vote calculation, report management, and
verification dashboard functionality.

The application is hosted on GitHub Pages and integrates with an existing
Google Apps Script API for election data and report operations.

## Live Application

- Election Calculator: <https://chris5123.github.io/online-calculator/>
- Verification Dashboard:
  <https://chris5123.github.io/online-calculator/dashboard.html>
- Fork Repository: <https://github.com/chris5123/online-calculator>
- Original Repository: <https://github.com/swin24-cool/online-calculator>

## Features

- Election vote calculation.
- Polling station selection.
- Candidate vote entry.
- Input validation.
- Report image upload.
- Verification dashboard.
- Report image viewing.
- Responsive layout.
- Explicit Mock API mode.
- Progressive Web App support.

## Technology Stack

- Vite.
- Vanilla JavaScript.
- HTML5 and CSS3.
- Google Apps Script API.
- GitHub Pages.
- Vitest.
- Playwright.
- ESLint.
- Prettier.
- Progressive Web App manifest and service worker.

## Getting Started

Clone the fork repository:

```bash
git clone https://github.com/chris5123/online-calculator.git
```

Change to the project directory:

```bash
cd online-calculator
```

Install the locked dependency set:

```bash
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

## Development Commands

Run the development server:

```bash
npm run dev
```

Run unit and integration tests:

```bash
npm test
```

Run ESLint:

```bash
npm run lint
```

Build the production site:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run Playwright browser tests when a supported browser is installed:

```bash
npm run test:e2e
```

## iPhone Remote Keyboard

The calculator supports an optional iPhone input page. The iPhone keeps its
native numeric keyboard, while numeric input is relayed to the currently
focused calculator field through a separate WebSocket relay. The relay does
not use the production Google Apps Script API and does not persist input data.

Start the dependency-free local relay:

```bash
npm run relay
```

For local iPhone testing, expose the development server on the computer's LAN
interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

Open the calculator with the computer's LAN address, not `localhost`:

```text
http://<computer-lan-address>:5173/online-calculator/
```

If the computer is connected through an iPhone hotspot, the address is usually
an IPv4 address such as `172.20.10.2`. The relay prints all detected LAN relay
URLs when it starts. The calculator also provides a `Find LAN Relay` action
that discovers these addresses from the local relay server.

Select the address belonging to the phone-hotspot interface, for example
`ws://172.20.10.2:8787`, and open the generated phone link on the iPhone. The
computer and iPhone must remain connected to the same hotspot. The relay runs
on the computer, so do not use the iPhone hotspot gateway address or
`localhost` as the relay host.

On the calculator, choose `iPhone Keyboard` and generate a pairing code. When
the calculator is served over a local HTTP LAN address, the relay URL follows
that computer host automatically. If the calculator was opened with
`localhost`, use `Find LAN Relay`; the generated iPhone link is rewritten to
the selected computer LAN address so that it does not point to the iPhone's
own `localhost`.

When the calculator is served from HTTPS, configure a TLS-enabled relay and
use a `wss://` URL. GitHub Pages does not host the WebSocket relay itself.
USB trust between an iPhone and a Mac is not a browser transport; the phone
and computer pages must both connect to the configured relay.

The relay only forwards pairing, synchronization, numeric input, clear, and
next-field messages. It must be protected by a private network or an
authenticated TLS reverse proxy before public deployment.

## Mock Mode

Mock mode is enabled explicitly with the `?mode=mock` query parameter.

Mock mode does not access the production Google Apps Script API and does not
modify production Google Sheets data. Production API failures do not
automatically activate mock mode.

Calculator Mock URL:

<http://localhost:5173/online-calculator/?mode=mock>

Dashboard Mock URL:

<http://localhost:5173/online-calculator/dashboard.html?mode=mock>

## Project Structure

- `src/core/`: calculation and validation logic.
- `src/services/`: production API and explicit Mock API clients.
- `src/components/`: reusable UI helpers and table rendering.
- `src/pages/`: calculator and dashboard entry modules.
- `src/styles/`: responsive application styles.
- `tests/unit/`: calculation and validation tests.
- `tests/integration/`: API error and contract tests.
- `tests/e2e/`: Playwright Mock API flows.
- `public/`: PWA manifest, service worker, and icon assets.

## Testing

The test suite includes:

- Unit tests for calculation and input validation.
- Integration tests for API transport and error handling.
- Playwright E2E tests using Mock API data.
- Regression coverage for calculator and dashboard workflows.

E2E tests use Mock API mode and must not write to the production Google Apps
Script endpoint.

## Production Build

Run the production build command:

```bash
npm run build
```

Vite generates the multi-page site in `dist/`, including:

- `dist/index.html` for the Election Calculator.
- `dist/dashboard.html` for the Verification Dashboard.

The configured GitHub Pages base path is `/online-calculator/`.

## GitHub Pages Deployment

The workflow in `.github/workflows/deploy-pages.yml` runs on pushes to the
`main` branch. It performs the following steps:

- Install dependencies with `npm ci`.
- Run the automated test suite.
- Build the Vite multi-page application.
- Upload the `dist/` Pages artifact.
- Deploy the artifact through the official GitHub Pages Actions.

## PWA

The application includes a PWA manifest, an SVG icon, and a service worker.
The service worker caches same-origin static GET resources within the
`/online-calculator/` scope and removes older application cache versions.

The service worker does not intercept Google Apps Script requests or POST
requests. The PWA does not provide offline synchronization of official
election data or offline submission of production records.

## Security Considerations

- Do not commit production API credentials, private keys, or access tokens.
- The production API endpoint is referenced by the client and is not a secret.
- Client-side role selection does not replace server-side authorization.
- Production writes must be validated by the backend.
- Mock mode must not write production data.
- Do not test production write operations from automated browser tests.

## License

No `LICENSE` file is currently present in this repository. Licensing terms
have not been specified by the project.
