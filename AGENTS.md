# Base44 development notes

- Start the development environment with `docker compose -f docker-compose.base44.yml up -d`.
- The Express server and Vite middleware share port 3000; `/api/health` verifies HTTP and WebSocket signaling readiness.
- Application records persist as JSON files in the bind-mounted `data/` directory. There is no separate database or migration step.
- Authentication is implemented by the local Express server rather than Firebase; the committed Firebase config is not required to boot the app.
- Verify changes with `docker compose -f docker-compose.base44.yml exec -T app npm run lint` and `curl -fsS http://localhost:3000/api/health`.
