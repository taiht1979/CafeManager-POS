"""
CafeManager POS - B2B Multi-Tenant SaaS Backend (Python / FastAPI alternative)

Cung cấp 2 Dependency / Middleware cốt lõi:
1. check_tenant: Giải mã JWT, trích xuất StoreID, tự động cô lập dữ liệu.
2. check_subscription & require_feature: Chặn request nếu hết hạn hoặc thiếu cờ tính năng trong gói Plans.
"""

from fastapi import FastAPI, Depends, HTTPException, Header, Query, status
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import json
import base64

app = FastAPI(
    title="CafeManager POS - B2B SaaS Engine",
    description="Multi-tenant POS Core with CheckTenant & CheckSubscription Enforcement",
    version="2.5.0"
)

# =============================================================================
# MOCK DATABASE (Tương thích schema.sql)
# =============================================================================
db_plans = {
    1: {"PlanID": 1, "PlanCode": "STARTER", "PlanName": "Gói Khởi Nghiệp", "MaxTables": 10, "Feature_CRM": False, "Feature_Inventory": False},
    2: {"PlanID": 2, "PlanCode": "PRO", "PlanName": "Gói Tiêu Chuẩn", "MaxTables": 30, "Feature_CRM": True, "Feature_Inventory": False},
    3: {"PlanID": 3, "PlanCode": "ENTERPRISE", "PlanName": "Gói Doanh Nghiệp", "MaxTables": 999, "Feature_CRM": True, "Feature_Inventory": True},
}

db_stores = {
    1: {"StoreID": 1, "StoreName": "Aroma Coffee Roastery", "PlanID": 3, "ExpiryDate": "2027-09-26T23:59:59Z", "SubscriptionStatus": "Active"},
    2: {"StoreID": 2, "StoreName": "Little Bean Coffee", "PlanID": 1, "ExpiryDate": "2027-03-15T23:59:59Z", "SubscriptionStatus": "Active"},
    3: {"StoreID": 3, "StoreName": "Old Time Cafe (Hết Hạn)", "PlanID": 2, "ExpiryDate": "2026-08-01T00:00:00Z", "SubscriptionStatus": "Expired"},
}

db_tables = [
    {"TableID": 1, "StoreID": 1, "TableName": "Bàn 01", "AreaName": "Tầng 1", "Status": "Occupied"},
    {"TableID": 2, "StoreID": 1, "TableName": "Bàn 02", "AreaName": "Tầng 1", "Status": "Available"},
    {"TableID": 3, "StoreID": 2, "TableName": "Bàn Nhỏ 01", "AreaName": "Sân", "Status": "Available"}
]

db_customers = [
    {"CustomerID": 1, "StoreID": 1, "FullName": "Nguyễn Văn An", "Phone": "0901234567", "Points": 450}
]

# =============================================================================
# 1. MIDDLEWARE: CheckTenant
# =============================================================================
async def check_tenant(
    authorization: Optional[str] = Header(None),
    x_store_id: Optional[int] = Header(None),
    qr_token: Optional[str] = Query(None)
):
    """
    Giải mã JWT từ Authorization Header hoặc QR Token, trích xuất StoreID
    """
    # 1. Khách quét mã QR
    if qr_token:
        # Tìm bàn theo QR Token
        for t in db_tables:
            if t.get("QRToken") == qr_token:
                return {"storeId": t["StoreID"], "isQr": True, "role": "Customer"}

    # 2. Giải mã Bearer Token
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            if "." in token:
                parts = token.split(".")
                # Giải mã phần payload
                padded = parts[1] + '=' * (4 - len(parts[1]) % 4)
                decoded_bytes = base64.urlsafe_b64decode(padded)
                payload = json.loads(decoded_bytes.decode('utf-8'))
                store_id = payload.get("storeId") or payload.get("StoreID")
                if store_id:
                    return {"storeId": int(store_id), "user": payload, "role": payload.get("role", "Staff")}
        except Exception:
            pass

    # 3. Fallback header kiểm thử
    if x_store_id:
        return {"storeId": x_store_id, "role": "StoreManager"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Yêu cầu xác thực StoreID! Vui lòng gửi kèm Authorization Bearer Token hoặc tham số QR hợp lệ."
    )

# =============================================================================
# 2. MIDDLEWARE: CheckSubscription
# =============================================================================
async def check_subscription(tenant: dict = Depends(check_tenant)):
    """
    Chặn request nếu cửa hàng đã hết hạn thuê bao (ExpiryDate)
    """
    store_id = tenant["storeId"]
    store = db_stores.get(store_id)

    if not store:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy StoreID #{store_id}")

    # Kiểm tra hạn ExpiryDate
    expiry = datetime.fromisoformat(store["ExpiryDate"].replace("Z", "+00:00"))
    now = datetime.now(expiry.tzinfo)

    if now > expiry or store["SubscriptionStatus"] == "Expired":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SUBSCRIPTION_EXPIRED",
                "message": f"Tài khoản quán '{store['StoreName']}' đã hết hạn thuê bao vào ngày {expiry.strftime('%d/%m/%Y')}. Vui lòng gia hạn để tiếp tục sử dụng!",
                "upgradeUrl": "/admin-dashboard.html#billing"
            }
        )

    plan = db_plans.get(store["PlanID"])
    return {"store": store, "plan": plan, "tenant": tenant}

# =============================================================================
# 3. FACTORY DEPENDENCY: require_feature
# =============================================================================
def require_feature(feature_flag: str, feature_name_vi: str = "tính năng này"):
    """
    Kiểm tra xem gói Plans hiện tại có bật cờ tính năng đó không
    """
    async def dependency(sub_context: dict = Depends(check_subscription)):
        plan = sub_context["plan"]
        if not plan.get(feature_flag, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FEATURE_LOCKED",
                    "message": f"Tính năng '{feature_name_vi}' không khả dụng trong gói [{plan['PlanName']}]. Vui lòng nâng cấp gói SaaS để mở khóa!",
                    "currentPlan": plan["PlanName"],
                    "requiredFeature": feature_flag,
                    "upgradeUrl": "/admin-dashboard.html#upgrade"
                }
            )
        return sub_context
    return dependency

# =============================================================================
# CÁC API ENDPOINTS
# =============================================================================

@app.get("/api/tables", summary="Lấy danh sách bàn (Cô lập StoreID)")
async def get_tables(sub: dict = Depends(check_subscription)):
    store_id = sub["store"]["StoreID"]
    # Tự động lọc tuyệt đối theo StoreID
    my_tables = [t for t in db_tables if t["StoreID"] == store_id]
    return {
        "success": True,
        "storeId": store_id,
        "storeName": sub["store"]["StoreName"],
        "data": my_tables
    }

@app.get("/api/customers", summary="CRM Khách Quen (Yêu cầu Feature_CRM)")
async def get_customers(sub: dict = Depends(require_feature("Feature_CRM", "CRM Khách Hàng Thân Thiết"))):
    store_id = sub["store"]["StoreID"]
    my_customers = [c for c in db_customers if c["StoreID"] == store_id]
    return {
        "success": True,
        "storeId": store_id,
        "total": len(my_customers),
        "data": my_customers
    }

class CustomerCreate(BaseModel):
    fullName: str
    phone: str
    tier: Optional[str] = "Standard"

@app.post("/api/customers", summary="Tạo Khách Quen (Yêu cầu Feature_CRM)")
async def create_customer(payload: CustomerCreate, sub: dict = Depends(require_feature("Feature_CRM", "CRM Khách Hàng Thân Thiết"))):
    store_id = sub["store"]["StoreID"]
    new_c = {
        "CustomerID": len(db_customers) + 1,
        "StoreID": store_id,
        "FullName": payload.fullName,
        "Phone": payload.phone,
        "Tier": payload.tier,
        "Points": 0
    }
    db_customers.append(new_c)
    return {"success": True, "message": "Đã thêm khách hàng thành công!", "customer": new_c}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
