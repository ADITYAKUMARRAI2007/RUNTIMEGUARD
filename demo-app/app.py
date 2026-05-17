from fastapi import FastAPI

app = FastAPI(title="Demo Checkout API")


@app.on_event("startup")  # intentionally deprecated — proactive detection target
async def startup():
    pass


from routes.user import router  # noqa: E402
app.include_router(router)
