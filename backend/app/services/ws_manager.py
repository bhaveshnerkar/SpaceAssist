"""
Minimal WebSocket connection manager.

Every time the experiment state changes (start / predict / reset), the
route layer calls `manager.broadcast(...)` so connected dashboards get
pushed an update instantly instead of waiting for their next poll.

Kept intentionally simple for a single-laptop hackathon prototype: no
auth, no rooms, just "tell every connected browser tab to refresh."
"""

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)


manager = ConnectionManager()
