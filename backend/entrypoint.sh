#!/bin/sh
set -e

echo "=== Creating Tailscale directories ==="
mkdir -p /var/run/tailscale /var/lib/tailscale

export TS_DEBUG_ALWAYS_USE_DERP=1

echo "=== STARTING TAILSCALE DAEMON ==="
tailscaled \
  --tun=userspace-networking \
  --socks5-server=127.0.0.1:1055 \
  --outbound-http-proxy-listen=127.0.0.1:1056 &

DAEMON_PID=$!

echo "=== WAITING FOR SOCKET FILE ==="
WAIT_COUNT=0
until [ -S /var/run/tailscale/tailscaled.sock ]; do
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ $WAIT_COUNT -gt 15 ]; then
        echo "ERROR: tailscaled.sock was not created within 15 seconds!"
        # Do not exit instantly, let the app start anyway so we can see logs
        break
    fi
    sleep 1
done

echo "=== AUTHENTICATING TAILSCALE ==="
# We add || true so the container doesn't instantly crash if the key is invalid
tailscale up \
  --reset \
  --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=${TS_HOSTNAME:-agri-backend-client} \
  --accept-routes || echo "WARNING: Tailscale up failed. Key might be invalid."

echo "=== LOCKING DERP REGION ==="
tailscale set --derp-region=blr || echo "DERP region lock failed"

echo "=== STARTING FASTAPI BACKEND ==="
# Cloud Run injects the PORT environment variable dynamically
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
