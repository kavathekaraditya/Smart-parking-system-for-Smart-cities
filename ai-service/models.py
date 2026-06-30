import math
from typing import List, Dict, Any

class SmartParkingAI:
    @staticmethod
    def predict_occupancy(base_occupancy: float, hour: int, day_of_week: int, is_event: bool = False) -> float:
        """
        Predict hourly occupancy (0.0 to 1.0) using a synthetic diurnal cycle model.
        Peak hours are usually 8-10 AM and 5-7 PM for business districts, or 12-2 PM and 6-9 PM for shopping.
        """
        # Diurnal double peak curve
        peak_1 = math.exp(-((hour - 9) ** 2) / 6.0)  # Morning rush
        peak_2 = math.exp(-((hour - 18) ** 2) / 8.0) # Evening rush
        
        # Base factor based on day of week (weekends have different patterns)
        is_weekend = day_of_week in [5, 6] # Saturday, Sunday
        day_factor = 0.85 if is_weekend else 1.0
        
        predicted = base_occupancy + (0.5 * peak_1 + 0.4 * peak_2) * day_factor
        
        if is_event:
            predicted += 0.25 # Event boost
            
        # Bound between 0.0 and 1.0
        return min(max(predicted, 0.05), 1.0)

    @staticmethod
    def forecast_demand(hour: int, day_of_week: int, is_event: bool = False) -> Dict[str, Any]:
        """
        Forecast peak hours, busy days, and event impact.
        Returns a dictionary with demand metrics.
        """
        is_weekend = day_of_week in [5, 6]
        
        # Base demand calculation
        if is_weekend:
            # Weekend peak in afternoon/evening
            demand_score = 0.4 + 0.5 * math.exp(-((hour - 14) ** 2) / 18.0)
        else:
            # Weekday peak during commute
            demand_score = 0.3 + 0.6 * max(
                math.exp(-((hour - 8.5) ** 2) / 4.0),
                math.exp(-((hour - 17.5) ** 2) / 4.0)
            )
            
        if is_event:
            demand_score = min(demand_score + 0.3, 1.0)
            
        # Determine labels
        demand_level = "LOW"
        if demand_score > 0.75:
            demand_level = "CRITICAL"
        elif demand_score > 0.55:
            demand_level = "HIGH"
        elif demand_score > 0.35:
            demand_level = "MEDIUM"
            
        return {
            "demand_score": round(demand_score, 2),
            "demand_level": demand_level,
            "is_peak_hour": hour in [8, 9, 10, 17, 18, 19] if not is_weekend else hour in [12, 13, 14, 18, 19, 20],
            "busy_day": is_weekend or day_of_week == 4 # Friday, Sat, Sun
        }

    @staticmethod
    def calculate_dynamic_price(
        base_price: float, 
        current_occupancy: float, 
        demand_score: float, 
        multiplier_cap: float = 3.0
    ) -> float:
        """
        Calculate dynamic pricing based on current occupancy and forecasted demand.
        Formula: Price = BasePrice * (1 + Occupancy^2 * DemandScore * MultiplierCap)
        """
        # Surge pricing triggers when occupancy is above 50%
        if current_occupancy > 0.5:
            occupancy_factor = (current_occupancy - 0.5) * 2.0 # 0 to 1
            surge = base_price * (occupancy_factor ** 1.5) * demand_score * (multiplier_cap - 1.0)
            final_price = base_price + surge
        else:
            # Discount pricing when occupancy is low to attract drivers
            discount_factor = (0.5 - current_occupancy) * 0.4 # up to 20% discount
            final_price = base_price * (1.0 - discount_factor)
            
        return round(final_price, 2)

    @staticmethod
    def recommend_parking(
        lots: List[Dict[str, Any]], 
        user_lat: float, 
        user_lng: float, 
        preference: str = "nearest"
    ) -> List[Dict[str, Any]]:
        """
        Recommend parking slots based on driver preference: 'nearest', 'cheapest', or 'best' (fastest & available).
        Each lot must contain: id, name, latitude, longitude, base_price, current_price, occupancy_rate, available_slots
        """
        scored_lots = []
        for lot in lots:
            # Calculate distance using Haversine approximation
            lat_diff = lot["latitude"] - user_lat
            lng_diff = lot["longitude"] - user_lng
            distance_km = math.sqrt(lat_diff**2 + lng_diff**2) * 111.0 # 1 degree lat is ~111km
            
            # Scores (lower is better for ranking)
            distance_score = distance_km
            price_score = lot.get("current_price", lot.get("base_price", 10.0))
            
            # Availability score (higher availability is better, so take inverse)
            available = lot.get("available_slots", 1)
            availability_score = 1.0 / (available + 0.1)
            
            # Preference routing
            if preference == "nearest":
                rank_score = distance_score
            elif preference == "cheapest":
                rank_score = price_score + (distance_score * 0.5) # small distance penalty
            else: # "best" / fastest
                # Balanced rank score
                rank_score = (distance_score * 0.5) + (price_score * 0.3) + (availability_score * 5.0)
                
            lot_copy = lot.copy()
            lot_copy["distance_km"] = round(distance_km, 2)
            lot_copy["recommendation_score"] = round(rank_score, 4)
            scored_lots.append(lot_copy)
            
        # Sort by recommendation score ascending
        return sorted(scored_lots, key=lambda x: x["recommendation_score"])
