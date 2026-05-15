import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
app.mount("/games",  StaticFiles(directory=os.path.join(BASE_DIR, "games")),  name="games")

templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

connected: list[WebSocket] = []

@app.get("/")
async def index(request: Request):
    games_dir = os.path.join(BASE_DIR, "games")
    folders = [
        name for name in os.listdir(games_dir)
        if os.path.isdir(os.path.join(games_dir, name))
        and os.path.exists(os.path.join(games_dir, name, f"{name}.js"))
    ]
    return templates.TemplateResponse("menu.html", {"request": request, "folders": folders})

@app.get("/controller")
async def controller(request: Request):
    return templates.TemplateResponse("controller.html", {"request": request})

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            for client in list(connected):
                try:
                    await client.send_text(data)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        connected.remove(ws)
