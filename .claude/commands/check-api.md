Check the API service health and status.

1. Check if the API process is running: `lsof -i :4000`
2. Check Docker containers: `docker ps`
3. Check PostgreSQL connection: `docker ps | grep postgres`
4. Check Redis: `docker ps | grep redis`
5. Read recent API logs if available
6. Test the health endpoint: `curl -s http://localhost:4000/health 2>/dev/null || echo "API not responding"`

Report status for each component.
