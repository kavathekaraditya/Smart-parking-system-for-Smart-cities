from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from models import SmartParkingAI

app = FastAPI(
    title="SmartPark AI Prediction Engine",
    description="Microservice providing real-time parking forecasts, pricing optimization, and recommendations.",
    version="1.0.0"
)

# Enable CORS for communication with NestJS backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- REQUEST/RESPONSE SCHEMAS ---

class OccupancyRequest(BaseModel):
    base_occupancy: float
    hour: int
    day_of_week: int
    is_event: Optional[bool] = False

class DemandRequest(BaseModel):
    hour: int
    day_of_week: int
    is_event: Optional[bool] = False

class DynamicPricingRequest(BaseModel):
    base_price: float
    current_occupancy: float
    demand_score: float
    multiplier_cap: Optional[float] = 3.0

class ParkingSpace(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    base_price: float
    current_price: Optional[float] = None
    occupancy_rate: float
    available_slots: int

class RecommendationRequest(BaseModel):
    lots: List[ParkingSpace]
    user_latitude: float
    user_longitude: float
    preference: Optional[str] = "nearest"  # "nearest", "cheapest", "best"


# --- ENDPOINTS ---

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "smartpark-ai-engine"}

@app.post("/predict/occupancy")
def predict_occupancy(req: OccupancyRequest):
    try:
        # Predict occupancy
        pred_val = SmartParkingAI.predict_occupancy(
            base_occupancy=req.base_occupancy,
            hour=req.hour,
            day_of_week=req.day_of_week,
            is_event=req.is_event
        )
        
        # Calculate daily trend (simulation of 24 hours)
        daily_trend = []
        for h in range(24):
            val = SmartParkingAI.predict_occupancy(
                base_occupancy=req.base_occupancy,
                hour=h,
                day_of_week=req.day_of_week,
                is_event=req.is_event
            )
            daily_trend.append({"hour": h, "occupancy": round(val, 2)})
            
        # Calculate weekly trend (simulation of 7 days for this hour)
        weekly_trend = []
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        for d in range(7):
            val = SmartParkingAI.predict_occupancy(
                base_occupancy=req.base_occupancy,
                hour=req.hour,
                day_of_week=d,
                is_event=req.is_event
            )
            weekly_trend.append({"day": days[d], "occupancy": round(val, 2)})

        return {
            "requested_prediction": round(pred_val, 2),
            "daily_trend": daily_trend,
            "weekly_trend": weekly_trend
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/demand")
def predict_demand(req: DemandRequest):
    try:
        forecast = SmartParkingAI.forecast_demand(
            hour=req.hour,
            day_of_week=req.day_of_week,
            is_event=req.is_event
        )
        return forecast
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/pricing/dynamic")
def calculate_dynamic_pricing(req: DynamicPricingRequest):
    try:
        optimized_price = SmartParkingAI.calculate_dynamic_price(
            base_price=req.base_price,
            current_occupancy=req.current_occupancy,
            demand_score=req.demand_score,
            multiplier_cap=req.multiplier_cap
        )
        # Determine surge status
        surge_active = optimized_price > req.base_price
        multiplier = round(optimized_price / req.base_price, 2) if req.base_price > 0 else 1.0
        
        return {
            "base_price": req.base_price,
            "optimized_price": optimized_price,
            "surge_active": surge_active,
            "multiplier": multiplier
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recommend")
def recommend_parking(req: RecommendationRequest):
    try:
        # Convert Pydantic schemas to dict list
        lots_dict = [lot.model_dump() for lot in req.lots]
        recommended = SmartParkingAI.recommend_parking(
            lots=lots_dict,
            user_lat=req.user_latitude,
            user_lng=req.user_longitude,
            preference=req.preference
        )
        return {
            "preference": req.preference,
            "recommendations": recommended
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
